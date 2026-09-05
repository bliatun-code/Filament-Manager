#!/usr/bin/env node

import { statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { currentSchemaVersion } from "./smoke-release-database-upgrade.mjs";

export const REQUIRED_WINDOWS_SMOKE_TABLES = [
  "filament_master_list",
  "filament_spools",
  "catalog_refresh_jobs",
  "settings",
];
export const REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION = currentSchemaVersion();
export const REQUIRED_WINDOWS_SMOKE_COLUMNS = {
  filament_spools: [
    "purchase_currency",
    "supplier_reference",
    "purchase_price_batch_locked",
    "purchase_price_source",
  ],
  catalog_refresh_jobs: [
    "job_id", "authority_key", "owner_id", "vendor", "material", "status",
    "started_at", "finished_at", "result_json", "error",
  ],
};

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

    const schemaVersion = database.pragma("user_version", { simple: true });
    if (schemaVersion !== REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version mismatch for ${resolvedDatabasePath}: expected ${REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION}, got ${String(schemaVersion)}`,
      );
    }

    const foreignKeyViolations = database.pragma("foreign_key_check");
    if (foreignKeyViolations.length > 0) {
      throw new Error(
        `SQLite foreign_key_check failed for ${resolvedDatabasePath}: ${foreignKeyViolations.length} violation(s)`,
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

    for (const [tableName, requiredColumns] of Object.entries(
      REQUIRED_WINDOWS_SMOKE_COLUMNS,
    )) {
      const columnRows = database.pragma(`table_info(${tableName})`);
      const presentColumns = new Set(columnRows.map(({ name }) => name));
      const missingColumns = requiredColumns.filter(
        (columnName) => !presentColumns.has(columnName),
      );
      if (missingColumns.length > 0) {
        throw new Error(
          `Database table ${tableName} is missing required column(s): ${missingColumns.join(", ")}`,
        );
      }
    }

    return {
      databasePath: resolvedDatabasePath,
      schemaVersion,
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
    `Verified Windows app database schema v${result.schemaVersion} (${result.size} bytes): ${result.tables.join(", ")}\n`,
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
