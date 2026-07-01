import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  formatVisualQaDatasetReport,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

export const COMPANION_SCREENSHOT_VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  wide: { width: 1440, height: 1000 },
};

const DEFAULT_OUTPUT_DIR = "release-artifacts/visual-qa";
const COMPANION_THEME_STORAGE_KEY = "bfm-companion-theme-mode";

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

function routeUrl(baseUrl, route) {
  return new URL(route, `${baseUrl}/`).toString();
}

function screenshotPath(outputDir, scenarioName) {
  return resolve(outputDir, `companion-${scenarioName}.png`);
}

function minimumFor(value, fallback = 1) {
  return Number.isFinite(value) ? value : fallback;
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
  const minColorBuckets = minimumFor(minimums.colorBuckets, 24);
  const minEdgeDeltaMean = minimumFor(minimums.edgeDeltaMean, 1.2);
  const minLumaStdDev = minimumFor(minimums.lumaStdDev, 5);
  const minVisibleSwatchPixels = minimumFor(minimums.visibleSwatchPixels, 1);

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
      errors.push(`${prefix} has ${entry.outsideElements.length} visible element(s) outside viewport`);
    }
    if (entry.textOverflow.length > 0) {
      errors.push(`${prefix} has ${entry.textOverflow.length} obvious text overflow candidate(s)`);
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
    if (entry.expectations?.detail && entry.counts.detailModals < 1) {
      errors.push(`${prefix} expected an open detail modal`);
    }
    if (entry.expectations?.loans && entry.counts.loanCards < minLoanCards) {
      errors.push(`${prefix} expected loan cards, found ${entry.counts.loanCards}`);
    }
    if (entry.expectations?.printers && entry.counts.slotCards < minSlotCards) {
      errors.push(`${prefix} expected printer slot cards, found ${entry.counts.slotCards}`);
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
    return {
      appChildren: document.querySelector("#app")?.children.length ?? 0,
      bodySample: bodyText.slice(0, 360),
      counts: {
        detailModals: document.querySelectorAll(".detail-modal").length,
        listRows: document.querySelectorAll(".list-row").length,
        loanCards: document.querySelectorAll(".loan-card").length,
        phoneNavButtons: document.querySelectorAll(".phone-nav-button").length,
        slotCards: document.querySelectorAll(".slot-card").length,
        swatchSurfaces: document.querySelectorAll(".swatch-surface").length,
        taskSheets: document.querySelectorAll(".task-sheet").length,
      },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      },
      expectations: scenario.expectations,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
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

async function runScenario(browser, baseUrl, scenario, outputDir, timeoutMs, options = {}) {
  const context = await browser.newContext({
    colorScheme: options.themeMode === "dark" ? "dark" : undefined,
    viewport: scenario.viewport,
  });
  const page = await context.newPage();
  try {
    if (options.themeMode) {
      await page.addInitScript(
        ({ key, value }) => {
          window.localStorage?.setItem(key, value);
        },
        { key: COMPANION_THEME_STORAGE_KEY, value: options.themeMode },
      );
    }
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
    return {
      ...metrics,
      screenshot: path,
      screenshotPixels: measureCompanionScreenshotPixels(screenshotBuffer, metrics.swatchSamples),
    };
  } finally {
    await context.close();
  }
}

function buildScenarios() {
  return [
    {
      name: "wide-inventory",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.wide,
      expectations: { inventory: true, swatches: true },
    },
    {
      name: "tablet-inventory",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.tablet,
      expectations: { inventory: true, swatches: true },
    },
    {
      name: "phone-inventory",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { inventory: true, swatches: true },
    },
    {
      name: "phone-add-spool",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { inventory: true, sheet: true, swatches: true },
      prepare: async (page, timeoutMs) => {
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
      },
    },
    {
      name: "phone-lend-spool",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { sheet: true, swatches: true },
      prepare: async (page, timeoutMs) => {
        await page.locator('[data-root-flow="loans"]').click({ timeout: timeoutMs });
        await page.locator('[data-action="start-loan-picker"]').click({ timeout: timeoutMs });
        await page.waitForSelector(".task-sheet", { timeout: timeoutMs });
        const option = await chooseFirstNonBambuOption(page.locator(".loan-picker-option"));
        if (option) {
          await option.click({ timeout: timeoutMs });
          await page.waitForSelector(".loan-create-card", { timeout: timeoutMs });
        }
      },
    },
    {
      name: "phone-detail",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { detail: true, swatches: true },
      prepare: async (page, timeoutMs) => {
        await page.locator('[data-action="select-spool"]').first().click({ timeout: timeoutMs });
        await page.waitForSelector(".detail-modal", { timeout: timeoutMs });
      },
    },
    {
      name: "phone-printers",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { printers: true, swatches: true },
      prepare: async (page, timeoutMs) => {
        await page.locator('[data-root-flow="printers"]').click({ timeout: timeoutMs });
        await page.waitForSelector(".slot-card", { timeout: timeoutMs });
      },
    },
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
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: options.headless !== false });
  try {
    const scenarios = options.scenarios ?? buildScenarios();
    const metrics = [];
    for (const scenario of scenarios) {
      metrics.push(await runScenario(browser, baseUrl, scenario, outputDir, timeoutMs, { themeMode }));
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

async function runCli() {
  const argv = process.argv.slice(2);
  const urlArg = parseArgValue(argv, "--url");
  const sourcePath = parseArgValue(argv, "--source");
  const profile = parseArgValue(argv, "--profile");
  const outputDir = parseArgValue(argv, "--out-dir") ?? DEFAULT_OUTPUT_DIR;
  const timeoutMs = parseIntegerArg(argv, "--timeout-ms", 8_000);

  const dbResult = await prepareVisualQaDatabase({
    live: true,
    profile,
    sourcePath,
  });
  const baseUrl = normalizeCompanionBaseUrl(
    urlArg || dbResult.inspection.details?.trustedLanCompanionUrl,
  );

  console.log(formatVisualQaDatasetReport(dbResult));
  const visualGate = await runCompanionVisualGate({ baseUrl, timeoutMs });
  console.log(formatCompanionVisualGateReport(visualGate));
  if (visualGate.errors.length > 0) {
    process.exit(1);
  }

  const screenshotGate = await runCompanionScreenshotGate({
    baseUrl,
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
