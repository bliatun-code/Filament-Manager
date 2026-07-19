import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve, win32 } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  APP_DB_PATH_ENV_VAR,
  DEFAULT_VISUAL_QA_DB_CANDIDATES,
  VISUAL_QA_FIXTURE_LOAN_DIALOGS,
  VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE,
  VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES,
  VISUAL_QA_FIXTURE_TRUSTED_LAN_INTERFACE,
  VISUAL_QA_FIXTURE_WISHLIST_QUEUE,
  VISUAL_QA_PROFILE_BASE,
  VISUAL_QA_PROFILE_RICH,
  VISUAL_QA_DB_PATH_ENV_VAR,
  VISUAL_QA_TRUSTED_LAN_PORT,
  applyTrustedLanInterfaceFixture,
  applyVisualQaDatabaseFixture,
  assessVisualQaDataset,
  chooseBalancedCatalogSwatchFixtureRows,
  formatVisualQaDatasetReport,
  formatVisualQaLaunchCommand,
  formatSqliteCliBackupCommand,
  listPrivateVisualQaNetworkInterfaces,
  normalizeVisualQaDatabaseFixtureScenario,
  normalizeVisualQaPath,
  normalizeVisualQaProfile,
  resolveVisualQaDbSource,
  visualQaTempDbPath,
} from "./visual-qa-db.mjs";

test("visual QA launch command is copyable in POSIX shells", () => {
  const dbPath = posix.join("workspace", "Visual QA", "O'Brien.db");

  assert.equal(
    formatVisualQaLaunchCommand(dbPath, "darwin"),
    "FILAMENT_MANAGER_DB_PATH='workspace/Visual QA/O'\\''Brien.db' FILAMENT_MANAGER_VISUAL_QA='1' npm run tauri -- dev",
  );
});

test("visual QA launch command is copyable in PowerShell", () => {
  const dbPath = win32.join("D:\\", "Visual QA", "O'Brien.db");

  assert.equal(
    formatVisualQaLaunchCommand(dbPath, "win32"),
    String.raw`$env:FILAMENT_MANAGER_DB_PATH='D:\Visual QA\O''Brien.db'; $env:FILAMENT_MANAGER_VISUAL_QA='1'; npm.cmd run tauri -- dev`,
  );
});

test("SQLite CLI backup command preserves portable path characters", () => {
  assert.equal(
    formatSqliteCliBackupCommand(
      String.raw`C:\Users\O'Brien\Visual QA\backup.db`,
    ),
    String.raw`.backup "C:\\Users\\O'Brien\\Visual QA\\backup.db"`,
  );
  assert.equal(
    formatSqliteCliBackupCommand(
      posix.join(
        "workspace",
        'Visual "QA"',
        "line\nbreak\rreturn\ttab\bbackspace\fformfeed\vvertical.db",
      ),
    ),
    String.raw`.backup "workspace/Visual \"QA\"/line\nbreak\rreturn\ttab\bbackspace\fformfeed\vvertical.db"`,
  );
});

test("default visual QA sources never auto-select the live App Support library", () => {
  assert.ok(DEFAULT_VISUAL_QA_DB_CANDIDATES.length > 0);
  assert.ok(
    DEFAULT_VISUAL_QA_DB_CANDIDATES.every(
      (candidate) => !candidate.includes("Library/Application Support"),
    ),
  );
});

test("normalizeVisualQaPath trims and resolves relative paths", () => {
  assert.equal(normalizeVisualQaPath(""), null);
  assert.equal(normalizeVisualQaPath("   "), null);
  assert.equal(normalizeVisualQaPath("data/example.db", "/repo"), resolve("/repo", "data/example.db"));
});

test("normalizeVisualQaProfile defaults to rich and accepts base", () => {
  assert.equal(normalizeVisualQaProfile(), VISUAL_QA_PROFILE_RICH);
  assert.equal(normalizeVisualQaProfile("base"), VISUAL_QA_PROFILE_BASE);
  assert.throws(() => normalizeVisualQaProfile("thin"), /Unknown visual QA profile/);
});

