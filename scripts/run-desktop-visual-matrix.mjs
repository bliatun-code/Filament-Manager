import { pathToFileURL } from "node:url";

import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";

import {
  assertDesktopScreenshotPlatform,
  defaultDesktopVisualQaCaptureDelayMs,
  formatDesktopScreenshotGateReport,
  normalizeDesktopVisualQaTheme,
  runDesktopScreenshotGateWithLaunchRetry,
} from "./run-desktop-screenshot-gate.mjs";
import { cleanupVisualQaDatabase } from "./visual-qa-db.mjs";
import { CATALOG_LOCALES } from "../src-tauri/companion_browser/supported_locales.js";

const DESKTOP_VISUAL_QA_REGRESSION_ENTRIES = Object.freeze([
  Object.freeze({ height: 500, locale: "zh-CN", scenario: "add-filament", width: 900 }),
  Object.freeze({ locale: "de", scenario: "dashboard-onboarding", width: 900 }),
  Object.freeze({ locale: "fr", scenario: "settings-general", width: 1050 }),
  Object.freeze({ locale: "nb", scenario: "selected-roll", width: 1200 }),
  Object.freeze({ locale: "en", scenario: "statistics-overview", width: 1500 }),
]);

const regressionLocales = new Set(
  DESKTOP_VISUAL_QA_REGRESSION_ENTRIES.map(({ locale }) => locale),
);

export const DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX = Object.freeze([
  ...DESKTOP_VISUAL_QA_REGRESSION_ENTRIES,
  ...CATALOG_LOCALES.filter(
    ({ id, selectable }) => selectable && !regressionLocales.has(id),
  ).map(({ id }) =>
    Object.freeze({ locale: id, scenario: "settings-general", width: 1200 }),
  ),
]);

export const DESKTOP_VISUAL_QA_LIVE_PRINTER_ENTRY = Object.freeze({
  locale: "de",
  scenario: "printer-board",
  width: 900,
});

function parseArgValue(argv, name) {
  const index = argv.lastIndexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parsePositiveInteger(argv, name, fallback) {
  const raw = parseArgValue(argv, name);
  if (raw == null) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} requires a positive integer.`);
  }
  return value;
}

export function assertDesktopVisualQaMatrixPlatform(platform = process.platform) {
  assertDesktopScreenshotPlatform({ platform });
}

export function desktopVisualQaMatrixEntries(options = {}) {
  if (!options.includeLivePrinter) {
    return DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX;
  }
  if (!String(options.sourcePath ?? "").trim()) {
    throw new Error(
      "--include-live-printer requires an explicit --source database copy with a configured live printer.",
    );
  }
  return Object.freeze([
    ...DESKTOP_VISUAL_QA_WIDTH_LOCALE_MATRIX,
    DESKTOP_VISUAL_QA_LIVE_PRINTER_ENTRY,
  ]);
}

export function desktopVisualQaMatrixEntryOptions(entry, options = {}) {
  const height = options.height ?? entry.height ?? 900;
  return {
    captureDelayMs: defaultDesktopVisualQaCaptureDelayMs([entry.scenario]),
    keep: Boolean(options.keep),
    keepAppOnFail: Boolean(options.keepAppOnFail),
    locale: entry.locale,
    name: `desktop-matrix-${entry.width}-${entry.locale}-${entry.scenario}`,
    outputDir:
      options.outputDir ?? "release-artifacts/visual-qa/desktop-width-locale-matrix",
    postTerminateDelayMs: options.postTerminateDelayMs ?? 1_200,
    profile: options.profile ?? "rich",
    scenario: entry.scenario,
    sourcePath: options.sourcePath,
    themeMode: options.themeMode ?? "dark",
    windowPositionTolerance: options.windowPositionTolerance ?? 40,
    windowSize: { height, width: entry.width },
  };
}

export async function runDesktopVisualQaMatrix(
  options = {},
  runEntryFn = runDesktopScreenshotGateWithLaunchRetry,
) {
  assertDesktopVisualQaMatrixPlatform(options.platform ?? process.platform);
  const explicitSourcePath = String(options.sourcePath ?? "").trim() || null;
  const entries = desktopVisualQaMatrixEntries({
    includeLivePrinter: options.includeLivePrinter,
    sourcePath: explicitSourcePath,
  });
  const generatedFixture = explicitSourcePath ? null : createVisualQaFixture();
  const matrixOptions = {
    ...options,
    profile: options.profile ?? (generatedFixture ? "base" : "rich"),
    sourcePath: explicitSourcePath ?? generatedFixture.outputPath,
  };
  const results = [];
  let primaryError = null;
  try {
    for (const entry of entries) {
      const result = await runEntryFn(
        desktopVisualQaMatrixEntryOptions(entry, matrixOptions),
        options.launchAttempts ?? 2,
      );
      results.push(result);
      if (result.appKept || result.launchOwnershipUnresolved || result.launchFailed) {
        break;
      }
    }
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  if (generatedFixture) {
    try {
      cleanupVisualQaDatabase(generatedFixture.outputPath);
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      `${primaryError.message}\nSanitized visual matrix fixture cleanup also failed: ${cleanupError.message}`,
      { cause: primaryError },
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  return results;
}

async function runCli() {
  const argv = process.argv.slice(2);
  const options = {
    height: parsePositiveInteger(argv, "--height", undefined),
    includeLivePrinter: argv.includes("--include-live-printer"),
    keep: argv.includes("--keep"),
    keepAppOnFail: argv.includes("--keep-app-on-fail"),
    launchAttempts: parsePositiveInteger(argv, "--launch-attempts", 2),
    outputDir: parseArgValue(argv, "--output-dir") ?? undefined,
    sourcePath: parseArgValue(argv, "--source") ?? undefined,
    themeMode: normalizeDesktopVisualQaTheme(
      parseArgValue(argv, "--theme") ?? "dark",
    ),
  };
  const entries = desktopVisualQaMatrixEntries(options);
  const results = await runDesktopVisualQaMatrix(options);
  console.log(results.map(formatDesktopScreenshotGateReport).join("\n\n"));
  if (
    results.length !== entries.length ||
    results.some((result) => result.errors.length > 0)
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
