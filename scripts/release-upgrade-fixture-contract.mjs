export const RELEASE_UPGRADE_FIXTURE_MARKER_KEY =
  "release_candidate_upgrade_fixture_v1";
export const RELEASE_UPGRADE_FIXTURE_MARKER_VALUE = "sanitized";
export const BAMBU_LIVE_SETTING_PREFIX = "bambu_live_integration:";
export const RELEASE_UPGRADE_SAFE_BAMBU_LIVE_CONFIG = Object.freeze({
  access_code_configured: false,
  enabled: false,
  last_error: null,
  observed_state: null,
});

export const RELEASE_UPGRADE_GENERIC_COLUMN_VALUES = Object.freeze([
  Object.freeze(["inventory_locations", "name", "Release QA location"]),
  Object.freeze(["print_jobs", "job_name", "Release QA print"]),
  Object.freeze(["printer_live_usage_sessions", "job_name", "Release QA print"]),
  Object.freeze(["printers", "name", "Release QA printer"]),
  Object.freeze(["scales", "name", "Release QA scale"]),
  Object.freeze(["spool_loans", "borrower_name", "Release QA borrower"]),
  Object.freeze(["spool_loans", "counterparty_name", "Release QA borrower"]),
]);

export const RELEASE_UPGRADE_PRIVATE_SETTING_KEYS = Object.freeze([
  "credential_store_profile_id",
  "credential_store_profile_migration_v1",
  "library_sync_client_auth_configured",
  "library_sync_client_auth_expires_at",
  "library_sync_client_auth_paired_at",
  "library_sync_client_csrf_token",
  "library_sync_client_device_token",
  "library_sync_client_session_id",
  "library_sync_host_base_url",
  "library_sync_host_device_name",
  "library_sync_last_checked_at",
  "library_sync_last_reachable_at",
  "library_sync_last_validation_message",
  "secure_credential_storage_migration_v1",
]);

export const RELEASE_UPGRADE_PRIVATE_SETTING_PREFIXES = Object.freeze([
  "library_sync_cached_",
  "trusted_lan_pairing_",
]);

export const RELEASE_UPGRADE_EMPTY_TABLES = Object.freeze([
  "sync_queue",
  "trusted_lan_paired_browsers",
  "trusted_lan_pairings",
]);

const SEED_MANAGED_CATALOG_SOURCES = Object.freeze([
  "",
  "scraped",
  "seeded",
  "unknown",
]);
const SEED_MUTABLE_CATALOG_COLUMNS = new Set([
  "catalog_seed_version",
  "catalog_source",
  "last_seen_at",
  "updated_at",
]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function databaseTables(database) {
  return new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => String(name)),
  );
}

function tableColumns(database, table) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all()
      .map(({ name }) => String(name)),
  );
}

function assertNullColumn(database, table, column) {
  const tables = databaseTables(database);
  if (!tables.has(table) || !tableColumns(database, table).has(column)) {
    return;
  }
  const count = Number(
    database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM ${quoteIdentifier(table)}
          WHERE ${quoteIdentifier(column)} IS NOT NULL
            AND trim(CAST(${quoteIdentifier(column)} AS TEXT)) != ''`,
      )
      .get().count,
  );
  if (count > 0) {
    throw new Error(
      `Upgrade fixture still contains private ${table}.${column} values.`,
    );
  }
}

function assertFixedColumn(database, table, column, expected) {
  const tables = databaseTables(database);
  if (!tables.has(table) || !tableColumns(database, table).has(column)) {
    return;
  }
  const count = Number(
    database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM ${quoteIdentifier(table)}
          WHERE ${quoteIdentifier(column)} IS NULL
             OR CAST(${quoteIdentifier(column)} AS TEXT) != ?`,
      )
      .get(expected).count,
  );
  if (count > 0) {
    throw new Error(
      `Upgrade fixture must genericize ${table}.${column} values.`,
    );
  }
}

function canonicalDatabaseValue(value) {
  if (Buffer.isBuffer(value)) {
    return { base64: value.toString("base64"), type: "blob" };
  }
  return value;
}

function sameCanonicalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Captures user-owned values that startup must not rewrite.
 *
 * Settings are captured after fixture sanitization. New settings written by a
 * later release remain allowed, while every pre-existing safe preference must
 * keep its value. Catalog maintenance may update bundled rows and lifecycle
 * metadata, so only manual/user-edited rows and their user-owned columns are
 * protected.
 */
export function snapshotReleaseUpgradeProtectedValues(database) {
  const tables = databaseTables(database);
  const settings = Object.create(null);
  if (tables.has("settings")) {
    for (const { key, value } of database
      .prepare("SELECT key, value FROM settings ORDER BY key")
      .all()) {
      settings[String(key)] = canonicalDatabaseValue(value);
    }
  }

  const catalog = {
    columns: [],
    rows: Object.create(null),
  };
  if (!tables.has("filament_master_list")) {
    return { catalog, settings };
  }
  const columns = [...tableColumns(database, "filament_master_list")];
  if (!columns.includes("id")) {
    throw new Error("filament_master_list has no id column.");
  }
  const hasUserEdited = columns.includes("catalog_user_edited");
  const hasCatalogSource = columns.includes("catalog_source");
  if (!hasUserEdited && !hasCatalogSource) {
    return { catalog, settings };
  }
  catalog.columns = columns.filter(
    (column) => !SEED_MUTABLE_CATALOG_COLUMNS.has(column),
  );
  const predicates = [];
  if (hasUserEdited) {
    predicates.push("COALESCE(catalog_user_edited, 0) != 0");
  }
  if (hasCatalogSource) {
    predicates.push(
      `lower(trim(COALESCE(catalog_source, ''))) NOT IN (${SEED_MANAGED_CATALOG_SOURCES
        .map(() => "?")
        .join(", ")})`,
    );
  }
  const rows = database
    .prepare(
      `SELECT ${catalog.columns.map(quoteIdentifier).join(", ")}
         FROM filament_master_list
        WHERE ${predicates.map((predicate) => `(${predicate})`).join(" OR ")}
        ORDER BY id`,
    )
    .all(...(hasCatalogSource ? SEED_MANAGED_CATALOG_SOURCES : []));
  for (const row of rows) {
    const id = String(row.id);
    catalog.rows[id] = catalog.columns.map((column) =>
      canonicalDatabaseValue(row[column]),
    );
  }
  return { catalog, settings };
}

export function assertReleaseUpgradeProtectedValuesPreserved(before, after) {
  for (const [key, expected] of Object.entries(before.settings ?? {})) {
    if (!Object.hasOwn(after.settings ?? {}, key)) {
      throw new Error(`Upgrade removed the protected setting ${key}.`);
    }
    if (!sameCanonicalValue(after.settings[key], expected)) {
      throw new Error(`Upgrade changed the protected setting ${key}.`);
    }
  }

  const beforeCatalog = before.catalog ?? { columns: [], rows: {} };
  const afterCatalog = after.catalog ?? { columns: [], rows: {} };
  const afterColumns = new Map(
    (afterCatalog.columns ?? []).map((column, index) => [column, index]),
  );
  for (const column of beforeCatalog.columns ?? []) {
    if (!afterColumns.has(column)) {
      throw new Error(
        `Upgrade removed protected filament_master_list.${column}.`,
      );
    }
  }
  for (const [id, expectedRow] of Object.entries(beforeCatalog.rows ?? {})) {
    const actualRow = afterCatalog.rows?.[id];
    if (!actualRow) {
      throw new Error(`Upgrade removed protected catalog row ${id}.`);
    }
    const projected = (beforeCatalog.columns ?? []).map(
      (column) => actualRow[afterColumns.get(column)],
    );
    if (!sameCanonicalValue(projected, expectedRow)) {
      throw new Error(`Upgrade changed protected catalog row ${id}.`);
    }
  }
}

export function parseStrictReleaseUpgradeInteger(
  value,
  { label, maximum, minimum },
) {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < minimum ||
    normalized > maximum
  ) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return normalized;
}

