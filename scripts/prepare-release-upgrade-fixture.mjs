#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  assertReleaseUpgradeFixtureSanitized,
  BAMBU_LIVE_SETTING_PREFIX,
  RELEASE_UPGRADE_EMPTY_TABLES,
  RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
  RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
  RELEASE_UPGRADE_PRIVATE_SETTING_KEYS,
  RELEASE_UPGRADE_PRIVATE_SETTING_PREFIXES,
  RELEASE_UPGRADE_SAFE_BAMBU_LIVE_CONFIG,
  snapshotReleaseUpgradeProtectedValues,
} from "./release-upgrade-fixture-contract.mjs";

const IDENTITY_SNAPSHOT_EXCLUDED_TABLES = new Set([
  "settings",
  ...RELEASE_UPGRADE_EMPTY_TABLES,
]);

function canonicalPath(filePath) {
  const resolved = path.resolve(filePath);
  try {
    return realpathSync(resolved);
  } catch {
    try {
      return path.join(realpathSync(path.dirname(resolved)), path.basename(resolved));
    } catch {
      return resolved;
    }
  }
}

function assertRegularSource(sourcePath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Upgrade source database does not exist: ${sourcePath}`);
  }
  const sourceStat = statSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.size <= 0) {
    throw new Error(`Upgrade source database is not a non-empty file: ${sourcePath}`);
  }
}

function assertSafeOutput(sourcePath, outputPath) {
  if (canonicalPath(sourcePath) === canonicalPath(outputPath)) {
    throw new Error("Upgrade fixture output must differ from its source database.");
  }
  if (existsSync(outputPath)) {
    if (lstatSync(outputPath).isSymbolicLink()) {
      throw new Error("Upgrade fixture output must not be a symbolic link.");
    }
    throw new Error(`Upgrade fixture output already exists: ${outputPath}`);
  }
}

export function assertPrivateFixturePlatform(platform = process.platform) {
  if (!["darwin", "linux"].includes(platform)) {
    throw new Error(
      "Private release-upgrade fixtures must be prepared on macOS or Linux; " +
        "this helper cannot guarantee an owner-only ACL on this platform.",
    );
  }
}

function runPrivateAccessCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ||
      String(result.stderr ?? "").trim() ||
      `exit ${String(result.status)}`;
    throw new Error(
      `Could not verify private fixture access controls: ${detail}`,
    );
  }
  return String(result.stdout ?? "");
}

function linuxPathHasExtendedAcl(filePath) {
  const output = runPrivateAccessCommand("/bin/ls", ["-ld", filePath]);
  const mode = output.trimStart().split(/\s+/, 1)[0] ?? "";
  if (!mode) {
    throw new Error("Could not read private fixture Unix mode.");
  }
  return mode.endsWith("+");
}

function macosPathHasExtendedAcl(filePath) {
  const output = runPrivateAccessCommand("/bin/ls", ["-lde", filePath]);
  return output
    .split(/\r?\n/)
    .slice(1)
    .some((line) => /^\s*\d+:\s/.test(line));
}

export function assertPrivateFixturePath(
  filePath,
  expectedMode,
  platform = process.platform,
) {
  assertPrivateFixturePlatform(platform);
  if (lstatSync(filePath).isSymbolicLink()) {
    throw new Error("Private fixture path must not be a symbolic link.");
  }
  const actualMode = statSync(filePath).mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new Error(
      `Private fixture path must use mode ${expectedMode.toString(8)}; ` +
        `found ${actualMode.toString(8)}.`,
    );
  }
  const hasExtendedAcl =
    platform === "darwin"
      ? macosPathHasExtendedAcl(filePath)
      : linuxPathHasExtendedAcl(filePath);
  if (hasExtendedAcl) {
    throw new Error("Private fixture path still has an extended ACL.");
  }
}

export function hardenPrivateFixturePath(
  filePath,
  expectedMode,
  platform = process.platform,
) {
  assertPrivateFixturePlatform(platform);
  chmodSync(filePath, expectedMode);
  if (platform === "darwin") {
    runPrivateAccessCommand("/bin/chmod", ["-N", filePath]);
  } else if (linuxPathHasExtendedAcl(filePath)) {
    const setfaclPath = ["/usr/bin/setfacl", "/bin/setfacl"].find((candidate) =>
      existsSync(candidate),
    );
    if (!setfaclPath) {
      throw new Error(
        "Private fixture path has an ACL, but setfacl is unavailable.",
      );
    }
    runPrivateAccessCommand(setfaclPath, ["-b", filePath]);
    if (statSync(filePath).isDirectory()) {
      runPrivateAccessCommand(setfaclPath, ["-k", filePath]);
    }
  }
  assertPrivateFixturePath(filePath, expectedMode, platform);
}

export function publishPrivateFixtureNoReplace(stagingPath, outputPath) {
  let linked = false;
  try {
    linkSync(stagingPath, outputPath);
    linked = true;
    unlinkSync(stagingPath);
  } catch (error) {
    if (linked) {
      rmSync(outputPath, { force: true });
    }
    throw error;
  }
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
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map(({ name }) => String(name)),
  );
}

function updateExistingColumns(database, table, assignments) {
  const tables = databaseTables(database);
  if (!tables.has(table)) {
    return 0;
  }
  const columns = tableColumns(database, table);
  const selected = Object.entries(assignments).filter(([column]) =>
    columns.has(column),
  );
  if (selected.length === 0) {
    return 0;
  }
  const sql = `UPDATE "${table}" SET ${selected
    .map(([column]) => `"${column}" = ?`)
    .join(", ")}`;
  return database.prepare(sql).run(...selected.map(([, value]) => value)).changes;
}

function sanitizeBambuLiveConfig(rawValue) {
  void rawValue;
  return JSON.stringify(RELEASE_UPGRADE_SAFE_BAMBU_LIVE_CONFIG);
}

function sanitizeSettings(database) {
  const tables = databaseTables(database);
  if (!tables.has("settings")) {
    return { bambuLiveSettings: 0, removedSettings: 0 };
  }
  const rows = database.prepare("SELECT key, value FROM settings").all();
  const deleteSetting = database.prepare("DELETE FROM settings WHERE key = ?");
  const updateSetting = database.prepare(
    "UPDATE settings SET value = ? WHERE key = ?",
  );
  let bambuLiveSettings = 0;
  let removedSettings = 0;
  for (const row of rows) {
    const key = String(row.key);
    if (key.startsWith(BAMBU_LIVE_SETTING_PREFIX)) {
      updateSetting.run(sanitizeBambuLiveConfig(String(row.value ?? "")), key);
      bambuLiveSettings += 1;
      continue;
    }
    if (
      RELEASE_UPGRADE_PRIVATE_SETTING_KEYS.includes(key) ||
      RELEASE_UPGRADE_PRIVATE_SETTING_PREFIXES.some((prefix) =>
        key.startsWith(prefix),
      )
    ) {
      removedSettings += deleteSetting.run(key).changes;
    }
  }
  database
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("trusted_lan_enabled", "0");
  database
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("library_sync_mode", "STANDALONE");
  database
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("library_sync_device_name", "Release candidate QA");
  database
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("library_sync_library_id", "release-candidate-qa-library");
  database
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(
      RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
      RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
    );
  database
    .prepare("DELETE FROM settings WHERE key IN (?, ?, ?)")
    .run(
      "trusted_lan_interface_address",
      "trusted_lan_interface_name",
      "trusted_lan_port",
    );
  return { bambuLiveSettings, removedSettings };
}

function sanitizePrivateRows(database) {
  const tables = databaseTables(database);
  let removedPrivateRows = 0;
  for (const table of RELEASE_UPGRADE_EMPTY_TABLES) {
    if (tables.has(table)) {
      removedPrivateRows += database.prepare(`DELETE FROM "${table}"`).run().changes;
    }
  }

  updateExistingColumns(database, "printers", {
    access_token: null,
    ip_address: null,
    name: "Release QA printer",
  });
  updateExistingColumns(database, "inventory_locations", {
    name: "Release QA location",
  });
  updateExistingColumns(database, "filament_spools", {
    batch_code: null,
    owner_contact: null,
    owner_name: null,
    ownership_note: null,
    qr_code: null,
    rfid_observed_at: null,
    rfid_tag: null,
    supplier_reference: null,
  });
  updateExistingColumns(database, "ams_slots", {
    rfid_override_tray_uuid: null,
  });
  updateExistingColumns(database, "spool_loans", {
    borrower_name: "Release QA borrower",
    counterparty_contact: null,
    counterparty_name: "Release QA borrower",
    counterparty_note: null,
    lent_note: null,
    return_note: null,
  });
  updateExistingColumns(database, "print_jobs", {
    job_name: "Release QA print",
  });
  updateExistingColumns(database, "printer_live_usage_sessions", {
    job_name: "Release QA print",
  });
  updateExistingColumns(database, "printer_live_events", {
    payload_json: "{}",
  });
  updateExistingColumns(database, "spool_history_events", {
    payload_json: "{}",
  });
  updateExistingColumns(database, "alerts", {
    payload_json: "{}",
  });
  updateExistingColumns(database, "scales", {
    device_id: null,
    name: "Release QA scale",
  });
  updateExistingColumns(database, "scan_events", {
    qr_code: null,
  });
  updateExistingColumns(database, "wishlist_items", {
    note: null,
  });
  return { removedPrivateRows };
}

function identitySnapshot(database) {
  const tables = databaseTables(database);
  const counts = {};
  const ids = {};
  for (const table of [...tables].sort()) {
    if (
      table.startsWith("sqlite_") ||
      IDENTITY_SNAPSHOT_EXCLUDED_TABLES.has(table)
    ) {
      continue;
    }
    counts[table] = Number(
      database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count,
    );
    const columns = tableColumns(database, table);
    if (columns.has("id")) {
      ids[table] = database
        .prepare(`SELECT CAST(id AS TEXT) AS id FROM "${table}" ORDER BY id`)
        .all()
        .map(({ id }) => String(id));
    }
  }
  return { counts, ids };
}

function inspectDatabase(database) {
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
  return {
    ...identitySnapshot(database),
    schemaVersion: Number(database.pragma("user_version", { simple: true })),
    tableCount: databaseTables(database).size,
  };
}

export function validateReleaseUpgradeFixtureOptions({ outputPath, sourcePath }) {
  if (typeof sourcePath !== "string" || !sourcePath.trim()) {
    throw new Error("An upgrade source database path is required.");
  }
  if (typeof outputPath !== "string" || !outputPath.trim()) {
    throw new Error("An upgrade fixture output path is required.");
  }
  return {
    outputPath: path.resolve(outputPath),
    sourcePath: path.resolve(sourcePath),
  };
}

export async function prepareReleaseUpgradeFixture(options) {
  const { outputPath, sourcePath } =
    validateReleaseUpgradeFixtureOptions(options);
  assertRegularSource(sourcePath);
  assertSafeOutput(sourcePath, outputPath);
  assertPrivateFixturePlatform();
  mkdirSync(path.dirname(outputPath), { mode: 0o700, recursive: true });

  const stagingDirectory = mkdtempSync(
    path.join(path.dirname(outputPath), ".release-upgrade-fixture-"),
  );
  hardenPrivateFixturePath(stagingDirectory, 0o700);
  const stagingPath = path.join(stagingDirectory, "fixture.sqlite");
  const stagingDescriptor = openSync(stagingPath, "wx", 0o600);
  closeSync(stagingDescriptor);
  hardenPrivateFixturePath(stagingPath, 0o600);
  let published = false;

  try {
    const source = new Database(sourcePath, {
      fileMustExist: true,
      readonly: true,
    });
    let sourceInspection;
    try {
      sourceInspection = inspectDatabase(source);
      await source.backup(stagingPath);
    } finally {
      source.close();
    }
    hardenPrivateFixturePath(stagingPath, 0o600);

    const fixture = new Database(stagingPath, { fileMustExist: true });
    let sanitization;
    try {
      fixture.pragma("foreign_keys = ON");
      fixture.pragma("secure_delete = ON");
      sanitization = fixture.transaction(() => ({
        ...sanitizeSettings(fixture),
        ...sanitizePrivateRows(fixture),
      }))();
      fixture.exec("VACUUM");
    } finally {
      fixture.close();
    }
    hardenPrivateFixturePath(stagingPath, 0o600);

    const verified = new Database(stagingPath, {
      fileMustExist: true,
      readonly: true,
    });
    let fixtureInspection;
    let protectedValues;
    try {
      fixtureInspection = inspectDatabase(verified);
      assertReleaseUpgradeFixtureSanitized(verified);
      protectedValues = snapshotReleaseUpgradeProtectedValues(verified);
    } finally {
      verified.close();
    }

    for (const table of Object.keys(sourceInspection.counts)) {
      if (fixtureInspection.counts[table] !== sourceInspection.counts[table]) {
        throw new Error(`Upgrade fixture changed the ${table} row count.`);
      }
      if (
        JSON.stringify(fixtureInspection.ids[table] ?? []) !==
        JSON.stringify(sourceInspection.ids[table] ?? [])
      ) {
        throw new Error(`Upgrade fixture changed ${table} identities.`);
      }
    }

    if (existsSync(outputPath)) {
      throw new Error(`Upgrade fixture output appeared during preparation: ${outputPath}`);
    }
    publishPrivateFixtureNoReplace(stagingPath, outputPath);
    published = true;
    hardenPrivateFixturePath(outputPath, 0o600);
    return {
      fixture: fixtureInspection,
      outputPath,
      protectedValues,
      sanitization,
      size: statSync(outputPath).size,
      source: sourceInspection,
      sourcePath,
    };
  } catch (error) {
    if (published && existsSync(outputPath)) {
      rmSync(outputPath, { force: true });
    }
    throw error;
  } finally {
    rmSync(stagingDirectory, { force: true, recursive: true });
  }
}

function cliOptions(argv) {
  const sourcePath = argv
    .find((argument) => argument.startsWith("--source="))
    ?.slice("--source=".length);
  const outputPath = argv
    .find((argument) => argument.startsWith("--output="))
    ?.slice("--output=".length);
  if (argv.some((argument) => !argument.startsWith("--source=") && !argument.startsWith("--output="))) {
    throw new Error(
      "Usage: node scripts/prepare-release-upgrade-fixture.mjs " +
        "--source=<database> --output=<private-copy>",
    );
  }
  return { outputPath, sourcePath };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await prepareReleaseUpgradeFixture(
      cliOptions(process.argv.slice(2)),
    );
    console.log(
      `Prepared private upgrade fixture: schema ${result.source.schemaVersion}, ` +
        `${result.source.counts.filament_spools ?? 0} spool(s), ` +
        `${result.source.counts.printers ?? 0} printer(s), ` +
        `${result.size} bytes.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
