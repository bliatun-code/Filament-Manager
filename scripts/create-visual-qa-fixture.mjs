import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import {
  assertVisualQaDatabaseTarget,
  cleanupVisualQaDatabase,
} from "./visual-qa-db.mjs";

export const VISUAL_QA_SEED_PATH = fileURLToPath(
  new URL("../test_fixtures/visual_qa_seed.json", import.meta.url),
);
export const VISUAL_QA_SCHEMA_PATH = fileURLToPath(
  new URL("../src/database/schema.sql", import.meta.url),
);
export const VISUAL_QA_SEED_SHA256 =
  "6a3943e6f3d53ed1fc63bab594a0a462dae2e32100a6beded993c4fc61d0b979";

const ALLOWED_VISUAL_QA_SEED_COLUMNS = new Map(
  Object.entries({
    filament_master_list: [
      "catalog_source",
      "catalog_user_edited",
      "color_name",
      "default_weight",
      "filament_name",
      "hex_color",
      "id",
      "material",
      "vendor",
    ],
    inventory_locations: ["id", "name", "type"],
    filament_spools: [
      "current_weight_g",
      "home_location_id",
      "id",
      "initial_weight_g",
      "location_id",
      "master_id",
      "owner_name",
      "ownership_note",
      "ownership_type",
      "purchase_date",
      "qr_code",
      "remaining_g",
      "status",
    ],
    printers: ["id", "model", "name"],
    ams_units: ["id", "printer_id", "slot_count"],
    ams_slots: ["ams_id", "id", "slot_index", "spool_id"],
    spool_history_events: ["created_at", "event_type", "id", "payload_json", "spool_id"],
    spool_loans: [
      "borrower_name",
      "consumed_grams",
      "grams_out",
      "id",
      "lent_at",
      "loan_direction",
      "loan_status",
      "returned_at",
      "returned_grams",
      "spool_id",
    ],
    wishlist_items: [
      "color_name",
      "filament_name",
      "id",
      "material",
      "note",
      "quantity",
      "status",
      "vendor",
    ],
    print_jobs: [
      "ended_at",
      "id",
      "job_name",
      "material_used_g",
      "printer_id",
      "spool_id",
      "started_at",
      "success",
    ],
    printer_live_events: ["created_at", "event_type", "id", "payload_json", "printer_id"],
    printer_live_usage_sessions: [
      "finished_at",
      "id",
      "job_name",
      "last_seen_at",
      "print_type",
      "printer_id",
      "session_key",
      "source",
      "started_at",
      "status",
      "success",
      "total_used_g",
    ],
    printer_live_usage_session_spools: ["id", "session_id", "spool_id", "used_g"],
    settings: ["key", "value"],
  }).map(([table, columns]) => [table, new Set(columns)]),
);

const ALLOWED_VISUAL_QA_SETTING_KEYS = new Set([
  "app_language",
  "library_sync_library_id",
  "theme_mode",
  "trusted_lan_enabled",
]);
const APPROVED_VISUAL_QA_SETTINGS = new Map([
  ["app_language", "en"],
  ["library_sync_library_id", "qa-library"],
  ["theme_mode", "dark"],
  ["trusted_lan_enabled", "1"],
]);

const APPROVED_SYNTHETIC_IDENTITIES = [
  {
    field: "borrowername",
    path: /^\$seed\.tables\.spool_loans\[\d+\]\.borrower_name$/,
    values: new Set(["Sample maker space"]),
  },
  {
    field: "jobname",
    path: /^\$seed\.tables\.(?:print_jobs|printer_live_usage_sessions)\[\d+\]\.job_name$/,
    values: new Set(["QA calibration sample"]),
  },
  {
    field: "name",
    path: /^\$seed\.tables\.inventory_locations\[\d+\]\.name$/,
    values: new Set(["QA Dry box", "QA Shelf A"]),
  },
  {
    field: "name",
    path: /^\$seed\.tables\.printers\[\d+\]\.name$/,
    values: new Set(["Atlas QA", "Nova QA"]),
  },
  {
    field: "note",
    path: /^\$seed\.tables\.wishlist_items\[\d+\]\.note$/,
    values: new Set(["Synthetic QA record"]),
  },
  {
    field: "ownername",
    path: /^\$seed\.tables\.filament_spools\[\d+\]\.owner_name$/,
    values: new Set(["Sample workshop"]),
  },
  {
    field: "ownershipnote",
    path: /^\$seed\.tables\.filament_spools\[\d+\]\.ownership_note$/,
    values: new Set(["Synthetic QA record"]),
  },
];
const SYNTHETIC_IDENTITY_FIELDS = new Set(
  APPROVED_SYNTHETIC_IDENTITIES.map(({ field }) => field),
);

