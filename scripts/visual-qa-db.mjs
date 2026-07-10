import { existsSync, mkdirSync, rmSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const VISUAL_QA_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_DB_PATH";
export const APP_DB_PATH_ENV_VAR = "FILAMENT_MANAGER_DB_PATH";
export const VISUAL_QA_PROFILE_BASE = "base";
export const VISUAL_QA_PROFILE_RICH = "rich";
export const VISUAL_QA_FIXTURE_PRINTER_SLOT_ONBOARDING = "printer-slot-onboarding";
export const VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE = "printer-rfid-override";
export const VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES =
  "settings-catalog-missing-swatches";
export const VISUAL_QA_FIXTURE_WISHLIST_QUEUE = "wishlist-queue";
export const VISUAL_QA_FIXTURE_LOAN_DIALOGS = "loan-dialogs";
export const VISUAL_QA_FIXTURE_TRUSTED_LAN_INTERFACE = "trusted-lan-interface";
export const VISUAL_QA_TRUSTED_LAN_PORT = 4279;

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

export function normalizeVisualQaDatabaseFixtureScenario(scenario) {
  switch (String(scenario ?? "").trim().toLowerCase()) {
    case "printer-slot-onboarding":
    case "slot-onboarding":
    case "ams-onboarding":
    case "printer-ams-onboarding":
      return VISUAL_QA_FIXTURE_PRINTER_SLOT_ONBOARDING;
    case "printer-rfid-override":
    case "rfid-override":
    case "slot-rfid-override":
    case "printer-slot-rfid-override":
      return VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE;
    case "settings-catalog-swatch-review":
    case "settings-catalog-missing-swatches":
    case "catalog-swatch-review":
    case "missing-swatches":
      return VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES;
    case "wishlist-queue":
    case "inventory-wishlist":
    case "wishlist-orders":
    case "order-queue":
      return VISUAL_QA_FIXTURE_WISHLIST_QUEUE;
    case "return-inbound-loan":
    case "inbound-return":
    case "borrowed-in-hand-back":
    case "hand-back-borrowed-in":
    case "statistics-borrower":
    case "borrower-usage-breakdown":
    case "statistics-borrower-usage":
      return VISUAL_QA_FIXTURE_LOAN_DIALOGS;
    default:
      return null;
  }
}

function safeCount(counts, table) {
  return Number(counts?.[table] ?? 0);
}

function isPrivateIpv4Address(address) {
  const parts = String(address ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function networkInterfacePreference(name) {
  const normalized = String(name ?? "").toLowerCase();
  if (/^(en|eth|wlan|wi-?fi|ethernet)/.test(normalized)) {
    return 0;
  }
  if (/(bridge|docker|vmnet|vbox|utun|awdl|llw|anpi|stf)/.test(normalized)) {
    return 50;
  }
  return 20;
}

function sqliteTableColumns(db, table) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => String(row.name)),
  );
}

function ensureSqliteColumns(columns, table, requiredColumns, context) {
  const missing = requiredColumns.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`${context} requires ${table}.${missing.join(", ")}.`);
  }
}

export function listPrivateVisualQaNetworkInterfaces(interfaces = networkInterfaces()) {
  const options = [];
  for (const [name, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      const family = typeof entry.family === "string" ? entry.family : `IPv${entry.family}`;
      if (family !== "IPv4" || entry.internal || !isPrivateIpv4Address(entry.address)) {
        continue;
      }
      options.push({
        address: entry.address,
        name,
        preference: networkInterfacePreference(name),
      });
    }
  }
  return options
    .sort((left, right) =>
      left.preference - right.preference ||
      left.name.localeCompare(right.name) ||
      left.address.localeCompare(right.address),
    )
    .map(({ address, name }) => ({ address, name }));
}

function readSetting(db, key) {
  try {
    return db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key)?.value ?? null;
  } catch {
    return null;
  }
}

function writeSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

