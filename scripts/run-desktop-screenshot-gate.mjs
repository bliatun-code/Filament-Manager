import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { measureScreenshotPixels } from "./screenshot-pixels.mjs";

const execFile = promisify(execFileCallback);
const DEFAULT_OUTPUT_DIR = "release-artifacts/visual-qa";
const DEFAULT_WINDOW_TITLE = "Filament Manager";

function parseArgValue(argv, name) {
  const index = argv.indexOf(name);
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

function minimumFor(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function quoteAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildDesktopWindowLookupScript(windowTitle = DEFAULT_WINDOW_TITLE) {
  const title = quoteAppleScriptString(windowTitle);
  return `
tell application "System Events"
  repeat with appProcess in (application processes whose visible is true)
    repeat with appWindow in windows of appProcess
      set windowName to name of appWindow as text
      if windowName contains "${title}" then
        set windowPosition to position of appWindow
        set windowSize to size of appWindow
        return (name of appProcess as text) & tab & windowName & tab & (item 1 of windowPosition as text) & tab & (item 2 of windowPosition as text) & tab & (item 1 of windowSize as text) & tab & (item 2 of windowSize as text)
      end if
    end repeat
  end repeat
end tell
return ""
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

export async function findDesktopWindow(options = {}) {
  const execFileFn = options.execFileFn ?? execFile;
  const windowTitle = options.windowTitle ?? DEFAULT_WINDOW_TITLE;
  const { stdout } = await execFileFn("osascript", [
    "-e",
    buildDesktopWindowLookupScript(windowTitle),
  ]);
  return parseDesktopWindowInfo(stdout);
}

async function wait(ms) {
  await new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

export async function activateDesktopWindow(windowInfo, options = {}) {
  if (!windowInfo?.processName || options.activate === false) {
    return;
  }
  const execFileFn = options.execFileFn ?? execFile;
  await execFileFn("osascript", [
    "-e",
    buildDesktopWindowActivateScript(windowInfo.processName),
  ]);
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
  await execFileFn("screencapture", ["-x", "-R", region, path]);
  return {
    buffer: await readFile(path),
    path,
    region,
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
  if (
    metric.screenshotPixels.width !== metric.window.width ||
    metric.screenshotPixels.height !== metric.window.height
  ) {
    errors.push(
      `Desktop screenshot size ${metric.screenshotPixels.width}x${metric.screenshotPixels.height} does not match window ${metric.window.width}x${metric.window.height}.`,
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
  };
}

export function formatDesktopScreenshotGateReport(result) {
  const lines = [`Desktop screenshot artifacts: ${result.outputDir}`];
  const metric = result.metric;
  if (metric.window) {
    lines.push(
      `Desktop window: ${metric.window.title} (${metric.window.processName}) ${metric.window.width}x${metric.window.height}`,
    );
  }
  if (metric.screenshotPixels) {
    lines.push(
      `Pixels: contrast ${metric.screenshotPixels.lumaStdDev.toFixed(1)}, colors ${metric.screenshotPixels.colorBuckets}, saturated ${(metric.screenshotPixels.saturatedPixelRatio * 100).toFixed(1)}%`,
      `${metric.screenshot}`,
    );
  }
  if (result.errors.length > 0) {
    lines.push("Desktop screenshot gate errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  } else {
    lines.push("Desktop screenshot gate ok.");
  }
  return lines.join("\n");
}

async function runCli() {
  const argv = process.argv.slice(2);
  const result = await runDesktopScreenshotGate({
    name: parseArgValue(argv, "--name") ?? "desktop-window",
    outputDir: parseArgValue(argv, "--output-dir") ?? DEFAULT_OUTPUT_DIR,
    windowTitle: parseArgValue(argv, "--window-title") ?? DEFAULT_WINDOW_TITLE,
    minimums: {
      colorBuckets: parseIntegerArg(argv, "--min-colors", undefined),
      edgeDeltaMean: parseIntegerArg(argv, "--min-edge", undefined),
      lumaStdDev: parseIntegerArg(argv, "--min-contrast", undefined),
      windowHeight: parseIntegerArg(argv, "--min-window-height", undefined),
      windowWidth: parseIntegerArg(argv, "--min-window-width", undefined),
    },
  });
  console.log(formatDesktopScreenshotGateReport(result));
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
