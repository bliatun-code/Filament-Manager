import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertDesktopVisualQaMatrixPlatform,
  DESKTOP_VISUAL_QA_LIVE_PRINTER_ENTRY,
  DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX,
  desktopVisualQaMatrixEntries,
  desktopVisualQaMatrixEntryOptions,
  runDesktopVisualQaMatrix,
} from "./run-desktop-visual-matrix.mjs";

const sourceDatabasePath = join(tmpdir(), "desktop-visual-matrix-library.db");

test("desktop visual matrix keeps the sparse width and locale coverage", () => {
  assert.deepEqual(DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX, [
    { locale: "zh-CN", scenario: "add-filament", width: 900 },
    { locale: "de", scenario: "dashboard-onboarding", width: 900 },
    { locale: "fr", scenario: "settings-general", width: 1050 },
    { locale: "nb", scenario: "selected-roll", width: 1200 },
    { locale: "en", scenario: "statistics-overview", width: 1500 },
  ]);
});

test("desktop visual matrix keeps genuine live telemetry explicitly opt-in", () => {
  assert.deepEqual(DESKTOP_VISUAL_QA_LIVE_PRINTER_ENTRY, {
    locale: "de",
    scenario: "printer-board",
    width: 900,
  });
  assert.equal(
    desktopVisualQaMatrixEntries({ sourcePath: sourceDatabasePath }).length,
    5,
  );
  assert.deepEqual(
    desktopVisualQaMatrixEntries({
      includeLivePrinter: true,
      sourcePath: sourceDatabasePath,
    }),
    [...DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX, DESKTOP_VISUAL_QA_LIVE_PRINTER_ENTRY],
  );
  assert.throws(
    () => desktopVisualQaMatrixEntries({ includeLivePrinter: true }),
    /requires an explicit --source database copy/,
  );
});

test("desktop visual matrix is explicitly macOS-only", () => {
  assert.doesNotThrow(() => assertDesktopVisualQaMatrixPlatform("darwin"));
  assert.throws(
    () => assertDesktopVisualQaMatrixPlatform("win32"),
    /currently supports macOS only/,
  );
});

test("desktop visual matrix builds rich data-backed launch options", () => {
  assert.deepEqual(
    desktopVisualQaMatrixEntryOptions(DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX[0], {
      height: 840,
      sourcePath: sourceDatabasePath,
      themeMode: "light",
    }),
    {
      captureDelayMs: 3_500,
      keep: false,
      keepAppOnFail: false,
      locale: "zh-CN",
      name: "desktop-matrix-900-zh-CN-add-filament",
      outputDir: "release-artifacts/visual-qa/desktop-width-locale-matrix",
      postTerminateDelayMs: 1_200,
      profile: "rich",
      scenario: "add-filament",
      sourcePath: sourceDatabasePath,
      themeMode: "light",
      windowSize: { height: 840, width: 900 },
    },
  );
});

test("desktop visual matrix runs each entry in order with isolated launches", async () => {
  const calls = [];
  const results = await runDesktopVisualQaMatrix(
    {
      height: 800,
      includeLivePrinter: true,
      launchAttempts: 3,
      platform: "darwin",
      sourcePath: sourceDatabasePath,
    },
    async (options, attempts) => {
      calls.push({ attempts, options });
      return {
        appKept: false,
        errors: [],
        launchFailed: false,
        launchOwnershipUnresolved: false,
      };
    },
  );

  assert.equal(results.length, 6);
  assert.deepEqual(
    calls.map(({ options }) => [
      options.windowSize.width,
      options.locale,
      options.scenario,
    ]),
    [
      ...DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX,
      DESKTOP_VISUAL_QA_LIVE_PRINTER_ENTRY,
    ].map(({ locale, scenario, width }) => [width, locale, scenario]),
  );
  assert.ok(calls.every(({ attempts }) => attempts === 3));
  assert.ok(calls.every(({ options }) => options.windowSize.height === 800));
  assert.ok(calls.every(({ options }) => options.profile === "rich"));
  assert.ok(calls.every(({ options }) => options.sourcePath === sourceDatabasePath));
});

test("desktop visual matrix stops when launch ownership is unsafe", async () => {
  let calls = 0;
  let generatedSourcePath = null;
  const results = await runDesktopVisualQaMatrix(
    { platform: "darwin" },
    async (options) => {
      calls += 1;
      generatedSourcePath ??= options.sourcePath;
      assert.equal(options.sourcePath, generatedSourcePath);
      assert.equal(options.profile, "base");
      assert.equal(existsSync(options.sourcePath), true);
      return {
        appKept: false,
        errors: ["launch stopped"],
        launchFailed: calls === 2,
        launchOwnershipUnresolved: false,
      };
    },
  );

  assert.equal(calls, 2);
  assert.equal(results.length, 2);
  assert.equal(existsSync(generatedSourcePath), false);
});