async function applyTrustedLanInterfaceFixtureWithBetterSqlite(dbPath, options = {}) {
  const availableInterfaces = options.interfaces ?? listPrivateVisualQaNetworkInterfaces();
  const selectedInterface = availableInterfaces[0] ?? null;
  if (!selectedInterface) {
    return null;
  }

  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath);
  try {
    const settingsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings' LIMIT 1")
      .get();
    if (!settingsTable) {
      return null;
    }

    const enabled = parseBooleanSetting(readSetting(db, TRUSTED_LAN_KEYS.enabled));
    if (!enabled) {
      return null;
    }

    const previousName = String(readSetting(db, TRUSTED_LAN_KEYS.interfaceName) ?? "").trim();
    const previousAddress = String(readSetting(db, TRUSTED_LAN_KEYS.interfaceAddress) ?? "").trim();
    const previousPort = String(readSetting(db, TRUSTED_LAN_KEYS.port) ?? "").trim();
    const fixturePort = String(options.trustedLanPort ?? VISUAL_QA_TRUSTED_LAN_PORT);
    if (
      previousName === selectedInterface.name &&
      previousAddress === selectedInterface.address &&
      previousPort === fixturePort
    ) {
      return null;
    }

    const transaction = db.transaction(() => {
      writeSetting(db, TRUSTED_LAN_KEYS.interfaceName, selectedInterface.name);
      writeSetting(db, TRUSTED_LAN_KEYS.interfaceAddress, selectedInterface.address);
      writeSetting(db, TRUSTED_LAN_KEYS.port, fixturePort);
    });
    transaction();

    return {
      fixture: VISUAL_QA_FIXTURE_TRUSTED_LAN_INTERFACE,
      interfaceAddress: selectedInterface.address,
      interfaceName: selectedInterface.name,
      previousInterfaceAddress: previousAddress || null,
      previousInterfaceName: previousName || null,
      previousPort: previousPort || null,
      port: fixturePort,
    };
  } finally {
    db.close();
  }
}

