import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCompanionScreenshotGateReport,
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
