import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { measureScreenshotPixels } from "./screenshot-pixels.mjs";
import {
  DEFAULT_LOCALE,
  normalizeSupportedLocale,
} from "../src-tauri/companion_browser/supported_locales.js";
import { pseudoLocalizeMessageForLocale } from "../src-tauri/companion_browser/pseudo_locale.js";
import {
  APP_DB_PATH_ENV_VAR,
  cleanupVisualQaDatabase,
  formatVisualQaDatasetReport,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

const execFile = promisify(execFileCallback);
const DEFAULT_OUTPUT_DIR = "release-artifacts/visual-qa";
const DEFAULT_PROCESS_NAME = "bambu-filament-manager";
const DEFAULT_WINDOW_TITLE = "Filament Manager";
export const DEFAULT_WINDOW_COMMAND_TIMEOUT_MS = 15_000;
export const DESKTOP_PRINTER_LIVE_WAIT_MS = 30_000;
const VISUAL_QA_SCENARIO_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_SCENARIO";
const VISUAL_QA_LOCALE_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_LOCALE";
const VISUAL_QA_THEME_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_THEME";
export const DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN = 96;
export const DESKTOP_DARK_THEME_MAX_LUMA_MEAN = 128;
const DESKTOP_VISUAL_QA_SCENARIO_MANIFEST = JSON.parse(
  readFileSync(resolve("ui", "src", "lib", "desktop_visual_qa_scenarios.json"), "utf8"),
);
const DESKTOP_VISUAL_QA_SCENARIO_DEFINITIONS =
  DESKTOP_VISUAL_QA_SCENARIO_MANIFEST.scenarios ?? [];
const DESKTOP_VISUAL_QA_SCENARIOS = DESKTOP_VISUAL_QA_SCENARIO_DEFINITIONS.map(
  (scenario) => scenario.id,
);
const DESKTOP_VISUAL_QA_PAGE_TITLES = {
  en: {
    dashboard: "Dashboard",
    inventory: "Inventory",
    loans: "Loans",
    printers: "Printers",
    settings: "Settings",
    statistics: "Statistics",
  },
  nb: {
    dashboard: "Oversikt",
    inventory: "Lager",
    loans: "Utlån",
    printers: "Printere",
    settings: "Innstillinger",
    statistics: "Statistikk",
  },
  de: {
    dashboard: "Übersicht",
    inventory: "Bestand",
    loans: "Ausleihen",
    printers: "Drucker",
    settings: "Einstellungen",
    statistics: "Statistik",
  },
  fr: {
    dashboard: "Tableau de bord",
    inventory: "Stock",
    loans: "Prêts",
    printers: "Imprimantes",
    settings: "Paramètres",
    statistics: "Statistiques",
  },
  es: {
    dashboard: "Panel",
    inventory: "Inventario",
    loans: "Préstamos",
    printers: "Impresoras",
    settings: "Ajustes",
    statistics: "Estadísticas",
  },
  "en-XA": Object.fromEntries(
    Object.entries({
      dashboard: "Dashboard",
      inventory: "Inventory",
      loans: "Loans",
      printers: "Printers",
      settings: "Settings",
      statistics: "Statistics",
    }).map(([page, title]) => [page, pseudoLocalizeMessageForLocale(title, {}, "en-XA")]),
  ),
  "ar-XB": Object.fromEntries(
    Object.entries({
      dashboard: "Dashboard",
      inventory: "Inventory",
      loans: "Loans",
      printers: "Printers",
      settings: "Settings",
      statistics: "Statistics",
    }).map(([page, title]) => [page, pseudoLocalizeMessageForLocale(title, {}, "ar-XB")]),
  ),
  "zh-XB": Object.fromEntries(
    Object.entries({
      dashboard: "Dashboard",
      inventory: "Inventory",
      loans: "Loans",
      printers: "Printers",
      settings: "Settings",
      statistics: "Statistics",
    }).map(([page, title]) => [page, pseudoLocalizeMessageForLocale(title, {}, "zh-XB")]),
  ),
};

function parseArgValue(argv, name) {
  const index = argv.lastIndexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parseIntegerArg(argv, name, fallback) {
  const value = parseArgValue(argv, name);
  if (value == null) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNumberArg(argv, name, fallback) {
  const value = parseArgValue(argv, name);
  if (value == null) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanArg(argv, name) {
  return argv.includes(name);
}

export function normalizeVisualQaLocale(value) {
  return normalizeSupportedLocale(value, DEFAULT_LOCALE);
}

export function normalizeDesktopVisualQaTheme(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "light" || normalized === "dark" || normalized === "auto") {
    return normalized;
  }
  if (!normalized) {
    throw new Error('Desktop visual QA theme is required. Use "light", "dark", or "auto".');
  }
  throw new Error(
    `Unknown desktop visual QA theme "${value}". Use "light", "dark", or "auto".`,
  );
}

export function resolveDesktopVisualQaTheme(argv, { hasScenario, launch }) {
  const explicitTheme = argv.includes("--theme");
  if (!explicitTheme) {
    return hasScenario ? "dark" : null;
  }
  if (!launch) {
    throw new Error("Desktop visual QA --theme requires --launch.");
  }
  if (!hasScenario) {
    throw new Error("Desktop visual QA --theme requires --scenario.");
  }
  return normalizeDesktopVisualQaTheme(parseArgValue(argv, "--theme"));
}

export function normalizeDesktopVisualQaWindowSize(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error('Desktop visual QA window size is required. Use a value like "900x700".');
  }
  const match = normalized.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (
    !match ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      `Unknown desktop visual QA window size "${value}". Use a positive width and height like "900x700".`,
    );
  }
  return { height, width };
}

export function resolveDesktopVisualQaWindowSize(argv, { hasScenario, launch }) {
  if (!argv.includes("--window-size")) {
    return null;
  }
  if (!launch) {
    throw new Error("Desktop visual QA --window-size requires --launch.");
  }
  if (!hasScenario) {
    throw new Error("Desktop visual QA --window-size requires --scenario.");
  }
  return normalizeDesktopVisualQaWindowSize(parseArgValue(argv, "--window-size"));
}

export function normalizeDesktopVisualQaScenario(value) {
  const definition = desktopVisualQaScenarioDefinition(value);
  if (definition) {
    return definition.id;
  }
  if (String(value ?? "").trim() === "") {
    return null;
  }
  throw new Error(
    `Unknown desktop visual QA scenario "${value}". Use ${DESKTOP_VISUAL_QA_SCENARIOS.join(", ")}.`,
  );
}

export function desktopVisualQaScenarioDefinition(value) {
  const token = String(value ?? "").trim().toLowerCase();
  if (!token) {
    return null;
  }
  return (
    DESKTOP_VISUAL_QA_SCENARIO_DEFINITIONS.find(
      (scenario) => scenario.id === token || scenario.aliases?.includes(token),
    ) ?? null
  );
}

export function parseDesktopVisualQaScenarios(argv) {
  const raw = parseArgValue(argv, "--scenario");
  if (raw == null || raw.trim() === "") {
    return [null];
  }
  if (raw.trim().toLowerCase() === "all") {
    return DESKTOP_VISUAL_QA_SCENARIOS;
  }
  return [normalizeDesktopVisualQaScenario(raw)];
}

export function desktopVisualQaScenarioRequiresDatabaseFixture(scenario) {
  return Boolean(desktopVisualQaScenarioDefinition(scenario)?.requiresDatabaseFixture);
}

export function defaultDesktopVisualQaCaptureDelayMs(scenarios) {
  if (
    scenarios.some(
      (scenario) => desktopVisualQaScenarioDefinition(scenario)?.page === "printers",
    )
  ) {
    return DESKTOP_PRINTER_LIVE_WAIT_MS;
  }
  return scenarios.some(Boolean) ? 3_500 : 0;
}

export function desktopVisualQaExpectedWindowTitles(scenario, locale) {
  const definition = desktopVisualQaScenarioDefinition(scenario);
  if (!definition?.page) {
    return [];
  }
  const normalizedLocale = normalizeVisualQaLocale(locale);
  const title =
    DESKTOP_VISUAL_QA_PAGE_TITLES[normalizedLocale]?.[definition.page] ??
    DESKTOP_VISUAL_QA_PAGE_TITLES[DEFAULT_LOCALE]?.[definition.page];
  return title ? [title] : [];
}

export function desktopVisualQaWindowMatchesScenario(window, scenario, locale) {
  const expectedTitles = desktopVisualQaExpectedWindowTitles(scenario, locale);
  if (expectedTitles.length === 0) {
    return true;
  }
  return expectedTitles.includes(String(window?.title ?? ""));
}

export function desktopScreenshotNameForScenario({
  baseName,
  explicitName = false,
  scenario,
  scenarioCount,
}) {
  if (!scenario) {
    return baseName;
  }
  return scenarioCount > 1 || !explicitName ? `${baseName}-${scenario}` : baseName;
}

export function shouldRetryDesktopLaunch(result) {
  return Boolean(
    result?.errors?.some((error) =>
      String(error).includes("No Filament Manager desktop window was found after launching"),
    ),
  );
}

function minimumFor(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function quoteAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export async function execFileWithTimeout(execFileFn, command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const label = options.label ?? command;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return await execFileFn(command, args);
  }

  let timer = null;
  const timeoutGraceMs =
    options.timeoutGraceMs ?? Math.min(250, Math.max(20, Math.round(timeoutMs * 0.1)));
  try {
    return await Promise.race([
      execFileFn(command, args, { timeout: timeoutMs }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs + timeoutGraceMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function buildDesktopWindowLookupScript(windowTitle = DEFAULT_WINDOW_TITLE) {
  const options =
    typeof windowTitle === "object" && windowTitle !== null
      ? windowTitle
      : { windowTitle };
  const title = quoteAppleScriptString(options.windowTitle ?? DEFAULT_WINDOW_TITLE);
  const processName = quoteAppleScriptString(options.processName ?? DEFAULT_PROCESS_NAME);
  return `
tell application "System Events"
  repeat with appProcess in (application processes whose visible is true)
    set processName to name of appProcess as text
    repeat with appWindow in windows of appProcess
      set windowName to name of appWindow as text
      if windowName contains "${title}" or processName contains "${processName}" then
        set windowPosition to position of appWindow
        set windowSize to size of appWindow
        return processName & tab & windowName & tab & (item 1 of windowPosition as text) & tab & (item 2 of windowPosition as text) & tab & (item 1 of windowSize as text) & tab & (item 2 of windowSize as text)
      end if
    end repeat
  end repeat
end tell
return ""
`.trim();
}

export function buildDesktopWindowListScript() {
  return `
set windowRows to ""
tell application "System Events"
  repeat with appProcess in (application processes whose visible is true)
    repeat with appWindow in windows of appProcess
      set windowName to name of appWindow as text
      set windowPosition to position of appWindow
      set windowSize to size of appWindow
      set windowRows to windowRows & (name of appProcess as text) & tab & windowName & tab & (item 1 of windowPosition as text) & tab & (item 2 of windowPosition as text) & tab & (item 1 of windowSize as text) & tab & (item 2 of windowSize as text) & linefeed
    end repeat
  end repeat
end tell
return windowRows
`.trim();
}

export function buildDesktopWindowActivateScript(processName) {
  const name = quoteAppleScriptString(processName);
  return `
tell application "System Events"
  set frontmost of first application process whose name is "${name}" to true
end tell
`.trim();
}

export function buildDesktopWindowResizeScript(windowInfo, windowSize) {
  const processName = quoteAppleScriptString(windowInfo?.processName ?? "");
  const windowTitle = quoteAppleScriptString(windowInfo?.title ?? "");
  const width = Number(windowSize?.width);
  const height = Number(windowSize?.height);
  if (!processName || !windowTitle || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new Error("Desktop window resize requires a target window and an integer size.");
  }
  return `
tell application "System Events"
  tell first application process whose name is "${processName}"
    set size of first window whose name is "${windowTitle}" to {${width}, ${height}}
  end tell
end tell
`.trim();
}

export function parseDesktopWindowInfo(raw) {
  const parts = String(raw ?? "").trim().split("\t");
  if (parts.length < 6 || !parts[0] || !parts[1]) {
    return null;
  }
  const [processName, title, xRaw, yRaw, widthRaw, heightRaw] = parts;
  const x = Number.parseInt(xRaw, 10);
  const y = Number.parseInt(yRaw, 10);
  const width = Number.parseInt(widthRaw, 10);
  const height = Number.parseInt(heightRaw, 10);
  if (![x, y, width, height].every((value) => Number.isFinite(value))) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    height,
    processName,
    title,
    width,
    x,
    y,
  };
}

export function parseDesktopWindowList(raw) {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map(parseDesktopWindowInfo)
    .filter((window) => window != null);
}

export async function listDesktopWindows(options = {}) {
  const execFileFn = options.execFileFn ?? execFile;
  const { stdout } = await execFileWithTimeout(
    execFileFn,
    "osascript",
    ["-e", buildDesktopWindowListScript()],
    {
      label: "Desktop visible-window diagnostics",
      timeoutMs:
        options.windowCommandTimeoutMs ??
        options.desktopCommandTimeoutMs ??
        DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
    },
  );
  return parseDesktopWindowList(stdout);
}

export async function findDesktopWindow(options = {}) {
  const execFileFn = options.execFileFn ?? execFile;
  const windowTitle = options.windowTitle ?? DEFAULT_WINDOW_TITLE;
  const processName = options.processName ?? DEFAULT_PROCESS_NAME;
  const { stdout } = await execFileWithTimeout(
    execFileFn,
    "osascript",
    ["-e", buildDesktopWindowLookupScript({ processName, windowTitle })],
    {
      label: "Desktop window lookup",
      timeoutMs:
        options.windowCommandTimeoutMs ??
        options.desktopCommandTimeoutMs ??
        DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
    },
  );
  return parseDesktopWindowInfo(stdout);
}

async function wait(ms) {
  await new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

export async function waitForDesktopWindow(options = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = Date.now();
  const findWindowFn = options.findWindowFn ?? findDesktopWindow;

  while (Date.now() - startedAt <= timeoutMs) {
    if (options.shouldAbort?.()) {
      return null;
    }
    const window = await findWindowFn(options).catch(() => null);
    if (window && (options.isWindowReady?.(window) ?? true)) {
      return window;
    }
    await wait(intervalMs);
  }

  return null;
}

export async function activateDesktopWindow(windowInfo, options = {}) {
  if (!windowInfo?.processName || options.activate === false) {
    return;
  }
  const execFileFn = options.execFileFn ?? execFile;
  await execFileWithTimeout(
    execFileFn,
    "osascript",
    ["-e", buildDesktopWindowActivateScript(windowInfo.processName)],
    {
      label: "Desktop window activation",
      timeoutMs:
        options.windowCommandTimeoutMs ??
        options.desktopCommandTimeoutMs ??
        DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
    },
  );
  await wait(options.waitAfterActivateMs ?? 350);
}

export function desktopWindowMatchesRequestedSize(windowInfo, windowSize, tolerance = 2) {
  if (!windowInfo || !windowSize) {
    return false;
  }
  const allowedDelta = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 2;
  return (
    Math.abs(Number(windowInfo.width) - Number(windowSize.width)) <= allowedDelta &&
    Math.abs(Number(windowInfo.height) - Number(windowSize.height)) <= allowedDelta
  );
}

export async function resizeDesktopWindow(windowInfo, windowSize, options = {}) {
  if (!windowInfo || !windowSize) {
    return windowInfo;
  }
  const execFileFn = options.execFileFn ?? execFile;
  await execFileWithTimeout(
    execFileFn,
    "osascript",
    ["-e", buildDesktopWindowResizeScript(windowInfo, windowSize)],
    {
      label: "Desktop window resize",
      timeoutMs:
        options.windowCommandTimeoutMs ??
        options.desktopCommandTimeoutMs ??
        DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
    },
  );

  const findWindowFn = options.findWindowFn ?? findDesktopWindow;
  let latestWindow = windowInfo;
  const resizedWindow = await waitForDesktopWindow({
    ...options,
    findWindowFn: async (lookupOptions) => {
      const nextWindow = await findWindowFn(lookupOptions);
      if (nextWindow) {
        latestWindow = nextWindow;
      }
      return nextWindow;
    },
    intervalMs: options.resizeWindowPollMs ?? 100,
    isWindowReady: (candidate) =>
      desktopWindowMatchesRequestedSize(
        candidate,
        windowSize,
        options.windowSizeTolerance,
      ),
    timeoutMs: options.resizeWindowTimeoutMs ?? 3_000,
  });
  return resizedWindow ?? latestWindow;
}

function screenshotPath(outputDir, name = "desktop-window") {
  return resolve(outputDir, `${name}.png`);
}

export async function captureDesktopWindowScreenshot(windowInfo, options = {}) {
  const execFileFn = options.execFileFn ?? execFile;
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });
  const path = screenshotPath(outputDir, options.name);
  const region = [
    Math.max(0, windowInfo.x),
    Math.max(0, windowInfo.y),
    Math.max(1, windowInfo.width),
    Math.max(1, windowInfo.height),
  ].join(",");
  await execFileWithTimeout(execFileFn, "screencapture", ["-x", "-R", region, path], {
    label: "Desktop window screenshot capture",
    timeoutMs: options.screenshotCommandTimeoutMs ?? options.desktopCommandTimeoutMs ?? 8_000,
  });
  return {
    buffer: await readFile(path),
    path,
    region,
  };
}

export function desktopScreenshotScale(metric) {
  if (!metric?.window || !metric?.screenshotPixels) {
    return null;
  }
  const windowWidth = Number(metric.window.width);
  const windowHeight = Number(metric.window.height);
  const pixelWidth = Number(metric.screenshotPixels.width);
  const pixelHeight = Number(metric.screenshotPixels.height);
  if (![windowWidth, windowHeight, pixelWidth, pixelHeight].every(Number.isFinite)) {
    return null;
  }
  if (windowWidth <= 0 || windowHeight <= 0 || pixelWidth <= 0 || pixelHeight <= 0) {
    return null;
  }
  const x = pixelWidth / windowWidth;
  const y = pixelHeight / windowHeight;
  return {
    average: (x + y) / 2,
    delta: Math.abs(x - y),
    x,
    y,
  };
}

export function validateDesktopScreenshotMetrics(metric, minimums = {}) {
  const errors = [];
  const minWindowWidth = minimumFor(minimums.windowWidth, 700);
  const minWindowHeight = minimumFor(minimums.windowHeight, 500);
  const minColorBuckets = minimumFor(minimums.colorBuckets, 24);
  const minEdgeDeltaMean = minimumFor(minimums.edgeDeltaMean, 1.2);
  const minLumaStdDev = minimumFor(minimums.lumaStdDev, 5);
  const minSaturatedPixelRatio = minimumFor(minimums.saturatedPixelRatio, 0.006);

  if (!metric.window) {
    errors.push("No Filament Manager desktop window was found.");
    return errors;
  }
  if (metric.window.width < minWindowWidth || metric.window.height < minWindowHeight) {
    errors.push(
      `Desktop window is too small (${metric.window.width}x${metric.window.height}, expected at least ${minWindowWidth}x${minWindowHeight}).`,
    );
  }
  if (!metric.screenshotPixels) {
    errors.push("Desktop screenshot is missing pixel metrics.");
    return errors;
  }
  const screenshotScale = desktopScreenshotScale(metric);
  if (
    !screenshotScale ||
    screenshotScale.average < 0.95 ||
    screenshotScale.average > 3.1 ||
    screenshotScale.delta > 0.05
  ) {
    const scaleDetail = screenshotScale
      ? ` @${screenshotScale.average.toFixed(2)}x`
      : "";
    errors.push(
      `Desktop screenshot size ${metric.screenshotPixels.width}x${metric.screenshotPixels.height}${scaleDetail} is not a plausible capture for window ${metric.window.width}x${metric.window.height}.`,
    );
  }
  if (metric.screenshotPixels.colorBuckets < minColorBuckets) {
    errors.push(
      `Desktop screenshot has too little color diversity (${metric.screenshotPixels.colorBuckets} buckets).`,
    );
  }
  if (metric.screenshotPixels.lumaStdDev < minLumaStdDev) {
    errors.push(
      `Desktop screenshot has too little luminance contrast (${metric.screenshotPixels.lumaStdDev.toFixed(2)}).`,
    );
  }
  if (metric.screenshotPixels.edgeDeltaMean < minEdgeDeltaMean) {
    errors.push(
      `Desktop screenshot has too little rendered edge detail (${metric.screenshotPixels.edgeDeltaMean.toFixed(2)}).`,
    );
  }
  if (metric.screenshotPixels.saturatedPixelRatio < minSaturatedPixelRatio) {
    errors.push(
      `Desktop screenshot has too few saturated pixels (${metric.screenshotPixels.saturatedPixelRatio.toFixed(4)}).`,
    );
  }
  return errors;
}

export function validateDesktopScreenshotTheme(metric, themeMode) {
  if (themeMode !== "light" && themeMode !== "dark") {
    return [];
  }
  const lumaMean = Number(metric?.screenshotPixels?.lumaMean);
  if (!Number.isFinite(lumaMean)) {
    return [`Desktop ${themeMode} theme verification is missing screenshot luminance.`];
  }
  if (themeMode === "light" && lumaMean < DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN) {
    return [
      `Desktop light theme screenshot is too dark (mean luminance ${lumaMean.toFixed(1)}, expected at least ${DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN}).`,
    ];
  }
  if (themeMode === "dark" && lumaMean >= DESKTOP_DARK_THEME_MAX_LUMA_MEAN) {
    return [
      `Desktop dark theme screenshot is too light (mean luminance ${lumaMean.toFixed(1)}, expected below ${DESKTOP_DARK_THEME_MAX_LUMA_MEAN}).`,
    ];
  }
  return [];
}

export function validateDesktopWindowSize(metric, windowSize, tolerance = 2) {
  if (!windowSize || !metric?.window) {
    return [];
  }
  if (desktopWindowMatchesRequestedSize(metric.window, windowSize, tolerance)) {
    return [];
  }
  return [
    `Desktop window size ${metric.window.width}x${metric.window.height} does not match requested ${windowSize.width}x${windowSize.height}.`,
  ];
}

export async function runDesktopScreenshotGate(options = {}) {
  if (process.platform !== "darwin" && !options.allowNonDarwin) {
    throw new Error("Desktop screenshot gate currently supports macOS only.");
  }
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const window = options.window ?? (await findDesktopWindow(options));
  if (!window) {
    return {
      errors: validateDesktopScreenshotMetrics({ window: null }, options.minimums),
      metric: { window: null },
      outputDir,
      themeMode: options.themeMode ?? null,
      windowSize: options.windowSize ?? null,
    };
  }
  await activateDesktopWindow(window, options);
  const screenshot = await captureDesktopWindowScreenshot(window, {
    execFileFn: options.execFileFn,
    name: options.name,
    outputDir,
  });
  const screenshotPixels = measureScreenshotPixels(screenshot.buffer);
  const metric = {
    screenshot: screenshot.path,
    screenshotPixels,
    window,
  };
  const errors = [
    ...validateDesktopScreenshotMetrics(metric, options.minimums),
    ...validateDesktopScreenshotTheme(metric, options.themeMode),
    ...validateDesktopWindowSize(metric, options.windowSize, options.windowSizeTolerance),
  ];
  return {
    errors,
    metric,
    outputDir,
    scenario: options.scenario ?? null,
    themeMode: options.themeMode ?? null,
    windowSize: options.windowSize ?? null,
  };
}

function appendOutputTail(tail, chunk, maxLength = 8_000) {
  const next = `${tail}${chunk}`;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function formatVisibleWindowSummary(windows) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return "none";
  }
  return windows
    .slice(0, 8)
    .map((window) => `${window.processName}:${window.title} ${window.width}x${window.height}`)
    .join("; ");
}

function signalChildProcessGroup(child, signal) {
  if (!child?.pid) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Best effort cleanup for a QA helper that is already exiting.
    }
  }
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return true;
  }
  return await new Promise((resolveWait) => {
    const onExit = () => {
      clearTimeout(timer);
      resolveWait(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolveWait(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function terminateChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return;
  }
  signalChildProcessGroup(child, "SIGTERM");
  const exited = await waitForChildExit(child, 3_000);
  if (!exited) {
    signalChildProcessGroup(child, "SIGKILL");
    await waitForChildExit(child, 1_000);
  }
  if (child.stdout) {
    child.stdout.destroy();
  }
  if (child.stderr) {
    child.stderr.destroy();
  }
}

function releaseChild(child) {
  if (!child) {
    return;
  }
  child.unref?.();
  if (child.stdout) {
    child.stdout.destroy();
  }
  if (child.stderr) {
    child.stderr.destroy();
  }
}

export function buildDesktopVisualQaLaunchEnv(options, database, baseEnv = process.env) {
  return {
    ...baseEnv,
    [APP_DB_PATH_ENV_VAR]: database.targetPath,
    FILAMENT_MANAGER_VISUAL_QA: "1",
    [VISUAL_QA_LOCALE_ENV_VAR]: normalizeVisualQaLocale(options.locale),
    ...(options.scenario ? { [VISUAL_QA_SCENARIO_ENV_VAR]: options.scenario } : {}),
    ...(options.themeMode ? { [VISUAL_QA_THEME_ENV_VAR]: options.themeMode } : {}),
  };
}

function spawnTauriDev(spawnFn, options, database) {
  return spawnFn("npm", ["run", "tauri", "--", "dev"], {
    cwd: options.cwd ?? process.cwd(),
    detached: true,
    env: buildDesktopVisualQaLaunchEnv(options, database),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function runLaunchedDesktopScreenshotGate(options = {}) {
  if (process.platform !== "darwin" && !options.allowNonDarwin) {
    throw new Error("Desktop screenshot gate currently supports macOS only.");
  }

  const prepareDatabase = options.prepareVisualQaDatabase ?? prepareVisualQaDatabase;
  const cleanupDatabase = options.cleanupVisualQaDatabase ?? cleanupVisualQaDatabase;
  const spawnFn = options.spawnFn ?? spawn;
  const forceCopyForFixture = Boolean(
    options.live && desktopVisualQaScenarioRequiresDatabaseFixture(options.scenario),
  );
  const database = await prepareDatabase({
    live: Boolean(options.live) && !forceCopyForFixture,
    profile: options.profile,
    scenario: options.scenario,
    sourcePath: options.sourcePath,
  });
  if (forceCopyForFixture) {
    database.liveOverrideReason =
      "Scenario requires a temporary DB fixture, so --live was ignored for this capture.";
  }
  let outputTail = "";
  let childExit = null;
  const child = spawnTauriDev(spawnFn, options, database);
  const expectedWindowTitles = desktopVisualQaExpectedWindowTitles(
    options.scenario,
    options.locale,
  );

  child.stdout?.on("data", (chunk) => {
    outputTail = appendOutputTail(outputTail, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    outputTail = appendOutputTail(outputTail, chunk);
  });
  child.once("exit", (code, signal) => {
    childExit = { code, signal };
  });

  let keepApp = false;
  try {
    let window = await waitForDesktopWindow({
      ...options,
      intervalMs: options.windowPollMs ?? 500,
      isWindowReady:
        expectedWindowTitles.length > 0
          ? (windowInfo) =>
              desktopVisualQaWindowMatchesScenario(
                windowInfo,
                options.scenario,
                options.locale,
              )
          : options.isWindowReady,
      timeoutMs: options.startupTimeoutMs ?? 45_000,
      shouldAbort: () => childExit != null,
    });
    if (!window) {
      keepApp = Boolean(options.keepAppOnFail);
      const visibleWindows = await listDesktopWindows(options).catch(() => []);
      const suffix = childExit
        ? ` Tauri dev exited early (${childExit.signal ?? childExit.code ?? "unknown"}).`
        : "";
      return {
        database,
        errors: [
          `No Filament Manager desktop window${expectedWindowTitles.length > 0 ? ` titled ${expectedWindowTitles.join(" or ")}` : ""} was found after launching Tauri dev.${suffix} Visible windows: ${formatVisibleWindowSummary(visibleWindows)}.`,
        ],
        launchOutputTail: outputTail.trim(),
        metric: { visibleWindows, window: null },
        outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
        scenario: options.scenario ?? null,
        themeMode: options.themeMode ?? null,
        windowSize: options.windowSize ?? null,
      };
    }

    if (options.windowSize) {
      window = await resizeDesktopWindow(window, options.windowSize, options);
    }

    if (options.captureDelayMs) {
      await wait(options.captureDelayMs);
    }

    return {
      ...(await runDesktopScreenshotGate({
        ...options,
        window,
      })),
      database,
      launchOutputTail: outputTail.trim(),
      scenario: options.scenario ?? null,
    };
  } finally {
    if (keepApp) {
      releaseChild(child);
    } else {
      await terminateChild(child);
      const postTerminateDelayMs = options.postTerminateDelayMs ?? 1_200;
      if (postTerminateDelayMs > 0) {
        await wait(postTerminateDelayMs);
      }
    }
    if (!options.keep && !database.live && !keepApp) {
      cleanupDatabase(database.targetPath);
    }
  }
}

async function runDesktopScreenshotGateWithLaunchRetry(options, attempts) {
  let result = null;
  const launchAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= launchAttempts; attempt += 1) {
    result = await runLaunchedDesktopScreenshotGate(options);
    if (!shouldRetryDesktopLaunch(result) || attempt >= launchAttempts) {
      return {
        ...result,
        launchAttempts: attempt,
      };
    }
    await wait(options.relaunchDelayMs ?? 2_000);
  }
  return result;
}

export function formatDesktopScreenshotGateReport(result) {
  const lines = [];
  if (result.database) {
    lines.push(formatVisualQaDatasetReport(result.database));
    if (result.database.liveOverrideReason) {
      lines.push(result.database.liveOverrideReason);
    }
    lines.push(
      result.database.live
        ? "Desktop visual QA live DB mode: app changes affected the selected database."
        : "Desktop visual QA used a temporary DB copy. Live library was not modified.",
    );
  }
  if (result.scenario) {
    const definition = desktopVisualQaScenarioDefinition(result.scenario);
    const details = [
      definition?.page,
      definition?.settingsTab ? `settings:${definition.settingsTab.toLowerCase()}` : null,
      definition?.category,
      definition?.requiresDatabaseFixture ? "db-fixture" : null,
    ].filter(Boolean);
    lines.push(
      `Desktop visual QA scenario: ${result.scenario}${
        details.length > 0 ? ` (${details.join(", ")})` : ""
      }`,
    );
  }
  if (result.themeMode) {
    if (result.themeMode === "auto") {
      lines.push(
        "Desktop visual QA theme: auto (system-resolved; luminance assertion skipped).",
      );
    } else {
      const lumaMean = Number(result.metric?.screenshotPixels?.lumaMean);
      const expectation =
        result.themeMode === "light"
          ? `>= ${DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN}`
          : `< ${DESKTOP_DARK_THEME_MAX_LUMA_MEAN}`;
      lines.push(
        `Desktop visual QA theme: ${result.themeMode} (mean luminance ${
          Number.isFinite(lumaMean) ? lumaMean.toFixed(1) : "unavailable"
        }, expected ${expectation}).`,
      );
    }
  }
  if (result.windowSize) {
    const capturedWindow = result.metric?.window;
    lines.push(
      `Desktop visual QA window size: requested ${result.windowSize.width}x${result.windowSize.height}; captured ${
        capturedWindow ? `${capturedWindow.width}x${capturedWindow.height}` : "unavailable"
      }.`,
    );
  }
  lines.push(`Desktop screenshot artifacts: ${result.outputDir}`);
  const metric = result.metric;
  if (metric.window) {
    lines.push(
      `Desktop window: ${metric.window.title} (${metric.window.processName}) ${metric.window.width}x${metric.window.height}`,
    );
  }
  if (!metric.window && metric.visibleWindows?.length > 0) {
    lines.push("Visible desktop windows:");
    for (const window of metric.visibleWindows.slice(0, 8)) {
      lines.push(`  - ${window.processName}: ${window.title} ${window.width}x${window.height}`);
    }
  }
  if (metric.screenshotPixels) {
    const screenshotScale = desktopScreenshotScale(metric);
    const scaleDetail = screenshotScale
      ? ` @${screenshotScale.average.toFixed(1)}x`
      : "";
    lines.push(
      `Pixels: ${metric.screenshotPixels.width}x${metric.screenshotPixels.height}${scaleDetail}, contrast ${metric.screenshotPixels.lumaStdDev.toFixed(1)}, colors ${metric.screenshotPixels.colorBuckets}, saturated ${(metric.screenshotPixels.saturatedPixelRatio * 100).toFixed(1)}%`,
      `${metric.screenshot}`,
    );
  }
  if (result.errors.length > 0) {
    lines.push("Desktop screenshot gate errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
    if (result.launchOutputTail) {
      lines.push("Tauri launch output tail:");
      lines.push(result.launchOutputTail);
    }
  } else {
    lines.push("Desktop screenshot gate ok.");
  }
  return lines.join("\n");
}

async function runCli() {
  const argv = process.argv.slice(2);
  const scenarios = parseDesktopVisualQaScenarios(argv);
  const hasScenario = scenarios.some(Boolean);
  const launch = parseBooleanArg(argv, "--launch");
  const themeMode = resolveDesktopVisualQaTheme(argv, { hasScenario, launch });
  const windowSize = resolveDesktopVisualQaWindowSize(argv, { hasScenario, launch });
  const explicitName = parseArgValue(argv, "--name");
  const baseName = explicitName ?? (hasScenario ? "desktop-scenario" : "desktop-window");
  const baseOptions = {
    captureDelayMs: parseIntegerArg(
      argv,
      "--capture-delay-ms",
      defaultDesktopVisualQaCaptureDelayMs(scenarios),
    ),
    keep: parseBooleanArg(argv, "--keep"),
    keepAppOnFail: parseBooleanArg(argv, "--keep-app-on-fail"),
    live: parseBooleanArg(argv, "--live"),
    locale: normalizeVisualQaLocale(parseArgValue(argv, "--locale")),
    name: baseName,
    outputDir: parseArgValue(argv, "--output-dir") ?? DEFAULT_OUTPUT_DIR,
    postTerminateDelayMs: parseIntegerArg(argv, "--post-terminate-delay-ms", 1_200),
    profile: parseArgValue(argv, "--profile") ?? undefined,
    relaunchDelayMs: parseIntegerArg(argv, "--relaunch-delay-ms", 2_000),
    desktopCommandTimeoutMs: parseIntegerArg(argv, "--desktop-command-timeout-ms", 4_000),
    screenshotCommandTimeoutMs: parseIntegerArg(argv, "--screenshot-command-timeout-ms", 8_000),
    windowCommandTimeoutMs: parseIntegerArg(
      argv,
      "--window-command-timeout-ms",
      DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
    ),
    sourcePath: parseArgValue(argv, "--source") ?? undefined,
    startupTimeoutMs: parseIntegerArg(argv, "--startup-timeout-ms", 45_000),
    themeMode,
    windowSize,
    processName: parseArgValue(argv, "--process-name") ?? DEFAULT_PROCESS_NAME,
    windowTitle: parseArgValue(argv, "--window-title") ?? DEFAULT_WINDOW_TITLE,
    minimums: {
      colorBuckets: parseNumberArg(argv, "--min-colors", undefined),
      edgeDeltaMean: parseNumberArg(argv, "--min-edge", undefined),
      lumaStdDev: parseNumberArg(argv, "--min-contrast", undefined),
      windowHeight: parseIntegerArg(argv, "--min-window-height", undefined),
      windowWidth: parseIntegerArg(argv, "--min-window-width", undefined),
    },
  };
  const launchAttempts = parseIntegerArg(argv, "--launch-attempts", launch ? 2 : 1);
  const results = [];
  for (const scenario of scenarios) {
    const name = desktopScreenshotNameForScenario({
      baseName,
      explicitName: Boolean(explicitName),
      scenario,
      scenarioCount: scenarios.length,
    });
    const options = { ...baseOptions, name, scenario };
    const result = launch
      ? await runDesktopScreenshotGateWithLaunchRetry(options, launchAttempts)
      : await runDesktopScreenshotGate(options);
    results.push(result);
  }

  console.log(results.map(formatDesktopScreenshotGateReport).join("\n\n"));
  if (results.some((result) => result.errors.length > 0)) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