export async function applyTrustedLanInterfaceFixture(dbPath, options = {}) {
  if (options.live) {
    return null;
  }
  return applyTrustedLanInterfaceFixtureWithBetterSqlite(dbPath, options);
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

function chooseSlotOnboardingCatalogMaster(db) {
  const strictRow = db
    .prepare(
      `SELECT m.id, m.vendor, m.material, m.filament_name, m.color_name, m.hex_color, m.default_weight
       FROM filament_master_list m
       WHERE lower(m.vendor) LIKE '%bambu%'
         AND COALESCE(m.is_discontinued, 0) = 0
         AND COALESCE(m.hex_color, '') <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM filament_spools fs
           JOIN filament_master_list sm ON sm.id = fs.master_id
           WHERE fs.deleted_at IS NULL
             AND lower(sm.vendor) LIKE '%bambu%'
             AND lower(sm.material) = lower(m.material)
         )
       ORDER BY
         CASE lower(m.material)
           WHEN 'asa' THEN 0
           WHEN 'pa6' THEN 1
           WHEN 'pc' THEN 2
           ELSE 3
         END,
         CASE
           WHEN lower(m.color_name) LIKE '%black%'
             OR lower(m.color_name) LIKE '%white%'
             OR lower(m.color_name) LIKE '%gray%'
             OR lower(m.color_name) LIKE '%grey%'
             OR lower(m.color_name) LIKE '%silver%'
             OR lower(m.color_name) LIKE '%transparent%'
             OR lower(m.color_name) LIKE '%clear%'
             OR lower(m.color_name) LIKE '%natural%'
           THEN 1
           ELSE 0
         END,
         m.material,
         m.filament_name,
         m.color_name
       LIMIT 1`,
    )
    .get();
  if (strictRow) {
    return strictRow;
  }

  return db
    .prepare(
      `SELECT m.id, m.vendor, m.material, m.filament_name, m.color_name, m.hex_color, m.default_weight
       FROM filament_master_list m
       WHERE lower(m.vendor) LIKE '%bambu%'
         AND COALESCE(m.is_discontinued, 0) = 0
         AND COALESCE(m.hex_color, '') <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM filament_spools fs
           WHERE fs.master_id = m.id
             AND fs.deleted_at IS NULL
         )
       ORDER BY
         CASE
           WHEN lower(m.color_name) LIKE '%black%'
             OR lower(m.color_name) LIKE '%white%'
             OR lower(m.color_name) LIKE '%gray%'
             OR lower(m.color_name) LIKE '%grey%'
             OR lower(m.color_name) LIKE '%silver%'
             OR lower(m.color_name) LIKE '%transparent%'
             OR lower(m.color_name) LIKE '%clear%'
             OR lower(m.color_name) LIKE '%natural%'
           THEN 1
           ELSE 0
         END,
         m.material,
         m.filament_name,
         m.color_name
       LIMIT 1`,
    )
    .get();
}

function findSlotForObservedTray(db, printerId, tray) {
  const trayIndex = Number(tray?.tray_index);
  if (!Number.isFinite(trayIndex) || trayIndex < 0 || trayIndex >= 128) {
    return null;
  }
  const slotIndex = trayIndex + 1;
  const amsIndex = Number(tray?.ams_index);
  const preferredAmsNumber = Number.isFinite(amsIndex) ? Math.max(1, amsIndex + 1) : 1;
  return (
    db
      .prepare(
        `SELECT s.id AS slot_id, s.ams_id, s.slot_index, s.spool_id
         FROM ams_slots s
         JOIN ams_units u ON u.id = s.ams_id
         WHERE u.printer_id = ?
           AND u.id NOT LIKE '%_ext'
           AND s.slot_index = ?
         ORDER BY CASE WHEN u.id LIKE ? THEN 0 ELSE 1 END, u.id
         LIMIT 1`,
      )
      .get(printerId, slotIndex, `%_ams_${preferredAmsNumber}`) ?? null
  );
}

function findSlotOnboardingFixtureTarget(db) {
  const rows = db
    .prepare(
      `SELECT key, value
       FROM settings
       WHERE key LIKE ? || '%'
       ORDER BY key ASC`,
    )
    .all(BAMBU_LIVE_SETTING_PREFIX);
  for (const row of rows) {
    const printerId = String(row.key).slice(BAMBU_LIVE_SETTING_PREFIX.length);
    const config = safeJsonParse(row.value);
    const trays = config?.observed_state?.trays;
    if (!printerId || !Array.isArray(trays)) {
      continue;
    }
    for (let trayIndex = 0; trayIndex < trays.length; trayIndex += 1) {
      const tray = trays[trayIndex];
      if (!tray?.loaded) {
        continue;
      }
      const slot = findSlotForObservedTray(db, printerId, tray);
      if (slot) {
        return {
          config,
          printerId,
          settingKey: row.key,
          slot,
          tray,
          trayArrayIndex: trayIndex,
        };
      }
    }
  }
  return null;
}

async function applyPrinterSlotOnboardingFixtureWithBetterSqlite(dbPath, options = {}) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath);
  try {
    const target = findSlotOnboardingFixtureTarget(db);
    if (!target) {
      throw new Error("No loaded Bambu Live AMS tray was found for printer slot onboarding QA.");
    }
    const master = chooseSlotOnboardingCatalogMaster(db);
    if (!master) {
      throw new Error("No unused Bambu catalog master was found for printer slot onboarding QA.");
    }

    const now = (options.now ?? new Date()).toISOString();
    const fixtureIdentity = `VISUALQA-${target.slot.slot_id}`;
    const nextTray = {
      ...target.tray,
      loaded: true,
      filament_type: master.material,
      filament_name: master.filament_name,
      color_hex: master.hex_color,
      remaining_percent: target.tray.remaining_percent ?? 88,
      observed_rfid_tag: null,
      tray_uuid: fixtureIdentity,
      chip_id: null,
      tray_info_idx: target.tray.tray_info_idx ?? null,
      tray_id_name: `${master.filament_name} (${master.color_name})`,
      last_identity_seen_at: now,
      matched_inventory_spool_id: null,
      matched_inventory_mode: null,
      match_status: "unknown_rfid",
      match_note: "Visual QA fixture: unknown Bambu RFID for catalog onboarding.",
    };
    const nextConfig = structuredClone(target.config);
    nextConfig.observed_state = nextConfig.observed_state ?? {};
    nextConfig.observed_state.online = true;
    nextConfig.observed_state.mqtt_connected = true;
    nextConfig.observed_state.last_seen_at = now;
    nextConfig.observed_state.active_ams_index = nextTray.ams_index ?? null;
    nextConfig.observed_state.active_tray_index = nextTray.tray_index;
    nextConfig.observed_state.trays = [...(nextConfig.observed_state.trays ?? [])];
    nextConfig.observed_state.trays[target.trayArrayIndex] = nextTray;

    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE ams_slots
         SET spool_id = NULL,
             rfid_override_tray_uuid = NULL,
             rfid_override_color_hex = NULL,
             live_cache_cleared_at = NULL,
             last_seen_at = ?
         WHERE id = ?`,
      ).run(now, target.slot.slot_id);
      db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
        JSON.stringify(nextConfig),
        target.settingKey,
      );
    });
    transaction();

    return {
      fixture: VISUAL_QA_FIXTURE_PRINTER_SLOT_ONBOARDING,
      printerId: target.printerId,
      slotId: target.slot.slot_id,
      masterId: master.id,
      material: master.material,
      filamentName: master.filament_name,
      colorName: master.color_name,
      hexColor: master.hex_color,
      rfid: fixtureIdentity,
    };
  } finally {
    db.close();
  }
}

function chooseRfidOverrideFixtureSpool(db, preferredSpoolId) {
  if (preferredSpoolId) {
    const preferred = db
      .prepare(
        `SELECT fs.id AS spool_id,
                m.id AS master_id,
                m.vendor,
                m.material,
                m.filament_name,
                m.color_name,
                m.hex_color
         FROM filament_spools fs
         JOIN filament_master_list m ON m.id = fs.master_id
         WHERE fs.id = ?
           AND fs.deleted_at IS NULL
         LIMIT 1`,
      )
      .get(preferredSpoolId);
    if (preferred) {
      return preferred;
    }
  }

  return db
    .prepare(
      `SELECT fs.id AS spool_id,
              m.id AS master_id,
              m.vendor,
              m.material,
              m.filament_name,
              m.color_name,
              m.hex_color
       FROM filament_spools fs
       JOIN filament_master_list m ON m.id = fs.master_id
       WHERE fs.deleted_at IS NULL
       ORDER BY
         CASE WHEN COALESCE(m.hex_color, '') <> '' THEN 0 ELSE 1 END,
         CASE
           WHEN lower(m.color_name) LIKE '%black%'
             OR lower(m.color_name) LIKE '%white%'
             OR lower(m.color_name) LIKE '%gray%'
             OR lower(m.color_name) LIKE '%grey%'
             OR lower(m.color_name) LIKE '%silver%'
             OR lower(m.color_name) LIKE '%transparent%'
             OR lower(m.color_name) LIKE '%clear%'
             OR lower(m.color_name) LIKE '%natural%'
           THEN 1
           ELSE 0
         END,
         lower(m.vendor) LIKE '%bambu%' DESC,
         m.material,
         m.filament_name,
         m.color_name
       LIMIT 1`,
    )
    .get();
}

async function applyPrinterRfidOverrideFixtureWithBetterSqlite(dbPath, options = {}) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath);
  try {
    const target = findSlotOnboardingFixtureTarget(db);
    if (!target) {
      throw new Error("No loaded Bambu Live AMS tray was found for printer RFID override QA.");
    }
    const spool = chooseRfidOverrideFixtureSpool(db, target.slot.spool_id);
    if (!spool) {
      throw new Error("No existing spool was found for printer RFID override QA.");
    }

    const now = (options.now ?? new Date()).toISOString();
    const fixtureIdentity = `VISUALQA-OVERRIDE-${target.slot.slot_id}`;
    const fixtureColor = spool.hex_color || target.tray.color_hex || "#64748B";
    const nextTray = {
      ...target.tray,
      loaded: true,
      filament_type: spool.material,
      filament_name: spool.filament_name,
      color_hex: fixtureColor,
      remaining_percent: target.tray.remaining_percent ?? 76,
      observed_rfid_tag: null,
      tray_uuid: fixtureIdentity,
      chip_id: null,
      tray_info_idx: target.tray.tray_info_idx ?? null,
      tray_id_name: `${spool.filament_name} (${spool.color_name})`,
      last_identity_seen_at: now,
      matched_inventory_spool_id: null,
      matched_inventory_mode: null,
      match_status: "unknown_rfid",
      match_note: "Visual QA fixture: manual RFID override for an unknown live identity.",
    };
    const nextConfig = structuredClone(target.config);
    nextConfig.observed_state = nextConfig.observed_state ?? {};
    nextConfig.observed_state.online = true;
    nextConfig.observed_state.mqtt_connected = true;
    nextConfig.observed_state.last_seen_at = now;
    nextConfig.observed_state.active_ams_index = nextTray.ams_index ?? null;
    nextConfig.observed_state.active_tray_index = nextTray.tray_index;
    nextConfig.observed_state.trays = [...(nextConfig.observed_state.trays ?? [])];
    nextConfig.observed_state.trays[target.trayArrayIndex] = nextTray;

    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE ams_slots
         SET spool_id = ?,
             rfid_override_tray_uuid = ?,
             rfid_override_color_hex = ?,
             live_cache_cleared_at = NULL,
             last_seen_at = ?
         WHERE id = ?`,
      ).run(spool.spool_id, fixtureIdentity, fixtureColor, now, target.slot.slot_id);
      db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
        JSON.stringify(nextConfig),
        target.settingKey,
      );
    });
    transaction();

    return {
      fixture: VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE,
      printerId: target.printerId,
      slotId: target.slot.slot_id,
      spoolId: spool.spool_id,
      masterId: spool.master_id,
      material: spool.material,
      filamentName: spool.filament_name,
      colorName: spool.color_name,
      hexColor: fixtureColor,
      rfid: fixtureIdentity,
    };
  } finally {
    db.close();
  }
}

