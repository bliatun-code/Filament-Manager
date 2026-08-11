import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { resolveDefaultSeedCatalogDatabasePath } from "./export-seed-catalog.mjs";

export const FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB_ENV =
  "FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB";

const REQUIRED_TABLES = ["settings", "filament_spools", "printers"];
const USEFUL_DATA_TABLES = [
  "filament_spools",
  "printers",
  "print_jobs",
  "printer_live_usage_sessions",
];
const PORTABLE_SETTING_KEYS = ["active_printer_id", "theme_mode", "trusted_lan_port"];
const MACHINE_LOCAL_TABLES = [
  "trusted_lan_pairings",
  "trusted_lan_paired_browsers",
  "sync_queue",
];
const SQLITE_SIDECAR_SUFFIXES = ["", "-wal", "-shm", "-journal"];
const LOCAL_DEV_TARGET_SEGMENTS = ["tmp", "dev-local", "filament-manager.db"];
const LOCAL_DEV_LOCK_FILE_NAME = ".filament-manager-dev-local.lock";
const LOCAL_DEV_STAGING_FILE_PATTERN =
  /^\.filament-manager-local-dev-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sqlite(?:-wal|-shm|-journal)?$/i;
const RECOVERY_REASONS = [
  "full-restore",
  "legacy-bundle-migration",
  "schema-upgrade",
  "windows-storage-merge",
];

function validRecoverySnapshotId(value) {
  return (
    /^[0-9a-z]{25}$/.test(value) ||
    /^\d{20}-\d+-\d{10}$/.test(value)
  );
}

function isSuccessfulRecoverySnapshotName(fileName, baseFileName) {
  const prefix = `${baseFileName}.recovery-`;
  const suffix = ".sqlite";
  if (!fileName.startsWith(prefix) || !fileName.endsWith(suffix)) {
    return false;
  }
  const middle = fileName.slice(prefix.length, -suffix.length);
  return RECOVERY_REASONS.some((reason) => {
    const statePrefix = `${reason}-successful-`;
    return middle.startsWith(statePrefix) && validRecoverySnapshotId(middle.slice(statePrefix.length));
  });
}

function normalizedEnvironmentPath(value, cwd) {
  return typeof value === "string" && value.trim().length > 0
    ? path.resolve(cwd, value.trim())
    : null;
}

function tableNames(database) {
  return new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all()
      .map(String),
  );
}

function tableRowCount(database, tables, tableName) {
  if (!tables.has(tableName)) {
    return 0;
  }
  return Number(database.prepare(`SELECT COUNT(*) FROM "${tableName}"`).pluck().get() ?? 0);
}

function databaseRole(database, tables) {
  if (!tables.has("settings")) {
    return "STANDALONE";
  }
  const raw = database
    .prepare("SELECT value FROM settings WHERE key = 'library_sync_mode' LIMIT 1")
    .pluck()
    .get();
  const normalized = String(raw ?? "STANDALONE").trim().toUpperCase();
  return normalized === "CLIENT" || normalized === "HOST" ? normalized : "STANDALONE";
}

export function inspectLocalDevDatabase(databasePath) {
  if (!existsSync(databasePath)) {
    return {
      databasePath,
      exists: false,
      role: null,
      usable: false,
      usefulRows: 0,
    };
  }
  const databaseStats = lstatSync(databasePath);
  if (databaseStats.isSymbolicLink()) {
    throw new Error(`Local development database must not be a symbolic link: ${databasePath}`);
  }
  if (!databaseStats.isFile()) {
    throw new Error(`Local development database must be a regular file: ${databasePath}`);
  }
  if (databaseStats.nlink > 1) {
    throw new Error(`Local development database must not be a hard link: ${databasePath}`);
  }

  let database;
  try {
    database = new Database(databasePath, { fileMustExist: true, readonly: true });
    const integrity = database.pragma("quick_check", { simple: true });
    const tables = tableNames(database);
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
    const usefulRows = USEFUL_DATA_TABLES.reduce(
      (total, table) => total + tableRowCount(database, tables, table),
      0,
    );
    return {
      databasePath,
      exists: true,
      integrity,
      missingTables,
      role: databaseRole(database, tables),
      usable: integrity === "ok" && missingTables.length === 0,
      usefulRows,
    };
  } catch (error) {
    return {
      databasePath,
      error: error instanceof Error ? error.message : String(error),
      exists: true,
      role: null,
      usable: false,
      usefulRows: 0,
    };
  } finally {
    database?.close();
  }
}

function recoveryDatabaseCandidates(installedDatabasePath) {
  const directory = path.dirname(installedDatabasePath);
  if (!existsSync(directory)) {
    return [];
  }
  const baseFileName = path.basename(installedDatabasePath);
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        isSuccessfulRecoverySnapshotName(entry.name, baseFileName),
    )
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

function requireUsefulSource(databasePath, context) {
  const inspection = inspectLocalDevDatabase(databasePath);
  if (!inspection.usable || inspection.usefulRows === 0) {
    throw new Error(`${context} does not contain a usable local Filament Manager library: ${databasePath}`);
  }
  return inspection;
}

