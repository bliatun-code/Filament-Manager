import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  VISUAL_QA_BASELINE_SCHEMA_SHA256,
  VISUAL_QA_BASELINE_SCHEMA_VERSION,
  VISUAL_QA_SCHEMA_PATH,
  VISUAL_QA_SCHEMA_MIGRATION_PATH,
  VISUAL_QA_SEED_PATH,
  VISUAL_QA_SEED_SHA256,
  assertSanitizedVisualQaSeed,
  createVisualQaFixture,
  visualQaSeedSha256,
} from "./create-visual-qa-fixture.mjs";
import { applyVisualQaDatabaseFixture } from "./visual-qa-db.mjs";

test("committed visual QA seed matches its reviewed content hash", () => {
  const rawSeed = readFileSync(VISUAL_QA_SEED_PATH, "utf8");
  assert.equal(visualQaSeedSha256(rawSeed), VISUAL_QA_SEED_SHA256);
  assert.notEqual(visualQaSeedSha256(`${rawSeed}\n`), VISUAL_QA_SEED_SHA256);
  assert.equal(
    visualQaSeedSha256(readFileSync(VISUAL_QA_SCHEMA_PATH, "utf8")),
    VISUAL_QA_BASELINE_SCHEMA_SHA256,
  );
});

test("sanitized visual QA seed generates a healthy deterministic database", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-test-"));
  const outputPath = join(directory, "fixture.db");
  try {
    const result = createVisualQaFixture({ outputPath });
    assert.equal(result.outputPath, outputPath);
    assert.equal(result.schemaVersion, 2);

    const db = new Database(outputPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(db.pragma("quick_check", { simple: true }), "ok");
      assert.deepEqual(db.pragma("foreign_key_check"), []);
      assert.equal(db.pragma("user_version", { simple: true }), 2);
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM library_domain_revisions").get().count,
        6,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM filament_spools").get().count,
        result.expectedCounts.filament_spools,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM printers").get().count,
        result.expectedCounts.printers,
      );
      assert.deepEqual(
        db
          .prepare("SELECT id, name FROM inventory_locations ORDER BY id")
          .all(),
        [
          { id: "QA Dry box", name: "QA Dry box" },
          { id: "QA Shelf A", name: "QA Shelf A" },
        ],
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM filament_master_list WHERE id LIKE 'qa_%'").get()
          .count,
        result.expectedCounts.filament_master_list,
      );
      const activeLoan = db
        .prepare(
          `SELECT l.id, l.spool_id, s.status AS spool_status
           FROM spool_loans l
           JOIN filament_spools s ON s.id = l.spool_id
           WHERE l.loan_direction = 'OUTBOUND'
             AND l.loan_status = 'ACTIVE'
             AND l.returned_at IS NULL`,
        )
        .get();
      assert.deepEqual(activeLoan, {
        id: "qa_loan_active",
        spool_id: "spool_demo_100008",
        spool_status: "LOANED_OUT",
      });
      const lendableSpool = db
        .prepare(
          `SELECT s.id
           FROM filament_spools s
           WHERE s.id = 'spool_demo_100003'
             AND s.ownership_type = 'OWNED'
             AND s.status = 'IN_STOCK'
             AND NOT EXISTS (
               SELECT 1 FROM ams_slots slot WHERE slot.spool_id = s.id
             )
             AND NOT EXISTS (
               SELECT 1
               FROM spool_loans loan
               WHERE loan.spool_id = s.id
                 AND loan.loan_status = 'ACTIVE'
                 AND loan.returned_at IS NULL
             )`,
        )
        .get();
      assert.deepEqual(lendableSpool, { id: "spool_demo_100003" });
      assert.deepEqual(
        db
          .prepare(
            `SELECT event_type
             FROM spool_history_events
             WHERE spool_id = 'spool_demo_100003'
             ORDER BY created_at`,
          )
          .all(),
        [
          { event_type: "CREATED" },
          { event_type: "LOCATION_UPDATED" },
          { event_type: "WEIGHT_UPDATED" },
        ],
      );

      assert.deepEqual(
        db
          .prepare(
            `SELECT m.id, m.material, m.filament_name, m.color_name
             FROM filament_master_list m
             WHERE lower(m.vendor) LIKE '%bambu%'
               AND NOT EXISTS (
                 SELECT 1
                 FROM filament_spools s
                 WHERE s.master_id = m.id
                   AND s.deleted_at IS NULL
               )
             ORDER BY m.id`,
          )
          .all(),
        [
          {
            id: "qa_master_bambu_asa_marine_blue",
            material: "ASA",
            filament_name: "ASA",
            color_name: "Marine Blue",
          },
        ],
      );

      const liveSetting = db
        .prepare(
          "SELECT value FROM settings WHERE key = 'bambu_live_integration:qa_printer_bambu'",
        )
        .get();
      const liveConfig = JSON.parse(liveSetting.value);
      assert.equal(liveConfig.enabled, true);
      assert.equal(Object.hasOwn(liveConfig, "host"), false);
      assert.equal(Object.hasOwn(liveConfig, "access_code"), false);
      assert.equal(Object.hasOwn(liveConfig, "printer_serial"), false);
      assert.equal(liveConfig.observed_state.mqtt_connected, true);
      assert.equal(liveConfig.observed_state.last_seen_at, "2099-01-02T12:05:00Z");
      assert.equal(liveConfig.observed_state.active_ams_index, 0);
      assert.equal(liveConfig.observed_state.active_tray_index, 0);
      assert.deepEqual(liveConfig.observed_state.trays, [
        {
          ams_index: 0,
          tray_index: 0,
          loaded: true,
          filament_type: "PLA",
          filament_name: "PLA Basic",
          color_hex: "#111827",
          tray_weight_g: 1000,
          remaining_percent: 82,
          remaining_grams: 820,
          last_identity_seen_at: "2099-01-02T12:05:00Z",
        },
      ]);
    } finally {
      db.close();
    }
    if (process.platform !== "win32") {
      assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("sanitized visual QA seed can reproduce the historical baseline schema", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "filament-manager-baseline-fixture-test-"),
  );
  const outputPath = join(directory, "fixture.db");
  try {
    const result = createVisualQaFixture({
      outputPath,
      schemaVersion: VISUAL_QA_BASELINE_SCHEMA_VERSION,
    });
    assert.equal(result.schemaVersion, VISUAL_QA_BASELINE_SCHEMA_VERSION);

    const db = new Database(outputPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(db.pragma("quick_check", { simple: true }), "ok");
      assert.deepEqual(db.pragma("foreign_key_check"), []);
      assert.equal(
        db.pragma("user_version", { simple: true }),
        VISUAL_QA_BASELINE_SCHEMA_VERSION,
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'library_domain_revisions'",
          )
          .get().count,
        0,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM filament_spools").get().count,
        result.expectedCounts.filament_spools,
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("normalized visual QA database supports deterministic printer slot onboarding", async () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-onboarding-fixture-test-"));
  const outputPath = join(directory, "fixture.db");
  try {
    createVisualQaFixture({ outputPath });
    const fixture = await applyVisualQaDatabaseFixture(outputPath, "printer-slot-onboarding", {
      now: new Date("2026-07-01T12:00:00Z"),
    });

    assert.deepEqual(fixture, {
      fixture: "printer-slot-onboarding",
      printerId: "qa_printer_bambu",
      slotId: "qa_bambu_slot_1",
      masterId: "qa_master_bambu_asa_marine_blue",
      material: "ASA",
      filamentName: "ASA",
      colorName: "Marine Blue",
      hexColor: "#256D85",
      rfid: "VISUALQA-AMS1-SLOT1",
    });

    const db = new Database(outputPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        db.prepare("SELECT spool_id FROM ams_slots WHERE id = 'qa_bambu_slot_1'").get().spool_id,
        null,
      );
      const liveConfig = JSON.parse(
        db
          .prepare(
            "SELECT value FROM settings WHERE key = 'bambu_live_integration:qa_printer_bambu'",
          )
          .get().value,
      );
      assert.deepEqual(
        {
          enabled: liveConfig.enabled,
          filamentName: liveConfig.observed_state.trays[0].filament_name,
          filamentType: liveConfig.observed_state.trays[0].filament_type,
          matchStatus: liveConfig.observed_state.trays[0].match_status,
        },
        {
          enabled: true,
          filamentName: "ASA",
          filamentType: "ASA",
          matchStatus: "unknown_rfid",
        },
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA fixture generator removes incomplete output on invalid rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-invalid-"));
  const outputPath = join(directory, "fixture.db");
  const seedPath = join(directory, "invalid-seed.json");
  try {
    const seed = JSON.parse(readFileSync("test_fixtures/visual_qa_seed.json", "utf8"));
    seed.tables.filament_master_list[0].unknown_column = "invalid";
    writeFileSync(seedPath, JSON.stringify(seed));
    assert.throws(
      () => createVisualQaFixture({ outputPath, seedPath }),
      /unreviewed column\(s\): unknown_column/,
    );
    assert.throws(
      () => new Database(outputPath, { readonly: true, fileMustExist: true }),
      /(?:does not exist|unable to open database file)/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA fixture generator rejects unreviewed live-setting changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-live-setting-"));
  const outputPath = join(directory, "fixture.db");
  const seedPath = join(directory, "invalid-live-setting-seed.json");
  try {
    const seed = JSON.parse(readFileSync(VISUAL_QA_SEED_PATH, "utf8"));
    const liveSetting = seed.tables.settings.find(
      ({ key }) => key === "bambu_live_integration:qa_printer_bambu",
    );
    liveSetting.value = JSON.stringify({ enabled: false, observed_state: null });
    writeFileSync(seedPath, JSON.stringify(seed));
    assert.throws(
      () => createVisualQaFixture({ outputPath, seedPath }),
      /unreviewed setting value/,
    );
    assert.throws(
      () => new Database(outputPath, { readonly: true, fileMustExist: true }),
      /(?:does not exist|unable to open database file)/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA fixture generator refuses existing and protected output paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-output-"));
  const outputPath = join(directory, "fixture.db");
  const originalContent = "preserve this unrelated file";
  try {
    writeFileSync(outputPath, originalContent);
    assert.throws(
      () => createVisualQaFixture({ outputPath }),
      /output already exists/,
    );
    assert.equal(readFileSync(outputPath, "utf8"), originalContent);

    const result = createVisualQaFixture({ outputPath, overwrite: true });
    assert.equal(result.outputPath, outputPath);
    const db = new Database(outputPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(db.pragma("quick_check", { simple: true }), "ok");
    } finally {
      db.close();
    }

    for (const protectedPath of [
      VISUAL_QA_SEED_PATH,
      VISUAL_QA_SCHEMA_PATH,
      VISUAL_QA_SCHEMA_MIGRATION_PATH,
    ]) {
      const before = readFileSync(protectedPath, "utf8");
      assert.throws(
        () => createVisualQaFixture({ outputPath: protectedPath, overwrite: true }),
        /target must differ/,
      );
      assert.equal(readFileSync(protectedPath, "utf8"), before);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA fixture defaults resolve independently of the caller working directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-cwd-"));
  const outputPath = join(directory, "fixture.db");
  const originalCwd = process.cwd();
  try {
    process.chdir(directory);
    const result = createVisualQaFixture({ outputPath });
    assert.equal(result.seedPath, VISUAL_QA_SEED_PATH);
    assert.equal(result.outputPath, outputPath);
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA seed sanitizer rejects credentials, addresses, contacts and personal paths", () => {
  const unixPersonalPath = ["", "Users", "example", "library.db"].join("/");
  for (const value of [
    '{"access_code":"secret"}',
    '{"api_key":"secret-value"}',
    '{"passphrase":"secret-value"}',
    '{"printer_password":"secret-value"}',
    '{"serial_number":"device-123"}',
    '{"host":"192.168.1.42"}',
    '{"endpoint":"https://8.8.8.8/status"}',
    '{"host":"fd00::42"}',
    '{"host":"http://[::1]:4278"}',
    '{"adapter":"AA:BB:CC:DD:EE:FF"}',
    '{"email":"person@example.com"}',
    '{"description":"mailto:person@example.com"}',
    '{"phone":"+47 123 45 678"}',
    '{"description":"tel:+47 123 45 678"}',
    '{"key":"api_key","value":"secret-value"}',
    JSON.stringify({ path: unixPersonalPath }),
    '{"path":"C:\\\\Users\\\\example\\\\library.db"}',
  ]) {
    assert.throws(() => assertSanitizedVisualQaSeed(value), /forbidden/);
  }
  assert.doesNotThrow(() =>
    assertSanitizedVisualQaSeed('{"id":"qa_spool","label":"Synthetic QA record"}'),
  );
});

test("visual QA seed sanitizer allows only reviewed synthetic identity values", () => {
  for (const value of [
    '{"borrower_name":"Alice Example"}',
    '{"ownership_note":"Example Street 12"}',
    '{"name":"Personal printer name"}',
    '{"job_name":"Customer prototype"}',
    '{"borrower_name":"Sample maker space"}',
  ]) {
    assert.throws(() => assertSanitizedVisualQaSeed(value), /unapproved identity value/);
  }
  assert.doesNotThrow(() =>
    assertSanitizedVisualQaSeed(
      JSON.stringify({
        tables: {
          filament_spools: [
            {
              owner_name: "Sample workshop",
              ownership_note: "Synthetic QA record",
            },
          ],
          spool_loans: [{ borrower_name: "Sample maker space" }],
        },
      }),
    ),
  );
});

test("visual QA seed sanitizer inspects decoded keys, paths and nested JSON", () => {
  for (const value of [
    String.raw`{"access\u005fcode":"secret"}`,
    '{"access%5Ftoken":"secret"}',
    '{"callback":"https://fixture.invalid/?access%5Fcode=secret"}',
    String.raw`{"path":"\u002fUsers\u002fexample\u002flibrary.db"}`,
    '{"path":"%2Fhome%2Fexample%2Flibrary.db"}',
    '{"host":"fe80%3A%3A1%2525en0"}',
    '{"description":"person%40example.com"}',
    '{"contact%5Fname":"Example Person"}',
    JSON.stringify({
      payload_json: String.raw`{"printer\u005fserial":"01P00EXAMPLE"}`,
    }),
  ]) {
    assert.throws(() => assertSanitizedVisualQaSeed(value), /forbidden/);
  }

  assert.doesNotThrow(() =>
    assertSanitizedVisualQaSeed(
      JSON.stringify({
        tables: {
          spool_loans: [
            {
              borrower_name: "Sample maker space",
              created_at: "2026-05-02 12:00:00",
              payload_json: "{}",
            },
          ],
        },
      }),
    ),
  );
});

test("visual QA seed sanitizer validates the parsed root structure", () => {
  assert.throws(() => assertSanitizedVisualQaSeed("{"), /valid JSON/);
  assert.throws(() => assertSanitizedVisualQaSeed("[]"), /root must be a JSON object/);
  assert.throws(() => assertSanitizedVisualQaSeed("null"), /root must be a JSON object/);
});

test("visual QA fixture preserves the primary error while attempting close and cleanup", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-lifecycle-"));
  const outputPath = join(directory, "fixture.db");
  const primaryError = new Error("fixture insertion failed");
  const closeError = new Error("fixture close failed");
  const cleanupError = new Error("fixture cleanup failed");
  const lifecycle = [];

  try {
    assert.throws(
      () =>
        createVisualQaFixture({
          cleanupVisualQaDatabase: (path) => {
            lifecycle.push(`cleanup:${path}`);
            throw cleanupError;
          },
          openDatabase: () => ({
            close() {
              lifecycle.push("close");
              throw closeError;
            },
            pragma() {
              throw primaryError;
            },
          }),
          outputPath,
        }),
      (error) => {
        assert.equal(error instanceof AggregateError, true);
        assert.deepEqual(error.errors, [primaryError, closeError, cleanupError]);
        assert.equal(error.cause, primaryError);
        assert.match(error.message, /fixture insertion failed/);
        assert.match(error.message, /close or cleanup also failed/);
        return true;
      },
    );
    assert.deepEqual(lifecycle, ["close", `cleanup:${outputPath}`]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA fixture rethrows an unchanged primary error after successful cleanup", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-primary-"));
  const outputPath = join(directory, "fixture.db");
  const primaryError = new Error("fixture open failed");
  const cleanup = [];

  try {
    assert.throws(
      () =>
        createVisualQaFixture({
          cleanupVisualQaDatabase: (path) => cleanup.push(path),
          openDatabase: () => {
            throw primaryError;
          },
          outputPath,
        }),
      (error) => error === primaryError,
    );
    assert.deepEqual(cleanup, [outputPath]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("visual QA fixture preserves falsey thrown values while still cleaning up", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-fixture-falsey-"));
  const outputPath = join(directory, "fixture.db");
  const cleanup = [];

  try {
    assert.throws(
      () =>
        createVisualQaFixture({
          cleanupVisualQaDatabase: (path) => cleanup.push(path),
          openDatabase: () => {
            throw null;
          },
          outputPath,
        }),
      (error) => error === null,
    );
    assert.deepEqual(cleanup, [outputPath]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
