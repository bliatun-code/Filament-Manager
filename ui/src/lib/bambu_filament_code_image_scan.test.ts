import assert from "node:assert/strict";
import test from "node:test";

import {
  bambuFilamentCodeImageScanAvailable,
  type BambuFilamentBarcodeDetectorConstructor,
  scanBambuFilamentCodesFromImage,
} from "./bambu_filament_code_image_scan";

function detectorFor(rawValues: string[]): BambuFilamentBarcodeDetectorConstructor {
  return class {
    async detect() {
      return rawValues.map((rawValue) => ({ rawValue }));
    }
  };
}

test("scanBambuFilamentCodesFromImage appends detected barcode filament codes", async () => {
  let closed = false;
  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "53400",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: detectorFor(["Filament Code: 53600", "65103"]),
      createImageBitmap: async () => ({
        close: () => {
          closed = true;
        },
      }),
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(closed, true);
  assert.deepEqual(result.rawValues, ["Filament Code: 53600", "65103"]);
  assert.deepEqual(result.appendedLines, ["53600", "65103"]);
  assert.equal(result.append?.input, "53400\n53600\n65103");
});

test("scanBambuFilamentCodesFromImage keeps non-code barcode values reviewable", async () => {
  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: detectorFor(["6977252426206"]),
      createImageBitmap: async () => ({}),
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.appendedLines, ["6977252426206"]);
  assert.equal(result.append?.input, "6977252426206");
});

test("scanBambuFilamentCodesFromImage reports unsupported and empty image scans", async () => {
  assert.equal(
    bambuFilamentCodeImageScanAvailable({
      barcodeDetector: detectorFor(["53400"]),
      createImageBitmap: async () => ({}),
    }),
    true,
  );
  assert.equal(
    bambuFilamentCodeImageScanAvailable({
      barcodeDetector: null,
      createImageBitmap: async () => ({}),
    }),
    false,
  );

  const unsupported = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: null,
      createImageBitmap: async () => ({}),
    },
  });
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.append, null);

  const empty = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: detectorFor([]),
      createImageBitmap: async () => ({}),
    },
  });
  assert.equal(empty.status, "no_barcode");
  assert.equal(empty.append, null);
});
