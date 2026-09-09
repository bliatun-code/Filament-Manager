import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";
import { prepareCompatibilityReleaseUpgradeFixture } from "./prepare-compatibility-release-upgrade-fixture.mjs";

import {
  RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
  RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
} from "./release-upgrade-fixture-contract.mjs";
import {
  assertPreservedReleaseUpgradeData,
  assertReleaseUpgradeSmokePlatform,
  assertSanitizedReleaseUpgradeFixture,
  currentSchemaVersion,
  databaseStartupAcknowledged,
  macosApplicationBundlePath,
  macosWindowOutputHasProcessId,
  monitorChildProcessErrors,
  parseReleaseDatabaseUpgradeSmokeCliOptions,
  snapshotReleaseUpgradeDatabase,
  smokeReleaseDatabaseUpgrade,
  stopChild,
  validateReleaseDatabaseUpgradeSmokeOptions,
  waitForSpawnedChild,
} from "./smoke-release-database-upgrade.mjs";

const batchMigration = readFileSync(
  new URL("../src/database/migrations/008_catalog_spool_batches.sql", import.meta.url),
  "utf8",
);

function insertBatchReceipt(database) {
  database.prepare(
    "INSERT INTO catalog_spool_batches (batch_id, library_id, request_json, receipt_json, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("batch-a", "release-candidate-qa-library", JSON.stringify({
    batch_id: "batch-a", master_ids: ["master-a", "master-a"], initial_weight_g: 850,
    ownership_type: "OWNED", owner_name: null, owner_contact: null, ownership_note: null, location: null,
  }), JSON.stringify({ batch_id: "batch-a", spool_ids: ["spool-a", "spool-b"] }), "2026-09-06T00:00:00Z");
}

function createSanitizedFixture(databasePath) {
  const database = new Database(databasePath);
  database.exec(`
    PRAGMA user_version = 0;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE trusted_lan_pairings (id TEXT PRIMARY KEY);
    CREATE TABLE trusted_lan_paired_browsers (id TEXT PRIMARY KEY);
    CREATE TABLE sync_queue (id TEXT PRIMARY KEY);
  `);
  const insert = database.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?)",
  );
  insert.run(
    RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
    RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
  );
  insert.run("trusted_lan_enabled", "0");
  insert.run("library_sync_mode", "STANDALONE");
  database.close();
}

test("release database upgrade smoke validates explicit bounded inputs", () => {
  assert.throws(
    () =>
      validateReleaseDatabaseUpgradeSmokeOptions({
        databasePath: "",
        executablePath: "candidate",
        launchCount: 2,
        launchTimeoutMs: 90_000,
        logDirectory: "logs",
      }),
    /database path is required/,
  );
  assert.throws(
    () =>
      validateReleaseDatabaseUpgradeSmokeOptions({
        databasePath: "fixture.db",
        executablePath: "candidate",
        launchCount: 1,
        launchTimeoutMs: 90_000,
        logDirectory: "logs",
      }),
    /Launch count must be an integer from 2 to 5/,
  );
  assert.throws(
    () =>
      validateReleaseDatabaseUpgradeSmokeOptions({
        databasePath: "fixture.db",
        executablePath: "candidate",
        launchCount: 2,
        launchTimeoutMs: 9_999,
        logDirectory: "logs",
      }),
    /Launch timeout must be an integer/,
  );
  assert.throws(
    () =>
      validateReleaseDatabaseUpgradeSmokeOptions({
        databasePath: "fixture.db",
        executablePath: "candidate",
        launchCount: 2.5,
        launchTimeoutMs: 90_000,
        logDirectory: "logs",
      }),
    /Launch count must be an integer/,
  );
  assert.throws(
    () =>
      validateReleaseDatabaseUpgradeSmokeOptions({
        databasePath: "fixture.db",
        executablePath: "candidate",
        launchCount: 2,
        launchTimeoutMs: "90000",
        logDirectory: "logs",
      }),
    /Launch timeout must be an integer/,
  );
});