export function chooseBalancedCatalogSwatchFixtureRows(candidates, limit = 8) {
  const safeLimit = Math.max(0, Number.parseInt(String(limit), 10) || 0);
  if (safeLimit === 0) {
    return [];
  }
  const vendorRows = (vendor) =>
    candidates.filter((row) => String(row.vendor ?? "").toLowerCase().includes(vendor));
  const esunRows = vendorRows("esun");
  const bambuRows = vendorRows("bambu");
  const preferredPerVendor = Math.floor(safeLimit / 2);
  const selected = [];
  const selectedIds = new Set();
  const add = (row) => {
    const id = String(row?.id ?? "");
    if (!id || selectedIds.has(id) || selected.length >= safeLimit) {
      return;
    }
    selected.push(row);
    selectedIds.add(id);
  };

  for (let index = 0; index < preferredPerVendor; index += 1) {
    add(esunRows[index]);
    add(bambuRows[index]);
  }
  for (const row of candidates) {
    add(row);
  }
  return selected;
}

async function applySettingsCatalogMissingSwatchesFixtureWithBetterSqlite(dbPath) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath);
  try {
    const columns = new Set(
      db
        .prepare("PRAGMA table_info(filament_master_list)")
        .all()
        .map((row) => String(row.name)),
    );
    const candidates = db
      .prepare(
        `SELECT id, vendor, material, filament_name, color_name
         FROM filament_master_list
         WHERE COALESCE(is_discontinued, 0) = 0
           AND COALESCE(hex_color, '') <> ''
         ORDER BY
           CASE
             WHEN lower(color_name) LIKE '%black%'
               OR lower(color_name) LIKE '%white%'
               OR lower(color_name) LIKE '%gray%'
               OR lower(color_name) LIKE '%grey%'
               OR lower(color_name) LIKE '%silver%'
               OR lower(color_name) LIKE '%transparent%'
               OR lower(color_name) LIKE '%clear%'
               OR lower(color_name) LIKE '%natural%'
             THEN 1
             ELSE 0
           END,
           CASE
             WHEN lower(vendor) LIKE '%esun%' THEN 0
             WHEN lower(vendor) LIKE '%bambu%' THEN 1
             ELSE 2
           END,
           lower(material),
           lower(filament_name),
           lower(color_name),
           id`,
      )
      .all();
    const rows = chooseBalancedCatalogSwatchFixtureRows(candidates, 8);
    if (rows.length === 0) {
      throw new Error("No catalog masters with saved swatches were found for swatch-review QA.");
    }

    const updateParts = ["hex_color = NULL"];
    if (columns.has("catalog_user_edited")) {
      updateParts.push("catalog_user_edited = 1");
    }
    if (columns.has("updated_at")) {
      updateParts.push("updated_at = datetime('now')");
    }
    const clearSwatch = db.prepare(
      `UPDATE filament_master_list SET ${updateParts.join(", ")} WHERE id = ?`,
    );
    const transaction = db.transaction(() => {
      for (const row of rows) {
        clearSwatch.run(row.id);
      }
    });
    transaction();

    return {
      fixture: VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES,
      count: rows.length,
      masterIds: rows.map((row) => String(row.id)),
      vendors: [...new Set(rows.map((row) => String(row.vendor)).filter(Boolean))],
    };
  } finally {
    db.close();
  }
}

