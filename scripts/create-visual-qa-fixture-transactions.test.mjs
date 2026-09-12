import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  createVisualQaFixture,
  VISUAL_QA_SCHEMA_PATH,
  VISUAL_QA_SCHEMA_MIGRATION_PATH,
  VISUAL_QA_SEED_PATH,
} from "./create-visual-qa-fixture.mjs";

const quote = (value) => `"${value.replaceAll('"', '""')}"`;

function openMeasuredDatabase(path, trace) {
  const db = new Database(path, {
    verbose(sql) {
      const statement = sql.replace(/--[^\n]*/g, "").trim();
      if (/^(CREATE|INSERT|UPDATE|DELETE|ALTER|DROP|REPLACE)\b/i.test(statement)) {
        if (!db.inTransaction) trace.autocommitWrites += 1;
      }
      if (/^COMMIT\b/i.test(statement)) trace.commits += 1;
    },
  });
  // Keep defaults and revision triggers comparable without masking any stored fields.
  db.function("datetime", { varargs: true }, (...args) => {
    assert.deepEqual(args, ["now"]);
    return "2026-09-13 12:00:00";
  });
  return db;
}

function snapshot(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();
    return {
      schema,
      rows: Object.fromEntries(schema.filter(({ type }) => type === "table").map(({ name }) => [
        name, db.prepare(`SELECT * FROM ${quote(name)}`).all().map((row) => JSON.stringify(row)).sort(),
      ])),
      version: db.pragma("user_version", { simple: true }),
      health: db.pragma("quick_check", { simple: true }),
      foreignKeys: db.pragma("foreign_key_check"),
    };
  } finally {
    db.close();
  }
}

// Independent reference for the previous layout: autocommit DDL, then seeded rows.
function createUnbatchedReference(path, schemaVersion, trace) {
  const seed = JSON.parse(readFileSync(VISUAL_QA_SEED_PATH, "utf8"));
  const db = openMeasuredDatabase(path, trace);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(VISUAL_QA_SCHEMA_PATH, "utf8"));
    if (schemaVersion === 2) db.exec(readFileSync(VISUAL_QA_SCHEMA_MIGRATION_PATH, "utf8"));
    db.transaction(() => {
      for (const [table, rows] of Object.entries(seed.tables)) {
        for (const row of rows) {
          const columns = Object.keys(row);
          db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
            .run(...columns.map((column) => row[column]));
        }
      }
      db.pragma(`user_version = ${schemaVersion}`);
    })();
  } finally {
    db.close();
  }
}

for (const schemaVersion of [1, 2]) {
  test(`fixture schema ${schemaVersion} preserves the full database with one commit and no autocommit writes`, (t) => {
    const root = mkdtempSync(join(tmpdir(), "filament-fixture-transactions-"));
    try {
      const referencePath = join(root, "reference.db");
      const candidatePath = join(root, "candidate.db");
      const reference = { autocommitWrites: 0, commits: 0 };
      const candidate = { autocommitWrites: 0, commits: 0 };
      const start = performance.now();
      createUnbatchedReference(referencePath, schemaVersion, reference);
      const referenceMs = performance.now() - start;
      const candidateStart = performance.now();
      createVisualQaFixture({
        outputPath: candidatePath, schemaVersion,
        openDatabase: (path) => openMeasuredDatabase(path, candidate),
      });
      const candidateMs = performance.now() - candidateStart;
      const candidateSnapshot = snapshot(candidatePath);
      assert.deepEqual(candidateSnapshot, snapshot(referencePath));
      assert.equal(candidateSnapshot.health, "ok");
      assert.deepEqual(candidateSnapshot.foreignKeys, []);
      assert.ok(reference.autocommitWrites > 0);
      assert.equal(candidate.autocommitWrites, 0);
      assert.equal(candidate.commits, 1);
      t.diagnostic(`fixture schema ${schemaVersion}: reference=${referenceMs.toFixed(1)}ms, batched=${candidateMs.toFixed(1)}ms; autocommit writes=${reference.autocommitWrites}->${candidate.autocommitWrites}. Timings are advisory under runner contention.`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const phase of ["schema", "foreign-key", "verification"]) {
  test(`fixture ${phase} failure rolls back schema and rows before closing and removing the output`, () => {
    const root = mkdtempSync(join(tmpdir(), "filament-fixture-rollback-"));
    const outputPath = join(root, "fixture.db");
    let stateBeforeClose;
    try {
      const options = { outputPath };
      if (phase === "schema") {
        options.schemaPath = join(root, "broken.sql");
        writeFileSync(options.schemaPath, `${readFileSync(VISUAL_QA_SCHEMA_PATH, "utf8")}\nINVALID SQL;`);
      }
      if (phase === "foreign-key") {
        const seed = JSON.parse(readFileSync(VISUAL_QA_SEED_PATH, "utf8"));
        seed.tables.filament_spools[0].master_id = "qa_missing_master";
        options.seedPath = join(root, "invalid-reference.json");
        writeFileSync(options.seedPath, JSON.stringify(seed));
      }
      options.openDatabase = (path) => {
        const db = new Database(path);
        const pragma = db.pragma.bind(db);
        const close = db.close.bind(db);
        if (phase === "verification") {
          db.pragma = (sql, ...args) => sql === "quick_check" ? "injected verification failure" : pragma(sql, ...args);
        }
        db.close = () => {
          stateBeforeClose = {
            objects: db.prepare("SELECT name FROM sqlite_master").all(),
            version: pragma("user_version", { simple: true }),
            foreignKeys: pragma("foreign_keys", { simple: true }),
            inTransaction: db.inTransaction,
          };
          close();
        };
        return db;
      };
      const failure = phase === "schema" ? /syntax error/ : phase === "foreign-key" ? /FOREIGN KEY constraint failed/ : /injected verification failure/;
      assert.throws(() => createVisualQaFixture(options), failure);
      assert.deepEqual(stateBeforeClose, { objects: [], version: 0, foreignKeys: 1, inTransaction: false });
      for (const suffix of ["", "-journal", "-wal", "-shm"]) assert.equal(existsSync(`${outputPath}${suffix}`), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