const FORBIDDEN_SEED_FIELD_KEY_FRAGMENTS = [
  "accesscode",
  "apikey",
  "credential",
  "password",
  "passcode",
  "passphrase",
  "privatekey",
  "secret",
  "serial",
  "serialnumber",
  "printerserial",
  "token",
];

const FORBIDDEN_SEED_VALUE_PATTERNS = [
  { label: "personal Unix path", pattern: /\/(?:Users|home)\//i },
  { label: "personal Windows path", pattern: /[A-Z]:[\\/]+Users[\\/]+/i },
  {
    label: "private or loopback address",
    pattern: /(?:^|[^\d])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?:[^\d]|$)/,
  },
  {
    label: "credential field",
    pattern: /\b(?:access_code|access_token|device_token|pairing_token|csrf_token|printer_serial)\b/i,
  },
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: "telephone contact data",
    pattern: /\b(?:tel|telephone|phone|mobile)\s*[:=]\s*\+?\d[\d ().-]{5,}\d\b/i,
  },
  {
    label: "telephone contact data",
    pattern: /(?:^|[^\w])\+\d[\d ().-]{6,}\d(?:$|[^\w])/,
  },
];

const FORBIDDEN_SEED_FIELD_KEYS = new Map([
  ["accesscode", "credential field"],
  ["accesstoken", "credential field"],
  ["devicetoken", "credential field"],
  ["pairingtoken", "credential field"],
  ["csrftoken", "credential field"],
  ["printerserial", "credential field"],
  ["email", "contact field"],
  ["emailaddress", "contact field"],
  ["contactemail", "contact field"],
  ["phone", "contact field"],
  ["phonenumber", "contact field"],
  ["telephone", "contact field"],
  ["mobile", "contact field"],
  ["mobilephone", "contact field"],
  ["contact", "contact field"],
  ["contactname", "contact field"],
  ["contactaddress", "contact field"],
  ["contactphone", "contact field"],
  ["contactnumber", "contact field"],
  ["ownercontact", "contact field"],
  ["counterpartycontact", "contact field"],
  ["address", "contact field"],
  ["streetaddress", "contact field"],
  ["postaladdress", "contact field"],
  ["mailingaddress", "contact field"],
  ["host", "network field"],
  ["hostname", "network field"],
  ["ipaddress", "network field"],
  ["printerip", "network field"],
  ["bindaddress", "network field"],
  ["selectedinterfaceaddress", "network field"],
  ["macaddress", "network field"],
]);

const MAX_DECODE_PASSES = 4;
const MAX_NESTED_JSON_DEPTH = 12;

function decodeJsonEscapeSequences(value) {
  return value.replace(
    /\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,
    (match, bracedCodePoint, codePoint, byte) => {
      const encoded = bracedCodePoint ?? codePoint ?? byte;
      const parsed = Number.parseInt(encoded, 16);
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return match;
      }
    },
  );
}

function decodedSeedTextCandidates(value) {
  const candidates = [];
  let current = String(value).normalize("NFKC");
  for (let index = 0; index < MAX_DECODE_PASSES; index += 1) {
    if (!candidates.includes(current)) {
      candidates.push(current);
    }
    const jsonDecoded = decodeJsonEscapeSequences(current);
    let percentDecoded = jsonDecoded;
    try {
      percentDecoded = decodeURIComponent(jsonDecoded);
    } catch {
      // A literal percent sign is valid fixture text. Keep the other decoded forms.
    }
    if (percentDecoded === current) {
      break;
    }
    current = percentDecoded.normalize("NFKC");
  }
  return candidates;
}

function normalizedSeedFieldKey(value) {
  return value.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/g, "");
}

function containsIpAddress(value) {
  const ipv4Candidates = value.match(/(?:^|[^A-Za-z0-9])((?:\d{1,3}\.){3}\d{1,3})(?=$|[^A-Za-z0-9])/g) ?? [];
  if (
    ipv4Candidates.some((candidate) => {
      const address = candidate.match(/(?:\d{1,3}\.){3}\d{1,3}/)?.[0] ?? "";
      return isIP(address) === 4;
    })
  ) {
    return true;
  }
  const candidates = value.match(/[0-9a-f:.%]{2,}/gi) ?? [];
  for (const candidate of candidates) {
    const withoutZone = candidate.split("%", 1)[0];
    if (isIP(withoutZone) === 6) {
      return true;
    }
  }
  return false;
}