export function resolveLocalDevSourceDatabase(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const explicitSource = normalizedEnvironmentPath(
    env[FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB_ENV],
    cwd,
  );
  if (explicitSource) {
    return requireUsefulSource(explicitSource, FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB_ENV);
  }

  const installedDatabasePath =
    options.installedDatabasePath ??
    resolveDefaultSeedCatalogDatabasePath({
      env,
      homeDirectory: options.homeDirectory,
      pathExists: options.pathExists,
      platform: options.platform,
    });
  const installed = inspectLocalDevDatabase(installedDatabasePath);
  if (installed.usable && installed.usefulRows > 0 && installed.role === "STANDALONE") {
    return installed;
  }

  for (const candidate of recoveryDatabaseCandidates(installedDatabasePath)) {
    const inspection = inspectLocalDevDatabase(candidate);
    if (inspection.usable && inspection.usefulRows > 0 && inspection.role === "STANDALONE") {
      return inspection;
    }
  }

  if (installed.usable && installed.usefulRows > 0) {
    return installed;
  }

  throw new Error(
    `No populated local Filament Manager database was found. Set ${FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB_ENV} to an explicit source database.`,
  );
}

async function createSqliteSnapshot(sourcePath, targetPath) {
  const source = new Database(sourcePath, { fileMustExist: true, readonly: true });
  try {
    await source.backup(targetPath);
  } finally {
    source.close();
  }
}

function setSetting(database, key, value) {
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function sanitizeLocalDevDatabase(databasePath, options = {}) {
  const database = new Database(databasePath, { fileMustExist: true });
  try {
    database.pragma("journal_mode = DELETE");
    database.pragma("secure_delete = ON");
    const tables = tableNames(database);
    const transaction = database.transaction(() => {
      const placeholders = PORTABLE_SETTING_KEYS.map(() => "?").join(", ");
      database
        .prepare(`DELETE FROM settings WHERE key NOT IN (${placeholders})`)
        .run(...PORTABLE_SETTING_KEYS);

      setSetting(database, "library_sync_mode", "STANDALONE");
      setSetting(database, "library_sync_device_name", "Local Dev");
      setSetting(
        database,
        "library_sync_library_id",
        (options.randomUuid ?? randomUUID)(),
      );
      setSetting(
        database,
        "credential_store_profile_id",
        `credential_profile_${(options.randomBytes ?? randomBytes)(16).toString("hex")}`,
      );
      setSetting(database, "credential_store_profile_migration_v1", "complete");

      for (const table of MACHINE_LOCAL_TABLES) {
        if (tables.has(table)) {
          database.prepare(`DELETE FROM "${table}"`).run();
        }
      }

      if (tables.has("printers")) {
        const printerColumns = new Set(
          database.pragma("table_info(printers)").map((column) => String(column.name)),
        );
        const clearedColumns = ["ip_address", "access_token"].filter((column) =>
          printerColumns.has(column),
        );
        if (clearedColumns.length > 0) {
          database
            .prepare(
              `UPDATE printers SET ${clearedColumns.map((column) => `"${column}" = NULL`).join(", ")}`,
            )
            .run();
        }
      }
    });
    transaction();
    database.exec("VACUUM");
    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`Sanitized local development database failed integrity check: ${integrity}`);
    }
  } finally {
    database.close();
  }
}

function ensurePrivateDirectory(directory, platform) {
  mkdirSync(directory, {
    recursive: true,
    ...(platform === "win32" ? {} : { mode: 0o700 }),
  });
  if (platform !== "win32") {
    chmodSync(directory, 0o700);
  }
}

function removeSqliteArtifacts(databasePath) {
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

function removeStaleLocalDevStagingFiles(directory) {
  if (!existsSync(directory)) {
    return;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!LOCAL_DEV_STAGING_FILE_PATTERN.test(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      throw new Error(
        `Local development staging path must not be a directory: ${path.join(directory, entry.name)}`,
      );
    }
    rmSync(path.join(directory, entry.name), { force: true });
  }
}

export function assertLocalDevTargetPath(targetPath, cwd = process.cwd()) {
  const workspaceRoot = path.resolve(cwd);
  const expectedTarget = path.join(workspaceRoot, ...LOCAL_DEV_TARGET_SEGMENTS);
  const caseInsensitive = process.platform === "darwin" || process.platform === "win32";
  const comparableTarget = caseInsensitive ? targetPath.toLowerCase() : targetPath;
  const comparableExpected = caseInsensitive ? expectedTarget.toLowerCase() : expectedTarget;
  if (comparableTarget !== comparableExpected) {
    throw new Error(`Local development database must stay at ${expectedTarget}`);
  }

  let current = workspaceRoot;
  for (const segment of LOCAL_DEV_TARGET_SEGMENTS.slice(0, -1)) {
    current = path.join(current, segment);
    if (!existsSync(current)) {
      continue;
    }
    const stats = lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`Local development database directory must not be a symbolic link: ${current}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Local development database directory is not a directory: ${current}`);
    }
  }
}