async function applyWishlistQueueFixtureWithBetterSqlite(dbPath, options = {}) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath);
  try {
    const masterColumns = sqliteTableColumns(db, "filament_master_list");
    const wishlistColumns = sqliteTableColumns(db, "wishlist_items");
    ensureSqliteColumns(
      masterColumns,
      "filament_master_list",
      ["id", "material", "filament_name", "color_name"],
      "Wishlist queue visual QA fixture",
    );
    ensureSqliteColumns(
      wishlistColumns,
      "wishlist_items",
      ["id", "material", "filament_name", "color_name", "vendor"],
      "Wishlist queue visual QA fixture",
    );

    const now = (options.now ?? new Date()).toISOString();
    const entries = [
      {
        id: "visual_qa_wishlist_planned",
        masterId: "visual_qa_master_wishlist_signal_red",
        vendor: "Bambu",
        material: "PLA",
        filamentName: "PLA Basic",
        colorName: "Signal Red",
        hexColor: "#E32636",
        status: "WISHLIST",
        quantity: 2,
        note: "Visual QA fixture: planned accent label stock.",
      },
      {
        id: "visual_qa_wishlist_on_order",
        masterId: "visual_qa_master_wishlist_teal",
        vendor: "eSUN",
        material: "PETG",
        filamentName: "PETG+",
        colorName: "Ocean Teal",
        hexColor: "#009688",
        status: "ON_ORDER",
        quantity: 3,
        note: "Visual QA fixture: arriving with the next supplier box.",
      },
      {
        id: "visual_qa_wishlist_received",
        masterId: "visual_qa_master_wishlist_violet",
        vendor: "Polymaker",
        material: "ASA",
        filamentName: "PolyLite ASA",
        colorName: "Deep Violet",
        hexColor: "#6D28D9",
        status: "RECEIVED",
        quantity: 1,
        note: "Visual QA fixture: ready to move into stock.",
      },
    ];

    const masterInsertColumns = [
      "id",
      "material",
      "filament_name",
      "color_name",
      ...(masterColumns.has("hex_color") ? ["hex_color"] : []),
      ...(masterColumns.has("vendor") ? ["vendor"] : []),
      ...(masterColumns.has("default_weight") ? ["default_weight"] : []),
      ...(masterColumns.has("is_discontinued") ? ["is_discontinued"] : []),
      ...(masterColumns.has("catalog_source") ? ["catalog_source"] : []),
      ...(masterColumns.has("catalog_user_edited") ? ["catalog_user_edited"] : []),
      ...(masterColumns.has("updated_at") ? ["updated_at"] : []),
    ];
    const masterUpdateColumns = masterInsertColumns.filter((column) => column !== "id");
    const upsertMaster = db.prepare(
      `INSERT INTO filament_master_list (${masterInsertColumns.join(", ")})
       VALUES (${masterInsertColumns.map(() => "?").join(", ")})
       ON CONFLICT(id) DO UPDATE SET ${masterUpdateColumns
         .map((column) => `${column} = excluded.${column}`)
         .join(", ")}`,
    );

    const wishlistInsertColumns = [
      "id",
      ...(wishlistColumns.has("master_id") ? ["master_id"] : []),
      "material",
      "filament_name",
      "color_name",
      "vendor",
      ...(wishlistColumns.has("status") ? ["status"] : []),
      ...(wishlistColumns.has("quantity") ? ["quantity"] : []),
      ...(wishlistColumns.has("note") ? ["note"] : []),
      ...(wishlistColumns.has("created_at") ? ["created_at"] : []),
      ...(wishlistColumns.has("updated_at") ? ["updated_at"] : []),
    ];
    const wishlistUpdateColumns = wishlistInsertColumns.filter((column) => column !== "id");
    const upsertWishlist = db.prepare(
      `INSERT INTO wishlist_items (${wishlistInsertColumns.join(", ")})
       VALUES (${wishlistInsertColumns.map(() => "?").join(", ")})
       ON CONFLICT(id) DO UPDATE SET ${wishlistUpdateColumns
         .map((column) => `${column} = excluded.${column}`)
         .join(", ")}`,
    );

    const masterValues = (entry) =>
      masterInsertColumns.map((column) => {
        switch (column) {
          case "id":
            return entry.masterId;
          case "material":
            return entry.material;
          case "filament_name":
            return entry.filamentName;
          case "color_name":
            return entry.colorName;
          case "hex_color":
            return entry.hexColor;
          case "vendor":
            return entry.vendor;
          case "default_weight":
            return 1000;
          case "is_discontinued":
            return 0;
          case "catalog_source":
            return "visual_qa";
          case "catalog_user_edited":
            return 1;
          case "updated_at":
            return now;
          default:
            return null;
        }
      });
    const wishlistValues = (entry) =>
      wishlistInsertColumns.map((column) => {
        switch (column) {
          case "id":
            return entry.id;
          case "master_id":
            return entry.masterId;
          case "material":
            return entry.material;
          case "filament_name":
            return entry.filamentName;
          case "color_name":
            return entry.colorName;
          case "vendor":
            return entry.vendor;
          case "status":
            return entry.status;
          case "quantity":
            return entry.quantity;
          case "note":
            return entry.note;
          case "created_at":
          case "updated_at":
            return now;
          default:
            return null;
        }
      });

    const transaction = db.transaction(() => {
      for (const entry of entries) {
        upsertMaster.run(...masterValues(entry));
        upsertWishlist.run(...wishlistValues(entry));
      }
    });
    transaction();

    return {
      fixture: VISUAL_QA_FIXTURE_WISHLIST_QUEUE,
      count: entries.length,
      itemIds: entries.map((entry) => entry.id),
      statuses: entries.map((entry) => entry.status),
    };
  } finally {
    db.close();
  }
}

