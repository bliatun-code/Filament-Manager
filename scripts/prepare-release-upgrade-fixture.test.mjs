import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  assertPrivateFixturePath,
  assertPrivateFixturePlatform,
  hardenPrivateFixturePath,
  prepareReleaseUpgradeFixture,
  publishPrivateFixtureNoReplace,
  validateReleaseUpgradeFixtureOptions,
} from "./prepare-release-upgrade-fixture.mjs";
import {
  assertReleaseUpgradeFixtureSanitized,
  assertReleaseUpgradeProtectedValuesPreserved,
  parseStrictReleaseUpgradeInteger,
  RELEASE_UPGRADE_FIXTURE_MARKER_KEY,
  RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
  snapshotReleaseUpgradeProtectedValues,
} from "./release-upgrade-fixture-contract.mjs";

function createLegacyDatabase(databasePath) {
  const database = new Database(databasePath);
  database.exec(`
    PRAGMA user_version = 0;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE printers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip_address TEXT,
      access_token TEXT
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
    CREATE TABLE filament_spools (
      id TEXT PRIMARY KEY,
      master_id TEXT NOT NULL,
      owner_name TEXT,
      owner_contact TEXT,
      ownership_note TEXT,
      batch_code TEXT,
      supplier_reference TEXT,
      qr_code TEXT,
      rfid_tag TEXT,
      rfid_observed_at TEXT
    );
    CREATE TABLE spool_history_events (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE printer_live_events (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE spool_loans (
      id TEXT PRIMARY KEY,
      borrower_name TEXT,
      counterparty_name TEXT,
      counterparty_contact TEXT,
      counterparty_note TEXT,
      lent_note TEXT,
      return_note TEXT
    );
    CREATE TABLE trusted_lan_pairings (id TEXT PRIMARY KEY);
    CREATE TABLE trusted_lan_paired_browsers (id TEXT PRIMARY KEY);
    CREATE TABLE inventory_locations (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE print_jobs (id TEXT PRIMARY KEY, job_name TEXT);
    CREATE TABLE printer_live_usage_sessions (id TEXT PRIMARY KEY, job_name TEXT);
    CREATE TABLE wishlist_items (id TEXT PRIMARY KEY, note TEXT);
    CREATE TABLE sync_queue (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
    CREATE TABLE scales (id TEXT PRIMARY KEY, name TEXT, device_id TEXT);
    CREATE TABLE scan_events (id TEXT PRIMARY KEY, qr_code TEXT);
    CREATE TABLE ams_slots (
      id TEXT PRIMARY KEY,
      rfid_override_tray_uuid TEXT
    );
    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );
  `);
  const secret = "release-qa-plaintext-secret";
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run(
      "bambu_live_integration:printer-private",
      JSON.stringify({
        access_code: secret,
        access_code_configured: true,
        enabled: true,
        host: "192.0.2.99",
        observed_state: { online: true },
        printer_serial: "01PRIVATE",
        tls_identity: { trusted_spki_sha256: "private-fingerprint" },
        unknown_future_auth: {
          password: secret,
        },
      }),
    );
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("library_sync_client_device_token", secret);
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("credential_store_profile_id", "credential_profile_private");
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("library_sync_cached_inventory", secret);
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("theme_mode", "dark");
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("language", "nb");
  database
    .prepare(
      "INSERT INTO printers (id, name, ip_address, access_token) VALUES (?, ?, ?, ?)",
    )
    .run("printer-1", "Private printer", "192.0.2.10", secret);
  database
    .prepare(
      `INSERT INTO filament_master_list (
         id, material, filament_name, color_name, vendor, catalog_source,
         catalog_seed_version, catalog_user_edited, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "master-1",
      "PLA",
      "Basic",
      "Black",
      "Bambu Lab",
      "seeded",
      "seed-v1",
      0,
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
    );
  database
    .prepare(
      `INSERT INTO filament_master_list (
         id, material, filament_name, color_name, vendor, catalog_source,
         catalog_seed_version, catalog_user_edited, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "master-manual",
      "PETG",
      "Workshop blend",
      "Ocean",
      "Local vendor",
      "manual",
      null,
      1,
      "2026-01-02T00:00:00Z",
      "2026-01-02T00:00:00Z",
    );
  database
    .prepare(
      `INSERT INTO filament_spools
       (id, master_id, owner_name, owner_contact, ownership_note, batch_code,
        supplier_reference, qr_code, rfid_tag, rfid_observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "spool-1",
      "master-1",
      "Private owner",
      "private@example.test",
      secret,
      secret,
      secret,
      "http://192.0.2.10/private",
      secret,
      "2026-07-29T00:00:00Z",
    );
  database
    .prepare("INSERT INTO spool_history_events (id, payload_json) VALUES (?, ?)")
    .run("history-1", JSON.stringify({ private_note: secret }));
  database
    .prepare("INSERT INTO printer_live_events (id, payload_json) VALUES (?, ?)")
    .run("live-1", JSON.stringify({ job_name: secret, raw_payload: secret }));
  database
    .prepare(
      `INSERT INTO spool_loans
       (id, borrower_name, counterparty_name, counterparty_contact,
        counterparty_note, lent_note, return_note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "loan-1",
      "Private borrower",
      "Private borrower",
      "private@example.test",
      secret,
      secret,
      secret,
    );
  database
    .prepare("INSERT INTO trusted_lan_pairings (id) VALUES (?)")
    .run(secret);
  database
    .prepare("INSERT INTO trusted_lan_paired_browsers (id) VALUES (?)")
    .run(secret);
  database
    .prepare("INSERT INTO sync_queue (id, payload_json) VALUES (?, ?)")
    .run("sync-1", JSON.stringify({ token: secret }));
  database
    .prepare("INSERT INTO scales (id, name, device_id) VALUES (?, ?, ?)")
    .run("scale-1", "Private scale", secret);
  database
    .prepare("INSERT INTO scan_events (id, qr_code) VALUES (?, ?)")
    .run("scan-1", `http://192.0.2.10/${secret}`);
  database
    .prepare("INSERT INTO inventory_locations (id, name) VALUES (?, ?)")
    .run("location-1", secret);
  database
    .prepare("INSERT INTO print_jobs (id, job_name) VALUES (?, ?)")
    .run("job-1", secret);
  database
    .prepare(
      "INSERT INTO printer_live_usage_sessions (id, job_name) VALUES (?, ?)",
    )
    .run("session-1", secret);
  database
    .prepare("INSERT INTO wishlist_items (id, note) VALUES (?, ?)")
    .run("wishlist-1", secret);
  database
    .prepare(
      "INSERT INTO ams_slots (id, rfid_override_tray_uuid) VALUES (?, ?)",
    )
    .run("slot-1", secret);
  database
    .prepare("INSERT INTO alerts (id, payload_json) VALUES (?, ?)")
    .run("alert-1", JSON.stringify({ private_note: secret }));
  database.close();
  return secret;
}

test("release upgrade fixture requires distinct explicit paths", () => {
  assert.throws(
    () =>
      validateReleaseUpgradeFixtureOptions({
        outputPath: "",
        sourcePath: "source.db",
      }),
    /output path is required/,
  );
  assert.throws(
    () =>
      validateReleaseUpgradeFixtureOptions({
        outputPath: "copy.db",
        sourcePath: "",
      }),
    /source database path is required/,
  );
});

test("release upgrade fixture refuses platforms without owner-only file ACL guarantees", () => {
  assert.throws(
    () => assertPrivateFixturePlatform("win32"),
    /cannot guarantee an owner-only ACL/,
  );
  assert.doesNotThrow(() => assertPrivateFixturePlatform("darwin"));
  assert.doesNotThrow(() => assertPrivateFixturePlatform("linux"));
  assert.throws(
    () => assertPrivateFixturePlatform("freebsd"),
    /cannot guarantee an owner-only ACL/,
  );
});

test("release upgrade fixture parses bounded integers without truncation", () => {
  const bounds = { label: "Launch count", maximum: 5, minimum: 2 };
  assert.equal(parseStrictReleaseUpgradeInteger("2", bounds), 2);
  assert.equal(parseStrictReleaseUpgradeInteger(5, bounds), 5);
  for (const invalid of ["2.5", "2junk", "02", " 2", 2.5, 6]) {
    assert.throws(
      () => parseStrictReleaseUpgradeInteger(invalid, bounds),
      /must be an integer from 2 to 5/,
    );
  }
});

test(
  "release upgrade fixture verifies private mode and ACL state",
  { skip: process.platform === "win32" },
  () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-private-path-test-"),
    );
    const privatePath = path.join(directory, "fixture.sqlite");
    writeFileSync(privatePath, "private", { mode: 0o600 });
    try {
      hardenPrivateFixturePath(privatePath, 0o600);
      assert.doesNotThrow(() =>
        assertPrivateFixturePath(privatePath, 0o600),
      );
      chmodSync(privatePath, 0o644);
      assert.throws(
        () => assertPrivateFixturePath(privatePath, 0o600),
        /must use mode 600/,
      );
      hardenPrivateFixturePath(privatePath, 0o600);
      assert.doesNotThrow(() =>
        assertPrivateFixturePath(privatePath, 0o600),
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test("release upgrade fixture publishes without replacing an existing path", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-no-replace-test-"),
  );
  try {
    const stagingPath = path.join(directory, "staging.sqlite");
    const outputPath = path.join(directory, "fixture.sqlite");
    writeFileSync(stagingPath, "sanitized", { mode: 0o600 });
    writeFileSync(outputPath, "existing", { mode: 0o600 });
    assert.throws(
      () => publishPrivateFixtureNoReplace(stagingPath, outputPath),
      (error) => error?.code === "EEXIST",
    );
    assert.equal(readFileSync(stagingPath, "utf8"), "sanitized");
    assert.equal(readFileSync(outputPath, "utf8"), "existing");

    rmSync(outputPath);
    publishPrivateFixtureNoReplace(stagingPath, outputPath);
    assert.equal(existsSync(stagingPath), false);
    assert.equal(readFileSync(outputPath, "utf8"), "sanitized");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("release upgrade fixture contract rejects unknown Bambu credential fields", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
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
    insert.run(
      "bambu_live_integration:printer-1",
      JSON.stringify({
        access_code_configured: false,
        enabled: false,
        last_error: null,
        observed_state: null,
        unknown_future_auth: {
          password: "must-not-survive",
        },
      }),
    );
    assert.throws(
      () => assertReleaseUpgradeFixtureSanitized(database),
      /minimal safe shape/,
    );
  } finally {
    database.close();
  }
});

test(
  "release upgrade fixture preserves domain identities and removes private data",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-release-upgrade-test-"),
    );
    const sourcePath = path.join(directory, "source.db");
    const outputPath = path.join(directory, "fixture.db");
    const secret = createLegacyDatabase(sourcePath);
    try {
      const result = await prepareReleaseUpgradeFixture({
        outputPath,
        sourcePath,
      });
      assert.equal(result.source.schemaVersion, 0);
      assert.deepEqual(result.fixture.counts, result.source.counts);
      assert.deepEqual(result.fixture.ids, result.source.ids);
      assert.equal(statSync(outputPath).mode & 0o777, 0o600);

      const fixture = new Database(outputPath, {
        fileMustExist: true,
        readonly: true,
      });
      try {
        assert.equal(
          fixture
            .prepare("SELECT COUNT(*) AS count FROM trusted_lan_pairings")
            .get().count,
          0,
        );
        assert.equal(
          fixture
            .prepare("SELECT COUNT(*) AS count FROM trusted_lan_paired_browsers")
            .get().count,
          0,
        );
        assert.equal(
          fixture
            .prepare(
              "SELECT COUNT(*) AS count FROM settings WHERE key = 'library_sync_client_device_token'",
            )
            .get().count,
          0,
        );
        const config = JSON.parse(
          fixture
            .prepare(
              "SELECT value FROM settings WHERE key LIKE 'bambu_live_integration:%'",
            )
            .get().value,
        );
        assert.equal(config.enabled, false);
        assert.equal(config.access_code_configured, false);
        assert.deepEqual(config, {
          access_code_configured: false,
          enabled: false,
          last_error: null,
          observed_state: null,
        });
        assert.equal(
          fixture
            .prepare("SELECT value FROM settings WHERE key = ?")
            .get(RELEASE_UPGRADE_FIXTURE_MARKER_KEY).value,
          RELEASE_UPGRADE_FIXTURE_MARKER_VALUE,
        );
        assert.equal(
          fixture
            .prepare(
              "SELECT COUNT(*) AS count FROM settings WHERE key LIKE 'library_sync_cached_%'",
            )
            .get().count,
          0,
        );
        assert.equal(
          fixture
            .prepare(
              "SELECT name, ip_address, access_token FROM printers WHERE id = ?",
            )
            .get("printer-1").name,
          "Release QA printer",
        );
        assert.deepEqual(
          fixture
            .prepare(
              "SELECT ip_address, access_token FROM printers WHERE id = ?",
            )
            .get("printer-1"),
          { access_token: null, ip_address: null },
        );
        assert.equal(
          fixture
            .prepare("SELECT payload_json FROM printer_live_events WHERE id = ?")
            .get("live-1").payload_json,
          "{}",
        );
        assert.equal(
          fixture
            .prepare(
              "SELECT rfid_override_tray_uuid FROM ams_slots WHERE id = ?",
            )
            .get("slot-1").rfid_override_tray_uuid,
          null,
        );
        assert.deepEqual(
          fixture
            .prepare(
              `SELECT
                 (SELECT name FROM inventory_locations WHERE id = 'location-1') AS location_name,
                 (SELECT job_name FROM print_jobs WHERE id = 'job-1') AS print_name,
                 (SELECT job_name FROM printer_live_usage_sessions WHERE id = 'session-1') AS live_name,
                 (SELECT name FROM scales WHERE id = 'scale-1') AS scale_name`,
            )
            .get(),
          {
            live_name: "Release QA print",
            location_name: "Release QA location",
            print_name: "Release QA print",
            scale_name: "Release QA scale",
          },
        );
        assert.equal(
          fixture.prepare("SELECT COUNT(*) AS count FROM sync_queue").get().count,
          0,
        );
        assert.equal(
          fixture
            .prepare("SELECT value FROM settings WHERE key = 'theme_mode'")
            .get().value,
          "dark",
        );
        assert.equal(
          fixture
            .prepare(
              "SELECT vendor FROM filament_master_list WHERE id = 'master-manual'",
            )
            .get().vendor,
          "Local vendor",
        );
      } finally {
        fixture.close();
      }

      assert.equal(readFileSync(outputPath).includes(Buffer.from(secret)), false);
      assert.deepEqual(
        result.protectedValues,
        (() => {
          const fixture = new Database(outputPath, {
            fileMustExist: true,
            readonly: true,
          });
          try {
            return snapshotReleaseUpgradeProtectedValues(fixture);
          } finally {
            fixture.close();
          }
        })(),
      );
      const source = new Database(sourcePath, {
        fileMustExist: true,
        readonly: true,
      });
      try {
        assert.equal(
          source
            .prepare("SELECT value FROM settings WHERE key = ?")
            .get("library_sync_client_device_token").value,
          secret,
        );
      } finally {
        source.close();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test(
  "release upgrade fixture protects safe settings and user catalog data only",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-protected-values-test-"),
    );
    const sourcePath = path.join(directory, "source.db");
    const outputPath = path.join(directory, "fixture.db");
    createLegacyDatabase(sourcePath);
    try {
      const result = await prepareReleaseUpgradeFixture({
        outputPath,
        sourcePath,
      });
      const before = result.protectedValues;

      let database = new Database(outputPath);
      database
        .prepare(
          "UPDATE filament_master_list SET vendor = ?, catalog_seed_version = ?, updated_at = ? WHERE id = ?",
        )
        .run("Updated seed vendor", "seed-v2", "2026-07-29T00:00:00Z", "master-1");
      database
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run("new_release_setting", "allowed");
      database.close();

      database = new Database(outputPath, { readonly: true });
      let after;
      try {
        after = snapshotReleaseUpgradeProtectedValues(database);
      } finally {
        database.close();
      }
      assert.doesNotThrow(() =>
        assertReleaseUpgradeProtectedValuesPreserved(before, after),
      );

      database = new Database(outputPath);
      database
        .prepare("UPDATE settings SET value = ? WHERE key = ?")
        .run("light", "theme_mode");
      database.close();
      database = new Database(outputPath, { readonly: true });
      try {
        after = snapshotReleaseUpgradeProtectedValues(database);
      } finally {
        database.close();
      }
      assert.throws(
        () => assertReleaseUpgradeProtectedValuesPreserved(before, after),
        /changed the protected setting theme_mode/,
      );

      database = new Database(outputPath);
      database
        .prepare("UPDATE settings SET value = ? WHERE key = ?")
        .run("dark", "theme_mode");
      database
        .prepare(
          "UPDATE filament_master_list SET vendor = ? WHERE id = 'master-manual'",
        )
        .run("Overwritten vendor");
      database.close();
      database = new Database(outputPath, { readonly: true });
      try {
        after = snapshotReleaseUpgradeProtectedValues(database);
      } finally {
        database.close();
      }
      assert.throws(
        () => assertReleaseUpgradeProtectedValuesPreserved(before, after),
        /changed protected catalog row master-manual/,
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);

test(
  "release upgrade fixture never publishes a raw copy when sanitization fails",
  { skip: process.platform === "win32" },
  async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "filament-manager-release-upgrade-failure-"),
    );
    const sourcePath = path.join(directory, "source.db");
    const outputPath = path.join(directory, "fixture.db");
    const source = new Database(sourcePath);
    source.exec(
      "PRAGMA user_version = 0; CREATE TABLE settings (unexpected TEXT);",
    );
    source.close();
    try {
      await assert.rejects(
        () =>
          prepareReleaseUpgradeFixture({
            outputPath,
            sourcePath,
          }),
        /no such column: key/,
      );
      assert.equal(existsSync(outputPath), false);
      assert.deepEqual(
        readdirSync(directory).filter((name) =>
          name.startsWith(".release-upgrade-fixture-"),
        ),
        [],
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
);
