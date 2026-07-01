import { existsSync, mkdirSync, rmSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const VISUAL_QA_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_DB_PATH";
export const APP_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_DB_PATH";
export const VISUAL_QA_PROFILE_BASE = "base";
export const VISUAL_QA_PROFILE_RICH = "rich";

const LOCAL_APP_SUPPORT_DB = process.env.HOME
  ? `${process.env.HOME}/Library/Application Support/no.bliatun.filamentmanager/filament-manager.db`
  : null;

export const DEFAULT_VISUAL_QA_DB_CANDIDATES = [
  LOCAL_APP_SUPPORT_DB,
  "data/filament_manager.db",
  "data/app.db",
  "data/visual-test-bambu.db",
  "data/ui_polish_test.db",
  "data/filament-manager.db",
  "data/bambu.db",
].filter(Boolean);

export const VISUAL_QA_REQUIRED_TABLES = ["filament_spools", "printers"];
export const VISUAL_QA_CONTEXT_TABLES = [
  "settings",
  "ams_units",
  "ams_slots",
  "spool_loans",
  "wishlist_items",
  "spool_history_events",
  "printer_live_events",
  "printer_live_usage_sessions",
  "printer_live_usage_session_spools",
  "print_jobs",
  "filament_master_list",
  "trusted_lan_paired_browsers",
];
export const VISUAL_QA_COUNT_TABLES = [
  ...new Set([...VISUAL_QA_REQUIRED_TABLES, ...VISUAL_QA_CONTEXT_TABLES]),
];

const BAMBU_LIVE_SETTING_PREFIX = "bambu_live_integration:";
const TRUSTED_LAN_KEYS = {
  enabled: "trusted_lan_enabled",
  interfaceName: "trusted_lan_interface_name",
  interfaceAddress: "trusted_lan_interface_address",
  port: "trusted_lan_port",
};

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

export function normalizeVisualQaProfile(profile) {
  const normalized = String(profile ?? VISUAL_QA_PROFILE_RICH).trim().toLowerCase();
  if (!normalized || normalized === VISUAL_QA_PROFILE_RICH) {
    return VISUAL_QA_PROFILE_RICH;
  }
  if (normalized === VISUAL_QA_PROFILE_BASE) {
    return VISUAL_QA_PROFILE_BASE;
  }
  throw new Error(`Unknown visual QA profile "${profile}". Use "rich" or "base".`);
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

function runSqliteRows(dbPath, sql) {
  const result = spawnSync("sqlite3", ["-separator", "\u001f", dbPath, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const reason = result.stderr?.trim() || result.error?.message || "sqlite3 failed";
    throw new Error(reason);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.split("\u001f"));
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

function quoteShellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function parseBooleanSetting(value) {
  return ["1", "true", "TRUE", "True"].includes(String(value ?? "").trim());
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeCount(counts, table) {
  return Number(counts?.[table] ?? 0);
}

function inspectVisualQaSettingsDetails(settingsRows, tables, counts) {
  const settings = new Map(settingsRows.map((row) => [String(row.key), String(row.value ?? "")]));
  const bambuLiveRows = settingsRows.filter((row) =>
    String(row.key).startsWith(BAMBU_LIVE_SETTING_PREFIX),
  );
  let bambuLiveEnabledCount = 0;
  let bambuLiveObservedStateCount = 0;
  let bambuLiveOnlineCount = 0;
  let bambuLiveObservedTrayCount = 0;
  let bambuLiveLatestObservedAt = null;

  for (const row of bambuLiveRows) {
    const config = safeJsonParse(row.value);
    if (!config || typeof config !== "object") {
      continue;
    }
    if (config.enabled === true) {
      bambuLiveEnabledCount += 1;
    }
    const observedState = config.observed_state;
    if (observedState && typeof observedState === "object") {
      bambuLiveObservedStateCount += 1;
      if (observedState.online === true || observedState.mqtt_connected === true) {
        bambuLiveOnlineCount += 1;
      }
      if (Array.isArray(observedState.trays)) {
        bambuLiveObservedTrayCount += observedState.trays.length;
      }
      if (typeof observedState.last_seen_at === "string" && observedState.last_seen_at.trim()) {
        bambuLiveLatestObservedAt = observedState.last_seen_at.trim();
      }
    }
  }

  const trustedLanEnabled = parseBooleanSetting(settings.get(TRUSTED_LAN_KEYS.enabled));
  const trustedLanInterfaceAddress =
    settings.get(TRUSTED_LAN_KEYS.interfaceAddress)?.trim() || null;
  const trustedLanInterfaceConfigured = Boolean(
    settings.get(TRUSTED_LAN_KEYS.interfaceName)?.trim() && trustedLanInterfaceAddress,
  );
  const trustedLanPort =
    Number.parseInt(settings.get(TRUSTED_LAN_KEYS.port) ?? "", 10) || 4278;
  const trustedLanCompanionUrl =
    trustedLanEnabled && trustedLanInterfaceAddress
      ? `http://${trustedLanInterfaceAddress}:${trustedLanPort}/companion`
      : null;

  return {
    activeTrustedLanBrowserCount: safeCount(counts, "trusted_lan_paired_browsers"),
    bambuLiveEnabledCount,
    bambuLiveIntegrationCount: bambuLiveRows.length,
    bambuLiveLatestObservedAt,
    bambuLiveObservedStateCount,
    bambuLiveObservedTrayCount,
    bambuLiveOnlineCount,
    trustedLanEnabled,
    trustedLanCompanionUrl,
    trustedLanInterfaceConfigured,
    trustedLanPort,
    usageEventCount:
      safeCount(counts, "printer_live_usage_sessions") + safeCount(counts, "print_jobs"),
  };
}

function maxColumnWithBetterSqlite(db, table, expression) {
  try {
    return db.prepare(`SELECT MAX(${expression}) AS value FROM "${table}"`).get()?.value ?? null;
  } catch {
    return null;
  }
}

function inspectVisualQaDetailsWithBetterSqlite(db, tables, counts) {
  const settingsRows = tables.includes("settings")
    ? db.prepare("SELECT key, value FROM settings ORDER BY key ASC").all()
    : [];
  const activeTrustedLanBrowserCount = tables.includes("trusted_lan_paired_browsers")
    ? Number(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM trusted_lan_paired_browsers WHERE revoked_at IS NULL",
          )
          .get()?.count ?? 0,
      )
    : 0;
  return {
    ...inspectVisualQaSettingsDetails(settingsRows, tables, counts),
    activeTrustedLanBrowserCount,
    latestPrinterLiveEventAt: tables.includes("printer_live_events")
      ? maxColumnWithBetterSqlite(db, "printer_live_events", "created_at")
      : null,
    latestLiveUsageSeenAt: tables.includes("printer_live_usage_sessions")
      ? maxColumnWithBetterSqlite(
          db,
          "printer_live_usage_sessions",
          "COALESCE(last_seen_at, finished_at, started_at)",
        )
      : null,
    latestPrintJobAt: tables.includes("print_jobs")
      ? maxColumnWithBetterSqlite(db, "print_jobs", "COALESCE(ended_at, started_at)")
      : null,
  };
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
    for (const table of VISUAL_QA_COUNT_TABLES) {
      if (tables.includes(table)) {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get();
        counts[table] = Number(row?.count ?? 0);
      }
    }
    return { counts, details: inspectVisualQaDetailsWithBetterSqlite(db, tables, counts), tables };
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
  for (const table of VISUAL_QA_COUNT_TABLES) {
    if (tables.includes(table)) {
      const output = runSqlite(dbPath, `SELECT COUNT(*) FROM "${table}";`).trim();
      counts[table] = Number(output || 0);
    }
  }
  const settingsRows = tables.includes("settings")
    ? runSqliteRows(dbPath, "SELECT key, value FROM settings ORDER BY key ASC;").map(
        ([key, value]) => ({ key, value }),
      )
    : [];
  const details = {
    ...inspectVisualQaSettingsDetails(settingsRows, tables, counts),
    activeTrustedLanBrowserCount: tables.includes("trusted_lan_paired_browsers")
      ? Number(
          runSqlite(
            dbPath,
            "SELECT COUNT(*) FROM trusted_lan_paired_browsers WHERE revoked_at IS NULL;",
          ).trim() || 0,
        )
      : 0,
    latestPrinterLiveEventAt: tables.includes("printer_live_events")
      ? runSqlite(dbPath, "SELECT MAX(created_at) FROM printer_live_events;").trim() || null
      : null,
    latestLiveUsageSeenAt: tables.includes("printer_live_usage_sessions")
      ? runSqlite(
          dbPath,
          "SELECT MAX(COALESCE(last_seen_at, finished_at, started_at)) FROM printer_live_usage_sessions;",
        ).trim() || null
      : null,
    latestPrintJobAt: tables.includes("print_jobs")
      ? runSqlite(dbPath, "SELECT MAX(COALESCE(ended_at, started_at)) FROM print_jobs;").trim() ||
        null
      : null,
  };
  return { counts, details, tables };
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
  const profile = normalizeVisualQaProfile(options.profile);
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

  if (profile === VISUAL_QA_PROFILE_RICH) {
    const richMinimums = {
      ams_slots: options.minAmsSlots ?? 1,
      printer_live_events: options.minPrinterLiveEvents ?? 1,
      printer_live_usage_sessions: options.minLiveUsageSessions ?? 1,
      printer_live_usage_session_spools: options.minLiveUsageSpools ?? 1,
    };
    for (const [table, minimum] of Object.entries(richMinimums)) {
      if (!inspection.tables.includes(table)) {
        errors.push(`rich visual QA is missing required context table ${table}`);
        continue;
      }
      const count = inspection.counts[table] ?? 0;
      if (count < minimum) {
        errors.push(`rich visual QA needs ${table} >= ${minimum}, found ${count}`);
      }
    }

    const details = inspection.details ?? {};
    if ((details.bambuLiveIntegrationCount ?? 0) < (options.minBambuLiveIntegrations ?? 1)) {
      errors.push("rich visual QA needs at least one Bambu Live integration setting");
    }
    if ((details.bambuLiveEnabledCount ?? 0) < (options.minEnabledBambuLiveIntegrations ?? 1)) {
      errors.push("rich visual QA needs at least one enabled Bambu Live printer");
    }
    if ((details.bambuLiveObservedStateCount ?? 0) < (options.minObservedBambuLiveStates ?? 1)) {
      errors.push("rich visual QA needs a Bambu Live observed_state snapshot");
    }
    if ((details.bambuLiveObservedTrayCount ?? 0) < (options.minObservedBambuLiveTrays ?? 1)) {
      errors.push("rich visual QA needs observed AMS tray data for swatches and live badges");
    }
    if (!details.trustedLanEnabled) {
      errors.push("rich visual QA needs trusted-LAN companion enabled");
    }
    if (!details.trustedLanInterfaceConfigured) {
      errors.push("rich visual QA needs a configured trusted-LAN interface");
    }
    if ((details.usageEventCount ?? 0) < (options.minUsageEvents ?? 1)) {
      errors.push("rich visual QA needs print/job usage statistics");
    }
  }

  return { errors, profile, warnings };
}

export function formatVisualQaDatasetReport({
  assessment,
  inspection,
  live = false,
  sourcePath,
  targetPath,
}) {
  const lines = [
    `Visual QA database source: ${sourcePath}`,
    targetPath ? `Visual QA database ${live ? "target" : "copy"}: ${targetPath}` : null,
    `Visual QA profile: ${assessment.profile ?? VISUAL_QA_PROFILE_RICH}`,
    "Visual QA targets:",
    "  - Desktop app: use the Tauri desktop window; the Vite localhost URL is only a frontend dev server.",
    inspection.details?.trustedLanCompanionUrl
      ? `  - Companion: ${inspection.details.trustedLanCompanionUrl}`
      : null,
    "Visual QA database counts:",
  ].filter(Boolean);

  for (const table of VISUAL_QA_COUNT_TABLES) {
    if (inspection.tables.includes(table)) {
      lines.push(`  - ${table}: ${inspection.counts[table] ?? 0}`);
    }
  }

  if (inspection.details) {
    const details = inspection.details;
    lines.push("Visual QA rich signals:");
    lines.push(
      `  - Bambu Live integrations: ${details.bambuLiveEnabledCount ?? 0}/${
        details.bambuLiveIntegrationCount ?? 0
      } enabled`,
    );
    lines.push(`  - Bambu Live observed states: ${details.bambuLiveObservedStateCount ?? 0}`);
    lines.push(`  - Bambu Live observed trays: ${details.bambuLiveObservedTrayCount ?? 0}`);
    lines.push(
      `  - Trusted-LAN companion: ${details.trustedLanEnabled ? "enabled" : "disabled"}, ${
        details.trustedLanInterfaceConfigured ? "interface configured" : "no interface"
      }, port ${details.trustedLanPort ?? 4278}`,
    );
    lines.push(`  - Active paired companion browsers: ${details.activeTrustedLanBrowserCount ?? 0}`);
    lines.push(
      `  - Job/usage signals: ${details.usageEventCount ?? 0} session/job row(s), latest live usage ${
        details.latestLiveUsageSeenAt ?? "n/a"
      }`,
    );
    lines.push(`  - Latest printer live event: ${details.latestPrinterLiveEventAt ?? "n/a"}`);
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
  const profile = normalizeVisualQaProfile(options.profile);
  const live = Boolean(options.live);
  const source = options.sourcePath
    ? { path: normalizeVisualQaPath(options.sourcePath, cwd), source: "argument" }
    : resolveVisualQaDbSource(options);

  if (!source?.path) {
    throw new Error(
      `No visual QA database found. Set ${VISUAL_QA_DB_PATH_ENV_VAR} to a data-rich local DB.`,
    );
  }

  const sourceInspection = await inspectVisualQaDatabase(source.path);
  const sourceAssessment = assessVisualQaDataset(sourceInspection, { ...options, profile });
  if (sourceAssessment.errors.length > 0) {
    throw new Error(
      formatVisualQaDatasetReport({
        assessment: sourceAssessment,
        inspection: sourceInspection,
        sourcePath: source.path,
      }),
    );
  }

  if (live) {
    return {
      assessment: sourceAssessment,
      copyMethod: "live-db",
      inspection: sourceInspection,
      live: true,
      sourcePath: source.path,
      sourceType: source.source,
      targetPath: source.path,
    };
  }

  const targetPath =
    options.targetPath ??
    visualQaTempDbPath(source.path, options.now ?? new Date());
  const copyMethod = await copySqliteDatabase(source.path, targetPath);
  const targetInspection = await inspectVisualQaDatabase(targetPath);
  const targetAssessment = assessVisualQaDataset(targetInspection, { ...options, profile });
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
    live: false,
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
  const profileArgIndex = process.argv.indexOf("--profile");
  const profile = profileArgIndex >= 0 ? process.argv[profileArgIndex + 1] : undefined;
  const keep = process.argv.includes("--keep");
  const live = process.argv.includes("--live");
  const result = await prepareVisualQaDatabase({ live, profile, sourcePath });
  const report = formatVisualQaDatasetReport(result);
  console.log(report);
  console.log(`Visual QA DB copy method: ${result.copyMethod}`);
  if (result.live) {
    console.log("Visual QA live DB mode: app changes affect the selected database.");
  }
  console.log(
    `Run with: ${APP_DB_PATH_ENV_VAR}=${quoteShellValue(result.targetPath)} npm run tauri -- dev`,
  );
  if (!keep && !result.live) {
    console.log("Note: this command only prepares the DB copy; it does not delete it automatically.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
