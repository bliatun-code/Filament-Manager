import assert from "node:assert/strict";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  acquireLocalDevProcessLock,
  FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB_ENV,
  inspectLocalDevDatabase,
  prepareLocalDevDatabase,
  resolveLocalDevSourceDatabase,
} from "./local-dev-database.mjs";

function createLocalLibrary(databasePath, options = {}) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE filament_spools (id TEXT PRIMARY KEY);
    CREATE TABLE printers (
      id TEXT PRIMARY KEY,
      ip_address TEXT,
      access_token TEXT
    );
    CREATE TABLE print_jobs (id TEXT PRIMARY KEY);
    CREATE TABLE printer_live_usage_sessions (id TEXT PRIMARY KEY);
    CREATE TABLE trusted_lan_pairings (id TEXT PRIMARY KEY);
    CREATE TABLE trusted_lan_paired_browsers (id TEXT PRIMARY KEY);
    CREATE TABLE sync_queue (id TEXT PRIMARY KEY);
  `);
  const insertSetting = database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  insertSetting.run("library_sync_mode", options.mode ?? "STANDALONE");
  insertSetting.run("library_sync_host_base_url", "http://192.0.2.1:4278");
  insertSetting.run("library_sync_client_device_token", "client-secret");
  insertSetting.run("credential_store_profile_id", "credential_profile_production");
  insertSetting.run("trusted_lan_enabled", "1");
  insertSetting.run("theme_mode", "dark");
  insertSetting.run(
    "bambu_live_integration:printer-1",
    JSON.stringify({ access_code: "printer-secret", enabled: true }),
  );
  if (options.populated !== false) {
    database.prepare("INSERT INTO filament_spools (id) VALUES ('spool-1')").run();
    database
      .prepare(
        "INSERT INTO printers (id, ip_address, access_token) VALUES (?, ?, ?)",
      )
      .run("printer-1", "192.0.2.2", "legacy-printer-secret");
    database.prepare("INSERT INTO print_jobs (id) VALUES ('job-1')").run();
  }
  database.prepare("INSERT INTO trusted_lan_pairings (id) VALUES ('pairing-1')").run();
  database
    .prepare("INSERT INTO trusted_lan_paired_browsers (id) VALUES ('browser-1')")
    .run();
  database.prepare("INSERT INTO sync_queue (id) VALUES ('queued-1')").run();
  return database;
}

function setting(database, key) {
  return database.prepare("SELECT value FROM settings WHERE key = ?").pluck().get(key);
}

test("local dev snapshots the latest standalone recovery and sanitizes only the copy", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-"));
  const installedDatabasePath = path.join(directory, "filament-manager.db");
  const recoveryPath =
    `${installedDatabasePath}.recovery-schema-upgrade-successful-` +
    "01784752673286618000-29315-0000000000.sqlite";
  const failedRecoveryPath =
    `${installedDatabasePath}.recovery-schema-upgrade-failed-` +
    "0000000000000000000000002.sqlite";
  const targetPath = path.join(directory, "workspace", "tmp", "dev-local", "filament-manager.db");
  const installed = createLocalLibrary(installedDatabasePath, { mode: "CLIENT" });
  const recovery = createLocalLibrary(recoveryPath, { mode: "STANDALONE" });
  const failedRecovery = createLocalLibrary(failedRecoveryPath, { mode: "STANDALONE" });

  try {
    recovery.pragma("journal_mode = WAL");
    recovery.pragma("wal_autocheckpoint = 0");
    recovery
      .prepare("INSERT INTO printer_live_usage_sessions (id) VALUES ('wal-session')")
      .run();
    const result = await prepareLocalDevDatabase({
      cwd: path.join(directory, "workspace"),
      installedDatabasePath,
      platform: process.platform,
      randomBytes: () => Buffer.from("11".repeat(16), "hex"),
      randomUuid: () => "local-dev-library",
      targetPath,
    });

    assert.deepEqual(result, {
      reused: false,
      sourcePath: recoveryPath,
      targetPath,
    });
    const target = new Database(targetPath, { fileMustExist: true, readonly: true });
    try {
      assert.equal(setting(target, "library_sync_mode"), "STANDALONE");
      assert.equal(setting(target, "library_sync_device_name"), "Local Dev");
      assert.equal(setting(target, "library_sync_library_id"), "local-dev-library");
      assert.equal(
        setting(target, "credential_store_profile_id"),
        `credential_profile_${"11".repeat(16)}`,
      );
      assert.equal(setting(target, "credential_store_profile_migration_v1"), "complete");
      assert.equal(setting(target, "theme_mode"), "dark");
      assert.equal(setting(target, "library_sync_host_base_url"), undefined);
      assert.equal(setting(target, "library_sync_client_device_token"), undefined);
      assert.equal(setting(target, "trusted_lan_enabled"), undefined);
      assert.equal(setting(target, "bambu_live_integration:printer-1"), undefined);
      assert.equal(
        target.prepare("SELECT COUNT(*) FROM printer_live_usage_sessions").pluck().get(),
        1,
      );
      assert.deepEqual(
        target.prepare("SELECT ip_address, access_token FROM printers").get(),
        { ip_address: null, access_token: null },
      );
      for (const table of [
        "trusted_lan_pairings",
        "trusted_lan_paired_browsers",
        "sync_queue",
      ]) {
        assert.equal(target.prepare(`SELECT COUNT(*) FROM "${table}"`).pluck().get(), 0);
      }
      assert.equal(target.pragma("integrity_check", { simple: true }), "ok");
    } finally {
      target.close();
    }

    assert.equal(setting(recovery, "library_sync_mode"), "STANDALONE");
    assert.equal(setting(recovery, "library_sync_host_base_url"), "http://192.0.2.1:4278");
    assert.equal(
      JSON.parse(setting(recovery, "bambu_live_integration:printer-1")).access_code,
      "printer-secret",
    );
    assert.deepEqual(
      recovery.prepare("SELECT ip_address, access_token FROM printers").get(),
      { ip_address: "192.0.2.2", access_token: "legacy-printer-secret" },
    );
    if (process.platform !== "win32") {
      assert.equal(statSync(path.dirname(targetPath)).mode & 0o777, 0o700);
      assert.equal(statSync(targetPath).mode & 0o777, 0o600);
    }
  } finally {
    failedRecovery.close();
    recovery.close();
    installed.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("local dev reuses a populated standalone target without resolving a source or leaving staging", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-reuse-"));
  const targetPath = path.join(directory, "tmp", "dev-local", "filament-manager.db");
  const target = createLocalLibrary(targetPath);
  target.close();
  const staleBase = path.join(
    path.dirname(targetPath),
    ".filament-manager-local-dev-11111111-1111-4111-8111-111111111111.sqlite",
  );
  writeFileSync(staleBase, "stale-secret", { mode: 0o600 });
  writeFileSync(`${staleBase}-journal`, "stale-journal-secret", { mode: 0o600 });

  try {
    assert.deepEqual(
      await prepareLocalDevDatabase({
        cwd: directory,
        installedDatabasePath: path.join(directory, "missing.db"),
        targetPath,
      }),
      { reused: true, sourcePath: null, targetPath },
    );
    assert.equal(existsSync(staleBase), false);
    assert.equal(existsSync(`${staleBase}-journal`), false);
    const reused = new Database(targetPath, { fileMustExist: true, readonly: true });
    try {
      assert.equal(reused.prepare("SELECT COUNT(*) FROM filament_spools").pluck().get(), 1);
    } finally {
      reused.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("local dev preserves and rejects an empty standalone target", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-empty-"));
  const targetPath = path.join(directory, "tmp", "dev-local", "filament-manager.db");
  const target = createLocalLibrary(targetPath, { populated: false });
  target.close();

  try {
    await assert.rejects(
      prepareLocalDevDatabase({
        cwd: directory,
        installedDatabasePath: path.join(directory, "missing.db"),
        targetPath,
      }),
      /has no inventory or usage data and was preserved/,
    );
    const preserved = new Database(targetPath, { fileMustExist: true, readonly: true });
    try {
      assert.equal(preserved.prepare("SELECT COUNT(*) FROM filament_spools").pluck().get(), 0);
      assert.equal(preserved.pragma("quick_check", { simple: true }), "ok");
    } finally {
      preserved.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("explicit local dev source must be a populated valid database", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-source-"));
  try {
    assert.throws(
      () =>
        resolveLocalDevSourceDatabase({
          cwd: directory,
          env: { [FILAMENT_MANAGER_LOCAL_DEV_SOURCE_DB_ENV]: "missing.db" },
        }),
      /does not contain a usable local Filament Manager library/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("local dev refuses a symbolic-link database target", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-link-"));
  const sourcePath = path.join(directory, "source.db");
  const targetPath = path.join(directory, "target.db");
  const source = createLocalLibrary(sourcePath);
  source.close();
  symlinkSync(sourcePath, targetPath);

  try {
    assert.equal(readlinkSync(targetPath), sourcePath);
    assert.throws(() => inspectLocalDevDatabase(targetPath), /must not be a symbolic link/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("local dev refuses a hard-linked database target", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-hardlink-"));
  const sourcePath = path.join(directory, "source.db");
  const targetPath = path.join(directory, "workspace", "tmp", "dev-local", "filament-manager.db");
  const source = createLocalLibrary(sourcePath);
  source.close();
  mkdirSync(path.dirname(targetPath), { recursive: true });
  linkSync(sourcePath, targetPath);

  try {
    assert.throws(() => inspectLocalDevDatabase(targetPath), /must not be a hard link/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test(
  "local dev refuses a symbolic-link target directory",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-parent-link-"));
    const workspace = path.join(directory, "workspace");
    const outside = path.join(directory, "outside");
    mkdirSync(workspace, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, path.join(workspace, "tmp"), "dir");
    const targetPath = path.join(workspace, "tmp", "dev-local", "filament-manager.db");

    try {
      await assert.rejects(
        prepareLocalDevDatabase({ cwd: workspace, targetPath }),
        /directory must not be a symbolic link/,
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test("local dev removes private staging files and SQLite sidecars after backup failure", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-cleanup-"));
  const workspace = path.join(directory, "workspace");
  const sourcePath = path.join(directory, "source.db");
  const targetPath = path.join(workspace, "tmp", "dev-local", "filament-manager.db");
  const targetDirectory = path.dirname(targetPath);
  const source = createLocalLibrary(sourcePath);
  source.close();
  mkdirSync(targetDirectory, { recursive: true });
  const staleBase = path.join(
    targetDirectory,
    ".filament-manager-local-dev-00000000-0000-4000-8000-000000000000.sqlite",
  );
  writeFileSync(staleBase, "stale-secret", { mode: 0o600 });
  writeFileSync(`${staleBase}-wal`, "stale-wal-secret", { mode: 0o600 });
  let stagingMode = null;

  try {
    await assert.rejects(
      prepareLocalDevDatabase({
        createSnapshot: async (_source, stagingPath) => {
          if (process.platform !== "win32") {
            stagingMode = statSync(stagingPath).mode & 0o777;
          }
          writeFileSync(stagingPath, "snapshot-secret");
          writeFileSync(`${stagingPath}-wal`, "snapshot-wal-secret");
          writeFileSync(`${stagingPath}-shm`, "snapshot-shm-secret");
          throw new Error("simulated backup failure");
        },
        cwd: workspace,
        installedDatabasePath: sourcePath,
        platform: process.platform,
        targetPath,
      }),
      /simulated backup failure/,
    );
    if (process.platform !== "win32") {
      assert.equal(stagingMode, 0o600);
    }
    assert.deepEqual(
      readdirSync(targetDirectory).filter((name) =>
        name.startsWith(".filament-manager-local-dev-"),
      ),
      [],
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("local dev process lock blocks a second process and releases cleanly", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-lock-"));
  const targetPath = path.join(directory, "tmp", "dev-local", "filament-manager.db");

  try {
    const releaseFirst = acquireLocalDevProcessLock({
      cwd: directory,
      platform: process.platform,
      targetPath,
    });
    assert.throws(
      () =>
        acquireLocalDevProcessLock({
          cwd: directory,
          platform: process.platform,
          targetPath,
        }),
      /lock already exists/,
    );
    releaseFirst();

    const releaseSecond = acquireLocalDevProcessLock({
      cwd: directory,
      platform: process.platform,
      targetPath,
    });
    releaseSecond();
    assert.equal(
      existsSync(path.join(path.dirname(targetPath), ".filament-manager-dev-local.lock")),
      false,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("local dev never overwrites a target that appears during snapshot preparation", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-manager-local-dev-race-"));
  const workspace = path.join(directory, "workspace");
  const sourcePath = path.join(directory, "source.db");
  const targetPath = path.join(workspace, "tmp", "dev-local", "filament-manager.db");
  const source = createLocalLibrary(sourcePath);
  source.close();

  try {
    await assert.rejects(
      prepareLocalDevDatabase({
        createSnapshot: async (snapshotSourcePath, stagingPath) => {
          const snapshotSource = new Database(snapshotSourcePath, {
            fileMustExist: true,
            readonly: true,
          });
          try {
            await snapshotSource.backup(stagingPath);
          } finally {
            snapshotSource.close();
          }
          const competingTarget = createLocalLibrary(targetPath);
          competingTarget
            .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
            .run("race_marker", "preserved");
          competingTarget.close();
        },
        cwd: workspace,
        installedDatabasePath: sourcePath,
        platform: process.platform,
        targetPath,
      }),
      /target appeared during preparation and was not overwritten/,
    );

    const target = new Database(targetPath, { fileMustExist: true, readonly: true });
    try {
      assert.equal(setting(target, "race_marker"), "preserved");
      assert.equal(target.pragma("quick_check", { simple: true }), "ok");
    } finally {
      target.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