async function applyLoanDialogsFixtureWithBetterSqlite(dbPath, options = {}) {
  const module = await import("better-sqlite3");
  const Database = module.default ?? module;
  const db = new Database(dbPath);
  try {
    const masterColumns = sqliteTableColumns(db, "filament_master_list");
    const spoolColumns = sqliteTableColumns(db, "filament_spools");
    const loanColumns = sqliteTableColumns(db, "spool_loans");
    ensureSqliteColumns(
      masterColumns,
      "filament_master_list",
      ["id", "material", "filament_name", "color_name", "hex_color", "default_weight", "vendor"],
      "Loan dialog visual QA fixture",
    );
    ensureSqliteColumns(
      spoolColumns,
      "filament_spools",
      [
        "id",
        "master_id",
        "status",
        "ownership_type",
        "owner_name",
        "owner_contact",
        "ownership_note",
        "initial_weight_g",
        "current_weight_g",
        "remaining_g",
        "spool_tare_weight_g",
        "deleted_at",
        "created_at",
        "updated_at",
      ],
      "Loan dialog visual QA fixture",
    );
    ensureSqliteColumns(
      loanColumns,
      "spool_loans",
      [
        "id",
        "spool_id",
        "borrower_name",
        "loan_direction",
        "loan_status",
        "counterparty_name",
        "counterparty_contact",
        "counterparty_note",
        "grams_out",
        "lent_note",
        "lent_at",
        "returned_at",
        "returned_grams",
        "consumed_grams",
        "return_note",
      ],
      "Loan dialog visual QA fixture",
    );

    const now = options.now ?? new Date();
    const timestamp = now.toISOString();
    const inboundLentAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1_000).toISOString();
    const outboundLentAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000).toISOString();
    const outboundReturnedAt = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1_000).toISOString();
    const entries = [
      {
        masterId: "visual_qa_master_inbound_lagoon",
        spoolId: "visual_qa_spool_inbound_lagoon",
        loanId: "visual_qa_loan_inbound_lagoon",
        vendor: "Bambu",
        material: "PETG",
        filamentName: "PETG HF",
        colorName: "Lagoon Blue",
        hexColor: "#0081A7",
        ownershipType: "BORROWED_IN",
        ownerName: "Maja Solberg",
        ownerContact: "maja@example.test",
        ownershipNote: "Visual QA fixture: borrowed-in roll for hand-back review.",
        currentWeight: 742,
        direction: "INBOUND",
        status: "ACTIVE",
        partyName: "Maja Solberg",
        lentAt: inboundLentAt,
        returnedAt: null,
        returnedGrams: null,
        consumedGrams: null,
      },
      {
        masterId: "visual_qa_master_outbound_coral",
        spoolId: "visual_qa_spool_outbound_coral",
        loanId: "visual_qa_loan_outbound_coral",
        vendor: "Polymaker",
        material: "PLA",
        filamentName: "PolyTerra PLA",
        colorName: "Coral Signal",
        hexColor: "#F25F5C",
        ownershipType: "OWNED",
        ownerName: null,
        ownerContact: null,
        ownershipNote: null,
        currentWeight: 620,
        direction: "OUTBOUND",
        status: "RETURNED",
        partyName: "Nora Berg",
        lentAt: outboundLentAt,
        returnedAt: outboundReturnedAt,
        returnedGrams: 620,
        consumedGrams: 380,
      },
    ];

    const upsertMaster = db.prepare(
      `INSERT INTO filament_master_list
       (id, material, filament_name, color_name, hex_color, default_weight, vendor)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         material = excluded.material,
         filament_name = excluded.filament_name,
         color_name = excluded.color_name,
         hex_color = excluded.hex_color,
         default_weight = excluded.default_weight,
         vendor = excluded.vendor`,
    );
    const upsertSpool = db.prepare(
      `INSERT INTO filament_spools
       (id, master_id, status, ownership_type, owner_name, owner_contact, ownership_note,
        initial_weight_g, current_weight_g, remaining_g, spool_tare_weight_g, deleted_at,
        created_at, updated_at)
       VALUES (?, ?, 'IN_STOCK', ?, ?, ?, ?, 1000, ?, ?, 250, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         master_id = excluded.master_id,
         status = excluded.status,
         ownership_type = excluded.ownership_type,
         owner_name = excluded.owner_name,
         owner_contact = excluded.owner_contact,
         ownership_note = excluded.ownership_note,
         initial_weight_g = excluded.initial_weight_g,
         current_weight_g = excluded.current_weight_g,
         remaining_g = excluded.remaining_g,
         spool_tare_weight_g = excluded.spool_tare_weight_g,
         deleted_at = NULL,
         updated_at = excluded.updated_at`,
    );
    const upsertLoan = db.prepare(
      `INSERT INTO spool_loans
       (id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
        counterparty_contact, counterparty_note, grams_out, lent_note, lent_at,
        returned_at, returned_grams, consumed_grams, return_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1000, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         spool_id = excluded.spool_id,
         borrower_name = excluded.borrower_name,
         loan_direction = excluded.loan_direction,
         loan_status = excluded.loan_status,
         counterparty_name = excluded.counterparty_name,
         counterparty_contact = excluded.counterparty_contact,
         counterparty_note = excluded.counterparty_note,
         grams_out = excluded.grams_out,
         lent_note = excluded.lent_note,
         lent_at = excluded.lent_at,
         returned_at = excluded.returned_at,
         returned_grams = excluded.returned_grams,
         consumed_grams = excluded.consumed_grams,
         return_note = excluded.return_note`,
    );

    const transaction = db.transaction(() => {
      for (const entry of entries) {
        upsertMaster.run(
          entry.masterId,
          entry.material,
          entry.filamentName,
          entry.colorName,
          entry.hexColor,
          1000,
          entry.vendor,
        );
        upsertSpool.run(
          entry.spoolId,
          entry.masterId,
          entry.ownershipType,
          entry.ownerName,
          entry.ownerContact,
          entry.ownershipNote,
          entry.currentWeight,
          entry.currentWeight,
          timestamp,
          timestamp,
        );
        upsertLoan.run(
          entry.loanId,
          entry.spoolId,
          entry.partyName,
          entry.direction,
          entry.status,
          entry.partyName,
          entry.ownerContact,
          "Visual QA fixture: data-connected loan dialog coverage.",
          "Visual QA fixture loan.",
          entry.lentAt,
          entry.returnedAt,
          entry.returnedGrams,
          entry.consumedGrams,
          entry.returnedAt ? "Visual QA fixture return." : null,
        );
      }
    });
    transaction();

    return {
      fixture: VISUAL_QA_FIXTURE_LOAN_DIALOGS,
      inboundLoanId: entries[0].loanId,
      inboundPartyName: entries[0].partyName,
      outboundLoanId: entries[1].loanId,
      outboundPartyName: entries[1].partyName,
    };
  } finally {
    db.close();
  }
}