test("normalizeVisualQaDatabaseFixtureScenario accepts slot onboarding aliases", () => {
  assert.equal(
    normalizeVisualQaDatabaseFixtureScenario("ams-onboarding"),
    "printer-slot-onboarding",
  );
  assert.equal(
    normalizeVisualQaDatabaseFixtureScenario("rfid-override"),
    VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE,
  );
  assert.equal(
    normalizeVisualQaDatabaseFixtureScenario("missing-swatches"),
    VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES,
  );
  assert.equal(
    normalizeVisualQaDatabaseFixtureScenario("wishlist-orders"),
    VISUAL_QA_FIXTURE_WISHLIST_QUEUE,
  );
  assert.equal(
    normalizeVisualQaDatabaseFixtureScenario("hand-back-borrowed-in"),
    VISUAL_QA_FIXTURE_LOAN_DIALOGS,
  );
  assert.equal(
    normalizeVisualQaDatabaseFixtureScenario("borrower-usage-breakdown"),
    VISUAL_QA_FIXTURE_LOAN_DIALOGS,
  );
  assert.equal(normalizeVisualQaDatabaseFixtureScenario("settings-library-pairing"), null);
  assert.equal(normalizeVisualQaDatabaseFixtureScenario("settings-library-browsers"), null);
  assert.equal(normalizeVisualQaDatabaseFixtureScenario("settings-library-browsers-history"), null);
  assert.equal(normalizeVisualQaDatabaseFixtureScenario("settings-general"), null);
});

test("catalog swatch fixture balances eSUN and Bambu before filling remaining slots", () => {
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `esun-${index}`, vendor: "eSUN" })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `bambu-${index}`, vendor: "Bambu" })),
    { id: "other-0", vendor: "Other" },
  ];

  const selected = chooseBalancedCatalogSwatchFixtureRows(candidates, 8);

  assert.equal(selected.length, 8);
  assert.equal(selected.filter((row) => row.vendor === "eSUN").length, 4);
  assert.equal(selected.filter((row) => row.vendor === "Bambu").length, 4);
  assert.deepEqual(
    selected.slice(0, 4).map((row) => row.id),
    ["esun-0", "bambu-0", "esun-1", "bambu-1"],
  );
});

