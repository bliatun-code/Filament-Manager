import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  formatCompanionVisualGateReport,
  normalizeCompanionBaseUrl,
  runCompanionVisualGate,
} from "./run-companion-visual-gate.mjs";
import {
  measureScreenshotPixels,
  summarizeScreenshotPixels,
} from "./screenshot-pixels.mjs";
import {
  DEFAULT_LOCALE,
  intlLocaleFor,
  normalizeSupportedLocale,
} from "../src-tauri/companion_browser/supported_locales.js";
import {
  APP_DB_PATH_ENV_VAR,
  cleanupVisualQaDatabase,
  formatVisualQaDatasetReport,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

export const COMPANION_SCREENSHOT_VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  wide: { width: 1440, height: 1000 },
};

const DEFAULT_OUTPUT_DIR = "release-artifacts/visual-qa";
export const COMPANION_PRINTER_LIVE_WAIT_MS = 30_000;
export const WINDOWS_PROCESS_TREE_TERMINATION_TIMEOUT_MS = 10_000;
const COMPANION_THEME_STORAGE_KEY = "bfm-companion-theme-mode";
const COMPANION_LOCALE_STORAGE_KEY = "bfm-companion-locale";
const execFileAsync = promisify(execFile);

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

function parseBooleanArg(argv, name) {
  return argv.includes(name);
}

export function normalizeCompanionScreenshotLocale(value) {
  return normalizeSupportedLocale(value, DEFAULT_LOCALE);
}

function routeUrl(baseUrl, route) {
  return new URL(route, `${baseUrl}/`).toString();
}

function screenshotPath(outputDir, scenarioName) {
  return resolve(outputDir, `companion-${scenarioName}.png`);
}

