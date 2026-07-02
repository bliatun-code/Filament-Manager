import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { measureScreenshotPixels } from "./screenshot-pixels.mjs";
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
const VISUAL_QA_SCENARIO_ENV_VAR = "FILAMENT_MANAGER_VISUAL_QA_SCENARIO";
const DESKTOP_VISUAL_QA_DATABASE_FIXTURE_SCENARIOS = new Set([
  "printer-slot-onboarding",
  "printer-rfid-override",
]);
const DESKTOP_VISUAL_QA_SCENARIOS = [
  "dashboard-overview",
  "inventory-overview",
  "add-filament",
  "bambu-batch-add",
  "loans-overview",
  "loan-out",
  "selected-roll",
  "rfid-capture",
  "return-loan",
  "printer-board",
  "printer-slot-assignment",
  "printer-slot-onboarding",
  "printer-rfid-override",
  "printer-slot-replacement",
  "printer-slot-clear",
  "settings-general",
  "settings-library",
  "settings-library-network-details",
  "settings-printer-diagnostics",
  "settings-printer-diagnostics-fields",
  "settings-printer-diagnostics-paused",
  "settings-catalog",
  "settings-maintenance",
  "statistics-overview",
];

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

export function normalizeDesktopVisualQaScenario(value) {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "":
      return null;
    case "dashboard-overview":
    case "dashboard":
      return "dashboard-overview";
    case "inventory-overview":
    case "inventory":
      return "inventory-overview";
    case "add-filament":
    case "inventory-add":
      return "add-filament";
    case "loans-overview":
    case "loans":
    case "loan-history":
      return "loans-overview";
    case "loan-out":
    case "inventory-loan":
      return "loan-out";
    case "selected-roll":
    case "detail":
    case "inventory-detail":
      return "selected-roll";
    case "rfid-capture":
    case "inventory-rfid":
      return "rfid-capture";
    case "return-loan":
    case "loan-return":
    case "return":
      return "return-loan";
    case "printer-board":
    case "printers":
      return "printer-board";
    case "printer-slot-assignment":
    case "printer-slot-dropdown":
    case "slot-assignment":
      return "printer-slot-assignment";
    case "printer-slot-onboarding":
    case "slot-onboarding":
    case "ams-onboarding":
    case "printer-ams-onboarding":
      return "printer-slot-onboarding";
    case "printer-rfid-override":
    case "rfid-override":
    case "slot-rfid-override":
    case "printer-slot-rfid-override":
      return "printer-rfid-override";
    case "printer-slot-replacement":
    case "printer-slot-swap":
    case "slot-replacement":
    case "slot-swap":
      return "printer-slot-replacement";
    case "printer-slot-clear":
    case "printer-slot-unload":
    case "slot-clear":
    case "slot-unload":
      return "printer-slot-clear";
    case "bambu-batch-add":
    case "batch-add":
    case "bambu-batch":
      return "bambu-batch-add";
    case "settings-general":
    case "general-settings":
      return "settings-general";
    case "settings-library":
    case "library-settings":
    case "companion-settings":
      return "settings-library";
    case "settings-library-network-details":
    case "library-network-details":
    case "companion-network-details":
    case "trusted-lan-details":
      return "settings-library-network-details";
    case "settings-printer-diagnostics":
    case "printer-diagnostics":
    case "bambu-live-diagnostics":
      return "settings-printer-diagnostics";
    case "settings-printer-diagnostics-fields":
    case "printer-diagnostics-fields":
    case "bambu-live-diagnostics-fields":
      return "settings-printer-diagnostics-fields";
    case "settings-printer-diagnostics-paused":
    case "printer-diagnostics-paused":
    case "bambu-live-diagnostics-paused":
      return "settings-printer-diagnostics-paused";
    case "settings-catalog":
    case "catalog-settings":
    case "filament-catalog":
      return "settings-catalog";
    case "settings-maintenance":
    case "maintenance-settings":
    case "program-maintenance":
      return "settings-maintenance";
    case "statistics-overview":
    case "statistics":
    case "usage-statistics":
    case "print-statistics":
      return "statistics-overview";
    default:
      throw new Error(
        `Unknown desktop visual QA scenario "${value}". Use dashboard-overview, inventory-overview, add-filament, loan-out, loans-overview, selected-roll, rfid-capture, return-loan, printer-board, printer-slot-assignment, printer-slot-onboarding, printer-rfid-override, printer-slot-replacement, printer-slot-clear, bambu-batch-add, settings-general, settings-library, settings-library-network-details, settings-printer-diagnostics, settings-printer-diagnostics-fields, settings-printer-diagnostics-paused, settings-catalog, settings-maintenance, or statistics-overview.`,
      );
  }
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
  const normalized = normalizeDesktopVisualQaScenario(scenario);
  return normalized != null && DESKTOP_VISUAL_QA_DATABASE_FIXTURE_SCENARIOS.has(normalized);
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
      timeoutMs: options.windowCommandTimeoutMs ?? options.desktopCommandTimeoutMs ?? 2_500,
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
      timeoutMs: options.windowCommandTimeoutMs ?? options.desktopCommandTimeoutMs ?? 2_500,
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
    if (window) {
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
      timeoutMs: options.windowCommandTimeoutMs ?? options.desktopCommandTimeoutMs ?? 2_500,
    },
  );
  await wait(options.waitAfterActivateMs ?? 350);
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
  const errors = validateDesktopScreenshotMetrics(metric, options.minimums);
  return {
    errors,
    metric,
    outputDir,
    scenario: options.scenario ?? null,
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

function spawnTauriDev(spawnFn, options, database) {
  return spawnFn("npm", ["run", "tauri", "--", "dev"], {
    cwd: options.cwd ?? process.cwd(),
    detached: true,
    env: {
      ...process.env,
      [APP_DB_PATH_ENV_VAR]: database.targetPath,
      FILAMENT_MANAGER_VISUAL_QA: "1",
      ...(options.scenario ? { [VISUAL_QA_SCENARIO_ENV_VAR]: options.scenario } : {}),
    },
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
    const window = await waitForDesktopWindow({
      ...options,
      intervalMs: options.windowPollMs ?? 500,
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
          `No Filament Manager desktop window was found after launching Tauri dev.${suffix} Visible windows: ${formatVisibleWindowSummary(visibleWindows)}.`,
        ],
        launchOutputTail: outputTail.trim(),
        metric: { visibleWindows, window: null },
        outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
        scenario: options.scenario ?? null,
      };
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
    lines.push(`Desktop visual QA scenario: ${result.scenario}`);
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
  const explicitName = parseArgValue(argv, "--name");
  const baseName = explicitName ?? (hasScenario ? "desktop-scenario" : "desktop-window");
  const baseOptions = {
    captureDelayMs: parseIntegerArg(argv, "--capture-delay-ms", hasScenario ? 3_500 : 0),
    keep: parseBooleanArg(argv, "--keep"),
    keepAppOnFail: parseBooleanArg(argv, "--keep-app-on-fail"),
    live: parseBooleanArg(argv, "--live"),
    name: baseName,
    outputDir: parseArgValue(argv, "--output-dir") ?? DEFAULT_OUTPUT_DIR,
    postTerminateDelayMs: parseIntegerArg(argv, "--post-terminate-delay-ms", 1_200),
    profile: parseArgValue(argv, "--profile") ?? undefined,
    relaunchDelayMs: parseIntegerArg(argv, "--relaunch-delay-ms", 2_000),
    desktopCommandTimeoutMs: parseIntegerArg(argv, "--desktop-command-timeout-ms", 4_000),
    screenshotCommandTimeoutMs: parseIntegerArg(argv, "--screenshot-command-timeout-ms", 8_000),
    windowCommandTimeoutMs: parseIntegerArg(argv, "--window-command-timeout-ms", 2_500),
    sourcePath: parseArgValue(argv, "--source") ?? undefined,
    startupTimeoutMs: parseIntegerArg(argv, "--startup-timeout-ms", 45_000),
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