export function assertReleaseUpgradeFixtureSanitized(database) {
  const tables = databaseTables(database);
  if (!tables.has("settings")) {
    throw new Error("Upgrade fixture has no settings table.");
  }

  const settings = database
    .prepare("SELECT key, value FROM settings")
    .all()
    .map(({ key, value }) => [String(key), String(value ?? "")]);
  const settingsMap = new Map(settings);
  if (
    settingsMap.get(RELEASE_UPGRADE_FIXTURE_MARKER_KEY) !==
    RELEASE_UPGRADE_FIXTURE_MARKER_VALUE
  ) {
    throw new Error(
      "Upgrade fixture is missing its exact safety-sanitization marker.",
    );
  }
  for (const [key] of settings) {
    if (
      RELEASE_UPGRADE_PRIVATE_SETTING_KEYS.includes(key) ||
      RELEASE_UPGRADE_PRIVATE_SETTING_PREFIXES.some((prefix) =>
        key.startsWith(prefix),
      )
    ) {
      throw new Error(`Upgrade fixture still contains private setting ${key}.`);
    }
  }

  const trustedLanEnabled = (
    settingsMap.get("trusted_lan_enabled") ?? "0"
  )
    .trim()
    .toLowerCase();
  if (!["0", "false"].includes(trustedLanEnabled)) {
    throw new Error("Upgrade fixture must disable the Trusted LAN server.");
  }
  if (
    (settingsMap.get("library_sync_mode") ?? "STANDALONE")
      .trim()
      .toUpperCase() !== "STANDALONE"
  ) {
    throw new Error("Upgrade fixture must use standalone library mode.");
  }

  for (const [key, value] of settings) {
    if (!key.startsWith(BAMBU_LIVE_SETTING_PREFIX)) {
      continue;
    }
    let config;
    try {
      config = JSON.parse(value);
    } catch {
      throw new Error("Upgrade fixture contains malformed Bambu Live settings.");
    }
    const safeKeys = Object.keys(RELEASE_UPGRADE_SAFE_BAMBU_LIVE_CONFIG).sort();
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(
        "Upgrade fixture must disable Bambu Live and clear its runtime state.",
      );
    }
    if (
      JSON.stringify(Object.keys(config).sort()) !== JSON.stringify(safeKeys) ||
      safeKeys.some(
        (key) =>
          !sameCanonicalValue(
            config[key],
            RELEASE_UPGRADE_SAFE_BAMBU_LIVE_CONFIG[key],
          ),
      )
    ) {
      throw new Error(
        "Upgrade fixture Bambu Live settings must use the minimal safe shape.",
      );
    }
  }

  for (const table of RELEASE_UPGRADE_EMPTY_TABLES) {
    if (
      tables.has(table) &&
      Number(
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`,
          )
          .get().count,
      ) > 0
    ) {
      throw new Error(`Upgrade fixture must empty ${table}.`);
    }
  }

  for (const [table, column] of [
    ["filament_spools", "batch_code"],
    ["filament_spools", "owner_contact"],
    ["filament_spools", "owner_name"],
    ["filament_spools", "ownership_note"],
    ["filament_spools", "qr_code"],
    ["filament_spools", "rfid_observed_at"],
    ["filament_spools", "rfid_tag"],
    ["ams_slots", "rfid_override_tray_uuid"],
    ["printers", "access_token"],
    ["printers", "ip_address"],
    ["scales", "device_id"],
    ["scan_events", "qr_code"],
    ["spool_loans", "counterparty_contact"],
    ["spool_loans", "counterparty_note"],
    ["spool_loans", "lent_note"],
    ["spool_loans", "return_note"],
    ["wishlist_items", "note"],
  ]) {
    assertNullColumn(database, table, column);
  }

  for (const [table, column, expected] of RELEASE_UPGRADE_GENERIC_COLUMN_VALUES) {
    assertFixedColumn(database, table, column, expected);
  }

  for (const table of [
    "alerts",
    "printer_live_events",
    "spool_history_events",
  ]) {
    if (!tables.has(table) || !tableColumns(database, table).has("payload_json")) {
      continue;
    }
    const privatePayloads = Number(
      database
        .prepare(
          `SELECT COUNT(*) AS count
             FROM ${quoteIdentifier(table)}
            WHERE payload_json != '{}'`,
        )
        .get().count,
    );
    if (privatePayloads > 0) {
      throw new Error(
        `Upgrade fixture still contains private ${table} payloads.`,
      );
    }
  }
}
