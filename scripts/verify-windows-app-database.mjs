#!/usr/bin/env node

import { statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_WINDOWS_SMOKE_TABLES = [
  "filament_master_list",
  "filament_spools",
  "settings",
];

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--database" || !argv[1]?.trim()) {
    throw new Error(
      "Usage: node ./scripts/verify-windows-app-database.mjs --database <path>",
    );
  }
  return resolve(argv[1]);
}

export async function verifyWindowsAppDatabase(
  databasePath,
  { loadDatabaseModule = () => import("better-sqlite3") } = {},
) {
  const resolvedDatabasePath = resolve(databasePath);
  const databaseStat = statSync(resolvedDatabasePath);
  if (!databaseStat.isFile() || databaseStat.size <= 0) {
    throw new Error(`Database is missing or empty: ${resolvedDatabasePath}`);
  }

  const databaseModule = await loadDatabaseModule();
  const Database = databaseModule.default ?? databaseModule;
  const database = new Database(resolvedDatabasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const quickCheck = database.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") {
      throw new Error(
        `SQLite quick_check failed for ${resolvedDatabasePath}: ${String(quickCheck)}`,
      );
    }

    const tableRows = database
      .prepare(
        `SELECT name
           FROM sqlite_master
          WHERE type = 'table'
            AND name IN (${REQUIRED_WINDOWS_SMOKE_TABLES.map(() => "?").join(", ")})`,
      )
      .all(...REQUIRED_WINDOWS_SMOKE_TABLES);
    const presentTables = new Set(tableRows.map(({ name }) => name));
    const missingTables = REQUIRED_WINDOWS_SMOKE_TABLES.filter(
      (tableName) => !presentTables.has(tableName),
    );
    if (missingTables.length > 0) {
      throw new Error(
        `Database is missing required table(s): ${missingTables.join(", ")}`,
      );
    }

    return {
      databasePath: resolvedDatabasePath,
      size: databaseStat.size,
      tables: [...presentTables].sort(),
    };
  } finally {
    database.close();
  }
}

async function main(argv) {
  const databasePath = parseArguments(argv);
  const result = await verifyWindowsAppDatabase(databasePath);
  process.stdout.write(
    `Verified Windows app database (${result.size} bytes): ${result.tables.join(", ")}\n`,
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
