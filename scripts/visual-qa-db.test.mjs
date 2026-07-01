import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  APP_DB_PATH_ENV_VAR,
  VISUAL_QA_DB_PATH_ENV_VAR,
  assessVisualQaDataset,
  formatVisualQaDatasetReport,
  normalizeVisualQaPath,
  resolveVisualQaDbSource,
  visualQaTempDbPath,
} from "./visual-qa-db.mjs";

test("normalizeVisualQaPath trims and resolves relative paths", () => {
  assert.equal(normalizeVisualQaPath(""), null);
  assert.equal(normalizeVisualQaPath("   "), null);
  assert.match(normalizeVisualQaPath("data/example.db", "/repo"), /\/repo\/data\/example\.db$/);
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
  });

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
  });

  assert.deepEqual(assessment.errors, []);
  assert.ok(assessment.warnings.some((warning) => warning.includes("spool_loans has no rows")));
});

test("formatVisualQaDatasetReport includes counts and errors", () => {
  const report = formatVisualQaDatasetReport({
    assessment: {
      errors: ["filament_spools has 0 row(s), expected at least 1"],
      warnings: [],
    },
    inspection: {
      counts: { filament_spools: 0, printers: 2 },
      tables: ["filament_spools", "printers"],
    },
    sourcePath: "/tmp/source.db",
    targetPath: "/tmp/copy.db",
  });

  assert.match(report, /Visual QA database source: \/tmp\/source\.db/);
  assert.match(report, /filament_spools: 0/);
  assert.match(report, /expected at least 1/);
});

test("visualQaTempDbPath creates a stable temp db name", () => {
  const path = visualQaTempDbPath("/repo/data/visual-test-bambu.db", new Date("2026-07-01T00:00:00Z"));
  assert.match(path, /filament-manager-visual-qa/);
  assert.match(path, /visual-test-bambu-2026-07-01T00-00-00-000Z\.db$/);
});
