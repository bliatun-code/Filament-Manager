import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";
import {
  formatCompanionVisualGateReport,
  normalizeCompanionBaseUrl,
  runCompanionVisualGate,
} from "./run-companion-visual-gate.mjs";
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

function paethPredictor(left, up, upLeft) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function decodePngScreenshot(buffer) {
  const signature = "89504e470d0a1a0a";
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Screenshot is not a PNG buffer.");
  }

  let offset = 8;
  let ihdr = null;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      ihdr = {
        bitDepth: data[8],
        colorType: data[9],
        compressionMethod: data[10],
        filterMethod: data[11],
        height: data.readUInt32BE(4),
        interlaceMethod: data[12],
        width: data.readUInt32BE(0),
      };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!ihdr) {
    throw new Error("Screenshot PNG is missing IHDR.");
  }
  if (ihdr.bitDepth !== 8 || ![2, 6].includes(ihdr.colorType)) {
    throw new Error(`Unsupported screenshot PNG format: bit depth ${ihdr.bitDepth}, color type ${ihdr.colorType}.`);
  }
  if (ihdr.compressionMethod !== 0 || ihdr.filterMethod !== 0 || ihdr.interlaceMethod !== 0) {
    throw new Error("Unsupported screenshot PNG compression, filter, or interlace mode.");
  }

  const channels = ihdr.colorType === 6 ? 4 : 3;
  const rowLength = ihdr.width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(ihdr.width * ihdr.height * 4);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);

  for (let y = 0; y < ihdr.height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = new Uint8Array(rowLength);

    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previousRow[x] ?? 0;
      const upLeft = x >= channels ? previousRow[x - channels] : 0;
      let value = raw;

      if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + up;
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value = raw + paethPredictor(left, up, upLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG row filter ${filter}.`);
      }

      row[x] = value & 0xff;
    }
    sourceOffset += rowLength;

    for (let x = 0; x < ihdr.width; x += 1) {
      const rowIndex = x * channels;
      const pixelIndex = (y * ihdr.width + x) * 4;
      pixels[pixelIndex] = row[rowIndex];
      pixels[pixelIndex + 1] = row[rowIndex + 1];
      pixels[pixelIndex + 2] = row[rowIndex + 2];
      pixels[pixelIndex + 3] = channels === 4 ? row[rowIndex + 3] : 255;
    }

    previousRow = row;
  }

  return {
    height: ihdr.height,
    pixels,
    width: ihdr.width,
  };
}

function pixelAt(image, x, y) {
  const safeX = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (safeY * image.width + safeX) * 4;
  return {
    b: image.pixels[index + 2],
    g: image.pixels[index + 1],
    r: image.pixels[index],
  };
}

function luminance(pixel) {
  return 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
}

function saturation(pixel) {
  const max = Math.max(pixel.r, pixel.g, pixel.b);
  const min = Math.min(pixel.r, pixel.g, pixel.b);
  return max <= 0 ? 0 : (max - min) / max;
}

function summarizeSampleBoxes(image, sampleBoxes = []) {
  let colorful = 0;
  let sampled = 0;
  let visible = 0;
  let saturationSum = 0;

  for (const box of sampleBoxes.slice(0, 80)) {
    const width = Number(box.width);
    const height = Number(box.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }
    const pixel = pixelAt(image, Number(box.left) + width / 2, Number(box.top) + height / 2);
    const sampleSaturation = saturation(pixel);
    const sampleLuma = luminance(pixel);
    sampled += 1;
    saturationSum += sampleSaturation;
    if (sampleLuma > 12 && sampleLuma < 245) {
      visible += 1;
    }
    if (sampleSaturation >= 0.14 && sampleLuma > 18) {
      colorful += 1;
    }
  }

  return {
    averageSaturation: sampled > 0 ? saturationSum / sampled : 0,
    colorful,
    total: sampled,
    visible,
  };
}

export function summarizeCompanionScreenshotPixels(image, sampleBoxes = []) {
  const totalPixels = image.width * image.height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 120_000)));
  const buckets = new Set();
  let edgeDeltaSum = 0;
  let edgeSamples = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let samples = 0;
  let saturatedPixels = 0;

  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const pixel = pixelAt(image, x, y);
      const luma = luminance(pixel);
      const bucket = ((pixel.r >> 4) << 8) | ((pixel.g >> 4) << 4) | (pixel.b >> 4);
      buckets.add(bucket);
      lumaSum += luma;
      lumaSquareSum += luma * luma;
      samples += 1;
      if (saturation(pixel) >= 0.18 && luma > 16) {
        saturatedPixels += 1;
      }
      if (x + step < image.width) {
        edgeDeltaSum += Math.abs(luma - luminance(pixelAt(image, x + step, y)));
        edgeSamples += 1;
      }
      if (y + step < image.height) {
        edgeDeltaSum += Math.abs(luma - luminance(pixelAt(image, x, y + step)));
        edgeSamples += 1;
      }
    }
  }

  const lumaMean = samples > 0 ? lumaSum / samples : 0;
  const variance = samples > 0 ? lumaSquareSum / samples - lumaMean * lumaMean : 0;

  return {
    colorBuckets: buckets.size,
    edgeDeltaMean: edgeSamples > 0 ? edgeDeltaSum / edgeSamples : 0,
    height: image.height,
    lumaMean,
    lumaStdDev: Math.sqrt(Math.max(0, variance)),
    saturatedPixelRatio: samples > 0 ? saturatedPixels / samples : 0,
    samples,
    swatchSamples: summarizeSampleBoxes(image, sampleBoxes),
    width: image.width,
  };
}

export function measureCompanionScreenshotPixels(buffer, sampleBoxes = []) {
  return summarizeCompanionScreenshotPixels(decodePngScreenshot(buffer), sampleBoxes);
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

async function runScenario(browser, baseUrl, scenario, outputDir, timeoutMs) {
  const context = await browser.newContext({ viewport: scenario.viewport });
  const page = await context.newPage();
  try {
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
      },
    },
    {
      name: "phone-lend-spool",
      viewport: COMPANION_SCREENSHOT_VIEWPORTS.phone,
      expectations: { inventory: true, sheet: true, swatches: true },
      prepare: async (page, timeoutMs) => {
        await page.locator('[data-root-flow="loans"]').click({ timeout: timeoutMs });
        await page.locator('[data-action="start-loan-picker"]').click({ timeout: timeoutMs });
        await page.waitForSelector(".task-sheet", { timeout: timeoutMs });
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
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: options.headless !== false });
  try {
    const scenarios = options.scenarios ?? buildScenarios();
    const metrics = [];
    for (const scenario of scenarios) {
      metrics.push(await runScenario(browser, baseUrl, scenario, outputDir, timeoutMs));
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
