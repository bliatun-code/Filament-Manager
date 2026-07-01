import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const VISUAL_QA_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_DB_PATH";
export const APP_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_DB_PATH";

export const DEFAULT_VISUAL_QA_DB_CANDIDATES = [
  "data/visual-test-bambu.db",
  "data/ui_polish_test.db",
  "data/filament-manager.db",
  "data/bambu.db",
];

export const VISUAL_QA_REQUIRED_TABLES = ["filament_spools", "printers"];
export const VISUAL_QA_CONTEXT_TABLES = [
  "spool_loans",
  "wishlist_items",
  "spool_history_events",
  "printer_live_events",
  "filament_master_list",
];

export function normalizeVisualQaPath(path, cwd = process.cwd()) {
  if (!path || typeof path !== "string") {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

export function resolveVisualQaDbSource(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const candidates = options.candidates ?? DEFAULT_VISUAL_QA_DB_CANDIDATES;
  const explicitVisualPath = normalizeVisualQaPath(env[VISUAL_QA_DB_PATH_ENV_VAR], cwd);
  const explicitAppPath = normalizeVisualQaPath(env[APP_DB_PATH_ENV_VAR], cwd);

  for (const candidate of [explicitVisualPath, explicitAppPath]) {
    if (candidate && existsSync(candidate)) {
      return { path: candidate, source: "env" };
    }
  }

  for (const candidate of candidates) {
    const candidatePath = normalizeVisualQaPath(candidate, cwd);
    if (candidatePath && existsSync(candidatePath)) {
      return { path: candidatePath, source: "candidate" };
    }
  }

  return null;
}

function quoteSqlitePath(path) {
  return `'${path.replaceAll("'", "''")}'`;
}

async function copyWithBetterSqlite(sourcePath, targetPath) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(targetPath);
  } finally {
    db.close();
  }
}

function runSqlite(dbPath, sql) {
  const result = spawnSync("sqlite3", [dbPath, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const reason = result.stderr?.trim() || result.error?.message || "sqlite3 failed";
    throw new Error(reason);
  }
  return result.stdout;
}

function copyWithSqliteCli(sourcePath, targetPath) {
  runSqlite(sourcePath, `.backup ${quoteSqlitePath(targetPath)}`);
}

async function copySqliteDatabase(sourcePath, targetPath) {
  mkdirSync(dirname(targetPath), { recursive: true });
  try {
    await copyWithBetterSqlite(sourcePath, targetPath);
    return "better-sqlite3";
  } catch (betterSqliteError) {
    try {
      copyWithSqliteCli(sourcePath, targetPath);
      return "sqlite3";
    } catch (sqliteCliError) {
      if (existsSync(`${sourcePath}-wal`) || existsSync(`${sourcePath}-shm`)) {
        throw new Error(
          `Could not create a safe SQLite backup (${betterSqliteError.message}; ${sqliteCliError.message})`,
        );
      }
      await copyFile(sourcePath, targetPath);
      return `copy-file (${betterSqliteError.message}; ${sqliteCliError.message})`;
    }
  }
}

async function inspectDatabaseWithBetterSqlite(dbPath) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all();
    const tables = tableRows.map((row) => String(row.name));
    const counts = {};
    for (const table of [...VISUAL_QA_REQUIRED_TABLES, ...VISUAL_QA_CONTEXT_TABLES]) {
      if (tables.includes(table)) {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get();
        counts[table] = Number(row?.count ?? 0);
      }
    }
    return { counts, tables };
  } finally {
    db.close();
  }
}

