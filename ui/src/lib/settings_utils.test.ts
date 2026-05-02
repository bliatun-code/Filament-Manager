import test from "node:test";
import assert from "node:assert/strict";
import {
  clampInt,
  extractBaseUrlFromPairingInput,
  formatDiagnosticJson,
  formatSettingsDateTime,
  formatTrustedLanPairingExpiry,
  isFullBackupValidationFormat,
  parseNonNegativeInt,
  parsePositiveInt,
} from "./settings_utils";

test("settings number helpers parse and clamp expected values", () => {
  assert.equal(parsePositiveInt("4278", 1), 4278);
  assert.equal(parsePositiveInt("0", 1), 1);
  assert.equal(parsePositiveInt("nope", 7), 7);
  assert.equal(parseNonNegativeInt("0", 3), 0);
  assert.equal(parseNonNegativeInt("-1", 3), 3);
  assert.equal(clampInt(12, 1, 8), 8);
  assert.equal(clampInt(-2, 1, 8), 1);
});

test("formatSettingsDateTime treats sqlite timestamps as UTC and preserves invalid values", () => {
  assert.match(formatSettingsDateTime("2026-05-02 12:34:00", "en"), /2026/);
  assert.equal(formatSettingsDateTime("not-a-date", "nb"), "not-a-date");
});

test("formatTrustedLanPairingExpiry returns a localized time", () => {
  assert.match(formatTrustedLanPairingExpiry(Date.UTC(2026, 4, 2, 12, 34), "en"), /\d/);
  assert.match(formatTrustedLanPairingExpiry(Date.UTC(2026, 4, 2, 12, 34), "nb"), /\d/);
});

test("formatDiagnosticJson serializes values and falls back for cyclic input", () => {
  assert.equal(formatDiagnosticJson({ ok: true }), '{\n  "ok": true\n}');
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.equal(formatDiagnosticJson(cyclic), "[object Object]");
});

test("isFullBackupValidationFormat accepts supported full backup markers", () => {
  assert.equal(isFullBackupValidationFormat("FULL_BACKUP"), true);
  assert.equal(isFullBackupValidationFormat("filament-manager-backup-v1"), true);
  assert.equal(isFullBackupValidationFormat("inventory"), false);
});

test("extractBaseUrlFromPairingInput accepts only pairing URLs", () => {
  assert.equal(
    extractBaseUrlFromPairingInput("http://192.168.1.10:4278/companion?pairing=abc"),
    "http://192.168.1.10:4278",
  );
  assert.equal(extractBaseUrlFromPairingInput("http://192.168.1.10:4278/companion"), null);
  assert.equal(extractBaseUrlFromPairingInput("not a url"), null);
});