test("release database upgrade smoke normalizes accepted paths", () => {
  const options = validateReleaseDatabaseUpgradeSmokeOptions({
    databasePath: "fixture.db",
    executablePath: "candidate",
    launchCount: 3,
    launchTimeoutMs: 120_000,
    logDirectory: "release-artifacts/upgrade-smoke",
  });
  assert.equal(options.databasePath, path.resolve("fixture.db"));
  assert.equal(options.executablePath, path.resolve("candidate"));
  assert.equal(options.launchCount, 3);
  assert.equal(options.launchTimeoutMs, 120_000);
  assert.equal(options.requireVisibleWindow, true);
  assert.equal(options.allowCurrentSchema, false);
  assert.equal(options.sourceRelease, null);
  assert.throws(
    () =>
      validateReleaseDatabaseUpgradeSmokeOptions({
        allowCurrentSchema: true,
        databasePath: "fixture.db",
        executablePath: "candidate",
        logDirectory: "logs",
      }),
    /source release is required/,
  );
  const compatibilityOptions = validateReleaseDatabaseUpgradeSmokeOptions({
    allowCurrentSchema: true,
    databasePath: "fixture.db",
    executablePath: "candidate",
    logDirectory: "logs",
    requireVisibleWindow: false,
    sourceRelease: "v0.28.0",
  });
  assert.equal(compatibilityOptions.allowCurrentSchema, true);
  assert.equal(compatibilityOptions.sourceRelease, "v0.28.0");
});

test("release database upgrade CLI parses integers without partial coercion", () => {
  const requiredArguments = [
    "--database=fixture.db",
    "--executable=candidate",
    "--log-dir=logs",
  ];
  const options = parseReleaseDatabaseUpgradeSmokeCliOptions([
    ...requiredArguments,
    "--launch-count=3",
    "--launch-timeout-ms=120000",
  ]);
  assert.equal(options.launchCount, 3);
  assert.equal(options.launchTimeoutMs, 120_000);
  assert.equal(options.requireVisibleWindow, true);

  const databaseReadinessOptions = parseReleaseDatabaseUpgradeSmokeCliOptions([
    ...requiredArguments,
    "--database-readiness-only",
    "--allow-current-schema",
    "--source-release=v0.28.0",
  ]);
  assert.equal(databaseReadinessOptions.requireVisibleWindow, false);
  assert.equal(databaseReadinessOptions.allowCurrentSchema, true);
  assert.equal(databaseReadinessOptions.sourceRelease, "v0.28.0");
  assert.throws(
    () =>
      parseReleaseDatabaseUpgradeSmokeCliOptions([
        ...requiredArguments,
        "--database-readiness-only=1",
      ]),
    /Usage:/,
  );

  for (const value of ["2.5", "2junk", " 2", "", "9007199254740992"]) {
    assert.throws(
      () =>
        parseReleaseDatabaseUpgradeSmokeCliOptions([
          ...requiredArguments,
          `--launch-count=${value}`,
        ]),
      /Launch count must be a strict base-10 integer/,
    );
  }
});

test(
  "release database upgrade smoke reads the schema independently of cwd",
  { concurrency: false },
  () => {
    const originalDirectory = process.cwd();
    const unrelatedDirectory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-upgrade-cwd-"),
    );
    try {
      process.chdir(unrelatedDirectory);
      assert.equal(Number.isSafeInteger(currentSchemaVersion()), true);
      assert.equal(currentSchemaVersion() > 0, true);
    } finally {
      process.chdir(originalDirectory);
      rmSync(unrelatedDirectory, { force: true, recursive: true });
    }
  },
);

test("release database upgrade smoke is explicit about its macOS window probe", () => {
  assert.doesNotThrow(() => assertReleaseUpgradeSmokePlatform("darwin"));
  assert.doesNotThrow(() =>
    assertReleaseUpgradeSmokePlatform("win32", { requireVisibleWindow: false }),
  );
  assert.doesNotThrow(() =>
    assertReleaseUpgradeSmokePlatform("linux", { requireVisibleWindow: false }),
  );
  assert.throws(
    () => assertReleaseUpgradeSmokePlatform("win32"),
    /requires macOS window inspection/,
  );
  assert.throws(
    () => assertReleaseUpgradeSmokePlatform("linux"),
    /requires macOS window inspection/,
  );
});