function inspectDatabaseWithSqliteCli(dbPath) {
  const tables = runSqlite(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts = {};
  for (const table of [...VISUAL_QA_REQUIRED_TABLES, ...VISUAL_QA_CONTEXT_TABLES]) {
    if (tables.includes(table)) {
      const output = runSqlite(dbPath, `SELECT COUNT(*) FROM "${table}";`).trim();
      counts[table] = Number(output || 0);
    }
  }
  return { counts, tables };
}

export async function inspectVisualQaDatabase(dbPath) {
  try {
    return await inspectDatabaseWithBetterSqlite(dbPath);
  } catch {
    return inspectDatabaseWithSqliteCli(dbPath);
  }
}

export function assessVisualQaDataset(
  inspection,
  options = {},
) {
  const minimums = {
    filament_spools: options.minSpools ?? 1,
    printers: options.minPrinters ?? 1,
  };
  const errors = [];
  const warnings = [];

  for (const table of VISUAL_QA_REQUIRED_TABLES) {
    if (!inspection.tables.includes(table)) {
      errors.push(`missing required table ${table}`);
      continue;
    }
    const count = inspection.counts[table] ?? 0;
    const minimum = minimums[table] ?? 1;
    if (count < minimum) {
      errors.push(`${table} has ${count} row(s), expected at least ${minimum}`);
    }
  }

  for (const table of VISUAL_QA_CONTEXT_TABLES) {
    if (!inspection.tables.includes(table)) {
      warnings.push(`missing context table ${table}`);
      continue;
    }
    if ((inspection.counts[table] ?? 0) === 0) {
      warnings.push(`${table} has no rows; related visual states may be empty`);
    }
  }

  return { errors, warnings };
}

export function formatVisualQaDatasetReport({ assessment, inspection, sourcePath, targetPath }) {
  const lines = [
    `Visual QA database source: ${sourcePath}`,
    targetPath ? `Visual QA database copy: ${targetPath}` : null,
    "Visual QA database counts:",
  ].filter(Boolean);

  for (const table of [...VISUAL_QA_REQUIRED_TABLES, ...VISUAL_QA_CONTEXT_TABLES]) {
    if (inspection.tables.includes(table)) {
      lines.push(`  - ${table}: ${inspection.counts[table] ?? 0}`);
    }
  }

  if (assessment.warnings.length > 0) {
    lines.push("Visual QA dataset warnings:");
    for (const warning of assessment.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (assessment.errors.length > 0) {
    lines.push("Visual QA dataset errors:");
    for (const error of assessment.errors) {
      lines.push(`  - ${error}`);
    }
  }

  return lines.join("\n");
}

export function visualQaTempDbPath(sourcePath, now = new Date()) {
  const stamp = now.toISOString().replaceAll(/[:.]/g, "-");
  const name = basename(sourcePath).replace(/\.db$/i, "");
  return resolve(tmpdir(), "filament-manager-visual-qa", `${name}-${stamp}.db`);
}

export async function prepareVisualQaDatabase(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const source = options.sourcePath
    ? { path: normalizeVisualQaPath(options.sourcePath, cwd), source: "argument" }
    : resolveVisualQaDbSource(options);

  if (!source?.path) {
    throw new Error(
      `No visual QA database found. Set ${VISUAL_QA_DB_PATH_ENV_VAR} to a data-rich local DB.`,
    );
  }

  const sourceInspection = await inspectVisualQaDatabase(source.path);
  const sourceAssessment = assessVisualQaDataset(sourceInspection, options);
  if (sourceAssessment.errors.length > 0) {
    throw new Error(
      formatVisualQaDatasetReport({
        assessment: sourceAssessment,
        inspection: sourceInspection,
        sourcePath: source.path,
      }),
    );
  }

  const targetPath =
    options.targetPath ??
    visualQaTempDbPath(source.path, options.now ?? new Date());
  const copyMethod = await copySqliteDatabase(source.path, targetPath);
  const targetInspection = await inspectVisualQaDatabase(targetPath);
  const targetAssessment = assessVisualQaDataset(targetInspection, options);
  if (targetAssessment.errors.length > 0) {
    throw new Error(
      formatVisualQaDatasetReport({
        assessment: targetAssessment,
        inspection: targetInspection,
        sourcePath: source.path,
        targetPath,
      }),
    );
  }

  return {
    assessment: targetAssessment,
    copyMethod,
    inspection: targetInspection,
    sourcePath: source.path,
    sourceType: source.source,
    targetPath,
  };
}

export function cleanupVisualQaDatabase(dbPath) {
  if (!dbPath) {
    return;
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function runCli() {
  const sourceArgIndex = process.argv.indexOf("--source");
  const sourcePath = sourceArgIndex >= 0 ? process.argv[sourceArgIndex + 1] : null;
  const keep = process.argv.includes("--keep");
  const result = await prepareVisualQaDatabase({ sourcePath });
  const report = formatVisualQaDatasetReport(result);
  console.log(report);
  console.log(`Visual QA DB copy method: ${result.copyMethod}`);
  console.log(`Run with: ${APP_DB_PATH_ENV_VAR}=${result.targetPath} npm run tauri -- dev`);
  if (!keep) {
    console.log("Note: this command only prepares the DB copy; it does not delete it automatically.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
