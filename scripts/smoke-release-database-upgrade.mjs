#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  assertReleaseUpgradeFixtureSanitized,
  assertReleaseUpgradeProtectedValuesPreserved,
  snapshotReleaseUpgradeProtectedValues,
} from "./release-upgrade-fixture-contract.mjs";

const DEFAULT_LAUNCH_COUNT = 2;
const DEFAULT_LAUNCH_TIMEOUT_MS = 90_000;
const MINIMUM_LAUNCH_TIMEOUT_MS = 10_000;
const MAXIMUM_LAUNCH_TIMEOUT_MS = 300_000;
const SNAPSHOT_EXCLUDED_TABLES = new Set([
  // Bundled catalog maintenance may add, refresh, deduplicate, or retire
  // seed-managed rows. The shared protected-values snapshot below still
  // requires every manual/user-edited row and user-owned field to survive.
  "filament_master_list",
  "library_domain_revisions",
  "settings",
]);
const VALUE_DIGEST_EXCLUDED_TABLES = new Set([
  ...SNAPSHOT_EXCLUDED_TABLES,
]);
const WINDOW_HELPER_PATH = fileURLToPath(
  new URL("./macos-window-info.swift", import.meta.url),
);
const DATABASE_SCHEMA_PATH = fileURLToPath(
  new URL("../src/backend/database_schema.rs", import.meta.url),
);

export function currentSchemaVersion() {
  const source = readFileSync(DATABASE_SCHEMA_PATH, "utf8");
  const match = source.match(
    /CURRENT_SCHEMA_VERSION\s*:\s*i64\s*=\s*(\d+)\s*;/,
  );
  if (!match?.[1]) {
    throw new Error("Could not read CURRENT_SCHEMA_VERSION.");
  }
  return Number.parseInt(match[1], 10);
}

function databaseTables(database) {
  return new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => String(name)),
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableColumns(database, table) {
  return database
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .map(({ name }) => String(name));
}

function canonicalDatabaseValue(value) {
  if (Buffer.isBuffer(value)) {
    return { base64: value.toString("base64"), type: "blob" };
  }
  return value;
}

function digestCanonicalRows(rows) {
  return createHash("sha256")
    .update(rows.map((row) => JSON.stringify(row)).sort().join("\n"))
    .digest("hex");
}

function tableValueRows(database, table, columns) {
  const selectedColumns = columns.map(quoteIdentifier).join(", ");
  return database
    .prepare(`SELECT ${selectedColumns} FROM ${quoteIdentifier(table)}`)
    .all()
    .map((row) =>
      columns.map((column) => canonicalDatabaseValue(row[column])),
    );
}

export function snapshotReleaseUpgradeDatabase(databasePath) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    const quickCheck = database.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") {
      throw new Error(`SQLite quick_check returned ${String(quickCheck)}.`);
    }
    const foreignKeyFailures = database.pragma("foreign_key_check");
    if (foreignKeyFailures.length > 0) {
      throw new Error(
        `SQLite foreign_key_check returned ${foreignKeyFailures.length} failure(s).`,
      );
    }
    const tables = databaseTables(database);
    const counts = {};
    const ids = {};
    const valueDigests = {};
    const valueColumns = {};
    const valueRows = {};
    const protectedValues = snapshotReleaseUpgradeProtectedValues(database);
    for (const table of [...tables].sort()) {
      if (
        table.startsWith("sqlite_") ||
        SNAPSHOT_EXCLUDED_TABLES.has(table)
      ) {
        continue;
      }
      counts[table] = Number(
        database
          .prepare(
            `SELECT COUNT(*) AS ${quoteIdentifier("count")} ` +
              `FROM ${quoteIdentifier(table)}`,
          )
          .get().count,
      );
      const columns = tableColumns(database, table);
      if (columns.includes("id")) {
        ids[table] = database
          .prepare(
            `SELECT CAST(${quoteIdentifier("id")} AS TEXT) ` +
              `AS ${quoteIdentifier("id")} FROM ${quoteIdentifier(table)} ` +
              `ORDER BY ${quoteIdentifier("id")}`,
          )
          .all()
          .map(({ id }) => String(id));
      }
      if (!VALUE_DIGEST_EXCLUDED_TABLES.has(table) && columns.length > 0) {
        valueColumns[table] = columns;
        valueRows[table] = tableValueRows(database, table, columns);
        valueDigests[table] = digestCanonicalRows(valueRows[table]);
      }
    }
    return {
      counts,
      ids,
      protectedValues,
      schemaVersion: Number(database.pragma("user_version", { simple: true })),
      tableCount: tables.size,
      valueColumns,
      valueDigests,
      valueRows,
    };
  } finally {
    database.close();
  }
}