export async function applyVisualQaDatabaseFixture(dbPath, scenario, options = {}) {
  const fixture = normalizeVisualQaDatabaseFixtureScenario(scenario);
  if (!fixture) {
    return null;
  }
  if (options.live) {
    return null;
  }
  if (fixture === VISUAL_QA_FIXTURE_PRINTER_SLOT_ONBOARDING) {
    return applyPrinterSlotOnboardingFixtureWithBetterSqlite(dbPath, options);
  }
  if (fixture === VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE) {
    return applyPrinterRfidOverrideFixtureWithBetterSqlite(dbPath, options);
  }
  if (fixture === VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES) {
    return applySettingsCatalogMissingSwatchesFixtureWithBetterSqlite(dbPath);
  }
  if (fixture === VISUAL_QA_FIXTURE_WISHLIST_QUEUE) {
    return applyWishlistQueueFixtureWithBetterSqlite(dbPath, options);
  }
  if (fixture === VISUAL_QA_FIXTURE_LOAN_DIALOGS) {
    return applyLoanDialogsFixtureWithBetterSqlite(dbPath, options);
  }
  return null;
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
  fixtures = [],
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

  if (fixtures.length > 0) {
    lines.push("Visual QA database fixtures:");
    for (const fixture of fixtures) {
      if (fixture.fixture === VISUAL_QA_FIXTURE_PRINTER_SLOT_ONBOARDING) {
        lines.push(
          `  - ${fixture.fixture}: ${fixture.slotId} -> ${fixture.material} ${fixture.filamentName} ${fixture.colorName}`,
        );
      } else if (fixture.fixture === VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE) {
        lines.push(
          `  - ${fixture.fixture}: ${fixture.slotId} -> ${fixture.material} ${fixture.filamentName} ${fixture.colorName}`,
        );
      } else if (fixture.fixture === VISUAL_QA_FIXTURE_TRUSTED_LAN_INTERFACE) {
        const previous = fixture.previousInterfaceAddress
          ? ` from ${fixture.previousInterfaceAddress}`
          : "";
        lines.push(
          `  - ${fixture.fixture}: ${fixture.interfaceName} ${fixture.interfaceAddress}:${fixture.port ?? 4278}${previous}`,
        );
      } else if (fixture.fixture === VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES) {
        const vendors = fixture.vendors?.length ? ` across ${fixture.vendors.join(", ")}` : "";
        lines.push(`  - ${fixture.fixture}: cleared ${fixture.count} swatch(es)${vendors}`);
      } else if (fixture.fixture === VISUAL_QA_FIXTURE_LOAN_DIALOGS) {
        lines.push(
          `  - ${fixture.fixture}: inbound ${fixture.inboundPartyName}, borrower ${fixture.outboundPartyName}`,
        );
      } else {
        lines.push(`  - ${fixture.fixture ?? "unknown"}`);
      }
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
  const trustedLanFixture = await applyTrustedLanInterfaceFixture(targetPath, {
    interfaces: options.interfaces,
    trustedLanPort: options.trustedLanPort,
  });
  const fixture = await applyVisualQaDatabaseFixture(targetPath, options.scenario, {
    now: options.now,
  });
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
    fixtures: [trustedLanFixture, fixture].filter(Boolean),
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
