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

test("UI bundle chunk contract accepts isolated lazy heavy vendors", () => {
  const errors = validateUiBundleChunks([
    ...requiredVendorAssets,
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
    ...requiredVendorAssets,
    asset("settings-abc.js", 'import("./vendor-pdf-lib-abc.js");', 110_000),
  ]);

  assert.ok(errors.some((error) => error.includes("settings-abc.js must not import")));
  assert.ok(errors.some((error) => error.includes("pulls heavy lazy vendors")));
});

test("UI bundle chunk contract rejects missing vendors and large anonymous esm chunks", () => {
  const errors = validateUiBundleChunks([
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