export function assertSanitizedReleaseUpgradeFixture(databasePath) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    assertReleaseUpgradeFixtureSanitized(database);
  } finally {
    database.close();
  }
}

export function assertPreservedReleaseUpgradeData(before, after) {
  for (const table of Object.keys(before.counts)) {
    if (!(table in after.counts)) {
      throw new Error(`Upgrade removed the ${table} table.`);
    }
    if (before.counts[table] !== after.counts[table]) {
      throw new Error(
        `Upgrade changed ${table} row count from ${before.counts[table]} ` +
          `to ${String(after.counts[table])}.`,
      );
    }
    if (
      JSON.stringify(before.ids[table] ?? []) !==
      JSON.stringify(after.ids[table] ?? [])
    ) {
      throw new Error(`Upgrade changed ${table} identities.`);
    }
  }
  for (const [table, digest] of Object.entries(before.valueDigests)) {
    const expectedColumns = before.valueColumns[table] ?? [];
    const afterColumns = after.valueColumns[table] ?? [];
    const actualColumns = new Set(afterColumns);
    for (const column of expectedColumns) {
      if (!actualColumns.has(column)) {
        throw new Error(`Upgrade removed ${table}.${column}.`);
      }
    }
    const indices = expectedColumns.map((column) => afterColumns.indexOf(column));
    const projectedRows = (after.valueRows[table] ?? []).map((row) =>
      indices.map((index) => row[index]),
    );
    if (digestCanonicalRows(projectedRows) !== digest) {
      throw new Error(`Upgrade changed preserved values in ${table}.`);
    }
  }
  assertReleaseUpgradeProtectedValuesPreserved(
    before.protectedValues,
    after.protectedValues,
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function childHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForChildExit(child, timeoutMs, pollIntervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (!childHasExited(child) && Date.now() < deadline) {
    await delay(pollIntervalMs);
  }
  return childHasExited(child);
}

export function monitorChildProcessErrors(child) {
  const state = { error: null };
  child.on("error", (error) => {
    state.error = error instanceof Error ? error : new Error(String(error));
  });
  return state;
}

export async function waitForSpawnedChild(
  child,
  state,
  { pollIntervalMs = 10, timeoutMs = 5_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.error) {
      throw new Error(
        `Release application spawn failed: ${state.error.message}`,
        { cause: state.error },
      );
    }
    if (Number.isSafeInteger(child.pid) && child.pid > 0) {
      return child.pid;
    }
    if (childHasExited(child)) {
      throw new Error(
        "Release application exited before reporting a valid process ID.",
      );
    }
    await delay(pollIntervalMs);
  }
  if (state.error) {
    throw new Error(
      `Release application spawn failed: ${state.error.message}`,
      { cause: state.error },
    );
  }
  throw new Error(
    `Release application did not report a valid process ID within ${timeoutMs} ms.`,
  );
}

export async function stopChild(
  child,
  {
    killTimeoutMs = 5_000,
    pollIntervalMs = 100,
    terminateTimeoutMs = 10_000,
  } = {},
) {
  if (
    childHasExited(child) ||
    !Number.isSafeInteger(child.pid) ||
    child.pid <= 0
  ) {
    return;
  }
  child.kill("SIGTERM");
  if (
    !(await waitForChildExit(child, terminateTimeoutMs, pollIntervalMs))
  ) {
    child.kill("SIGKILL");
    if (!(await waitForChildExit(child, killTimeoutMs, pollIntervalMs))) {
      throw new Error(
        `Release application process ${child.pid} did not exit after SIGKILL.`,
      );
    }
  }
}

export function macosApplicationBundlePath(executablePath) {
  return path.resolve(path.dirname(executablePath), "..", "..");
}

function strictSafeInteger(value) {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function macosWindowOutputHasProcessId(output, expectedProcessId) {
  if (
    !Number.isSafeInteger(expectedProcessId) ||
    expectedProcessId <= 0
  ) {
    return false;
  }
  return String(output ?? "")
    .split(/\r?\n/)
    .some((line) => {
      const fields = line.split("\t");
      if (fields.length !== 7) {
        return false;
      }
      return strictSafeInteger(fields[6]) === expectedProcessId;
    });
}

function applicationWindowIsVisible(processId, moduleCachePath) {
  mkdirSync(moduleCachePath, { mode: 0o700, recursive: true });
  const result = spawnSync("swift", [WINDOW_HELPER_PATH, "list"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: path.join(moduleCachePath, "clang"),
      DEVELOPER_DIR:
        process.env.DEVELOPER_DIR ??
        "/Applications/Xcode.app/Contents/Developer",
      SWIFT_MODULECACHE_PATH: path.join(moduleCachePath, "swift"),
    },
  });
  if (result.status !== 0) {
    return false;
  }
  return macosWindowOutputHasProcessId(result.stdout, processId);
}

export function assertReleaseUpgradeSmokePlatform(
  platform = process.platform,
  { requireVisibleWindow = true } = {},
) {
  if (requireVisibleWindow && platform !== "darwin") {
    throw new Error(
      "The release database-upgrade smoke currently requires macOS window " +
        "inspection. Windows release readiness is verified by the installed-MSI smoke.",
    );
  }
}

export function validateReleaseDatabaseUpgradeSmokeOptions({
  allowCurrentSchema = false,
  databasePath,
  executablePath,
  launchCount = DEFAULT_LAUNCH_COUNT,
  launchTimeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
  logDirectory,
  requireVisibleWindow = true,
  sourceRelease = null,
}) {
  for (const [label, value] of [
    ["database", databasePath],
    ["executable", executablePath],
    ["log directory", logDirectory],
  ]) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`A ${label} path is required.`);
    }
  }
  if (!Number.isSafeInteger(launchCount) || launchCount < 2 || launchCount > 5) {
    throw new Error("Launch count must be an integer from 2 to 5.");
  }
  if (
    !Number.isSafeInteger(launchTimeoutMs) ||
    launchTimeoutMs < MINIMUM_LAUNCH_TIMEOUT_MS ||
    launchTimeoutMs > MAXIMUM_LAUNCH_TIMEOUT_MS
  ) {
    throw new Error(
      `Launch timeout must be an integer from ${MINIMUM_LAUNCH_TIMEOUT_MS} ` +
        `to ${MAXIMUM_LAUNCH_TIMEOUT_MS} milliseconds.`,
    );
  }
  if (typeof requireVisibleWindow !== "boolean") {
    throw new Error("Visible-window readiness must be a boolean.");
  }
  if (typeof allowCurrentSchema !== "boolean") {
    throw new Error("Current-schema compatibility must be a boolean.");
  }
  const normalizedSourceRelease =
    typeof sourceRelease === "string" ? sourceRelease.trim() : "";
  if (allowCurrentSchema && !normalizedSourceRelease) {
    throw new Error(
      "A source release is required when current-schema compatibility is allowed.",
    );
  }
  if (!allowCurrentSchema && normalizedSourceRelease) {
    throw new Error(
      "A source release can only be used with current-schema compatibility.",
    );
  }
  return {
    allowCurrentSchema,
    databasePath: path.resolve(databasePath),
    executablePath: path.resolve(executablePath),
    launchCount,
    launchTimeoutMs,
    logDirectory: path.resolve(logDirectory),
    requireVisibleWindow,
    sourceRelease: normalizedSourceRelease || null,
  };
}

