import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import {
  assertReleaseUpgradeCatalogJobsSanitized,
  sanitizeReleaseUpgradeCatalogJobs,
} from "./release-upgrade-catalog-jobs.mjs";

const migration = readFileSync(
  new URL("../src/database/migrations/007_catalog_refresh_jobs.sql", import.meta.url),
  "utf8",
);

function sourceResult() {
  return {
    imported: 4, detected_store: "https://store.example.test/private-token",
    detected_collection: "private collection", discovered_materials: ["private discovery"],
    reactivated_count: 1, discontinued_count: 0, reused_cached_products: null,
    detail_fetches: 3, output: "private diagnostic output",
  };
}

function sourceDatabase() {
  const database = new Database(":memory:");
  database.exec(migration);
  database.pragma("user_version = 6");
  database.prepare(`
    INSERT INTO catalog_refresh_jobs
      (job_id, authority_key, owner_id, vendor, material, status,
       started_at, finished_at, result_json, error)
    VALUES ('job-a', 'private authority', 'private owner', 'Bambu', 'PLA',
      'SUCCEEDED', '2026-09-08T12:00:00Z', '2026-09-08T12:01:00Z', ?, NULL)
  `).run(JSON.stringify(sourceResult()));
  return database;
}

test("catalog-job safety assertion rejects source diagnostics and sanitization is idempotent", () => {
  const database = sourceDatabase();
  try {
    assert.throws(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    assert.deepEqual(sanitizeReleaseUpgradeCatalogJobs(database), {
      sanitizedCatalogJobs: 1, interruptedCatalogJobs: 0,
    });
    assert.doesNotThrow(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    const once = database.prepare("SELECT * FROM catalog_refresh_jobs").all();
    assert.deepEqual(JSON.parse(once[0].result_json), {
      imported: 4, detected_store: null, detected_collection: null,
      discovered_materials: null, reactivated_count: 1, discontinued_count: 0,
      reused_cached_products: null, detail_fetches: 3, output: "Release QA catalog result",
    });
    sanitizeReleaseUpgradeCatalogJobs(database);
    assert.deepEqual(database.prepare("SELECT * FROM catalog_refresh_jobs").all(), once);
  } finally {
    database.close();
  }
});

for (const failure of ["invalid later row", "update rejected by SQLite"]) {
  test(`catalog-job sanitization leaves all rows unchanged after an ${failure}`, () => {
    const database = sourceDatabase();
    try {
      database.exec(`
        INSERT INTO catalog_refresh_jobs
        SELECT 'job-b', authority_key, owner_id, vendor, material, status,
          started_at, finished_at, result_json, error FROM catalog_refresh_jobs WHERE job_id = 'job-a'
      `);
      if (failure === "invalid later row") {
        database.exec("UPDATE catalog_refresh_jobs SET result_json = '{}' WHERE job_id = 'job-b'");
      } else {
        database.exec(`
          CREATE TRIGGER reject_second_job BEFORE UPDATE ON catalog_refresh_jobs
          WHEN NEW.job_id = 'job-b' BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END
        `);
      }
      const before = database.prepare("SELECT * FROM catalog_refresh_jobs ORDER BY job_id").all();
      assert.throws(() => sanitizeReleaseUpgradeCatalogJobs(database));
      assert.deepEqual(database.prepare("SELECT * FROM catalog_refresh_jobs ORDER BY job_id").all(), before);
    } finally {
      database.close();
    }
  });
}

for (const [name, result] of [
  ["unknown metadata", { ...sourceResult(), metadata: { token: "private token" } }],
  ["negative count", { ...sourceResult(), imported: -1 }],
  ["fractional count", { ...sourceResult(), detail_fetches: 0.5 }],
  ["unsafe count", { ...sourceResult(), reused_cached_products: Number.MAX_SAFE_INTEGER + 1 }],
  ["string count", { ...sourceResult(), reactivated_count: "1" }],
  ["null required count", { ...sourceResult(), discontinued_count: null }],
  ["missing field", { ...sourceResult(), detected_store: undefined }],
  ["object store", { ...sourceResult(), detected_store: { token: "private token" } }],
  ["object collection", { ...sourceResult(), detected_collection: { token: "private token" } }],
  ["non-string discovery", { ...sourceResult(), discovered_materials: [42] }],
  ["non-array discovery", { ...sourceResult(), discovered_materials: "PLA" }],
  ["non-string output", { ...sourceResult(), output: 42 }],
  ["array result", []],
  ["null result", null],
]) {
  test(`catalog-job sanitization rejects ${name}`, () => {
    const database = sourceDatabase();
    try {
      database.prepare("UPDATE catalog_refresh_jobs SET result_json = ?").run(JSON.stringify(result));
      assert.throws(() => sanitizeReleaseUpgradeCatalogJobs(database));
      assert.throws(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    } finally {
      database.close();
    }
  });
}

for (const [name, tamper] of [
  ["authority", (database) => database.prepare("UPDATE catalog_refresh_jobs SET authority_key = ?").run("private authority")],
  ["owner", (database) => database.prepare("UPDATE catalog_refresh_jobs SET owner_id = ?").run("private process")],
  ["failure diagnostic", (database) => database.prepare("UPDATE catalog_refresh_jobs SET status = 'FAILED', result_json = NULL, error = ?").run("https://host.test/private-token")],
  ["running worker", (database) => database.exec("UPDATE catalog_refresh_jobs SET status = 'RUNNING', finished_at = NULL, result_json = NULL, error = NULL")],
  ...["detected_store", "detected_collection", "discovered_materials", "output", "metadata"].map((field) => [
    `result ${field}`, (database) => {
      const result = JSON.parse(database.prepare("SELECT result_json FROM catalog_refresh_jobs").get().result_json);
      result[field] = field === "discovered_materials" ? ["private material discovery"] : "private metadata";
      database.prepare("UPDATE catalog_refresh_jobs SET result_json = ?").run(JSON.stringify(result));
    },
  ]),
]) {
  test(`catalog-job safety assertion rejects reintroduced ${name}`, () => {
    const database = sourceDatabase();
    try {
      sanitizeReleaseUpgradeCatalogJobs(database);
      tamper(database);
      assert.throws(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    } finally {
      database.close();
    }
  });
}

test("historical schemas without catalog jobs remain valid while schema 6 and 7 require the table", () => {
  const database = new Database(":memory:");
  try {
    for (const version of [0, 5]) {
      database.pragma(`user_version = ${version}`);
      assert.deepEqual(sanitizeReleaseUpgradeCatalogJobs(database), {
        sanitizedCatalogJobs: 0, interruptedCatalogJobs: 0,
      });
      assert.doesNotThrow(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    }
    for (const version of [6, 7]) {
      database.pragma(`user_version = ${version}`);
      assert.throws(() => sanitizeReleaseUpgradeCatalogJobs(database));
      assert.throws(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    }
  } finally {
    database.close();
  }
});

for (const [name, alter] of [
  ["premature table", (database) => database.pragma("user_version = 5")],
  ["unknown column", (database) => database.exec("ALTER TABLE catalog_refresh_jobs ADD COLUMN private_metadata TEXT")],
  ["renamed column", (database) => database.exec("ALTER TABLE catalog_refresh_jobs RENAME COLUMN owner_id TO private_owner")],
]) {
  test(`catalog-job safety rejects a ${name}`, () => {
    const database = sourceDatabase();
    try {
      alter(database);
      assert.throws(() => sanitizeReleaseUpgradeCatalogJobs(database));
      assert.throws(() => assertReleaseUpgradeCatalogJobsSanitized(database));
    } finally {
      database.close();
    }
  });
}
