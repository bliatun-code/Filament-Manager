import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCompanionScreenshotGateReport,
  summarizeCompanionScreenshotPixels,
  validateCompanionScreenshotMetrics,
} from "./run-companion-screenshot-gate.mjs";

function createMetric(overrides = {}) {
  return {
    appChildren: 1,
    counts: {
      detailModals: 0,
      listRows: 12,
      loanCards: 3,
      phoneNavButtons: 4,
      slotCards: 5,
      swatchSurfaces: 10,
      taskSheets: 0,
      ...overrides.counts,
    },
    document: {
      clientWidth: 390,
      scrollHeight: 1200,
      scrollWidth: 390,
      ...overrides.document,
    },
    expectations: {
      inventory: true,
      swatches: true,
      ...overrides.expectations,
    },
    horizontalOverflow: false,
    name: "phone-inventory",
    outsideElements: [],
    pairingScreen: false,
    screenshot: "/tmp/companion-phone-inventory.png",
    screenshotPixels: {
      colorBuckets: 92,
      edgeDeltaMean: 7.4,
      height: 844,
      lumaMean: 38,
      lumaStdDev: 18,
      saturatedPixelRatio: 0.18,
      samples: 120000,
      swatchSamples: {
        averageSaturation: 0.42,
        colorful: 7,
        total: 8,
        visible: 8,
      },
      width: 390,
    },
    textOverflow: [],
    title: "Filament Manager Companion",
    url: "http://127.0.0.1:4278/companion",
    viewport: {
      height: 844,
      width: 390,
      ...overrides.viewport,
    },
    ...overrides,
  };
}

test("companion screenshot metric validation accepts rich rendered surfaces", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric(),
    createMetric({
      counts: { taskSheets: 1 },
      expectations: { inventory: true, sheet: true, swatches: true },
      name: "phone-add-spool",
    }),
    createMetric({
      counts: { detailModals: 1 },
      expectations: { detail: true, swatches: true },
      name: "phone-detail",
    }),
  ]);

  assert.deepEqual(errors, []);
});

test("companion screenshot metric validation rejects pairing and overflow shells", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      appChildren: 0,
      document: { clientWidth: 390, scrollWidth: 420 },
      horizontalOverflow: true,
      name: "phone-broken",
      outsideElements: [{ tag: "section" }],
      pairingScreen: true,
      textOverflow: [{ tag: "button" }],
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("pairing screen")));
  assert.ok(errors.some((error) => error.includes("blank app root")));
  assert.ok(errors.some((error) => error.includes("horizontal overflow")));
  assert.ok(errors.some((error) => error.includes("outside viewport")));
  assert.ok(errors.some((error) => error.includes("text overflow")));
});

test("companion screenshot metric validation rejects flat raster captures", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      name: "phone-flat",
      screenshotPixels: {
        colorBuckets: 3,
        edgeDeltaMean: 0.2,
        height: 844,
        lumaMean: 12,
        lumaStdDev: 1.1,
        saturatedPixelRatio: 0,
        samples: 120000,
        swatchSamples: {
          averageSaturation: 0,
          colorful: 0,
          total: 4,
          visible: 0,
        },
        width: 390,
      },
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("color diversity")));
  assert.ok(errors.some((error) => error.includes("luminance contrast")));
  assert.ok(errors.some((error) => error.includes("edge detail")));
  assert.ok(errors.some((error) => error.includes("visible swatch pixels")));
});

test("companion screenshot pixel summary measures contrast and swatch samples", () => {
  const width = 20;
  const height = 12;
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixelNumber = index / 4;
    const x = pixelNumber % width;
    const y = Math.floor(pixelNumber / width);
    const isSwatch = x >= 4 && x <= 8 && y >= 3 && y <= 7;
    pixels[index] = isSwatch ? 30 : x * 6;
    pixels[index + 1] = isSwatch ? 190 : y * 10;
    pixels[index + 2] = isSwatch ? 80 : 32;
    pixels[index + 3] = 255;
  }

  const summary = summarizeCompanionScreenshotPixels(
    { height, pixels, width },
    [{ height: 5, left: 4, top: 3, width: 5 }],
  );

  assert.ok(summary.colorBuckets > 8);
  assert.ok(summary.lumaStdDev > 10);
  assert.equal(summary.swatchSamples.visible, 1);
  assert.equal(summary.swatchSamples.colorful, 1);
});

test("companion screenshot report lists artifact paths", () => {
  const report = formatCompanionScreenshotGateReport({
    baseUrl: "http://127.0.0.1:4278",
    errors: [],
    metrics: [createMetric()],
    outputDir: "/tmp/visual-qa",
  });

  assert.match(report, /Companion screenshot gate target/);
  assert.match(report, /companion-phone-inventory\.png/);
  assert.match(report, /Companion screenshot gate ok/);
});