function minimumFor(value, fallback = 1) {
  return Number.isFinite(value) ? value : fallback;
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function wait(ms) {
  await new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

function appendOutputTail(tail, chunk, maxLength = 8_000) {
  const next = `${tail}${chunk}`;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function signalChildProcessGroup(
  child,
  signal,
  killProcessFn = process.kill,
) {
  if (!child?.pid) {
    return;
  }
  try {
    killProcessFn(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Best-effort cleanup for a helper process that may already be gone.
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

export async function terminateWindowsProcessTree(
  pid,
  execFileFn = execFileAsync,
  timeoutMs = WINDOWS_PROCESS_TREE_TERMINATION_TIMEOUT_MS,
) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  await execFileFn(
    "taskkill.exe",
    ["/PID", String(pid), "/T", "/F"],
    { timeout: timeoutMs, windowsHide: true },
  );
  return true;
}

function processTerminationErrorDetail(error) {
  const message = String(error?.message ?? error ?? "unknown taskkill failure");
  return error?.code ? `${error.code}: ${message}` : message;
}

async function terminateChild(child, options = {}) {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return;
  }
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    let taskkillError = null;
    try {
      const terminated = await terminateWindowsProcessTree(
        child.pid,
        options.taskkillExecFileFn,
        options.taskkillTimeoutMs,
      );
      if (terminated) {
        child.stdout?.destroy();
        child.stderr?.destroy();
        return;
      }
      taskkillError = new Error("taskkill did not receive a valid child process id");
    } catch (error) {
      taskkillError = error;
    }

    // Stopping the wrapper is still useful, but it cannot prove that all Windows
    // descendants exited after taskkill failed. Keep the QA database in that case.
    signalChildProcessGroup(child, "SIGTERM", options.killProcessFn);
    const exited = await waitForChildExit(child, 3_000);
    if (!exited) {
      signalChildProcessGroup(child, "SIGKILL", options.killProcessFn);
      await waitForChildExit(child, 1_000);
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    throw new Error(
      `Windows process-tree termination could not be confirmed after taskkill failed: ${processTerminationErrorDetail(taskkillError)}`,
      { cause: taskkillError },
    );
  }
  signalChildProcessGroup(child, "SIGTERM", options.killProcessFn);
  const exited = await waitForChildExit(child, 3_000);
  if (!exited) {
    signalChildProcessGroup(child, "SIGKILL", options.killProcessFn);
    await waitForChildExit(child, 1_000);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function releaseChild(child) {
  if (!child) {
    return;
  }
  child.unref?.();
  child.stdout?.destroy();
  child.stderr?.destroy();
}

export function resolveCompanionScreenshotTauriLaunch({
  args = ["dev"],
  executable = process.execPath,
} = {}) {
  return {
    args: [fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)), ...args],
    command: executable,
    shell: false,
  };
}

function spawnTauriDev(spawnFn, options, database) {
  const launch = resolveCompanionScreenshotTauriLaunch();
  return spawnFn(launch.command, launch.args, {
    cwd: options.cwd ?? process.cwd(),
    detached: true,
    env: {
      ...process.env,
      [APP_DB_PATH_ENV_VAR]: database.targetPath,
      FILAMENT_MANAGER_VISUAL_QA: "1",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function probeCompanionHealth(baseUrl, timeoutMs) {
  const response = await fetch(routeUrl(baseUrl, "/api/v1/health"), {
    headers: { accept: "application/json" },
    signal: createTimeoutSignal(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`/api/v1/health returned HTTP ${response.status}`);
  }
  return true;
}

export async function waitForCompanionServer(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 500;
  const probeTimeoutMs = options.probeTimeoutMs ?? Math.min(2_000, Math.max(500, intervalMs));
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt <= timeoutMs) {
    if (options.shouldAbort?.()) {
      return { lastError, ready: false };
    }
    try {
      await probeCompanionHealth(baseUrl, probeTimeoutMs);
      return { lastError: null, ready: true };
    } catch (error) {
      lastError = error;
      await wait(intervalMs);
    }
  }

  return { lastError, ready: false };
}

export function summarizeCompanionScreenshotPixels(image, sampleBoxes = []) {
  return summarizeScreenshotPixels(image, sampleBoxes);
}

export function measureCompanionScreenshotPixels(buffer, sampleBoxes = []) {
  return measureScreenshotPixels(buffer, sampleBoxes);
}

export function validateCompanionScreenshotMetrics(metrics, minimums = {}) {
  const errors = [];
  const minRows = minimumFor(minimums.rows);
  const minSwatches = minimumFor(minimums.swatches);
  const minLoanCards = minimumFor(minimums.loanCards);
  const minSlotCards = minimumFor(minimums.slotCards);
  const minSettingsCards = minimumFor(minimums.settingsCards);
  const minColorBuckets = minimumFor(minimums.colorBuckets, 24);
  const minEdgeDeltaMean = minimumFor(minimums.edgeDeltaMean, 1.2);
  const minLumaStdDev = minimumFor(minimums.lumaStdDev, 5);
  const minVisibleSwatchPixels = minimumFor(minimums.visibleSwatchPixels, 1);
  const maxContentOverlayViewportRatio = Number.isFinite(Number(minimums.maxContentOverlayViewportRatio))
    ? Number(minimums.maxContentOverlayViewportRatio)
    : 0.9;

  for (const entry of metrics) {
    const prefix = entry.name || "scenario";
    if (entry.pairingScreen) {
      errors.push(`${prefix} rendered the trusted-LAN pairing screen`);
    }
    if (!entry.appChildren) {
      errors.push(`${prefix} rendered a blank app root`);
    }
    if (entry.horizontalOverflow) {
      errors.push(
        `${prefix} has horizontal overflow (${entry.document.scrollWidth}px > ${entry.document.clientWidth}px)`,
      );
    }
    if (entry.outsideElements.length > 0) {
      const samples = entry.outsideElements
        .slice(0, 3)
        .map(({ className, left, right, text }) =>
          `${className || "unknown"} (${left}..${right}): ${text || "<no text>"}`,
        )
        .join("; ");
      errors.push(
        `${prefix} has ${entry.outsideElements.length} visible element(s) outside viewport: ${samples}`,
      );
    }
    if (entry.textOverflow.length > 0) {
      const samples = entry.textOverflow
        .slice(0, 3)
        .map(({ className, text }) => `${className || "unknown"}: ${text || "<no text>"}`)
        .join("; ");
      errors.push(
        `${prefix} has ${entry.textOverflow.length} obvious text overflow candidate(s): ${samples}`,
      );
    }
    if (entry.accessibility?.focusableCount < 1) {
      errors.push(`${prefix} has no visible keyboard-focusable controls`);
    }
    if (entry.accessibility?.unnamedFocusableCount > 0) {
      errors.push(
        `${prefix} has ${entry.accessibility.unnamedFocusableCount} unnamed keyboard-focusable control(s)`,
      );
    }
    if (entry.keyboard?.uniqueTargets < Math.min(2, entry.accessibility?.focusableCount ?? 0)) {
      errors.push(`${prefix} keyboard traversal did not reach at least two distinct controls`);
    }
    if (entry.keyboard?.unnamedTargets > 0) {
      errors.push(`${prefix} keyboard traversal reached ${entry.keyboard.unnamedTargets} unnamed control(s)`);
    }
    if (entry.keyboard?.outsideViewportTargets > 0) {
      errors.push(
        `${prefix} keyboard traversal reached ${entry.keyboard.outsideViewportTargets} control(s) outside the viewport: ${(entry.keyboard.outsideViewportTargetNames ?? []).join(", ")}`,
      );
    }
    if (entry.expectations?.inventory && entry.counts.listRows < minRows) {
      errors.push(`${prefix} expected inventory rows, found ${entry.counts.listRows}`);
    }
    if (entry.expectations?.swatches && entry.counts.swatchSurfaces < minSwatches) {
      errors.push(`${prefix} expected swatch surfaces, found ${entry.counts.swatchSurfaces}`);
    }
    if (entry.expectations?.sheet && entry.counts.taskSheets < 1) {
      errors.push(`${prefix} expected an open task sheet`);
    }
    if (entry.expectations?.outgoingLoanCalculation && entry.counts.outgoingLoanCalculations < 1) {
      errors.push(`${prefix} expected an outgoing loan weight calculation`);
    }
    if (entry.expectations?.detail && entry.counts.detailModals < 1) {
      errors.push(`${prefix} expected an open detail modal`);
    }
    if (entry.expectations?.loans && entry.counts.loanCards < minLoanCards) {
      errors.push(`${prefix} expected loan cards, found ${entry.counts.loanCards}`);
    }
    if (entry.expectations?.printers && entry.counts.slotCards < minSlotCards) {
      errors.push(`${prefix} expected printer slot cards, found ${entry.counts.slotCards}`);
    }
    if (entry.expectations?.stablePrinterActions && entry.counts.swatchedPrinterActions > 0) {
      errors.push(`${prefix} found ${entry.counts.swatchedPrinterActions} filament-colored printer action(s)`);
    }
    if (entry.expectations?.emptySlotsWithoutSwatches && entry.counts.emptySlotSwatchDots > 0) {
      errors.push(`${prefix} found ${entry.counts.emptySlotSwatchDots} swatch dot(s) on empty printer slots`);
    }
    if (entry.expectations?.settings && entry.counts.settingsCards < minSettingsCards) {
      errors.push(`${prefix} expected settings cards, found ${entry.counts.settingsCards}`);
    }
    if (entry.expectations?.enabledLoanReturnSubmit) {
      if (!entry.loanReturnSubmit?.present) {
        errors.push(`${prefix} expected a loan return submit button`);
      } else if (entry.loanReturnSubmit.disabled) {
        errors.push(`${prefix} loan return submit button is disabled`);
      }
    }
    if (entry.expectations?.contentSizedOverlay) {
      if (!Number.isFinite(entry.contentOverlay?.height)) {
        errors.push(`${prefix} expected a measurable compact overlay`);
      } else if (entry.contentOverlay.height > entry.viewport.height * maxContentOverlayViewportRatio) {
        errors.push(
          `${prefix} compact overlay fills too much of the viewport (${entry.contentOverlay.height}px of ${entry.viewport.height}px)`,
        );
      }
    }
    if (!entry.screenshotPixels) {
      errors.push(`${prefix} is missing screenshot pixel metrics`);
    } else {
      if (entry.screenshotPixels.width !== entry.viewport.width || entry.screenshotPixels.height !== entry.viewport.height) {
        errors.push(
          `${prefix} screenshot size ${entry.screenshotPixels.width}x${entry.screenshotPixels.height} does not match viewport ${entry.viewport.width}x${entry.viewport.height}`,
        );
      }
      if (entry.screenshotPixels.colorBuckets < minColorBuckets) {
        errors.push(`${prefix} screenshot has too little color diversity (${entry.screenshotPixels.colorBuckets} buckets)`);
      }
      if (entry.screenshotPixels.lumaStdDev < minLumaStdDev) {
        errors.push(`${prefix} screenshot has too little luminance contrast (${entry.screenshotPixels.lumaStdDev.toFixed(2)})`);
      }
      if (entry.screenshotPixels.edgeDeltaMean < minEdgeDeltaMean) {
        errors.push(`${prefix} screenshot has too little rendered edge detail (${entry.screenshotPixels.edgeDeltaMean.toFixed(2)})`);
      }
      if (
        entry.expectations?.swatches &&
        entry.screenshotPixels.swatchSamples.total > 0 &&
        entry.screenshotPixels.swatchSamples.visible < minVisibleSwatchPixels
      ) {
        errors.push(
          `${prefix} screenshot did not render visible swatch pixels (${entry.screenshotPixels.swatchSamples.visible}/${entry.screenshotPixels.swatchSamples.total})`,
        );
      }
    }
  }

  return errors;
}

export function formatCompanionScreenshotGateReport(result) {
  const lines = [
    `Companion screenshot gate target: ${result.baseUrl}/companion`,
    `Companion screenshot artifacts: ${result.outputDir}`,
    "Companion screenshot scenarios:",
  ];
  for (const metric of result.metrics) {
    lines.push(
      `  - ${metric.name}: ${metric.viewport.width}x${metric.viewport.height}, rows ${metric.counts.listRows}, swatches ${metric.counts.swatchSurfaces}, loans ${metric.counts.loanCards}, slots ${metric.counts.slotCards}`,
      `    settings ${metric.counts.settingsCards}`,
      `    keyboard ${metric.keyboard.uniqueTargets} targets, unnamed ${metric.accessibility.unnamedFocusableCount}`,
      `    pixels: contrast ${metric.screenshotPixels.lumaStdDev.toFixed(1)}, colors ${metric.screenshotPixels.colorBuckets}, swatch pixels ${metric.screenshotPixels.swatchSamples.visible}/${metric.screenshotPixels.swatchSamples.total}`,
      `    ${metric.screenshot}`,
    );
  }
  if (result.errors.length > 0) {
    lines.push("Companion screenshot gate errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  } else {
    lines.push("Companion screenshot gate ok.");
  }
  return lines.join("\n");
}

async function waitForCompanionReady(page, timeoutMs) {
  await page.waitForSelector("#app", { timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const bodyText = document.body?.innerText ?? "";
      if (bodyText.includes("Trusted-LAN browser companion")) {
        return false;
      }
      return Boolean(
        document.querySelector(".list-row, .loan-card, .slot-card, .task-sheet, .detail-modal"),
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function bootstrapCompanionSession(page, baseUrl, timeoutMs) {
  const response = await page.goto(routeUrl(baseUrl, "/api/v1/qa/session"), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  if (!response?.ok()) {
    throw new Error(`/api/v1/qa/session returned HTTP ${response?.status() ?? "unknown"}`);
  }
}

async function readPageMetrics(page, scenario) {
  const scenarioSummary = {
    expectations: scenario.expectations,
    name: scenario.name,
  };
  return page.evaluate((scenario) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };

    const outsideElements = [];
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      if (!visible(element)) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.right > window.innerWidth + 2 || rect.left < -2) {
        outsideElements.push({
          className: String(element.className || "").slice(0, 90),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
          width: Math.round(rect.width),
        });
      }
      if (outsideElements.length >= 12) {
        break;
      }
    }

    const textOverflow = [];
    for (const element of Array.from(
      document.querySelectorAll(
        "button, input, textarea, .list-row, .loan-card, .slot-card, .task-sheet, .detail-modal",
      ),
    )) {
      if (!visible(element)) {
        continue;
      }
      if (element.scrollWidth > element.clientWidth + 8) {
        textOverflow.push({
          className: String(element.className || "").slice(0, 90),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || element.getAttribute("placeholder") || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 90),
        });
      }
      if (textOverflow.length >= 12) {
        break;
      }
    }

    const bodyText = document.body?.innerText ?? "";
    const focusableElements = Array.from(
      document.querySelectorAll(
        'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => visible(element) && !element.matches(":disabled"));
    const accessibleName = (element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledByText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
        : "";
      const labelsText = Array.from(element.labels ?? [])
        .map((label) => label.textContent ?? "")
        .join(" ");
      return (
        element.getAttribute("aria-label") ||
        labelledByText ||
        labelsText ||
        element.textContent ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("value") ||
        ""
      ).trim();
    };
    const loanReturnSubmit = document.querySelector(
      '.loan-return-task-sheet button[type="submit"], .loan-return-task-sheet input[type="submit"]',
    );
    const contentOverlayElement = scenario.expectations?.detail
      ? document.querySelector(".detail-modal-shell")
      : scenario.expectations?.sheet
        ? document.querySelector(".task-sheet-shell:not(.task-sheet-shell-wide)")
        : null;
    const contentOverlayRect = contentOverlayElement?.getBoundingClientRect?.() ?? null;
    return {
      appChildren: document.querySelector("#app")?.children.length ?? 0,
      accessibility: {
        focusableCount: focusableElements.length,
        unnamedFocusableCount: focusableElements.filter(
          (element) => !accessibleName(element),
        ).length,
      },
      bodySample: bodyText.slice(0, 360),
      counts: {
        detailModals: document.querySelectorAll(".detail-modal").length,
        emptySlotSwatchDots: document.querySelectorAll(".slot-card-empty .swatch-dot").length,
        listRows: document.querySelectorAll(".list-row").length,
        loanCards: document.querySelectorAll(".loan-card").length,
        outgoingLoanCalculations: document.querySelectorAll("#loan-outgoing-calculation").length,
        phoneNavButtons: document.querySelectorAll(".phone-nav-button").length,
        settingsCards: document.querySelectorAll(".settings-card").length,
        slotCards: document.querySelectorAll(".slot-card").length,
        swatchSurfaces: document.querySelectorAll(".swatch-surface").length,
        swatchedPrinterActions: document.querySelectorAll(
          ".slot-card .slot-button-primary.swatch-action-button",
        ).length,
        taskSheets: document.querySelectorAll(".task-sheet").length,
      },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      },
      expectations: scenario.expectations,
      contentOverlay: {
        height: contentOverlayRect ? Math.round(contentOverlayRect.height) : null,
      },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      loanReturnSubmit: {
        disabled: loanReturnSubmit
          ? loanReturnSubmit.matches(":disabled") || loanReturnSubmit.getAttribute("aria-disabled") === "true"
          : null,
        present: Boolean(loanReturnSubmit),
      },
      name: scenario.name,
      outsideElements,
      pairingScreen: bodyText.includes("Trusted-LAN browser companion"),
      swatchSamples: Array.from(document.querySelectorAll(".swatch-surface"))
        .filter((element) => {
          if (!visible(element)) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          return (
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.top < window.innerHeight
          );
        })
        .slice(0, 80)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
          };
        }),
      textOverflow,
      title: document.title,
      url: location.href,
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    };
  }, scenarioSummary);
}

export async function auditCompanionKeyboardNavigation(page, steps = 8) {
  await page.evaluate(() => document.activeElement?.blur?.());
  const visits = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    const visit = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledByText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
        : "";
      const labelsText = Array.from(element.labels ?? [])
        .map((label) => label.textContent ?? "")
        .join(" ");
      const name = (
        element.getAttribute("aria-label") ||
        labelledByText ||
        labelsText ||
        element.textContent ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("value") ||
        ""
      ).trim();
      return {
        name,
        outsideViewport:
          rect.bottom < 0 ||
          rect.right < 0 ||
          rect.left > window.innerWidth ||
          rect.top > window.innerHeight,
        target:
          element.id ||
          element.getAttribute("data-action") ||
          element.getAttribute("name") ||
          `${element.tagName.toLowerCase()}:${String(element.className || "").slice(0, 80)}`,
      };
    });
    if (visit) {
      visits.push(visit);
    }
  }
  return {
    outsideViewportTargets: visits.filter(({ outsideViewport }) => outsideViewport).length,
    outsideViewportTargetNames: visits
      .filter(({ outsideViewport }) => outsideViewport)
      .map(({ name, target }) => name || target),
    uniqueTargets: new Set(visits.map(({ target }) => target)).size,
    unnamedTargets: visits.filter(({ name }) => !name).length,
    visits: visits.length,
  };
}

async function chooseFirstNonBambuOption(locator) {
  const count = await locator.count();
  let fallback = null;
  for (let index = 0; index < count; index += 1) {
    const option = locator.nth(index);
    const text = await option.innerText().catch(() => "");
    if (/\bBambu\b/i.test(text)) {
      continue;
    }
    fallback ??= option;
    if (!/\b(black|white|gray|grey|silver|transparent|clear|natural)\b/i.test(text)) {
      return option;
    }
  }
  return fallback ?? (count > 0 ? locator.first() : null);
}

async function prepareAddSpoolScenario(page, timeoutMs) {
  await page.locator('[data-action="toggle-add-spool-form"]').click({ timeout: timeoutMs });
  await page.waitForSelector(".task-sheet.add-filament-sheet", { timeout: timeoutMs });
  await page
    .locator('[data-action="set-filament-source"][data-filament-source="esun"]')
    .click({ timeout: timeoutMs });
  await page.waitForSelector(
    '[data-action="set-filament-source"][data-filament-source="esun"][data-active="true"]',
    { timeout: timeoutMs },
  );
  await page.locator('input[name="filament-catalog-search"]').fill("Dark Blue");
  await page.waitForTimeout(150);
}

async function prepareLendSpoolScenario(page, timeoutMs) {
  await page.locator('[data-root-flow="loans"]').click({ timeout: timeoutMs });
  await page.locator('[data-action="start-loan-picker"]').click({ timeout: timeoutMs });
  await page.waitForSelector(".task-sheet", { timeout: timeoutMs });
  const option = await chooseFirstNonBambuOption(page.locator(".loan-picker-option"));
  if (option) {
    await option.click({ timeout: timeoutMs });
    await page.waitForSelector(".loan-create-card", { timeout: timeoutMs });
  }
}

async function prepareReturnLoanScenario(page, timeoutMs) {
  await page.locator('[data-root-flow="loans"]').click({ timeout: timeoutMs });
  await page.waitForSelector(".loan-card", { timeout: timeoutMs });
  await page.locator('[data-action="toggle-loan-return"]').first().click({ timeout: timeoutMs });
  await page.waitForSelector(".loan-return-task-sheet", { timeout: timeoutMs });
}

async function prepareDetailScenario(page, timeoutMs) {
  await page.locator('[data-action="select-spool"]').first().click({ timeout: timeoutMs });
  await page.waitForSelector(".detail-modal", { timeout: timeoutMs });
}

async function preparePrintersScenario(page, timeoutMs) {
  await page.locator('[data-root-flow="printers"]').click({ timeout: timeoutMs });
  await page.waitForSelector(".slot-card", { timeout: timeoutMs });
  await waitForCompanionPrinterLiveData(page);
}

export async function waitForCompanionPrinterLiveData(
  page,
  timeoutMs = COMPANION_PRINTER_LIVE_WAIT_MS,
) {
  try {
    await page.waitForSelector(".printer-live-dot, .printer-live-strip", {
      state: "visible",
      timeout: timeoutMs,
    });
    return true;
  } catch {
    return false;
  }
}

async function prepareSettingsScenario(page, timeoutMs) {
  await page.locator('[data-root-flow="settings"]').click({ timeout: timeoutMs });
  await page.waitForSelector(".settings-card", { timeout: timeoutMs });
}

async function runScenario(browser, baseUrl, scenario, outputDir, timeoutMs, options = {}) {
  const locale = normalizeCompanionScreenshotLocale(options.locale);
  const context = await browser.newContext({
    colorScheme: options.themeMode === "dark" ? "dark" : undefined,
    locale: intlLocaleFor(locale),
    viewport: scenario.viewport,
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error?.message ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  try {
    await page.addInitScript(
      ({ localeKey, localeValue, themeKey, themeValue }) => {
        window.localStorage?.setItem(localeKey, localeValue);
        if (themeValue) {
          window.localStorage?.setItem(themeKey, themeValue);
        }
      },
      {
        localeKey: COMPANION_LOCALE_STORAGE_KEY,
        localeValue: locale,
        themeKey: COMPANION_THEME_STORAGE_KEY,
        themeValue: options.themeMode ?? "",
      },
    );
    await bootstrapCompanionSession(page, baseUrl, timeoutMs);
    await page.goto(routeUrl(baseUrl, "/companion"), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await waitForCompanionReady(page, timeoutMs);
    await scenario.prepare?.(page, timeoutMs);
    await page.waitForTimeout(250);
    const metrics = await readPageMetrics(page, scenario);
    const path = screenshotPath(outputDir, scenario.name);
    const screenshotBuffer = await page.screenshot({ path, fullPage: false });
    const keyboard = await auditCompanionKeyboardNavigation(page);
    return {
      ...metrics,
      keyboard,
      screenshot: path,
      screenshotPixels: measureCompanionScreenshotPixels(screenshotBuffer, metrics.swatchSamples),
    };
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      appChildren: document.querySelector("#app")?.childElementCount ?? 0,
      readySurfaces: document.querySelectorAll(
        ".list-row, .loan-card, .slot-card, .task-sheet, .detail-modal",
      ).length,
      url: window.location.href,
    })).catch(() => null);
    const detail = diagnostic
      ? ` ${JSON.stringify({ ...diagnostic, runtimeErrors: runtimeErrors.slice(-5) })}`
      : "";
    throw new Error(`[${scenario.name}] ${error.message}${detail}`);
  } finally {
    await context.close();
  }
}

function viewportScenario(viewportName, suffix, expectations, prepare = null) {
  return {
    name: `${viewportName}-${suffix}`,
    viewport: COMPANION_SCREENSHOT_VIEWPORTS[viewportName],
    expectations,
    ...(prepare ? { prepare } : {}),
  };
}

function buildCompanionTaskScenarios(viewportName) {
  const contentSizedOverlay = viewportName === "phone" ? {} : { contentSizedOverlay: true };
  return [
    viewportScenario(
      viewportName,
      "add-spool",
      { inventory: true, sheet: true, swatches: true },
      prepareAddSpoolScenario,
    ),
    viewportScenario(
      viewportName,
      "lend-spool",
      {
        ...contentSizedOverlay,
        outgoingLoanCalculation: true,
        sheet: true,
        swatches: true,
      },
      prepareLendSpoolScenario,
    ),
    viewportScenario(
      viewportName,
      "return-loan",
      { ...contentSizedOverlay, enabledLoanReturnSubmit: true, loans: true, sheet: true },
      prepareReturnLoanScenario,
    ),
    viewportScenario(
      viewportName,
      "detail",
      { ...contentSizedOverlay, detail: true, swatches: true },
      prepareDetailScenario,
    ),
    viewportScenario(
      viewportName,
      "printers",
      {
        emptySlotsWithoutSwatches: true,
        printers: true,
        stablePrinterActions: true,
        swatches: true,
      },
      preparePrintersScenario,
    ),
    viewportScenario(
      viewportName,
      "settings",
      { settings: true },
      prepareSettingsScenario,
    ),
  ];
}

export function buildCompanionScreenshotScenarios() {
  return [
    {
      name: "wide-inventory",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.wide,
      expectations: { inventory: true, swatches: true },
    },
    ...buildCompanionTaskScenarios("wide"),
    {
      name: "tablet-inventory",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.tablet,
      expectations: { inventory: true, swatches: true },
    },
    ...buildCompanionTaskScenarios("tablet"),
    {
      name: "phone-inventory",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { inventory: true, swatches: true },
    },
    ...buildCompanionTaskScenarios("phone"),
  ];
}

export async function runCompanionScreenshotGate(options = {}) {
  const baseUrl = normalizeCompanionBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("Companion screenshot gate needs a companion base URL.");
  }

  const timeoutMs = options.timeoutMs ?? 8_000;
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const themeMode = options.themeMode ?? "dark";
  const locale = normalizeCompanionScreenshotLocale(options.locale);
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: options.headless !== false });
  try {
    const scenarios = options.scenarios ?? buildCompanionScreenshotScenarios();
    const metrics = [];
    for (const scenario of scenarios) {
      metrics.push(
        await runScenario(browser, baseUrl, scenario, outputDir, timeoutMs, { locale, themeMode }),
      );
    }
    const errors = validateCompanionScreenshotMetrics(metrics, options.minimums ?? {});
    return {
      baseUrl,
      errors,
      metrics,
      outputDir,
    };
  } finally {
    await browser.close();
  }
}

export function companionScreenshotGateNeedsLaunch(error) {
  const message = String(error?.message ?? error ?? "");
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    message.includes("The operation was aborted") ||
    message.includes("timed out")
  );
}

