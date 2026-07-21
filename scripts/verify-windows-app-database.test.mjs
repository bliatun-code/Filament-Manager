import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  REQUIRED_WINDOWS_SMOKE_TABLES,
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

function createDatabase(databasePath, tableNames) {
  const database = new Database(databasePath);
  try {
    for (const tableName of tableNames) {
      database.exec(`CREATE TABLE ${tableName} (id TEXT PRIMARY KEY)`);
    }
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
    assert.equal(result.size > 0, true);
    assert.deepEqual(result.tables, [...REQUIRED_WINDOWS_SMOKE_TABLES].sort());
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
