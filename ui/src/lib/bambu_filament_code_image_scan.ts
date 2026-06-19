import {
  appendBambuFilamentCodeBatchScanValues,
  isIgnoredBambuFilamentBatchScanValue,
  type BambuFilamentCodeBatchScanAppendResult,
} from "./bambu_filament_code_batch";

export type BambuFilamentBarcodeDetection = {
  rawValue?: string | null;
};

export type BambuFilamentBarcodeDetector = {
  detect: (image: unknown) => Promise<BambuFilamentBarcodeDetection[]>;
};

export type BambuFilamentBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BambuFilamentBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

export type BambuFilamentBarcodeScannerFactory = () => Promise<
  BambuFilamentBarcodeDetector | null
>;

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

export type BambuFilamentCodeImageScanDependencies = {
  barcodeDetector?: BambuFilamentBarcodeDetectorConstructor | null;
  createImageBitmap?: ((file: Blob) => Promise<BambuFilamentImageBitmap>) | null;
  fallbackBarcodeScanner?: BambuFilamentBarcodeScannerFactory | null;
};

export const BAMBU_FILAMENT_BARCODE_FORMATS = [
  "qr_code",
  "data_matrix",
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

const ZXING_BARCODE_FORMAT_KEYS = [
  "QR_CODE",
  "DATA_MATRIX",
  "CODE_128",
  "CODE_39",
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
] as const;

const ZXING_LINEAR_BARCODE_FORMAT_KEYS = [
  "CODE_128",
  "CODE_39",
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
] as const;

const ZXING_MATRIX_BARCODE_FORMAT_KEYS = ["QR_CODE", "DATA_MATRIX"] as const;

let zxingBarcodeScannerPromise: Promise<BambuFilamentBarcodeDetector | null> | null =
  null;

async function supportedBarcodeFormats(
  detectorConstructor: BambuFilamentBarcodeDetectorConstructor,
): Promise<string[]> {
  if (typeof detectorConstructor.getSupportedFormats !== "function") {
    return BAMBU_FILAMENT_BARCODE_FORMATS;
  }
  try {
    const supportedFormats = await detectorConstructor.getSupportedFormats();
    const supported = new Set(
      supportedFormats.map((format) => String(format).trim()).filter(Boolean),
    );
    return BAMBU_FILAMENT_BARCODE_FORMATS.filter((format) => supported.has(format));
  } catch {
    return BAMBU_FILAMENT_BARCODE_FORMATS;
  }
}

export async function createBambuFilamentBarcodeDetector(
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

export function globalBambuFilamentBarcodeDetector():
  | BambuFilamentBarcodeDetectorConstructor
  | undefined {
  return (globalThis as typeof globalThis & {
    BarcodeDetector?: BambuFilamentBarcodeDetectorConstructor;
  }).BarcodeDetector;
}

function resolveFallbackBarcodeScanner(
  dependencies: BambuFilamentCodeImageScanDependencies,
): BambuFilamentBarcodeScannerFactory | null {
  return Object.prototype.hasOwnProperty.call(dependencies, "fallbackBarcodeScanner")
    ? dependencies.fallbackBarcodeScanner ?? null
    : createZxingBambuFilamentBarcodeScanner;
}

function resolveBarcodeDetector(
  dependencies: BambuFilamentCodeImageScanDependencies,
): BambuFilamentBarcodeDetectorConstructor | null | undefined {
  return Object.prototype.hasOwnProperty.call(dependencies, "barcodeDetector")
    ? dependencies.barcodeDetector
    : globalBambuFilamentBarcodeDetector();
}

function resolveCreateImageBitmap(
  dependencies: BambuFilamentCodeImageScanDependencies,
): ((file: Blob) => Promise<BambuFilamentImageBitmap>) | null | undefined {
  return Object.prototype.hasOwnProperty.call(dependencies, "createImageBitmap")
    ? dependencies.createImageBitmap
    : globalThis.createImageBitmap;
}

export function isBambuFilamentBarcodeDecodeMiss(error: unknown): boolean {
  const errorLike = error as {
    constructor?: { kind?: unknown };
    getKind?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const kind =
    typeof errorLike?.getKind === "function" ? String(errorLike.getKind()) : "";
  const constructorKind = String(errorLike?.constructor?.kind ?? "");
  const message = String(errorLike?.message ?? "");
  const name = String(errorLike?.name ?? "");
  const stringValue = String(error ?? "");
  const markers = [name, kind, constructorKind, message, stringValue];
  return (
    markers.some((marker) =>
      ["NotFoundException", "ChecksumException", "FormatException"].includes(
        marker,
      ),
    ) ||
    markers.some((marker) =>
      [
        "No MultiFormat Readers were able to detect the code.",
        "No barcode found",
      ].some((needle) => marker.includes(needle)),
    )
  );
}

function imageDimension(input: unknown, keys: string[]): number {
  const source = input as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function createCanvasForBarcodeScan(image: unknown): HTMLCanvasElement | null {
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
    return image;
  }
  if (typeof document === "undefined") {
    return null;
  }

  const width = imageDimension(image, ["videoWidth", "naturalWidth", "width"]);
  const height = imageDimension(image, ["videoHeight", "naturalHeight", "height"]);
  if (width <= 0 || height <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(image as CanvasImageSource, 0, 0, width, height);
  return canvas;
}

function normalizeZxingResult(result: unknown): BambuFilamentBarcodeDetection[] {
  const rawValue =
    typeof (result as { getText?: unknown })?.getText === "function"
      ? String((result as { getText: () => unknown }).getText() ?? "").trim()
      : String((result as { text?: unknown })?.text ?? "").trim();
  return rawValue ? [{ rawValue }] : [];
}

function zxingFormats(
  zxing: typeof import("@zxing/browser"),
  keys: readonly string[],
): number[] {
  return keys
    .map((key) => zxing.BarcodeFormat[key as keyof typeof zxing.BarcodeFormat])
    .filter((format): format is number => typeof format === "number");
}

function createZxingReader(
  zxing: typeof import("@zxing/browser"),
  keys: readonly string[],
): import("@zxing/browser").BrowserMultiFormatReader {
  const reader = new zxing.BrowserMultiFormatReader();
  reader.possibleFormats = zxingFormats(zxing, keys);
  return reader;
}

function rawDetectionValues(detections: BambuFilamentBarcodeDetection[]): string[] {
  return detections
    .map((detection) => String(detection.rawValue ?? "").trim())
    .filter(Boolean);
}

function detectionsOnlyContainIgnoredValues(
  detections: BambuFilamentBarcodeDetection[],
): boolean {
  const rawValues = rawDetectionValues(detections);
  return (
    rawValues.length > 0 &&
    rawValues.every((value) => isIgnoredBambuFilamentBatchScanValue(value))
  );
}

export async function createZxingBambuFilamentBarcodeScanner(): Promise<BambuFilamentBarcodeDetector | null> {
  zxingBarcodeScannerPromise ??= (async () => {
    const zxing = await import("@zxing/browser");
    const linearReader = createZxingReader(zxing, ZXING_LINEAR_BARCODE_FORMAT_KEYS);
    const matrixReader = createZxingReader(zxing, ZXING_MATRIX_BARCODE_FORMAT_KEYS);
    const broadReader = createZxingReader(zxing, ZXING_BARCODE_FORMAT_KEYS);
    const readers = [linearReader, matrixReader, broadReader];

    return {
      detect: async (image: unknown) => {
        const canvas = createCanvasForBarcodeScan(image);
        const scanImage = canvas ?? image;
        let lastMiss: unknown = null;
        for (const reader of readers) {
          try {
            const result = canvas
              ? reader.decodeFromCanvas(canvas)
              : reader.decode(scanImage as HTMLImageElement | HTMLVideoElement);
            return normalizeZxingResult(result);
          } catch (error) {
            if (isBambuFilamentBarcodeDecodeMiss(error)) {
              lastMiss = error;
              continue;
            }
            throw error;
          }
        }

        if (lastMiss) {
          return [];
        }
        return [];
      },
    };
  })().catch(() => null);

  return zxingBarcodeScannerPromise;
}

async function detectWithFallbackAfterIgnoredNative(input: {
  nativeDetections: BambuFilamentBarcodeDetection[];
  image: unknown;
  fallbackFactory: BambuFilamentBarcodeScannerFactory;
}): Promise<BambuFilamentBarcodeDetection[]> {
  if (!detectionsOnlyContainIgnoredValues(input.nativeDetections)) {
    return input.nativeDetections;
  }

  const fallbackScanner = await input.fallbackFactory();
  const fallbackDetections = (await fallbackScanner?.detect(input.image)) ?? [];
  return rawDetectionValues(fallbackDetections).length > 0
    ? [...input.nativeDetections, ...fallbackDetections]
    : input.nativeDetections;
}

export async function createBambuFilamentBarcodeScanner(
  dependencies: BambuFilamentCodeImageScanDependencies = {},
): Promise<BambuFilamentBarcodeDetector | null> {
  const detectorConstructor = resolveBarcodeDetector(dependencies);
  const fallbackFactory = resolveFallbackBarcodeScanner(dependencies);
  let nativeDetector: BambuFilamentBarcodeDetector | null = null;

  if (typeof detectorConstructor === "function") {
    try {
      nativeDetector = await createBambuFilamentBarcodeDetector(detectorConstructor);
    } catch (error) {
      if (!fallbackFactory) {
        throw error;
      }
    }
  }

  if (!nativeDetector && !fallbackFactory) {
    return null;
  }

  if (!nativeDetector) {
    return fallbackFactory?.() ?? null;
  }

  const fallbackScannerFactory = fallbackFactory;
  return {
    detect: async (image: unknown) => {
      try {
        const nativeDetections = await nativeDetector.detect(image);
        const hasNativeValue = rawDetectionValues(nativeDetections).length > 0;
        if (hasNativeValue) {
          return fallbackScannerFactory
            ? detectWithFallbackAfterIgnoredNative({
                nativeDetections,
                image,
                fallbackFactory: fallbackScannerFactory,
              })
            : nativeDetections;
        }
      } catch (error) {
        if (!fallbackScannerFactory) {
          throw error;
        }
      }
      const fallbackScanner = await fallbackScannerFactory?.();
      return fallbackScanner?.detect(image) ?? [];
    },
  };
}

export function bambuFilamentCodeImageScanAvailable(
  dependencies: BambuFilamentCodeImageScanDependencies = {},
): boolean {
  const detector = resolveBarcodeDetector(dependencies);
  const createBitmap = resolveCreateImageBitmap(dependencies);
  const fallbackScanner = resolveFallbackBarcodeScanner(dependencies);
  return (
    (typeof detector === "function" || Boolean(fallbackScanner)) &&
    typeof createBitmap === "function"
  );
}

export async function scanBambuFilamentCodesFromImage(input: {
  currentInput: string;
  file: Blob;
  dependencies?: BambuFilamentCodeImageScanDependencies;
}): Promise<BambuFilamentCodeImageScanResult> {
  const dependencies = input.dependencies ?? {};
  const createBitmap = resolveCreateImageBitmap(dependencies);

  if (!bambuFilamentCodeImageScanAvailable(dependencies) || typeof createBitmap !== "function") {
    return {
      status: "unsupported",
      rawValues: [],
      appendedLines: [],
      append: null,
    };
  }

  const bitmap = await createBitmap(input.file);
  try {
    const scanner = await createBambuFilamentBarcodeScanner(dependencies);
    if (!scanner) {
      return {
        status: "unsupported",
        rawValues: [],
        appendedLines: [],
        append: null,
      };
    }

    const rawValues = (await scanner.detect(bitmap))
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
