import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  VISUAL_QA_SCHEMA_PATH,
  VISUAL_QA_SCHEMA_MIGRATION_PATH,
  VISUAL_QA_SEED_PATH,
  VISUAL_QA_SEED_SHA256,
  assertSanitizedVisualQaSeed,
  createVisualQaFixture,
  visualQaSeedSha256,
} from "./create-visual-qa-fixture.mjs";

test("committed visual QA seed matches its reviewed content hash", () => {
  const rawSeed = readFileSync(VISUAL_QA_SEED_PATH, "utf8");
  assert.equal(visualQaSeedSha256(rawSeed), VISUAL_QA_SEED_SHA256);
  assert.notEqual(visualQaSeedSha256(`${rawSeed}\n`), VISUAL_QA_SEED_SHA256);
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
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM filament_master_list WHERE id LIKE 'qa_%'").get()
          .count,
        result.expectedCounts.filament_master_list,
      );
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
