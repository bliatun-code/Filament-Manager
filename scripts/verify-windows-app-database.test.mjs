import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  REQUIRED_WINDOWS_SMOKE_COLUMNS,
  REQUIRED_WINDOWS_SMOKE_TABLES,
  REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION,
  verifyWindowsAppDatabase,
} from "./verify-windows-app-database.mjs";

async function withTemporaryDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-windows-db-"));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function createDatabase(
  databasePath,
  tableNames,
  schemaVersion = REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION,
) {
  const database = new Database(databasePath);
  try {
    for (const tableName of tableNames) {
      const requiredColumns = REQUIRED_WINDOWS_SMOKE_COLUMNS[tableName] ?? [];
      const columnDefinitions = [
        "id TEXT PRIMARY KEY",
        ...requiredColumns.map((columnName) => `${columnName} TEXT`),
      ];
      database.exec(`CREATE TABLE ${tableName} (${columnDefinitions.join(", ")})`);
    }
    database.pragma(`user_version = ${schemaVersion}`);
  } finally {
    database.close();
  }
}

test("Windows app database verifier accepts a healthy initialized database", async () => {
  await withTemporaryDirectory(async (directory) => {
    const databasePath = join(directory, "filament-manager.db");
    createDatabase(databasePath, REQUIRED_WINDOWS_SMOKE_TABLES);

    const result = await verifyWindowsAppDatabase(databasePath);

    assert.equal(result.databasePath, databasePath);
    assert.equal(result.schemaVersion, REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION);
    assert.equal(result.size > 0, true);
    assert.deepEqual(result.tables, [...REQUIRED_WINDOWS_SMOKE_TABLES].sort());
  });
});

test("Windows app database verifier accepts the repository's actual migrated schema", async () => {
  await withTemporaryDirectory(async (directory) => {
    const databasePath = join(directory, "migrated.db");
    const migrationRoot = new URL("../src/database/migrations/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", migrationRoot), "utf8"));
    const database = new Database(databasePath);
    try {
      database.exec(readFileSync(new URL("../src/database/schema.sql", import.meta.url), "utf8"));
      for (const migration of manifest.migrations.filter(({ role }) => role === "schema-migration")) {
        database.exec(readFileSync(new URL(migration.file, migrationRoot), "utf8"));
      }
      database.pragma(`user_version = ${manifest.currentSchemaVersion}`);
    } finally {
      database.close();
    }
    const result = await verifyWindowsAppDatabase(databasePath);
    assert.equal(result.schemaVersion, manifest.currentSchemaVersion);
    assert.ok(result.tables.includes("catalog_refresh_jobs"));
  });
});

test("Windows app database verifier reports the schema version in CLI output", async () => {
  await withTemporaryDirectory(async (directory) => {
    const databasePath = join(directory, "filament-manager.db");
    createDatabase(databasePath, REQUIRED_WINDOWS_SMOKE_TABLES);

    const result = spawnSync(
      process.execPath,
      [
        resolve("scripts/verify-windows-app-database.mjs"),
        "--database",
        databasePath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`database schema v${REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION}`));
  });
});

test("Windows app database verifier requires the exact current schema version", async () => {
  await withTemporaryDirectory(async (directory) => {
    for (const schemaVersion of [
      ...Array.from({ length: REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION }, (_, version) => version),
      REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION + 1,
    ]) {
      const databasePath = join(
        directory,
        `filament-manager-schema-${schemaVersion}.db`,
      );
      createDatabase(
        databasePath,
        REQUIRED_WINDOWS_SMOKE_TABLES,
        schemaVersion,
      );

      await assert.rejects(
        verifyWindowsAppDatabase(databasePath),
        new RegExp(
          `schema version mismatch.*expected ${REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION}, got ${schemaVersion}`,
        ),
      );
    }
  });
});

test("Windows app database verifier rejects a missing or incomplete catalog job ledger", async () => {
  await withTemporaryDirectory(async (directory) => {
    for (const missingTable of [true, false]) {
      const databasePath = join(directory, `catalog-ledger-${missingTable}.db`);
      createDatabase(databasePath, REQUIRED_WINDOWS_SMOKE_TABLES);
      const database = new Database(databasePath);
      try {
        database.exec("DROP TABLE catalog_refresh_jobs");
        if (!missingTable) database.exec("CREATE TABLE catalog_refresh_jobs (job_id TEXT PRIMARY KEY)");
      } finally {
        database.close();
      }
      await assert.rejects(verifyWindowsAppDatabase(databasePath), missingTable
        ? /missing required table\(s\): catalog_refresh_jobs/
        : /catalog_refresh_jobs is missing required column\(s\): authority_key/);
    }
  });
});

test("Windows app database verifier requires schema 5 purchase-standard columns", async () => {
  await withTemporaryDirectory(async (directory) => {
    const databasePath = join(directory, "filament-manager.db");
    const database = new Database(databasePath);
    try {
      for (const tableName of REQUIRED_WINDOWS_SMOKE_TABLES) {
        database.exec(`CREATE TABLE ${tableName} (id TEXT PRIMARY KEY)`);
      }
      database.pragma(
        `user_version = ${REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION}`,
      );
    } finally {
      database.close();
    }

    await assert.rejects(
      verifyWindowsAppDatabase(databasePath),
      /filament_spools is missing required column\(s\): purchase_currency, supplier_reference, purchase_price_batch_locked, purchase_price_source/,
    );
  });
});

test("Windows app database verifier rejects foreign key violations", async () => {
  await withTemporaryDirectory(async (directory) => {
    const databasePath = join(directory, "filament-manager.db");
    createDatabase(databasePath, REQUIRED_WINDOWS_SMOKE_TABLES);
    const database = new Database(databasePath);
    try {
      database.pragma("foreign_keys = OFF");
      database.exec(`
        CREATE TABLE smoke_parent (id TEXT PRIMARY KEY);
        CREATE TABLE smoke_child (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES smoke_parent(id)
        );
        INSERT INTO smoke_child (id, parent_id) VALUES ('child-1', 'missing-parent');
      `);
    } finally {
      database.close();
    }

    await assert.rejects(
      verifyWindowsAppDatabase(databasePath),
      /foreign_key_check failed.*1 violation\(s\)/,
    );
  });
});

test("Windows app database verifier fails when initialization is incomplete", async () => {
  await withTemporaryDirectory(async (directory) => {
    const databasePath = join(directory, "filament-manager.db");
    createDatabase(databasePath, REQUIRED_WINDOWS_SMOKE_TABLES.slice(0, -1));

    await assert.rejects(
      verifyWindowsAppDatabase(databasePath),
      /missing required table\(s\): settings/,
    );
  });
});