test("release database upgrade smoke resolves the containing app bundle", () => {
  const appPath = path.join(
    tmpdir(),
    "Filament Manager.app",
  );
  const executablePath = path.join(
    appPath,
    "Contents",
    "MacOS",
    "bambu-filament-manager",
  );
  assert.equal(macosApplicationBundlePath(executablePath), path.resolve(appPath));
});

test("release database upgrade smoke matches a window only by exact child PID", () => {
  const windowOutput = [
    "Filament Manager\tDashboard\t0\t0\t900\t700\t4100",
    "Different Process Name\tReady\t10\t10\t800\t600\t4200",
    "",
  ].join("\n");

  assert.equal(macosWindowOutputHasProcessId(windowOutput, 4200), true);
  assert.equal(macosWindowOutputHasProcessId(windowOutput, 4300), false);
  assert.equal(
    macosWindowOutputHasProcessId(
      "Filament Manager\tDashboard\t0\t0\t900\t700",
      4200,
    ),
    false,
  );
  assert.equal(macosWindowOutputHasProcessId(windowOutput, 0), false);
});

test("release database upgrade smoke reports asynchronous spawn failures", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.pid = undefined;
  child.signalCode = null;
  const state = monitorChildProcessErrors(child);
  setImmediate(() => child.emit("error", new Error("synthetic spawn failure")));

  await assert.rejects(
    waitForSpawnedChild(child, state, {
      pollIntervalMs: 1,
      timeoutMs: 100,
    }),
    /Release application spawn failed: synthetic spawn failure/,
  );
});

test("release database upgrade smoke waits for exit after SIGKILL", async () => {
  const child = {
    exitCode: null,
    pid: 4242,
    signalCode: null,
    signals: [],
    kill(signal) {
      this.signals.push(signal);
      if (signal === "SIGKILL") {
        setTimeout(() => {
          this.signalCode = "SIGKILL";
        }, 10);
      }
      return true;
    },
  };

  await stopChild(child, {
    killTimeoutMs: 100,
    pollIntervalMs: 1,
    terminateTimeoutMs: 1,
  });
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(child.signalCode, "SIGKILL");
});

test("release database upgrade smoke fails if SIGKILL cannot stop the child", async () => {
  const child = {
    exitCode: null,
    pid: 4343,
    signalCode: null,
    kill() {
      return true;
    },
  };

  await assert.rejects(
    stopChild(child, {
      killTimeoutMs: 5,
      pollIntervalMs: 1,
      terminateTimeoutMs: 1,
    }),
    /process 4343 did not exit after SIGKILL/,
  );
});