function forbiddenSeedFieldLabel(normalizedKey) {
  const exactLabel = FORBIDDEN_SEED_FIELD_KEYS.get(normalizedKey);
  if (exactLabel) {
    return exactLabel;
  }
  return FORBIDDEN_SEED_FIELD_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))
    ? "credential field"
    : null;
}

function assertApprovedSyntheticIdentity(normalizedKey, value, location) {
  if (!SYNTHETIC_IDENTITY_FIELDS.has(normalizedKey)) {
    return;
  }
  const approval = APPROVED_SYNTHETIC_IDENTITIES.find(
    ({ field, path }) => field === normalizedKey && path.test(location),
  );
  if (!approval || !approval.values.has(String(value ?? ""))) {
    throw new Error(`Visual QA seed contains an unapproved identity value at ${location}.`);
  }
}

function assertSemanticFieldName(value, location) {
  for (const candidate of decodedSeedTextCandidates(value)) {
    const label = forbiddenSeedFieldLabel(normalizedSeedFieldKey(candidate));
    if (label) {
      throw new Error(`Visual QA seed contains a forbidden ${label} at ${location}.`);
    }
  }
}

function assertSanitizedSeedText(value, location) {
  for (const candidate of decodedSeedTextCandidates(value)) {
    for (const { label, pattern } of FORBIDDEN_SEED_VALUE_PATTERNS) {
      if (pattern.test(candidate)) {
        throw new Error(`Visual QA seed contains a forbidden ${label} at ${location}.`);
      }
    }
    if (containsIpAddress(candidate)) {
      throw new Error(`Visual QA seed contains a forbidden IP address at ${location}.`);
    }
    if (/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i.test(candidate)) {
      throw new Error(`Visual QA seed contains a forbidden MAC address at ${location}.`);
    }
  }
}

function assertSanitizedSeedValue(value, location, depth = 0) {
  if (depth > MAX_NESTED_JSON_DEPTH) {
    throw new Error(`Visual QA seed contains excessively nested encoded data at ${location}.`);
  }
  if (typeof value === "string") {
    assertSanitizedSeedText(value, location);
    for (const candidate of decodedSeedTextCandidates(value)) {
      const trimmed = candidate.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        continue;
      }
      try {
        assertSanitizedSeedValue(JSON.parse(trimmed), `${location} (decoded JSON)`, depth + 1);
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue;
        }
        throw error;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSanitizedSeedValue(item, `${location}[${index}]`, depth + 1),
    );
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    for (const candidate of decodedSeedTextCandidates(key)) {
      const normalizedKey = normalizedSeedFieldKey(candidate);
      const forbiddenLabel = forbiddenSeedFieldLabel(normalizedKey);
      if (forbiddenLabel) {
        throw new Error(`Visual QA seed contains a forbidden ${forbiddenLabel} at ${location}.`);
      }
      assertApprovedSyntheticIdentity(normalizedKey, child, `${location}.${key}`);
      if (normalizedKey === "key" && Object.prototype.hasOwnProperty.call(value, "value")) {
        assertSemanticFieldName(child, `${location}.${key}`);
      }
      assertSanitizedSeedText(candidate, `${location} key`);
    }
    assertSanitizedSeedValue(child, `${location}.${key}`, depth + 1);
  }
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe SQLite identifier in visual QA seed: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function assertSanitizedVisualQaSeed(rawSeed) {
  if (typeof rawSeed !== "string") {
    throw new TypeError("Visual QA seed must be supplied as JSON text.");
  }
  let seed;
  try {
    seed = JSON.parse(rawSeed);
  } catch (error) {
    throw new Error("Visual QA seed must contain valid JSON.", { cause: error });
  }
  if (!seed || Array.isArray(seed) || typeof seed !== "object") {
    throw new Error("Visual QA seed root must be a JSON object.");
  }
  assertSanitizedSeedValue(seed, "$seed");
  return seed;
}

export function visualQaSeedSha256(rawSeed) {
  return createHash("sha256").update(rawSeed, "utf8").digest("hex");
}

