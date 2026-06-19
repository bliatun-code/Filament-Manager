import {
  appendBambuFilamentCodeBatchScanValues,
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

export async function createZxingBambuFilamentBarcodeScanner(): Promise<BambuFilamentBarcodeDetector | null> {
  zxingBarcodeScannerPromise ??= (async () => {
    const zxing = await import("@zxing/browser");
    const reader = new zxing.BrowserMultiFormatReader();
    reader.possibleFormats = ZXING_BARCODE_FORMAT_KEYS.map(
      (key) => zxing.BarcodeFormat[key],
    ).filter((format): format is number => typeof format === "number");

    return {
      detect: async (image: unknown) => {
        try {
          const canvas = createCanvasForBarcodeScan(image);
          const result = canvas
            ? reader.decodeFromCanvas(canvas)
            : reader.decode(image as HTMLImageElement | HTMLVideoElement);
          return normalizeZxingResult(result);
        } catch (error) {
          if (isBambuFilamentBarcodeDecodeMiss(error)) {
            return [];
          }
          throw error;
        }
      },
    };
  })().catch(() => null);

  return zxingBarcodeScannerPromise;
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
        const hasNativeValue = nativeDetections.some((detection) =>
          String(detection.rawValue ?? "").trim(),
        );
        if (hasNativeValue || !fallbackScannerFactory) {
          return nativeDetections;
        }
      } catch (error) {
        if (!fallbackScannerFactory) {
          throw error;
        }
      }
      const fallbackScanner = await fallbackScannerFactory();
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