test("release database upgrade smoke requires the exact sanitized fixture contract", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-upgrade-contract-"),
  );
  try {
    const validPath = path.join(directory, "valid.db");
    createSanitizedFixture(validPath);
    assert.doesNotThrow(() => assertSanitizedReleaseUpgradeFixture(validPath));

    const missingMarkerPath = path.join(directory, "missing-marker.db");
    createSanitizedFixture(missingMarkerPath);
    let database = new Database(missingMarkerPath);
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(RELEASE_UPGRADE_FIXTURE_MARKER_KEY);
    database.close();
    assert.throws(
      () => assertSanitizedReleaseUpgradeFixture(missingMarkerPath),
      /missing its exact safety-sanitization marker/,
    );

    const privateKeyPath = path.join(directory, "private-key.db");
    createSanitizedFixture(privateKeyPath);
    database = new Database(privateKeyPath);
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("credential_store_profile_id", "private");
    database.close();
    assert.throws(
      () => assertSanitizedReleaseUpgradeFixture(privateKeyPath),
      /private setting credential_store_profile_id/,
    );

    const privatePrefixPath = path.join(directory, "private-prefix.db");
    createSanitizedFixture(privatePrefixPath);
    database = new Database(privatePrefixPath);
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("trusted_lan_pairing_pending", "private");
    database.close();
    assert.throws(
      () => assertSanitizedReleaseUpgradeFixture(privatePrefixPath),
      /private setting trusted_lan_pairing_pending/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("release database upgrade snapshot protects every existing domain table value", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-upgrade-digest-"),
  );
  const databasePath = path.join(directory, "fixture.db");
  try {
    const database = new Database(databasePath);
    database.exec(`
      PRAGMA user_version = 0;
      CREATE TABLE custom_domain (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE filament_master_list (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        catalog_source TEXT NOT NULL,
        catalog_seed_version TEXT,
        catalog_user_edited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE "custom""quoted" (
        id TEXT PRIMARY KEY,
        "value""quoted" TEXT NOT NULL
      );
      INSERT INTO custom_domain (id, value) VALUES ('domain-1', 'before');
      INSERT INTO settings (key, value) VALUES ('theme_mode', 'dark');
      INSERT INTO filament_master_list (
        id, material, filament_name, color_name, vendor, catalog_source,
        catalog_seed_version, catalog_user_edited, created_at, updated_at
      ) VALUES (
        'master-seeded', 'PLA', 'Basic', 'Black', 'Seed vendor', 'seeded',
        'seed-v1', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      );
      INSERT INTO filament_master_list (
        id, material, filament_name, color_name, vendor, catalog_source,
        catalog_seed_version, catalog_user_edited, created_at, updated_at
      ) VALUES (
        'master-manual', 'PETG', 'Workshop blend', 'Ocean', 'Manual vendor',
        'manual', NULL, 0, '2026-01-02T00:00:00Z',
        '2026-01-02T00:00:00Z'
      );
      INSERT INTO filament_master_list (
        id, material, filament_name, color_name, vendor, catalog_source,
        catalog_seed_version, catalog_user_edited, created_at, updated_at
      ) VALUES (
        'master-user-edited', 'ASA', 'Basic', 'Blue', 'Edited seed vendor',
        'seeded', 'seed-v1', 1, '2026-01-03T00:00:00Z',
        '2026-01-03T00:00:00Z'
      );
      INSERT INTO "custom""quoted" (id, "value""quoted")
      VALUES ('quoted-1', 'preserved');
    `);
    database.close();

    const before = snapshotReleaseUpgradeDatabase(databasePath);
    assert.equal(before.counts['custom"quoted'], 1);
    assert.deepEqual(before.ids['custom"quoted'], ["quoted-1"]);
    assert.deepEqual(before.valueColumns['custom"quoted'], [
      "id",
      'value"quoted',
    ]);
    assert.equal("filament_master_list" in before.counts, false);
    assert.deepEqual(Object.keys(before.protectedValues.catalog.rows), [
      "master-manual",
      "master-user-edited",
    ]);
    assert.equal(before.protectedValues.settings.theme_mode, "dark");
    let after = snapshotReleaseUpgradeDatabase(databasePath);
    assert.doesNotThrow(() =>
      assertPreservedReleaseUpgradeData(before, after),
    );

    const migrated = new Database(databasePath);
    migrated.exec(`
      ALTER TABLE custom_domain ADD COLUMN migration_note TEXT;
      UPDATE filament_master_list
         SET vendor = 'bundled refresh',
             catalog_seed_version = 'seed-v2',
             updated_at = '2026-07-29T00:00:00Z'
       WHERE id = 'master-seeded';
      UPDATE filament_master_list
         SET catalog_seed_version = 'seed-v2',
             updated_at = '2026-07-29T00:00:00Z'
       WHERE id = 'master-user-edited';
      INSERT INTO filament_master_list (
        id, material, filament_name, color_name, vendor, catalog_source,
        catalog_seed_version, catalog_user_edited, created_at, updated_at
      ) VALUES (
        'master-new-seed', 'ABS', 'Basic', 'Red', 'New seed vendor', 'seeded',
        'seed-v2', 0, '2026-07-29T00:00:00Z', '2026-07-29T00:00:00Z'
      );
      INSERT INTO settings (key, value)
      VALUES ('new_release_setting', 'allowed');
    `);
    migrated.close();
    after = snapshotReleaseUpgradeDatabase(databasePath);
    assert.doesNotThrow(() =>
      assertPreservedReleaseUpgradeData(before, after),
    );

    const changedSetting = new Database(databasePath);
    changedSetting
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run("light", "theme_mode");
    changedSetting.close();
    after = snapshotReleaseUpgradeDatabase(databasePath);
    assert.throws(
      () => assertPreservedReleaseUpgradeData(before, after),
      /changed the protected setting theme_mode/,
    );

    const changedCatalog = new Database(databasePath);
    changedCatalog
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run("dark", "theme_mode");
    changedCatalog
      .prepare(
        "UPDATE filament_master_list SET vendor = ? WHERE id = 'master-manual'",
      )
      .run("Overwritten manual vendor");
    changedCatalog.close();
    after = snapshotReleaseUpgradeDatabase(databasePath);
    assert.throws(
      () => assertPreservedReleaseUpgradeData(before, after),
      /changed protected catalog row master-manual/,
    );

    const changed = new Database(databasePath);
    changed
      .prepare(
        "UPDATE filament_master_list SET vendor = ? WHERE id = 'master-manual'",
      )
      .run("Manual vendor");
    changed
      .prepare("UPDATE custom_domain SET value = ? WHERE id = ?")
      .run("after", "domain-1");
    changed.close();
    after = snapshotReleaseUpgradeDatabase(databasePath);
    assert.throws(
      () => assertPreservedReleaseUpgradeData(before, after),
      /changed preserved values in custom_domain/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("schema 6 migration must create the actual empty batch journal and preserve prior data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-batch-migration-"));
  const databasePath = path.join(directory, "fixture.db");
  try {
    createSanitizedFixture(databasePath);
    let database = new Database(databasePath);
    database.exec("PRAGMA user_version = 6; CREATE TABLE user_data (id TEXT PRIMARY KEY, note TEXT); INSERT INTO user_data VALUES ('old', 'preserve');");
    database.close();
    const before = snapshotReleaseUpgradeDatabase(databasePath);
    assert.equal(before.catalogBatchJournal, null);

    database = new Database(databasePath);
    database.exec("PRAGMA user_version = 7");
    database.close();
    assert.throws(() => snapshotReleaseUpgradeDatabase(databasePath), /requires the catalog_spool_batches table/);

    database = new Database(databasePath);
    database.exec(batchMigration);
    database.close();
    const migrated = snapshotReleaseUpgradeDatabase(databasePath);
    assert.equal(migrated.catalogBatchJournal.receiptCount, 0);
    assert.doesNotThrow(() => assertPreservedReleaseUpgradeData(before, migrated));
    assert.doesNotThrow(() => assertPreservedReleaseUpgradeData(migrated, snapshotReleaseUpgradeDatabase(databasePath)));

    database = new Database(databasePath);
    insertBatchReceipt(database);
    database.close();
    assert.throws(() => assertPreservedReleaseUpgradeData(before, snapshotReleaseUpgradeDatabase(databasePath)), /must create an empty catalog batch journal/);

    database = new Database(databasePath);
    database.exec("DELETE FROM catalog_spool_batches; UPDATE user_data SET note = 'lost';");
    database.close();
    assert.throws(() => assertPreservedReleaseUpgradeData(before, snapshotReleaseUpgradeDatabase(databasePath)), /changed preserved values in user_data/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("schema-7 repeated launch snapshots preserve every batch receipt byte and ordered ID", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-batch-receipt-"));
  const databasePath = path.join(directory, "fixture.db");
  try {
    createSanitizedFixture(databasePath);
    let database = new Database(databasePath);
    database.exec(batchMigration);
    database.pragma("user_version = 7");
    insertBatchReceipt(database);
    const original = database.prepare("SELECT * FROM catalog_spool_batches").get();
    database.close();
    const before = snapshotReleaseUpgradeDatabase(databasePath);
    assert.equal(before.catalogBatchJournal.receiptCount, 1);
    assert.doesNotThrow(() => assertPreservedReleaseUpgradeData(before, snapshotReleaseUpgradeDatabase(databasePath)));
    for (const [column, value] of [
      ["batch_id", "batch-changed"], ["library_id", "another-library"],
      ["request_json", JSON.stringify({ changed: true })],
      ["receipt_json", JSON.stringify({ batch_id: "batch-a", spool_ids: ["spool-b", "spool-a"] })],
      ["created_at", "2026-09-07T00:00:00Z"],
    ]) {
      database = new Database(databasePath);
      database.prepare(`UPDATE catalog_spool_batches SET ${column} = ?`).run(value);
      database.close();
      assert.throws(() => assertPreservedReleaseUpgradeData(before, snapshotReleaseUpgradeDatabase(databasePath)), /changed preserved values in catalog_spool_batches/, column);
      database = new Database(databasePath);
      database.prepare(`UPDATE catalog_spool_batches SET ${column} = ?`).run(original[column]);
      database.close();
    }
    database = new Database(databasePath);
    database.exec("DELETE FROM catalog_spool_batches");
    database.close();
    assert.throws(() => assertPreservedReleaseUpgradeData(before, snapshotReleaseUpgradeDatabase(databasePath)), /catalog_spool_batches row count/);
    database = new Database(databasePath);
    database.exec("DROP TABLE catalog_spool_batches");
    database.close();
    assert.throws(() => snapshotReleaseUpgradeDatabase(databasePath), /requires the catalog_spool_batches table/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("repeated-launch gate detects a receipt lost while the application exits", { skip: process.platform === "win32" }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-batch-stop-"));
  const databasePath = path.join(directory, "fixture.db");
  try {
    createSanitizedFixture(databasePath);
    const database = new Database(databasePath);
    database.exec(readFileSync(new URL("../src/database/migrations/007_catalog_refresh_jobs.sql", import.meta.url), "utf8"));
    database.exec(batchMigration);
    database.pragma("user_version = 7");
    insertBatchReceipt(database);
    database.close();
    const executablePath = path.join(directory, "candidate.mjs");
    const require = createRequire(import.meta.url);
    writeFileSync(executablePath, `#!${process.execPath}
import Database from ${JSON.stringify(pathToFileURL(require.resolve("better-sqlite3")).href)};
import { writeFileSync, realpathSync } from 'node:fs';
setInterval(() => {}, 1000);
// Deliberately exceed the former fixed startup delay. Acknowledge only after
// the shutdown handler is installed, so this regression cannot pass by timing.
setTimeout(() => {
  const startupDb = new Database(process.env.FILAMENT_MANAGER_DB_PATH);
  startupDb.pragma('user_version'); startupDb.close();
  process.on('SIGTERM', () => { const db = new Database(process.env.FILAMENT_MANAGER_DB_PATH); db.exec('DELETE FROM catalog_spool_batches'); db.close(); process.exit(0); });
  writeFileSync(process.env.FILAMENT_MANAGER_DATABASE_READY_FILE, JSON.stringify({
    token: process.env.FILAMENT_MANAGER_DATABASE_READY_TOKEN, pid: process.pid,
    databasePath: realpathSync(process.env.FILAMENT_MANAGER_DB_PATH),
  }), {flag:'wx', mode:0o600});
}, 1500);
`, { mode: 0o700 });
    await assert.rejects(smokeReleaseDatabaseUpgrade({
      allowCurrentSchema: true, sourceRelease: "v0.29.0-test", databasePath, executablePath,
      logDirectory: path.join(directory, "logs"), requireVisibleWindow: false,
    }), /catalog_spool_batches row count/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});


test("startup acknowledgment requires the exact launch and actual fixture", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "database-readiness-contract-"));
  try {
    const databasePath = path.join(directory, "fixture.db");
    const otherPath = path.join(directory, "other.db");
    const readinessPath = path.join(directory, "ready.json");
    writeFileSync(databasePath, "fixture");
    writeFileSync(otherPath, "different database");
    const options = { databasePath, readinessPath, token: "a".repeat(64), processId: 123 };
    const valid = { token: options.token, pid: 123, databasePath };
    assert.equal(databaseStartupAcknowledged(options), false);
    writeFileSync(readinessPath, '{"token":');
    assert.equal(databaseStartupAcknowledged(options), false);
    for (const changed of [{token:"b".repeat(64)}, {pid:456}, {databasePath:otherPath}]) {
      writeFileSync(readinessPath, JSON.stringify({...valid, ...changed}));
      assert.throws(() => databaseStartupAcknowledged(options), /startup acknowledgment/);
    }
    writeFileSync(readinessPath, JSON.stringify(valid));
    assert.equal(databaseStartupAcknowledged(options), true);
    if (process.platform !== "win32") {
      rmSync(readinessPath);
      symlinkSync(databasePath, readinessPath);
      assert.throws(() => databaseStartupAcknowledged(options), /Invalid database startup acknowledgment file/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("same-schema smoke rejects a living process that never opens the database", { skip: process.platform === "win32" }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "database-readiness-noop-"));
  try {
    const databasePath = path.join(directory, "fixture.db");
    await prepareCompatibilityReleaseUpgradeFixture({outputPath:databasePath});
    const before = readFileSync(databasePath);
    const executablePath = path.join(directory, "noop.mjs");
    writeFileSync(executablePath, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`, {mode:0o700});
    await assert.rejects(smokeReleaseDatabaseUpgrade({
      databasePath, executablePath, logDirectory:path.join(directory,"logs"),
      allowCurrentSchema:true, sourceRelease:"v0.30.0", requireVisibleWindow:false, launchTimeoutMs:10000,
    }), /did not acknowledge database startup/);
    assert.deepEqual(readFileSync(databasePath), before);
  } finally { rmSync(directory, {recursive:true, force:true}); }
});

test("two acknowledged launches get different challenges and preserve the fixture", { skip: process.platform === "win32" }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "database-readiness-restart-"));
  try {
    const databasePath = path.join(directory, "fixture.db");
    await prepareCompatibilityReleaseUpgradeFixture({outputPath:databasePath});
    const executablePath = path.join(directory, "candidate.mjs");
    const require = createRequire(import.meta.url);
    writeFileSync(executablePath, `#!${process.execPath}
import Database from ${JSON.stringify(pathToFileURL(require.resolve("better-sqlite3")).href)};
import { writeFileSync, realpathSync } from 'node:fs';
const db = new Database(process.env.FILAMENT_MANAGER_DB_PATH);
db.pragma('user_version'); db.close();
writeFileSync(process.env.FILAMENT_MANAGER_DATABASE_READY_FILE, JSON.stringify({
  token:process.env.FILAMENT_MANAGER_DATABASE_READY_TOKEN, pid:process.pid,
  databasePath:realpathSync(process.env.FILAMENT_MANAGER_DB_PATH),
}), {flag:'wx', mode:0o600});
setInterval(() => {}, 1000);
`, {mode:0o700});
    const logDirectory = path.join(directory,"logs");
    const result = await smokeReleaseDatabaseUpgrade({databasePath, executablePath, logDirectory,
      allowCurrentSchema:true, sourceRelease:"v0.30.0", requireVisibleWindow:false});
    assert.equal(result.launchCount, 2);
    const markers = readdirSync(logDirectory).filter(file => file.endsWith(".json"))
      .map(file => JSON.parse(readFileSync(path.join(logDirectory,file),"utf8")));
    assert.equal(markers.length, 2);
    assert.notEqual(markers[0].token, markers[1].token);
    assert.notEqual(markers[0].pid, markers[1].pid);
    assert.match(readFileSync(path.join(logDirectory,"upgrade-summary.txt"),"utf8"), /Startup acknowledgment: unique token/);
  } finally { rmSync(directory, {recursive:true, force:true}); }
});
