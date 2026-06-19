import {
  appendBambuFilamentCodeBatchScanValues,
  type BambuFilamentCodeBatchScanAppendResult,
} from "./bambu_filament_code_batch";

type BarcodeDetection = {
  rawValue?: string | null;
};

export type BambuFilamentBarcodeDetector = {
  detect: (image: unknown) => Promise<BarcodeDetection[]>;
};

export type BambuFilamentBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BambuFilamentBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

export type BambuFilamentImageBitmap = {
  close?: () => void;
};

export type BambuFilamentCodeImageScanResult =
  | {
      status: "ready";
      rawValues: string[];
      appendedLines: string[];
      append: BambuFilamentCodeBatchScanAppendResult;
    }
  | {
      status: "unsupported" | "no_barcode";
      rawValues: string[];
      appendedLines: [];
      append: null;
    };

type BambuFilamentCodeImageScanDependencies = {
  barcodeDetector?: BambuFilamentBarcodeDetectorConstructor | null;
  createImageBitmap?: ((file: Blob) => Promise<BambuFilamentImageBitmap>) | null;
};

const BARCODE_FORMATS = [
  "qr_code",
  "data_matrix",
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

async function supportedBarcodeFormats(
  detectorConstructor: BambuFilamentBarcodeDetectorConstructor,
): Promise<string[]> {
  if (typeof detectorConstructor.getSupportedFormats !== "function") {
    return BARCODE_FORMATS;
  }
  try {
    const supportedFormats = await detectorConstructor.getSupportedFormats();
    const supported = new Set(
      supportedFormats.map((format) => String(format).trim()).filter(Boolean),
    );
    return BARCODE_FORMATS.filter((format) => supported.has(format));
  } catch {
    return BARCODE_FORMATS;
  }
}

async function createBarcodeDetector(
  detectorConstructor: BambuFilamentBarcodeDetectorConstructor,
): Promise<BambuFilamentBarcodeDetector> {
  const formats = await supportedBarcodeFormats(detectorConstructor);
  const options = formats.length > 0 ? { formats } : undefined;
  try {
    return new detectorConstructor(options);
  } catch (error) {
    if (options) {
      return new detectorConstructor();
    }
    throw error;
  }
}

function globalBarcodeDetector(): BambuFilamentBarcodeDetectorConstructor | undefined {
  return (globalThis as typeof globalThis & {
    BarcodeDetector?: BambuFilamentBarcodeDetectorConstructor;
  }).BarcodeDetector;
}

function resolveBarcodeDetector(
  dependencies: BambuFilamentCodeImageScanDependencies,
): BambuFilamentBarcodeDetectorConstructor | null | undefined {
  return Object.prototype.hasOwnProperty.call(dependencies, "barcodeDetector")
    ? dependencies.barcodeDetector
    : globalBarcodeDetector();
}

function resolveCreateImageBitmap(
  dependencies: BambuFilamentCodeImageScanDependencies,
): ((file: Blob) => Promise<BambuFilamentImageBitmap>) | null | undefined {
  return Object.prototype.hasOwnProperty.call(dependencies, "createImageBitmap")
    ? dependencies.createImageBitmap
    : globalThis.createImageBitmap;
}

export function bambuFilamentCodeImageScanAvailable(
  dependencies: BambuFilamentCodeImageScanDependencies = {},
): boolean {
  const detector = resolveBarcodeDetector(dependencies);
  const createBitmap = resolveCreateImageBitmap(dependencies);
  return typeof detector === "function" && typeof createBitmap === "function";
}

export async function scanBambuFilamentCodesFromImage(input: {
  currentInput: string;
  file: Blob;
  dependencies?: BambuFilamentCodeImageScanDependencies;
}): Promise<BambuFilamentCodeImageScanResult> {
  const dependencies = input.dependencies ?? {};
  const detectorConstructor = resolveBarcodeDetector(dependencies);
  const createBitmap = resolveCreateImageBitmap(dependencies);

  if (typeof detectorConstructor !== "function" || typeof createBitmap !== "function") {
    return {
      status: "unsupported",
      rawValues: [],
      appendedLines: [],
      append: null,
    };
  }

  const bitmap = await createBitmap(input.file);
  try {
    const detector = await createBarcodeDetector(detectorConstructor);
    const rawValues = (await detector.detect(bitmap))
      .map((detection) => String(detection.rawValue ?? "").trim())
      .filter(Boolean);

    if (rawValues.length === 0) {
      return {
        status: "no_barcode",
        rawValues,
        appendedLines: [],
        append: null,
      };
    }

    const append = appendBambuFilamentCodeBatchScanValues({
      currentInput: input.currentInput,
      scanValues: rawValues,
    });

    return {
      status: "ready",
      rawValues,
      appendedLines: append.appendedLines,
      append,
    };
  } finally {
    bitmap.close?.();
  }
}
