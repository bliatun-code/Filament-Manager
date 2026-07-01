import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  APP_DB_PATH_ENV_VAR,
  VISUAL_QA_PROFILE_BASE,
  VISUAL_QA_PROFILE_RICH,
  VISUAL_QA_DB_PATH_ENV_VAR,
  assessVisualQaDataset,
  formatVisualQaDatasetReport,
  normalizeVisualQaPath,
  normalizeVisualQaProfile,
  resolveVisualQaDbSource,
  visualQaTempDbPath,
} from "./visual-qa-db.mjs";

test("normalizeVisualQaPath trims and resolves relative paths", () => {
  assert.equal(normalizeVisualQaPath(""), null);
  assert.equal(normalizeVisualQaPath("   "), null);
  assert.match(normalizeVisualQaPath("data/example.db", "/repo"), /\/repo\/data\/example\.db$/);
});

test("normalizeVisualQaProfile defaults to rich and accepts base", () => {
  assert.equal(normalizeVisualQaProfile(), VISUAL_QA_PROFILE_RICH);
  assert.equal(normalizeVisualQaProfile("base"), VISUAL_QA_PROFILE_BASE);
  assert.throws(() => normalizeVisualQaProfile("thin"), /Unknown visual QA profile/);
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
    sourcePath: "/tmp/source.db",
    targetPath: "/tmp/copy.db",
  });

  assert.match(report, /Visual QA database source: \/tmp\/source\.db/);
  assert.match(report, /Visual QA profile: base/);
  assert.match(report, /Desktop app: use the Tauri desktop window/);
  assert.match(report, /Companion: http:\/\/192\.168\.1\.50:4278\/companion/);
  assert.match(report, /filament_spools: 0/);
  assert.match(report, /expected at least 1/);
});

test("visualQaTempDbPath creates a stable temp db name", () => {
  const path = visualQaTempDbPath("/repo/data/visual-test-bambu.db", new Date("2026-07-01T00:00:00Z"));
  assert.match(path, /filament-manager-visual-qa/);
  assert.match(path, /visual-test-bambu-2026-07-01T00-00-00-000Z\.db$/);
});