export async function runLaunchedCompanionScreenshotGate(options = {}) {
  const prepareDatabase = options.prepareVisualQaDatabase ?? prepareVisualQaDatabase;
  const cleanupDatabase = options.cleanupVisualQaDatabase ?? cleanupVisualQaDatabase;
  const spawnFn = options.spawnFn ?? spawn;
  const waitForServerFn = options.waitForCompanionServer ?? waitForCompanionServer;
  const visualGateFn = options.runCompanionVisualGate ?? runCompanionVisualGate;
  const screenshotGateFn = options.runCompanionScreenshotGate ?? runCompanionScreenshotGate;
  const database = await prepareDatabase({
    live: Boolean(options.live),
    profile: options.profile,
    sourcePath: options.sourcePath,
  });
  const baseUrl = normalizeCompanionBaseUrl(
    options.baseUrl || database.inspection.details?.trustedLanCompanionUrl,
  );
  if (!baseUrl) {
    if (!options.keep && !database.live) {
      cleanupDatabase(database.targetPath);
    }
    throw new Error("Companion screenshot launch needs a companion base URL from --url or trusted-LAN settings.");
  }

  let outputTail = "";
  let childExit = null;
  let child;
  try {
    child = spawnTauriDev(spawnFn, options, database);
  } catch (error) {
    if (!options.keep && !database.live) {
      cleanupDatabase(database.targetPath);
    }
    throw error;
  }
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
    const readiness = await waitForServerFn(baseUrl, {
      intervalMs: options.serverPollMs ?? 500,
      timeoutMs: options.startupTimeoutMs ?? 45_000,
      shouldAbort: () => childExit != null,
    });
    if (!readiness.ready) {
      keepApp = Boolean(options.keepAppOnFail);
      const suffix = childExit
        ? ` Tauri dev exited early (${childExit.signal ?? childExit.code ?? "unknown"}).`
        : "";
      const reason = readiness.lastError?.message ? ` Last probe: ${readiness.lastError.message}.` : "";
      return {
        baseUrl,
        database,
        errors: [
          `Companion server did not become reachable at ${baseUrl}/companion after launching Tauri dev.${suffix}${reason}`,
        ],
        launchOutputTail: outputTail.trim(),
        outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
        screenshotGate: null,
        visualGate: null,
      };
    }

    let visualGate = null;
    let screenshotGate = null;
    try {
      visualGate = await visualGateFn({
        baseUrl,
        timeoutMs: options.timeoutMs,
      });
      screenshotGate =
        visualGate.errors.length > 0
          ? null
          : await screenshotGateFn({
              baseUrl,
              locale: options.locale,
              outputDir: options.outputDir,
              timeoutMs: options.timeoutMs,
              themeMode: options.themeMode,
            });
    } catch (error) {
      return {
        baseUrl,
        database,
        errors: [`Companion launched screenshot gate failed after server readiness: ${error.message}`],
        launchOutputTail: outputTail.trim(),
        outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
        screenshotGate,
        visualGate,
      };
    }
    return {
      baseUrl,
      database,
      errors: [...visualGate.errors, ...(screenshotGate?.errors ?? [])],
      launchOutputTail: outputTail.trim(),
      outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
      screenshotGate,
      visualGate,
    };
  } finally {
    if (keepApp) {
      releaseChild(child);
    } else {
      try {
        await terminateChild(child, options);
      } catch (error) {
        const databaseDisposition = !options.keep && !database.live
          ? `Temporary visual QA database cleanup was skipped; retained at ${database.targetPath}.`
          : `Database was left at ${database.targetPath}.`;
        throw new Error(
          `Companion screenshot cleanup failed. Tauri may still be using ${baseUrl}. ${databaseDisposition} ${error.message}`,
          { cause: error },
        );
      }
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

export function formatLaunchedCompanionScreenshotGateReport(result) {
  const lines = [];
  if (result.database) {
    lines.push(formatVisualQaDatasetReport(result.database));
    lines.push(
      result.database.live
        ? "Companion screenshot QA live DB mode: app changes affected the selected database."
        : "Companion screenshot QA used a temporary DB copy. Live library was not modified.",
    );
  }
  if (result.visualGate) {
    lines.push(formatCompanionVisualGateReport(result.visualGate));
  }
  if (result.screenshotGate) {
    lines.push(formatCompanionScreenshotGateReport(result.screenshotGate));
  } else {
    lines.push(`Companion screenshot gate target: ${result.baseUrl}/companion`);
    lines.push(`Companion screenshot artifacts: ${result.outputDir}`);
  }
  if (result.errors.length > 0) {
    lines.push("Companion launched screenshot gate errors:");
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
    if (result.launchOutputTail) {
      lines.push("Tauri launch output tail:");
      lines.push(result.launchOutputTail);
    }
  } else {
    lines.push("Companion launched screenshot gate ok.");
  }
  return lines.join("\n");
}

async function runCli() {
  const argv = process.argv.slice(2);
  const urlArg = parseArgValue(argv, "--url");
  const sourcePath = parseArgValue(argv, "--source");
  const profile = parseArgValue(argv, "--profile");
  const outputDir = parseArgValue(argv, "--out-dir") ?? DEFAULT_OUTPUT_DIR;
  const timeoutMs = parseIntegerArg(argv, "--timeout-ms", 8_000);
  const locale = normalizeCompanionScreenshotLocale(parseArgValue(argv, "--locale"));
  const launch = parseBooleanArg(argv, "--launch");
  const launchOptions = {
    baseUrl: urlArg,
    keep: parseBooleanArg(argv, "--keep"),
    keepAppOnFail: parseBooleanArg(argv, "--keep-app-on-fail"),
    locale,
    live: parseBooleanArg(argv, "--live"),
    outputDir,
    postTerminateDelayMs: parseIntegerArg(argv, "--post-terminate-delay-ms", 1_200),
    profile,
    serverPollMs: parseIntegerArg(argv, "--server-poll-ms", 500),
    sourcePath,
    startupTimeoutMs: parseIntegerArg(argv, "--startup-timeout-ms", 45_000),
    themeMode: parseArgValue(argv, "--theme") ?? "dark",
    timeoutMs,
  };

  if (launch) {
    const result = await runLaunchedCompanionScreenshotGate(launchOptions);
    console.log(formatLaunchedCompanionScreenshotGateReport(result));
    if (result.errors.length > 0) {
      process.exit(1);
    }
    return;
  }

  const dbResult = await prepareVisualQaDatabase({
    live: true,
    profile,
    sourcePath,
  });
  const baseUrl = normalizeCompanionBaseUrl(
    urlArg || dbResult.inspection.details?.trustedLanCompanionUrl,
  );

  console.log(formatVisualQaDatasetReport(dbResult));
  let visualGate = null;
  try {
    visualGate = await runCompanionVisualGate({ baseUrl, timeoutMs });
  } catch (error) {
    if (companionScreenshotGateNeedsLaunch(error)) {
      throw new Error(
        `Companion server is not reachable at ${baseUrl}/companion (${error.message}). Start the desktop app with Companion enabled, or rerun with --launch to let this gate start Tauri dev against a visual-QA database.`,
      );
    }
    throw error;
  }
  console.log(formatCompanionVisualGateReport(visualGate));
  if (visualGate.errors.length > 0) {
    process.exit(1);
  }

  const screenshotGate = await runCompanionScreenshotGate({
    baseUrl,
    locale,
    outputDir,
    timeoutMs,
  });
  console.log(formatCompanionScreenshotGateReport(screenshotGate));
  if (screenshotGate.errors.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