function readLocalDevLock(lockPath) {
  const stats = lstatSync(lockPath);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink > 1) {
    throw new Error(`Local development lock is not a private regular file: ${lockPath}`);
  }
  let owner;
  try {
    owner = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    throw new Error(`Local development lock has invalid ownership data: ${lockPath}`);
  }
  if (
    !owner ||
    typeof owner !== "object" ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.token !== "string" ||
    owner.token.length === 0
  ) {
    throw new Error(`Local development lock has invalid ownership data: ${lockPath}`);
  }
  return owner;
}

export function acquireLocalDevProcessLock(options = {}) {
  const targetPath = path.resolve(options.targetPath);
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const pid = options.pid ?? process.pid;
  const token = (options.randomUuid ?? randomUUID)();
  const lockPath = path.join(path.dirname(targetPath), LOCAL_DEV_LOCK_FILE_NAME);
  assertLocalDevTargetPath(targetPath, cwd);
  ensurePrivateDirectory(path.dirname(targetPath), platform);

  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", platform === "win32" ? undefined : 0o600);
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "EEXIST") {
      throw error;
    }
    let owner;
    try {
      owner = readLocalDevLock(lockPath);
    } catch {
      throw new Error(
        `A local-only development lock with unreadable ownership data exists. ` +
          `Confirm that no dev:local process is running before removing ${lockPath}.`,
      );
    }
    throw new Error(
      `A local-only development lock already exists (last owner PID ${owner.pid}). ` +
        `Confirm that no dev:local process is running before removing ${lockPath}.`,
    );
  }

  try {
    writeFileSync(descriptor, JSON.stringify({ pid, token }), "utf8");
    if (platform !== "win32") {
      chmodSync(lockPath, 0o600);
    }
  } catch (error) {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
    throw error;
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    closeSync(descriptor);
    if (!existsSync(lockPath)) {
      return;
    }
    const owner = readLocalDevLock(lockPath);
    if (owner.pid === pid && owner.token === token) {
      rmSync(lockPath, { force: true });
    }
  };
}

function installDatabaseFileWithoutOverwrite(stagingPath, targetPath) {
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    if (existsSync(`${targetPath}${suffix}`)) {
      throw new Error(
        `Local development database target appeared during preparation and was not overwritten: ${targetPath}${suffix}`,
      );
    }
  }
  try {
    linkSync(stagingPath, targetPath);
  } finally {
    removeSqliteArtifacts(stagingPath);
  }
}

export async function prepareLocalDevDatabase(options = {}) {
  const targetPath = path.resolve(options.targetPath);
  const platform = options.platform ?? process.platform;
  assertLocalDevTargetPath(targetPath, options.cwd);
  const targetDirectory = path.dirname(targetPath);
  ensurePrivateDirectory(targetDirectory, platform);
  removeStaleLocalDevStagingFiles(targetDirectory);
  const targetInspection = inspectLocalDevDatabase(targetPath);
  if (
    targetInspection.usable &&
    targetInspection.role === "STANDALONE" &&
    targetInspection.usefulRows > 0
  ) {
    return { reused: true, sourcePath: null, targetPath };
  }
  if (targetInspection.usable && targetInspection.role === "STANDALONE") {
    throw new Error(
      `Existing local development database has no inventory or usage data and was preserved. ` +
        `Move it aside explicitly before creating a populated snapshot: ${targetPath}`,
    );
  }
  if (targetInspection.exists) {
    throw new Error(
      `Existing local development database is not a valid standalone library and was not replaced: ${targetPath}`,
    );
  }
  for (const suffix of SQLITE_SIDECAR_SUFFIXES.slice(1)) {
    if (existsSync(`${targetPath}${suffix}`)) {
      throw new Error(
        `SQLite sidecar exists without a local development database and was not replaced: ${targetPath}${suffix}`,
      );
    }
  }

  const source = resolveLocalDevSourceDatabase(options);
  const stagingPath = path.join(
    targetDirectory,
    `.filament-manager-local-dev-${randomUUID()}.sqlite`,
  );
  try {
    const descriptor = openSync(
      stagingPath,
      "wx",
      platform === "win32" ? undefined : 0o600,
    );
    closeSync(descriptor);
    await (options.createSnapshot ?? createSqliteSnapshot)(source.databasePath, stagingPath);
    sanitizeLocalDevDatabase(stagingPath, options);
    const prepared = inspectLocalDevDatabase(stagingPath);
    if (!prepared.usable || prepared.usefulRows === 0 || prepared.role !== "STANDALONE") {
      throw new Error("Prepared local development snapshot did not pass validation.");
    }
    if (platform !== "win32") {
      chmodSync(stagingPath, 0o600);
    }
    installDatabaseFileWithoutOverwrite(stagingPath, targetPath);
  } catch (error) {
    removeSqliteArtifacts(stagingPath);
    throw error;
  }

  return { reused: false, sourcePath: source.databasePath, targetPath };
}
