import assert from "node:assert/strict";
import test from "node:test";

import {
  bambuFilamentCodeImageScanAvailable,
  createBambuFilamentBarcodeScanner,
  isBambuFilamentBarcodeDecodeMiss,
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

test("isBambuFilamentBarcodeDecodeMiss recognizes ZXing miss shapes", () => {
  assert.equal(
    isBambuFilamentBarcodeDecodeMiss({ name: "NotFoundException" }),
    true,
  );
  assert.equal(
    isBambuFilamentBarcodeDecodeMiss({
      constructor: { kind: "ChecksumException" },
    }),
    true,
  );
  assert.equal(
    isBambuFilamentBarcodeDecodeMiss({
      getKind: () => "FormatException",
    }),
    true,
  );
  assert.equal(
    isBambuFilamentBarcodeDecodeMiss(
      new Error("No MultiFormat Readers were able to detect the code."),
    ),
    true,
  );
  assert.equal(isBambuFilamentBarcodeDecodeMiss(new TypeError("canvas failed")), false);
});

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
  assert.deepEqual(result.append?.appendedCodeLines, ["53600", "65103"]);
  assert.deepEqual(result.append?.appendedReviewLines, []);
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
  assert.deepEqual(result.append?.appendedCodeLines, []);
  assert.deepEqual(result.append?.appendedReviewLines, ["6977252426206"]);
  assert.equal(result.append?.input, "6977252426206");
});

test("scanBambuFilamentCodesFromImage maps known box barcodes and ignores instruction QRs", async () => {
  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: detectorFor([
        "6975337031338",
        "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
      ]),
      createImageBitmap: async () => ({}),
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.appendedLines, ["11101"]);
  assert.deepEqual(result.append?.appendedCodeLines, ["11101"]);
  assert.deepEqual(result.append?.appendedReviewLines, []);
  assert.deepEqual(result.append?.ignoredLines, [
    "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
  ]);
  assert.equal(result.append?.input, "11101");
});

test("createBambuFilamentBarcodeScanner tries fallback when native finds only an instruction QR", async () => {
  const scanner = await createBambuFilamentBarcodeScanner({
    barcodeDetector: detectorFor([
      "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
    ]),
    fallbackBarcodeScanner: async () => ({
      detect: async () => [{ rawValue: "6975337031338" }],
    }),
  });

  assert.deepEqual(await scanner?.detect({}), [
    { rawValue: "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte" },
    { rawValue: "6975337031338" },
  ]);
});

test("createBambuFilamentBarcodeScanner lets native one dimensional formats win before QR", async () => {
  const calls: string[][] = [];
  const Detector = class {
    private formats: string[];

    static async getSupportedFormats() {
      return ["qr_code", "ean_13"];
    }

    constructor(options?: { formats?: string[] }) {
      this.formats = options?.formats ?? [];
    }

    async detect() {
      calls.push(this.formats);
      if (this.formats.includes("ean_13") && !this.formats.includes("qr_code")) {
        return [{ rawValue: "6975337031338" }];
      }
      return [
        {
          rawValue: "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
        },
      ];
    }
  };

  const scanner = await createBambuFilamentBarcodeScanner({
    barcodeDetector: Detector,
    fallbackBarcodeScanner: async () => ({
      detect: async () => [{ rawValue: "11101" }],
    }),
  });

  assert.deepEqual(await scanner?.detect({}), [{ rawValue: "6975337031338" }]);
  assert.deepEqual(calls, [["ean_13"]]);
});

test("scanBambuFilamentCodesFromImage keeps mixed barcode values in the batch review model", async () => {
  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "53400",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: detectorFor(["Filament Code: 53600", "6977252426206"]),
      createImageBitmap: async () => ({}),
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.appendedLines, ["53600", "6977252426206"]);
  assert.deepEqual(result.append?.appendedCodeLines, ["53600"]);
  assert.deepEqual(result.append?.appendedReviewLines, ["6977252426206"]);
  assert.equal(result.append?.input, "53400\n53600\n6977252426206");
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
      fallbackBarcodeScanner: null,
      createImageBitmap: async () => ({}),
    }),
    false,
  );

  const unsupported = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: null,
      fallbackBarcodeScanner: null,
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
      fallbackBarcodeScanner: null,
      createImageBitmap: async () => ({}),
    },
  });
  assert.equal(empty.status, "no_barcode");
  assert.equal(empty.append, null);
});

test("scanBambuFilamentCodesFromImage uses fallback barcode scanner when native detection is unavailable", async () => {
  const bitmap = { close: () => {} };
  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: null,
      createImageBitmap: async () => bitmap,
      fallbackBarcodeScanner: async () => ({
        detect: async (image) => {
          assert.equal(image, bitmap);
          return [{ rawValue: "Filament Code: 53400" }];
        },
      }),
    },
  });

  assert.equal(
    bambuFilamentCodeImageScanAvailable({
      barcodeDetector: null,
      createImageBitmap: async () => ({}),
      fallbackBarcodeScanner: async () => null,
    }),
    true,
  );
  assert.equal(result.status, "ready");
  assert.deepEqual(result.appendedLines, ["53400"]);
  assert.equal(result.append?.input, "53400");
});

test("scanBambuFilamentCodesFromImage tries fallback barcode scanner after an empty native scan", async () => {
  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "53400",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: detectorFor([]),
      createImageBitmap: async () => ({}),
      fallbackBarcodeScanner: async () => ({
        detect: async () => [{ rawValue: "Filament Code: 53600" }],
      }),
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.appendedLines, ["53600"]);
  assert.equal(result.append?.input, "53400\n53600");
});

test("scanBambuFilamentCodesFromImage filters requested barcode formats when supported formats are available", async () => {
  const constructedFormats: Array<string[] | null> = [];
  const Detector = class {
    static async getSupportedFormats() {
      return ["qr_code", "unknown_format"];
    }

    constructor(options?: { formats?: string[] }) {
      constructedFormats.push(options?.formats ?? null);
    }

    async detect() {
      return [{ rawValue: "Filament Code: 53400" }];
    }
  };

  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: Detector,
      createImageBitmap: async () => ({}),
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(constructedFormats, [["qr_code"]]);
  assert.equal(result.append?.input, "53400");
});

test("scanBambuFilamentCodesFromImage falls back when barcode detector rejects format options", async () => {
  const constructedFormats: Array<string[] | null> = [];
  const Detector = class {
    constructor(options?: { formats?: string[] }) {
      constructedFormats.push(options?.formats ?? null);
      if (options?.formats) {
        throw new TypeError("unsupported formats");
      }
    }

    async detect() {
      return [{ rawValue: "Filament Code: 53600" }];
    }
  };

  const result = await scanBambuFilamentCodesFromImage({
    currentInput: "53400",
    file: new Blob(["image"], { type: "image/png" }),
    dependencies: {
      barcodeDetector: Detector,
      createImageBitmap: async () => ({}),
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(constructedFormats, [
    ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"],
    ["qr_code", "data_matrix", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"],
    null,
  ]);
  assert.equal(result.append?.input, "53400\n53600");
});
