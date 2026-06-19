import assert from "node:assert/strict";
import test from "node:test";

import {
  bambuFilamentCodeImageScanAvailable,
  createBambuFilamentBarcodeScanner,
  decodeBambuEan13BarcodeFromCanvas,
  detectKnownBambuBoxEanFromCanvas,
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

const TEST_EAN13_LEFT_ODD: Record<string, string> = {
  "0": "0001101",
  "1": "0011001",
  "2": "0010011",
  "3": "0111101",
  "4": "0100011",
  "5": "0110001",
  "6": "0101111",
  "7": "0111011",
  "8": "0110111",
  "9": "0001011",
};

const TEST_EAN13_LEFT_EVEN: Record<string, string> = {
  "0": "0100111",
  "1": "0110011",
  "2": "0011011",
  "3": "0100001",
  "4": "0011101",
  "5": "0111001",
  "6": "0000101",
  "7": "0010001",
  "8": "0001001",
  "9": "0010111",
};

const TEST_EAN13_RIGHT: Record<string, string> = {
  "0": "1110010",
  "1": "1100110",
  "2": "1101100",
  "3": "1000010",
  "4": "1011100",
  "5": "1001110",
  "6": "1010000",
  "7": "1000100",
  "8": "1001000",
  "9": "1110100",
};

const TEST_EAN13_PARITY: Record<string, string> = {
  "0": "LLLLLL",
  "1": "LLGLGG",
  "2": "LLGGLG",
  "3": "LLGGGL",
  "4": "LGLLGG",
  "5": "LGGLLG",
  "6": "LGGGLL",
  "7": "LGLGLG",
  "8": "LGLGGL",
  "9": "LGGLGL",
};

const TEST_CODE128_PATTERNS: Record<number, number[]> = {
  16: [1, 2, 3, 1, 2, 2],
  17: [1, 2, 3, 2, 2, 1],
  19: [2, 2, 1, 1, 3, 2],
  21: [2, 1, 3, 2, 1, 2],
  22: [2, 2, 3, 1, 1, 2],
  23: [3, 1, 2, 1, 3, 1],
  24: [3, 1, 1, 2, 2, 2],
  25: [3, 2, 1, 1, 2, 2],
  63: [1, 1, 1, 2, 2, 4],
  104: [2, 1, 1, 2, 1, 4],
  106: [2, 3, 3, 1, 1, 1, 2],
};

function ean13BitPattern(code: string): string {
  const digits = code.split("");
  const parity = TEST_EAN13_PARITY[digits[0] ?? ""];
  assert.ok(parity);

  let pattern = "101";
  digits.slice(1, 7).forEach((digit, index) => {
    pattern +=
      parity[index] === "L"
        ? TEST_EAN13_LEFT_ODD[digit]
        : TEST_EAN13_LEFT_EVEN[digit];
  });
  pattern += "01010";
  digits.slice(7).forEach((digit) => {
    pattern += TEST_EAN13_RIGHT[digit];
  });
  pattern += "101";
  return pattern;
}

function fakeEan13Canvas(code: string): HTMLCanvasElement {
  const moduleWidth = 5;
  const quietModules = 12;
  const barcodePattern = ean13BitPattern(code);
  const width = (barcodePattern.length + quietModules * 2) * moduleWidth;
  const height = 96;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const barcodeTop = 16;
  const barcodeBottom = 82;

  for (let moduleIndex = 0; moduleIndex < barcodePattern.length; moduleIndex += 1) {
    if (barcodePattern[moduleIndex] !== "1") {
      continue;
    }
    const startX = (quietModules + moduleIndex) * moduleWidth;
    for (let y = barcodeTop; y < barcodeBottom; y += 1) {
      for (let x = startX; x < startX + moduleWidth; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
  }

  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

function code128BitPattern(values: number[]): string {
  return values
    .map((value) => {
      const widths = TEST_CODE128_PATTERNS[value];
      assert.ok(widths);
      let black = true;
      let pattern = "";
      widths.forEach((width) => {
        pattern += (black ? "1" : "0").repeat(width);
        black = !black;
      });
      return pattern;
    })
    .join("");
}

function fakeCode128Canvas(values: number[]): HTMLCanvasElement {
  const moduleWidth = 4;
  const quietModules = 18;
  const barcodePattern = code128BitPattern(values);
  const width = (barcodePattern.length + quietModules * 2) * moduleWidth;
  const height = 96;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const barcodeTop = 16;
  const barcodeBottom = 82;

  for (let moduleIndex = 0; moduleIndex < barcodePattern.length; moduleIndex += 1) {
    if (barcodePattern[moduleIndex] !== "1") {
      continue;
    }
    const startX = (quietModules + moduleIndex) * moduleWidth;
    for (let y = barcodeTop; y < barcodeBottom; y += 1) {
      for (let x = startX; x < startX + moduleWidth; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
  }

  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

function blankCanvas(width = 320, height = 120): HTMLCanvasElement {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
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

test("createBambuFilamentBarcodeScanner tries native barcode crops after empty full-frame scans", async () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousCanvas = (globalThis as { HTMLCanvasElement?: unknown })
    .HTMLCanvasElement;
  const calls: string[] = [];

  class FakeCanvas {
    height = 100;
    width = 100;

    constructor(readonly label: string) {}

    getContext() {
      return {
        drawImage: () => {},
        filter: "",
        imageSmoothingEnabled: true,
      };
    }
  }

  (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement = FakeCanvas;
  (globalThis as { document?: unknown }).document = {
    createElement: () => new FakeCanvas("crop"),
  };

  const Detector = class {
    async detect(image: unknown) {
      const label = (image as { label?: string }).label ?? "unknown";
      calls.push(label);
      return label === "crop" ? [{ rawValue: "6975337031338" }] : [];
    }
  };

  try {
    const scanner = await createBambuFilamentBarcodeScanner({
      barcodeDetector: Detector,
      fallbackBarcodeScanner: null,
    });

    assert.deepEqual(await scanner?.detect(new FakeCanvas("source")), [
      { rawValue: "6975337031338" },
    ]);
    assert.deepEqual(calls, ["source", "crop"]);
  } finally {
    (globalThis as { document?: unknown }).document = previousDocument;
    (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement =
      previousCanvas;
  }
});

test("decodeBambuEan13BarcodeFromCanvas reads Bambu box EAN rows", () => {
  assert.equal(
    decodeBambuEan13BarcodeFromCanvas(fakeEan13Canvas("6975337031338")),
    "6975337031338",
  );
});

test("detectKnownBambuBoxEanFromCanvas matches known Bambu EAN and Code 128 box labels", () => {
  assert.equal(
    detectKnownBambuBoxEanFromCanvas(fakeEan13Canvas("6975337031338")),
    "6975337031338",
  );
  assert.equal(
    detectKnownBambuBoxEanFromCanvas(
      fakeCode128Canvas([
        104, 22, 25, 23, 21, 19, 19, 23, 16, 19, 17, 19, 19, 24, 63, 106,
      ]),
    ),
    "6975337031338",
  );
  assert.equal(
    detectKnownBambuBoxEanFromCanvas(blankCanvas()),
    null,
  );
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