function assertVisualQaSeedShape(seed) {
  const rootKeys = Object.keys(seed).sort();
  const expectedRootKeys = ["expectedCounts", "fixtureVersion", "schemaVersion", "tables"];
  if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) {
    throw new Error("Visual QA seed root fields do not match the reviewed fixture contract.");
  }
  const tableNames = Object.keys(seed.tables ?? {}).sort();
  const allowedTableNames = [...ALLOWED_VISUAL_QA_SEED_COLUMNS.keys()].sort();
  if (JSON.stringify(tableNames) !== JSON.stringify(allowedTableNames)) {
    throw new Error("Visual QA seed tables do not match the reviewed fixture contract.");
  }
  const countTableNames = Object.keys(seed.expectedCounts ?? {}).sort();
  if (JSON.stringify(countTableNames) !== JSON.stringify(allowedTableNames)) {
    throw new Error("Visual QA seed expected counts do not match the reviewed fixture tables.");
  }
  for (const [table, rows] of Object.entries(seed.tables)) {
    if (!Array.isArray(rows)) {
      throw new Error(`Visual QA seed table ${table} must contain an array.`);
    }
    const allowedColumns = ALLOWED_VISUAL_QA_SEED_COLUMNS.get(table);
    for (const [index, row] of rows.entries()) {
      if (!row || Array.isArray(row) || typeof row !== "object") {
        throw new Error(`Visual QA seed ${table} row ${index + 1} must be an object.`);
      }
      const unreviewedColumns = Object.keys(row).filter((column) => !allowedColumns.has(column));
      if (unreviewedColumns.length > 0) {
        throw new Error(
          `Visual QA seed ${table} row ${index + 1} has unreviewed column(s): ${unreviewedColumns.join(", ")}.`,
        );
      }
      if (
        table === "settings" &&
        !ALLOWED_VISUAL_QA_SETTING_KEYS.has(String(row.key ?? ""))
      ) {
        throw new Error(`Visual QA seed contains an unreviewed setting key: ${row.key}.`);
      }
      if (
        table === "settings" &&
        String(row.value ?? "") !== APPROVED_VISUAL_QA_SETTINGS.get(String(row.key ?? ""))
      ) {
        throw new Error(`Visual QA seed contains an unreviewed setting value for ${row.key}.`);
      }
      if (table !== "settings" && !String(row.id ?? "").startsWith("qa_")) {
        throw new Error(`Visual QA seed ${table} row ${index + 1} must use a qa_ id.`);
      }
      if (
        table === "filament_spools" &&
        Object.prototype.hasOwnProperty.call(row, "owner_name") &&
        row.ownership_type !== "BORROWED_IN"
      ) {
        throw new Error("Visual QA seed owner_name is only allowed on BORROWED_IN spools.");
      }
    }
  }
}

function visualQaFixtureLifecycleError(errors, outputPath) {
  if (errors.length === 1) {
    return errors[0];
  }
  const primaryError = errors[0];
  const primaryReason =
    primaryError instanceof Error ? primaryError.message : String(primaryError);
  return new AggregateError(
    errors,
    `${primaryReason}\nVisual QA fixture close or cleanup also failed for ${outputPath}.`,
    { cause: primaryError },
  );
}

export function defaultVisualQaFixturePath() {
  return resolve(
    tmpdir(),
    "filament-manager-visual-qa-fixture",
    `visual-qa-fixture-${process.pid}-${randomUUID()}.db`,
  );
}

function tableColumns(db, table) {
  return new Set(
    db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((row) => row.name),
  );
}

function insertFixtureRows(db, table, rows) {
  if (!Array.isArray(rows)) {
    throw new Error(`Visual QA seed table ${table} must contain an array.`);
  }
  const availableColumns = tableColumns(db, table);
  if (availableColumns.size === 0) {
    throw new Error(`Visual QA seed references unknown table ${table}.`);
  }
  for (const [index, row] of rows.entries()) {
    if (!row || Array.isArray(row) || typeof row !== "object") {
      throw new Error(`Visual QA seed ${table} row ${index + 1} must be an object.`);
    }
    const columns = Object.keys(row);
    if (columns.length === 0) {
      throw new Error(`Visual QA seed ${table} row ${index + 1} is empty.`);
    }
    const unknownColumns = columns.filter((column) => !availableColumns.has(column));
    if (unknownColumns.length > 0) {
      throw new Error(
        `Visual QA seed ${table} row ${index + 1} has unknown column(s): ${unknownColumns.join(", ")}.`,
      );
    }
    const statement = db.prepare(
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    );
    statement.run(...columns.map((column) => row[column]));
  }
}

