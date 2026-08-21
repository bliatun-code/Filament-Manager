import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
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
      database.exec(`CREATE TABLE ${tableName} (id TEXT PRIMARY KEY)`);
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
    assert.match(result.stdout, /database schema v3/);
  });
});

test("Windows app database verifier requires the exact current schema version", async () => {
  await withTemporaryDirectory(async (directory) => {
    for (const schemaVersion of [0, 1, 2, 4]) {
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
