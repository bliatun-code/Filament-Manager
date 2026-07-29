import assert from "node:assert/strict";
import test from "node:test";

import { validateUiBundleChunks } from "./check-ui-bundle-chunks.mjs";

function asset(name, source = "", size = 1_000) {
  return { name, source, size };
}

const requiredVendorAssets = [
  asset("vendor-pdf-lib-abc.js", "", 420_000),
  asset("vendor-qrcode-abc.js", "", 24_000),
  asset("vendor-zxing-abc.js", "", 470_000),
  asset("bambu_filament_code_camera_worker-abc.js", "", 13_000),
];
const requiredPageAssets = [
  asset("index-required.js", "", 210_000),
  asset("dashboard-required.js", "", 32_000),
  asset("inventory-required.js", "", 207_000),
  asset("loans-required.js", "", 20_000),
  asset("printers-required.js", "", 75_000),
  asset("settings-required.js", "", 127_000),
  asset("statistics-required.js", "", 42_000),
];
const requiredBundleAssets = [
  ...requiredVendorAssets,
  ...requiredPageAssets,
];

test("UI bundle chunk contract accepts isolated lazy heavy vendors", () => {
  const errors = validateUiBundleChunks([
    ...requiredBundleAssets,
    asset("index-abc.js", 'import("./inventory_overview_print-abc.js");', 210_000),
    asset(
      "inventory_overview_print-abc.js",
      'import{PDFDocument}from"./vendor-pdf-lib-abc.js";',
      4_000,
    ),
    asset("filament_label_print-abc.js", 'import QRCode from"./vendor-qrcode-abc.js";'),
    asset("trusted_lan_pairing_qr-abc.js", 'import("./vendor-qrcode-abc.js");'),
    asset("bambu_filament_code_image_scan-abc.js", 'import(`./vendor-zxing-abc.js`);'),
  ]);

  assert.deepEqual(errors, []);
});

test("UI bundle chunk contract rejects direct page imports of heavy vendors", () => {
  const errors = validateUiBundleChunks([
    ...requiredBundleAssets,
    asset("settings-abc.js", 'import("./vendor-pdf-lib-abc.js");', 110_000),
  ]);

  assert.ok(errors.some((error) => error.includes("settings-abc.js must not import")));
  assert.ok(errors.some((error) => error.includes("pulls heavy lazy vendors")));
});

test("UI bundle chunk contract rejects missing vendors and large anonymous esm chunks", () => {
  const errors = validateUiBundleChunks([
    ...requiredPageAssets,
    asset("vendor-pdf-lib-abc.js", "", 420_000),
    asset("vendor-qrcode-abc.js", "", 24_000),
    asset("esm-legacy.js", "", 450_000),
  ]);

  assert.ok(errors.some((error) => error.includes("Expected vendor-zxing-*.js")));
  assert.ok(
    errors.some((error) =>
      error.includes("Expected bambu_filament_code_camera_worker-*.js"),
    ),
  );
  assert.ok(errors.some((error) => error.includes("large anonymous esm chunk")));
});

test("UI bundle chunk contract enforces cold-start and page-navigation budgets", () => {
  const errors = validateUiBundleChunks([
    ...requiredVendorAssets,
    asset("index-too-large.js", "", 300_001),
    asset("dashboard-too-large.js", "", 65_001),
    asset("inventory-too-large.js", "", 260_001),
    asset("loans-too-large.js", "", 55_001),
    asset("printers-too-large.js", "", 115_001),
    asset("settings-too-large.js", "", 190_001),
    asset("statistics-too-large.js", "", 90_001),
  ]);

  for (const prefix of [
    "index-",
    "dashboard-",
    "inventory-",
    "loans-",
    "printers-",
    "settings-",
    "statistics-",
  ]) {
    assert.ok(
      errors.some(
        (error) =>
          error.includes(`${prefix}too-large.js`) &&
          error.includes("cold-start/navigation budget"),
      ),
      `missing performance budget failure for ${prefix}`,
    );
  }
});

test("UI bundle chunk contract leaves headroom for the v0.22.0 baseline", () => {
  const errors = validateUiBundleChunks([
    ...requiredVendorAssets,
    asset("index-baseline.js", "", 234_000),
    asset("dashboard-baseline.js", "", 32_000),
    asset("inventory-baseline.js", "", 207_000),
    asset("loans-baseline.js", "", 20_000),
    asset("printers-baseline.js", "", 75_000),
    asset("settings-baseline.js", "", 127_000),
    asset("statistics-baseline.js", "", 42_000),
  ]);

  assert.deepEqual(errors, []);
});

test("UI bundle chunk contract rejects a missing budgeted page chunk", () => {
  const errors = validateUiBundleChunks([
    ...requiredVendorAssets,
    ...requiredPageAssets.filter((entry) => !entry.name.startsWith("loans-")),
  ]);

  assert.ok(
    errors.some((error) =>
      error.includes(
        "Expected loans-*.js so its cold-start/navigation budget can be enforced",
      ),
    ),
  );
});