function verifyFixtureDatabase(db, seed) {
  const quickCheck = db.pragma("quick_check", { simple: true });
  if (quickCheck !== "ok") {
    throw new Error(`Generated visual QA fixture failed quick_check: ${quickCheck}`);
  }
  const foreignKeyIssues = db.pragma("foreign_key_check");
  if (foreignKeyIssues.length > 0) {
    throw new Error(
      `Generated visual QA fixture has ${foreignKeyIssues.length} foreign-key violation(s).`,
    );
  }
  const schemaVersion = db.pragma("user_version", { simple: true });
  if (schemaVersion !== seed.schemaVersion) {
    throw new Error(
      `Generated visual QA fixture schema version ${schemaVersion} does not match seed version ${seed.schemaVersion}.`,
    );
  }
  for (const [table, expected] of Object.entries(seed.expectedCounts ?? {})) {
    const count = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count;
    if (count !== expected) {
      throw new Error(
        `Generated visual QA fixture ${table} count ${count} does not match expected ${expected}.`,
      );
    }
  }
}

export function createVisualQaFixture(options = {}) {
  const seedPath = resolve(options.seedPath ?? VISUAL_QA_SEED_PATH);
  const schemaPath = resolve(options.schemaPath ?? VISUAL_QA_SCHEMA_PATH);
  const outputPath = resolve(options.outputPath ?? defaultVisualQaFixturePath());
  const cleanupDatabase = options.cleanupVisualQaDatabase ?? cleanupVisualQaDatabase;
  const openDatabase = options.openDatabase ?? ((path) => new Database(path));
  const setFileMode = options.chmodSync ?? chmodSync;
  const rawSeed = readFileSync(seedPath, "utf8");
  if (
    seedPath === resolve(VISUAL_QA_SEED_PATH) &&
    visualQaSeedSha256(rawSeed) !== VISUAL_QA_SEED_SHA256
  ) {
    throw new Error(
      "The committed visual QA seed changed without updating its reviewed SHA-256 contract.",
    );
  }
  const seed = assertSanitizedVisualQaSeed(rawSeed);
  assertVisualQaSeedShape(seed);
  if (seed.fixtureVersion !== 1 || seed.schemaVersion !== 1) {
    throw new Error("Visual QA seed uses an unsupported fixture or schema version.");
  }

  for (const protectedSourcePath of [seedPath, schemaPath]) {
    assertVisualQaDatabaseTarget({
      live: false,
      sourcePath: protectedSourcePath,
      targetPath: outputPath,
    });
  }
  if (existsSync(outputPath) && !options.overwrite) {
    throw new Error(
      `Visual QA fixture output already exists: ${outputPath}. Pass --overwrite to replace an intentional fixture output.`,
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  if (options.overwrite) {
    cleanupDatabase(outputPath);
  }
  let db = null;
  let primaryError = null;
  let hasPrimaryError = false;
  try {
    db = openDatabase(outputPath);
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(schemaPath, "utf8"));
    const insertAll = db.transaction(() => {
      for (const [table, rows] of Object.entries(seed.tables ?? {})) {
        insertFixtureRows(db, table, rows);
      }
      db.pragma(`user_version = ${seed.schemaVersion}`);
    });
    insertAll();
    verifyFixtureDatabase(db, seed);
  } catch (error) {
    primaryError = error;
    hasPrimaryError = true;
  }

  let closeError = null;
  let hasCloseError = false;
  if (db) {
    try {
      db.close();
    } catch (error) {
      closeError = error;
      hasCloseError = true;
    }
  }

  if (!hasPrimaryError && !hasCloseError && process.platform !== "win32") {
    try {
      setFileMode(outputPath, 0o600);
    } catch (error) {
      primaryError = error;
      hasPrimaryError = true;
    }
  }

  if (hasPrimaryError || hasCloseError) {
    const errors = [];
    if (hasPrimaryError) {
      errors.push(primaryError);
    }
    if (hasCloseError) {
      errors.push(closeError);
    }
    try {
      cleanupDatabase(outputPath);
    } catch (error) {
      errors.push(error);
    }
    throw visualQaFixtureLifecycleError(errors, outputPath);
  }
  return {
    expectedCounts: seed.expectedCounts,
    outputPath,
    schemaVersion: seed.schemaVersion,
    seedPath,
  };
}

async function runCli() {
  const outputIndex = process.argv.indexOf("--out");
  if (outputIndex >= 0 && !process.argv[outputIndex + 1]) {
    throw new Error("--out requires a database path.");
  }
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  const result = createVisualQaFixture({
    outputPath,
    overwrite: process.argv.includes("--overwrite"),
  });
  console.log(`Generated sanitized visual QA fixture: ${result.outputPath}`);
  console.log(`Schema version: ${result.schemaVersion}`);
  console.log(`Seed: ${result.seedPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