test("resolveVisualQaDbSource prefers explicit visual QA env path", () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-source-"));
  try {
    const visualDb = join(dir, "visual.db");
    const appDb = join(dir, "app.db");
    writeFileSync(visualDb, "");
    writeFileSync(appDb, "");

    const source = resolveVisualQaDbSource({
      candidates: [],
      cwd: dir,
      env: {
        [VISUAL_QA_DB_PATH_ENV_VAR]: visualDb,
        [APP_DB_PATH_ENV_VAR]: appDb,
      },
    });

    assert.equal(source?.path, visualDb);
    assert.equal(source?.source, "env");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("resolveVisualQaDbSource falls back to candidate paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-candidate-"));
  try {
    const candidate = join(dir, "candidate.db");
    writeFileSync(candidate, "");

    const source = resolveVisualQaDbSource({
      candidates: ["missing.db", "candidate.db"],
      cwd: dir,
      env: {},
    });

    assert.equal(source?.path, candidate);
    assert.equal(source?.source, "candidate");
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("listPrivateVisualQaNetworkInterfaces prefers physical private IPv4 interfaces", () => {
  const interfaces = listPrivateVisualQaNetworkInterfaces({
    bridge100: [{ address: "192.168.64.1", family: "IPv4", internal: false }],
    en0: [{ address: "172.20.10.7", family: "IPv4", internal: false }],
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    utun1: [{ address: "10.11.12.13", family: "IPv4", internal: false }],
    wan0: [{ address: "8.8.8.8", family: "IPv4", internal: false }],
  });

  assert.deepEqual(interfaces, [
    { address: "172.20.10.7", name: "en0" },
    { address: "192.168.64.1", name: "bridge100" },
    { address: "10.11.12.13", name: "utun1" },
  ]);
});

test("assessVisualQaDataset rejects empty shells", () => {
  const assessment = assessVisualQaDataset({
    counts: {
      filament_spools: 0,
      printers: 0,
    },
    tables: ["filament_spools", "printers"],
  }, { profile: "base" });

  assert.deepEqual(assessment.errors, [
    "filament_spools has 0 row(s), expected at least 1",
    "printers has 0 row(s), expected at least 1",
  ]);
});

test("assessVisualQaDataset allows sparse context but warns about it", () => {
  const assessment = assessVisualQaDataset({
    counts: {
      filament_spools: 4,
      printers: 1,
      spool_loans: 0,
    },
    tables: ["filament_spools", "printers", "spool_loans"],
  }, { profile: "base" });

  assert.deepEqual(assessment.errors, []);
  assert.ok(assessment.warnings.some((warning) => warning.includes("spool_loans has no rows")));
});

test("rich visual QA requires live printer, companion and usage context", () => {
  const assessment = assessVisualQaDataset({
    counts: {
      filament_spools: 4,
      printers: 1,
      settings: 1,
      ams_slots: 4,
      printer_live_events: 12,
      printer_live_usage_sessions: 0,
      printer_live_usage_session_spools: 0,
      print_jobs: 0,
    },
    details: {
      bambuLiveEnabledCount: 0,
      bambuLiveIntegrationCount: 0,
      bambuLiveObservedStateCount: 0,
      bambuLiveObservedTrayCount: 0,
      trustedLanEnabled: false,
      trustedLanInterfaceConfigured: false,
      usageEventCount: 0,
    },
    tables: [
      "filament_spools",
      "printers",
      "settings",
      "ams_slots",
      "printer_live_events",
      "printer_live_usage_sessions",
      "printer_live_usage_session_spools",
      "print_jobs",
    ],
  });

  assert.ok(assessment.errors.some((error) => error.includes("enabled Bambu Live printer")));
  assert.ok(assessment.errors.some((error) => error.includes("trusted-LAN companion enabled")));
  assert.ok(assessment.errors.some((error) => error.includes("print/job usage statistics")));
});

test("rich visual QA accepts production-like local context", () => {
  const assessment = assessVisualQaDataset({
    counts: {
      filament_spools: 56,
      printers: 2,
      settings: 6,
      ams_slots: 4,
      printer_live_events: 6713,
      printer_live_usage_sessions: 119,
      printer_live_usage_session_spools: 50,
      print_jobs: 3,
    },
    details: {
      bambuLiveEnabledCount: 1,
      bambuLiveIntegrationCount: 1,
      bambuLiveObservedStateCount: 1,
      bambuLiveObservedTrayCount: 4,
      trustedLanEnabled: true,
      trustedLanCompanionUrl: "http://192.168.1.50:4278/companion",
      trustedLanInterfaceConfigured: true,
      usageEventCount: 122,
    },
    tables: [
      "filament_spools",
      "printers",
      "settings",
      "ams_slots",
      "printer_live_events",
      "printer_live_usage_sessions",
      "printer_live_usage_session_spools",
      "print_jobs",
    ],
  });

  assert.deepEqual(assessment.errors, []);
});

test("formatVisualQaDatasetReport includes counts and errors", () => {
  const sourcePath = join(tmpdir(), "source.db");
  const targetPath = join(tmpdir(), "copy.db");
  const report = formatVisualQaDatasetReport({
    assessment: {
      errors: ["filament_spools has 0 row(s), expected at least 1"],
      profile: "base",
      warnings: [],
    },
    inspection: {
      counts: { filament_spools: 0, printers: 2 },
      details: {
        trustedLanCompanionUrl: "http://192.168.1.50:4278/companion",
      },
      tables: ["filament_spools", "printers"],
    },
    sourcePath,
    targetPath,
  });

  assert.ok(report.includes(`Visual QA database source: ${sourcePath}`));
  assert.match(report, /Visual QA profile: base/);
  assert.match(report, /Desktop app: use the Tauri desktop window/);
  assert.match(report, /Companion: http:\/\/192\.168\.1\.50:4278\/companion/);
  assert.match(report, /filament_spools: 0/);
  assert.match(report, /expected at least 1/);
});

test("applyTrustedLanInterfaceFixture retargets trusted LAN settings on database copies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-trusted-lan-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("trusted_lan_enabled", "1");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "trusted_lan_interface_name",
      "Wi-Fi",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "trusted_lan_interface_address",
      "192.168.1.25",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("trusted_lan_port", "4278");
    db.close();

    const fixture = await applyTrustedLanInterfaceFixture(dbPath, {
      interfaces: [{ address: "172.20.10.7", name: "en0" }],
    });

    assert.equal(fixture?.fixture, VISUAL_QA_FIXTURE_TRUSTED_LAN_INTERFACE);
    assert.equal(fixture?.previousInterfaceAddress, "192.168.1.25");
    assert.equal(fixture?.interfaceAddress, "172.20.10.7");
    assert.equal(fixture?.interfaceName, "en0");
    assert.equal(fixture?.previousPort, "4278");
    assert.equal(fixture?.port, String(VISUAL_QA_TRUSTED_LAN_PORT));

    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      assert.equal(
        updatedDb
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("trusted_lan_interface_name").value,
        "en0",
      );
      assert.equal(
        updatedDb
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("trusted_lan_interface_address").value,
        "172.20.10.7",
      );
      assert.equal(
        updatedDb
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("trusted_lan_port").value,
        String(VISUAL_QA_TRUSTED_LAN_PORT),
      );
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("applyTrustedLanInterfaceFixture leaves live databases untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-trusted-lan-live-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("trusted_lan_enabled", "1");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "trusted_lan_interface_address",
      "192.168.1.25",
    );
    db.close();

    const fixture = await applyTrustedLanInterfaceFixture(dbPath, {
      interfaces: [{ address: "172.20.10.7", name: "en0" }],
      live: true,
    });

    assert.equal(fixture, null);
    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      assert.equal(
        updatedDb
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("trusted_lan_interface_address").value,
        "192.168.1.25",
      );
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("visualQaTempDbPath creates a stable temp db name", () => {
  const path = visualQaTempDbPath("/repo/data/visual-test-bambu.db", new Date("2026-07-01T00:00:00Z"));
  assert.match(path, /filament-manager-visual-qa/);
  assert.match(path, /visual-test-bambu-2026-07-01T00-00-00-000Z\.db$/);
});

test("applyVisualQaDatabaseFixture creates a printer slot onboarding state on copies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-fixture-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE printers (id TEXT PRIMARY KEY, model TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE ams_units (id TEXT PRIMARY KEY, printer_id TEXT NOT NULL);
      CREATE TABLE ams_slots (
        id TEXT PRIMARY KEY,
        ams_id TEXT NOT NULL,
        slot_index INTEGER NOT NULL,
        spool_id TEXT,
        last_seen_at TEXT,
        rfid_override_tray_uuid TEXT,
        rfid_override_color_hex TEXT,
        live_cache_cleared_at TEXT
      );
      CREATE TABLE filament_master_list (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        hex_color TEXT,
        default_weight INTEGER NOT NULL DEFAULT 1000,
        vendor TEXT NOT NULL DEFAULT 'Bambu',
        is_discontinued INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE filament_spools (
        id TEXT PRIMARY KEY,
        master_id TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
    db.prepare("INSERT INTO printers (id, model, name) VALUES (?, ?, ?)").run(
      "printer_1",
      "Bambu Lab P1S",
      "Brutus",
    );
    db.prepare("INSERT INTO ams_units (id, printer_id) VALUES (?, ?)").run(
      "printer_1_ams_1",
      "printer_1",
    );
    db.prepare(
      `INSERT INTO ams_slots
       (id, ams_id, slot_index, spool_id, rfid_override_tray_uuid, rfid_override_color_hex, live_cache_cleared_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("printer_1_ams_1_slot_1", "printer_1_ams_1", 1, "spool_loaded", "old", "#000000", "old");
    db.prepare(
      `INSERT INTO filament_master_list
       (id, vendor, material, filament_name, color_name, hex_color, default_weight, is_discontinued)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("master_pla", "Bambu", "PLA", "PLA Basic", "Black (10101)", "#000000", 1000, 0);
    db.prepare(
      `INSERT INTO filament_master_list
       (id, vendor, material, filament_name, color_name, hex_color, default_weight, is_discontinued)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("master_asa", "Bambu", "ASA", "ASA", "Green (45500)", "#00A6A0", 1000, 0);
    db.prepare("INSERT INTO filament_spools (id, master_id, deleted_at) VALUES (?, ?, NULL)").run(
      "spool_loaded",
      "master_pla",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "bambu_live_integration:printer_1",
      JSON.stringify({
        enabled: true,
        host: "192.168.1.20",
        observed_state: {
          online: true,
          last_seen_at: "2026-07-01T00:00:00Z",
          mqtt_connected: true,
          active_ams_index: 0,
          active_tray_index: 0,
          trays: [
            {
              ams_index: 0,
              tray_index: 0,
              loaded: true,
              tray_uuid: "OLD-RFID",
              filament_type: "PLA",
              filament_name: "PLA Basic",
              color_hex: "#000000",
              match_status: "clear_match",
              matched_inventory_spool_id: "spool_loaded",
              matched_inventory_mode: "exact_rfid",
              last_identity_seen_at: "2026-07-01T00:00:00Z",
            },
          ],
        },
      }),
    );
    db.close();

    const fixture = await applyVisualQaDatabaseFixture(dbPath, "printer-slot-onboarding", {
      now: new Date("2026-07-01T12:00:00Z"),
    });
    assert.equal(fixture?.fixture, "printer-slot-onboarding");
    assert.equal(fixture?.slotId, "printer_1_ams_1_slot_1");
    assert.equal(fixture?.masterId, "master_asa");

    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      const slot = updatedDb
        .prepare(
          `SELECT spool_id, rfid_override_tray_uuid, rfid_override_color_hex, live_cache_cleared_at
           FROM ams_slots
           WHERE id = ?`,
        )
        .get("printer_1_ams_1_slot_1");
      assert.equal(slot.spool_id, null);
      assert.equal(slot.rfid_override_tray_uuid, null);
      assert.equal(slot.rfid_override_color_hex, null);
      assert.equal(slot.live_cache_cleared_at, null);

      const config = JSON.parse(
        updatedDb
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("bambu_live_integration:printer_1").value,
      );
      const tray = config.observed_state.trays[0];
      assert.equal(tray.match_status, "unknown_rfid");
      assert.equal(tray.matched_inventory_spool_id, null);
      assert.equal(tray.material, undefined);
      assert.equal(tray.filament_type, "ASA");
      assert.equal(tray.filament_name, "ASA");
      assert.equal(tray.color_hex, "#00A6A0");
      assert.equal(tray.last_identity_seen_at, "2026-07-01T12:00:00.000Z");
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("applyVisualQaDatabaseFixture creates a printer RFID override state on copies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-rfid-override-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE printers (id TEXT PRIMARY KEY, model TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE ams_units (id TEXT PRIMARY KEY, printer_id TEXT NOT NULL);
      CREATE TABLE ams_slots (
        id TEXT PRIMARY KEY,
        ams_id TEXT NOT NULL,
        slot_index INTEGER NOT NULL,
        spool_id TEXT,
        last_seen_at TEXT,
        rfid_override_tray_uuid TEXT,
        rfid_override_color_hex TEXT,
        live_cache_cleared_at TEXT
      );
      CREATE TABLE filament_master_list (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        hex_color TEXT,
        default_weight INTEGER NOT NULL DEFAULT 1000,
        vendor TEXT NOT NULL DEFAULT 'Bambu',
        is_discontinued INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE filament_spools (
        id TEXT PRIMARY KEY,
        master_id TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
    db.prepare("INSERT INTO printers (id, model, name) VALUES (?, ?, ?)").run(
      "printer_1",
      "Bambu Lab P1S",
      "Brutus",
    );
    db.prepare("INSERT INTO ams_units (id, printer_id) VALUES (?, ?)").run(
      "printer_1_ams_1",
      "printer_1",
    );
    db.prepare(
      `INSERT INTO ams_slots
       (id, ams_id, slot_index, spool_id, rfid_override_tray_uuid, rfid_override_color_hex, live_cache_cleared_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("printer_1_ams_1_slot_1", "printer_1_ams_1", 1, "spool_loaded", null, null, "old");
    db.prepare(
      `INSERT INTO filament_master_list
       (id, vendor, material, filament_name, color_name, hex_color, default_weight, is_discontinued)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "master_loaded",
      "Bambu",
      "PLA",
      "PLA Basic",
      "Mistletoe Green (10502)",
      "#00A6A0",
      1000,
      0,
    );
    db.prepare("INSERT INTO filament_spools (id, master_id, deleted_at) VALUES (?, ?, NULL)").run(
      "spool_loaded",
      "master_loaded",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "bambu_live_integration:printer_1",
      JSON.stringify({
        enabled: true,
        host: "192.168.1.20",
        observed_state: {
          online: true,
          last_seen_at: "2026-07-01T00:00:00Z",
          mqtt_connected: true,
          active_ams_index: 0,
          active_tray_index: 0,
          trays: [
            {
              ams_index: 0,
              tray_index: 0,
              loaded: true,
              tray_uuid: "OLD-RFID",
              filament_type: "PLA",
              filament_name: "PLA Basic",
              color_hex: "#00A6A0",
              match_status: "clear_match",
              matched_inventory_spool_id: "spool_loaded",
              matched_inventory_mode: "exact_rfid",
              last_identity_seen_at: "2026-07-01T00:00:00Z",
            },
          ],
        },
      }),
    );
    db.close();

    const fixture = await applyVisualQaDatabaseFixture(dbPath, "rfid-override", {
      now: new Date("2026-07-01T12:00:00Z"),
    });
    assert.equal(fixture?.fixture, VISUAL_QA_FIXTURE_PRINTER_RFID_OVERRIDE);
    assert.equal(fixture?.slotId, "printer_1_ams_1_slot_1");
    assert.equal(fixture?.spoolId, "spool_loaded");

    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      const slot = updatedDb
        .prepare(
          `SELECT spool_id, rfid_override_tray_uuid, rfid_override_color_hex, live_cache_cleared_at
           FROM ams_slots
           WHERE id = ?`,
        )
        .get("printer_1_ams_1_slot_1");
      assert.equal(slot.spool_id, "spool_loaded");
      assert.equal(slot.rfid_override_tray_uuid, "VISUALQA-OVERRIDE-printer_1_ams_1_slot_1");
      assert.equal(slot.rfid_override_color_hex, "#00A6A0");
      assert.equal(slot.live_cache_cleared_at, null);

      const config = JSON.parse(
        updatedDb
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("bambu_live_integration:printer_1").value,
      );
      const tray = config.observed_state.trays[0];
      assert.equal(tray.match_status, "unknown_rfid");
      assert.equal(tray.matched_inventory_spool_id, null);
      assert.equal(tray.matched_inventory_mode, null);
      assert.equal(tray.tray_uuid, slot.rfid_override_tray_uuid);
      assert.equal(tray.color_hex, slot.rfid_override_color_hex);
      assert.equal(tray.last_identity_seen_at, "2026-07-01T12:00:00.000Z");
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("applyVisualQaDatabaseFixture creates catalog missing-swatch review state on copies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-catalog-swatch-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE filament_master_list (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        hex_color TEXT,
        vendor TEXT NOT NULL DEFAULT 'Bambu',
        is_discontinued INTEGER NOT NULL DEFAULT 0,
        catalog_user_edited INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const insert = db.prepare(
      `INSERT INTO filament_master_list
       (id, vendor, material, filament_name, color_name, hex_color, is_discontinued)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("esun_red", "eSUN", "PLA", "PLA+", "Fire Engine Red", "#C1121F", 0);
    insert.run("bambu_green", "Bambu", "PLA", "PLA Basic", "Bambu Green", "#00AE42", 0);
    insert.run("already_missing", "Bambu", "PETG", "PETG Basic", "No Color", null, 0);
    insert.run("historical_blue", "eSUN", "PLA", "PLA+", "Old Blue", "#2255FF", 1);
    db.close();

    const fixture = await applyVisualQaDatabaseFixture(
      dbPath,
      "settings-catalog-swatch-review",
    );
    assert.equal(fixture?.fixture, VISUAL_QA_FIXTURE_SETTINGS_CATALOG_MISSING_SWATCHES);
    assert.equal(fixture?.count, 2);
    assert.deepEqual(fixture?.vendors, ["eSUN", "Bambu"]);

    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      const rows = updatedDb
        .prepare(
          `SELECT id, hex_color, catalog_user_edited
           FROM filament_master_list
           ORDER BY id ASC`,
        )
        .all();
      assert.deepEqual(rows, [
        { id: "already_missing", hex_color: null, catalog_user_edited: 0 },
        { id: "bambu_green", hex_color: null, catalog_user_edited: 1 },
        { id: "esun_red", hex_color: null, catalog_user_edited: 1 },
        { id: "historical_blue", hex_color: "#2255FF", catalog_user_edited: 0 },
      ]);
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("applyVisualQaDatabaseFixture creates wishlist queue review state on copies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-wishlist-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE filament_master_list (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        hex_color TEXT,
        product_url TEXT,
        default_weight INTEGER NOT NULL DEFAULT 1000,
        vendor TEXT NOT NULL DEFAULT 'Bambu',
        is_discontinued INTEGER NOT NULL DEFAULT 0,
        catalog_source TEXT NOT NULL DEFAULT 'unknown',
        catalog_user_edited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(material, filament_name, color_name)
      );
      CREATE TABLE wishlist_items (
        id TEXT PRIMARY KEY,
        master_id TEXT REFERENCES filament_master_list(id),
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        vendor TEXT NOT NULL DEFAULT 'Manual',
        status TEXT NOT NULL DEFAULT 'WISHLIST',
        quantity INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.close();

    const fixture = await applyVisualQaDatabaseFixture(dbPath, "wishlist-orders", {
      now: new Date("2026-07-09T10:00:00.000Z"),
    });
    assert.equal(fixture?.fixture, VISUAL_QA_FIXTURE_WISHLIST_QUEUE);
    assert.deepEqual(fixture?.statuses, ["WISHLIST", "ON_ORDER", "RECEIVED"]);

    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      const rows = updatedDb
        .prepare(
          `SELECT w.id, w.master_id, w.status, w.quantity, w.note, m.hex_color
           FROM wishlist_items w
           JOIN filament_master_list m ON m.id = w.master_id
           ORDER BY w.id ASC`,
        )
        .all();
      assert.deepEqual(rows, [
        {
          id: "visual_qa_wishlist_on_order",
          master_id: "visual_qa_master_wishlist_teal",
          status: "ON_ORDER",
          quantity: 3,
          note: "Visual QA fixture: arriving with the next supplier box.",
          hex_color: "#009688",
        },
        {
          id: "visual_qa_wishlist_planned",
          master_id: "visual_qa_master_wishlist_signal_red",
          status: "WISHLIST",
          quantity: 2,
          note: "Visual QA fixture: planned accent label stock.",
          hex_color: "#E32636",
        },
        {
          id: "visual_qa_wishlist_received",
          master_id: "visual_qa_master_wishlist_violet",
          status: "RECEIVED",
          quantity: 1,
          note: "Visual QA fixture: ready to move into stock.",
          hex_color: "#6D28D9",
        },
      ]);
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("applyVisualQaDatabaseFixture creates data-connected loan dialog states on copies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "visual-qa-loan-dialogs-"));
  try {
    const dbPath = join(dir, "fixture.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE filament_master_list (
        id TEXT PRIMARY KEY,
        material TEXT NOT NULL,
        filament_name TEXT NOT NULL,
        color_name TEXT NOT NULL,
        hex_color TEXT,
        default_weight INTEGER NOT NULL DEFAULT 1000,
        vendor TEXT NOT NULL DEFAULT 'Bambu'
      );
      CREATE TABLE filament_spools (
        id TEXT PRIMARY KEY,
        master_id TEXT NOT NULL REFERENCES filament_master_list(id),
        status TEXT NOT NULL,
        ownership_type TEXT NOT NULL DEFAULT 'OWNED',
        owner_name TEXT,
        owner_contact TEXT,
        ownership_note TEXT,
        initial_weight_g INTEGER,
        current_weight_g INTEGER,
        remaining_g INTEGER,
        spool_tare_weight_g INTEGER,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE spool_loans (
        id TEXT PRIMARY KEY,
        spool_id TEXT NOT NULL REFERENCES filament_spools(id),
        borrower_name TEXT NOT NULL,
        loan_direction TEXT NOT NULL DEFAULT 'OUTBOUND',
        loan_status TEXT NOT NULL DEFAULT 'ACTIVE',
        counterparty_name TEXT,
        counterparty_contact TEXT,
        counterparty_note TEXT,
        grams_out INTEGER NOT NULL,
        lent_note TEXT,
        lent_at TEXT NOT NULL DEFAULT (datetime('now')),
        returned_at TEXT,
        returned_grams INTEGER,
        consumed_grams INTEGER,
        return_note TEXT
      );
      CREATE UNIQUE INDEX idx_spool_loans_active_unique
        ON spool_loans(spool_id) WHERE returned_at IS NULL;
    `);
    db.close();

    const fixture = await applyVisualQaDatabaseFixture(dbPath, "statistics-borrower", {
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(fixture?.fixture, VISUAL_QA_FIXTURE_LOAN_DIALOGS);
    assert.equal(fixture?.inboundPartyName, "Maja Solberg");
    assert.equal(fixture?.outboundPartyName, "Nora Berg");

    const updatedDb = new Database(dbPath, { readonly: true });
    try {
      const rows = updatedDb
        .prepare(
          `SELECT l.id, l.loan_direction, l.loan_status, l.borrower_name,
                  l.grams_out, l.returned_grams, l.consumed_grams,
                  s.ownership_type, s.status AS spool_status, s.remaining_g,
                  m.color_name, m.hex_color
           FROM spool_loans l
           JOIN filament_spools s ON s.id = l.spool_id
           JOIN filament_master_list m ON m.id = s.master_id
           ORDER BY l.loan_direction ASC`,
        )
        .all();
      assert.deepEqual(rows, [
        {
          id: "visual_qa_loan_inbound_lagoon",
          loan_direction: "INBOUND",
          loan_status: "ACTIVE",
          borrower_name: "Maja Solberg",
          grams_out: 1000,
          returned_grams: null,
          consumed_grams: null,
          ownership_type: "BORROWED_IN",
          spool_status: "IN_STOCK",
          remaining_g: 742,
          color_name: "Lagoon Blue",
          hex_color: "#0081A7",
        },
        {
          id: "visual_qa_loan_outbound_coral",
          loan_direction: "OUTBOUND",
          loan_status: "RETURNED",
          borrower_name: "Nora Berg",
          grams_out: 1000,
          returned_grams: 620,
          consumed_grams: 380,
          ownership_type: "OWNED",
          spool_status: "IN_STOCK",
          remaining_g: 620,
          color_name: "Coral Signal",
          hex_color: "#F25F5C",
        },
      ]);
    } finally {
      updatedDb.close();
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