export async function smokeReleaseDatabaseUpgrade(options) {
  const {
    allowCurrentSchema,
    databasePath,
    executablePath,
    launchCount,
    launchTimeoutMs,
    logDirectory,
    requireVisibleWindow,
    sourceRelease,
  } = validateReleaseDatabaseUpgradeSmokeOptions(options);
  assertReleaseUpgradeSmokePlatform(process.platform, { requireVisibleWindow });
  for (const [label, filePath] of [
    ["Database", databasePath],
    ["Executable", executablePath],
  ]) {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`${label} is missing: ${filePath}`);
    }
    if (lstatSync(filePath).isSymbolicLink()) {
      throw new Error(`${label} must not be a symbolic link.`);
    }
  }
  assertSanitizedReleaseUpgradeFixture(databasePath);
  const before = snapshotReleaseUpgradeDatabase(databasePath);
  const expectedSchemaVersion = currentSchemaVersion();
  if (before.schemaVersion > expectedSchemaVersion) {
    throw new Error(
      `Compatibility fixture schema ${before.schemaVersion} is newer than ` +
        `current schema ${expectedSchemaVersion}.`,
    );
  }
  if (before.schemaVersion === expectedSchemaVersion && !allowCurrentSchema) {
    throw new Error(
      `Upgrade fixture schema ${before.schemaVersion} must be older than ` +
        `current schema ${expectedSchemaVersion}.`,
    );
  }
  const gateMode =
    before.schemaVersion < expectedSchemaVersion
      ? "schema migration"
      : `same-schema compatibility from ${sourceRelease}`;

  mkdirSync(logDirectory, { mode: 0o700, recursive: true });
  const moduleCachePath = path.join(
    tmpdir(),
    "filament-manager-swift-module-cache",
  );
  const launchResults = [];
  for (let launchIndex = 1; launchIndex <= launchCount; launchIndex += 1) {
    const stdoutPath = path.join(logDirectory, `launch-${launchIndex}-stdout.log`);
    const stderrPath = path.join(logDirectory, `launch-${launchIndex}-stderr.log`);
    const stdoutFile = openSync(stdoutPath, "w", 0o600);
    const stderrFile = openSync(stderrPath, "w", 0o600);
    let child = null;
    try {
      child = spawn(executablePath, [], {
        env: {
          ...process.env,
          FILAMENT_MANAGER_DB_PATH: databasePath,
        },
        stdio: ["ignore", stdoutFile, stderrFile],
      });
      const childState = monitorChildProcessErrors(child);
      const childProcessId = await waitForSpawnedChild(child, childState, {
        timeoutMs: Math.min(5_000, launchTimeoutMs),
      });
      const deadline = Date.now() + launchTimeoutMs;
      let after = null;
      let visibleWindow = !requireVisibleWindow;
      let lastError = null;
      while (Date.now() < deadline) {
        if (childState.error) {
          throw new Error(
            `Release application process failed during launch ${launchIndex}: ` +
              childState.error.message,
            { cause: childState.error },
          );
        }
        if (childHasExited(child)) {
          throw new Error(
            `Release application exited during launch ${launchIndex} ` +
              `(code ${String(child.exitCode)}, signal ${String(child.signalCode)}).`,
          );
        }
        try {
          after = snapshotReleaseUpgradeDatabase(databasePath);
          assertPreservedReleaseUpgradeData(before, after);
          if (after.schemaVersion !== expectedSchemaVersion) {
            throw new Error(
              `Expected schema ${expectedSchemaVersion}, found ${after.schemaVersion}.`,
            );
          }
          lastError = null;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
        if (requireVisibleWindow) {
          visibleWindow = applicationWindowIsVisible(
            childProcessId,
            moduleCachePath,
          );
        }
        if (after?.schemaVersion === expectedSchemaVersion && visibleWindow && !lastError) {
          break;
        }
        await delay(500);
      }
      if (lastError || !after || after.schemaVersion !== expectedSchemaVersion) {
        throw new Error(
          `Release database was not healthy after launch ${launchIndex}.` +
            (lastError ? ` Last check: ${lastError.message}` : ""),
        );
      }
      if (!visibleWindow) {
        throw new Error(
          `Release application did not expose a visible window during launch ${launchIndex}.`,
        );
      }
      await delay(1_000);
      if (childState.error) {
        throw new Error(
          `Release application process failed after launch ${launchIndex}: ` +
            childState.error.message,
          { cause: childState.error },
        );
      }
      if (childHasExited(child)) {
        throw new Error(`Release application exited after launch ${launchIndex}.`);
      }
      launchResults.push(after);
    } finally {
      try {
        if (child) {
          await stopChild(child);
        }
      } finally {
        closeSync(stdoutFile);
        closeSync(stderrFile);
      }
    }
  }

  const finalSnapshot = snapshotReleaseUpgradeDatabase(databasePath);
  assertPreservedReleaseUpgradeData(before, finalSnapshot);
  writeFileSync(
    path.join(logDirectory, "upgrade-summary.txt"),
    [
      "Release database upgrade smoke passed.",
      `Gate mode: ${gateMode}`,
      `Source release: ${sourceRelease ?? "historical schema fixture"}`,
      `Source schema: ${before.schemaVersion}`,
      `Current schema: ${finalSnapshot.schemaVersion}`,
      `Launches: ${launchCount}`,
      `Readiness: ${requireVisibleWindow ? "database and visible window" : "database"}`,
      `Preserved domain tables: ${Object.keys(before.counts).length}`,
      `Value-digested tables: ${Object.keys(before.valueDigests).length}`,
      `Protected settings: ${Object.keys(before.protectedValues.settings).length}`,
      `Protected catalog rows: ${Object.keys(before.protectedValues.catalog.rows).length}`,
      `Filament spools: ${finalSnapshot.counts.filament_spools ?? 0}`,
      `Printers: ${finalSnapshot.counts.printers ?? 0}`,
      `Spool history events: ${finalSnapshot.counts.spool_history_events ?? 0}`,
      `Printer live events: ${finalSnapshot.counts.printer_live_events ?? 0}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  return {
    after: finalSnapshot,
    before,
    gateMode,
    launchCount,
    launchResults,
    sourceRelease,
  };
}

function parseCliInteger(value, label) {
  const parsed = strictSafeInteger(value);
  if (parsed === null) {
    throw new Error(`${label} must be a strict base-10 integer.`);
  }
  return parsed;
}

export function parseReleaseDatabaseUpgradeSmokeCliOptions(argv) {
  const optionValue = (name) =>
    argv
      .find((argument) => argument.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  if (
    argv.some(
      (argument) =>
        argument !== "--database-readiness-only" &&
        argument !== "--allow-current-schema" &&
        ![
          "--database=",
          "--executable=",
          "--launch-count=",
          "--launch-timeout-ms=",
          "--log-dir=",
          "--source-release=",
        ].some((prefix) => argument.startsWith(prefix)),
    )
  ) {
    throw new Error(
      "Usage: node scripts/smoke-release-database-upgrade.mjs " +
        "--database=<sanitized-copy> --executable=<release-binary> " +
        "--log-dir=<private-directory> [--launch-count=2] " +
        "[--launch-timeout-ms=90000] [--database-readiness-only] " +
        "[--allow-current-schema --source-release=v0.27.0]",
    );
  }
  const launchCount = optionValue("--launch-count");
  const launchTimeoutMs = optionValue("--launch-timeout-ms");
  return {
    allowCurrentSchema: argv.includes("--allow-current-schema"),
    databasePath: optionValue("--database"),
    executablePath: optionValue("--executable"),
    launchCount:
      launchCount === undefined
        ? DEFAULT_LAUNCH_COUNT
        : parseCliInteger(launchCount, "Launch count"),
    launchTimeoutMs:
      launchTimeoutMs === undefined
        ? DEFAULT_LAUNCH_TIMEOUT_MS
        : parseCliInteger(launchTimeoutMs, "Launch timeout"),
    logDirectory: optionValue("--log-dir"),
    requireVisibleWindow: !argv.includes("--database-readiness-only"),
    sourceRelease: optionValue("--source-release"),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await smokeReleaseDatabaseUpgrade(
      parseReleaseDatabaseUpgradeSmokeCliOptions(process.argv.slice(2)),
    );
    console.log(
      `Release database upgrade smoke passed (schema ` +
        `${result.before.schemaVersion} -> ${result.after.schemaVersion}, ` +
        `${result.launchCount} launches).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
