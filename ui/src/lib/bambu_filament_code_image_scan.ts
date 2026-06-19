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

const BAMBU_FILAMENT_LINEAR_BARCODE_FORMATS = [
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

type BarcodeScanCropSpec = {
  enhance?: boolean;
  height: number;
  scale?: number;
  width: number;
  x: number;
  y: number;
};

const MAX_BARCODE_SCAN_CANVAS_WIDTH = 1600;
const BARCODE_SCAN_CROP_SPECS: BarcodeScanCropSpec[] = [
  { x: 0.04, y: 0.32, width: 0.92, height: 0.34, scale: 1.35 },
  { x: 0.04, y: 0.5, width: 0.92, height: 0.34, scale: 1.45 },
  { x: 0.04, y: 0.16, width: 0.92, height: 0.34, scale: 1.35 },
  { x: 0.12, y: 0.24, width: 0.76, height: 0.5, scale: 1.55 },
  { x: 0.04, y: 0.32, width: 0.92, height: 0.34, scale: 1.45, enhance: true },
  { x: 0.04, y: 0.5, width: 0.92, height: 0.34, scale: 1.55, enhance: true },
];

let zxingBarcodeScannerPromise: Promise<BambuFilamentBarcodeDetector | null> | null =
  null;

async function supportedBarcodeFormats(
  detectorConstructor: BambuFilamentBarcodeDetectorConstructor,
  requestedFormats: string[] = BAMBU_FILAMENT_BARCODE_FORMATS,
): Promise<string[]> {
  if (typeof detectorConstructor.getSupportedFormats !== "function") {
    return requestedFormats;
  }
  try {
    const supportedFormats = await detectorConstructor.getSupportedFormats();
    const supported = new Set(
      supportedFormats.map((format) => String(format).trim()).filter(Boolean),
    );
    return requestedFormats.filter((format) => supported.has(format));
  } catch {
    return requestedFormats;
  }
}

async function createBambuFilamentBarcodeDetectorForFormats(
  detectorConstructor: BambuFilamentBarcodeDetectorConstructor,
  requestedFormats: string[] = BAMBU_FILAMENT_BARCODE_FORMATS,
  settings: { fallbackToUnfiltered?: boolean } = {},
): Promise<BambuFilamentBarcodeDetector | null> {
  const formats = await supportedBarcodeFormats(detectorConstructor, requestedFormats);
  if (requestedFormats.length > 0 && formats.length === 0) {
    return null;
  }

  const detectorOptions = formats.length > 0 ? { formats } : undefined;
  try {
    return new detectorConstructor(detectorOptions);
  } catch (error) {
    if (detectorOptions && settings.fallbackToUnfiltered !== false) {
      return new detectorConstructor();
    }
    if (detectorOptions) {
      return null;
    }
    throw error;
  }
}

export async function createBambuFilamentBarcodeDetector(
  detectorConstructor: BambuFilamentBarcodeDetectorConstructor,
): Promise<BambuFilamentBarcodeDetector> {
  const detector = await createBambuFilamentBarcodeDetectorForFormats(
    detectorConstructor,
  );
  if (!detector) {
    return new detectorConstructor();
  }
  return detector;
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

function clampBarcodeCropValue(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createBarcodeScanCropCanvas(
  source: HTMLCanvasElement,
  spec: BarcodeScanCropSpec,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cropX = clampBarcodeCropValue(spec.x);
  const cropY = clampBarcodeCropValue(spec.y);
  const cropWidth = clampBarcodeCropValue(spec.width);
  const cropHeight = clampBarcodeCropValue(spec.height);
  const sx = Math.round(source.width * cropX);
  const sy = Math.round(source.height * cropY);
  const sw = Math.max(1, Math.round(source.width * cropWidth));
  const sh = Math.max(1, Math.round(source.height * cropHeight));
  const boundedSw = Math.max(1, Math.min(sw, source.width - sx));
  const boundedSh = Math.max(1, Math.min(sh, source.height - sy));
  const scale = spec.scale ?? 1;
  let targetWidth = Math.max(1, Math.round(boundedSw * scale));
  let targetHeight = Math.max(1, Math.round(boundedSh * scale));
  if (targetWidth > MAX_BARCODE_SCAN_CANVAS_WIDTH) {
    const resize = MAX_BARCODE_SCAN_CANVAS_WIDTH / targetWidth;
    targetWidth = MAX_BARCODE_SCAN_CANVAS_WIDTH;
    targetHeight = Math.max(1, Math.round(targetHeight * resize));
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = false;
  if (spec.enhance) {
    context.filter = "grayscale(100%) contrast(190%) brightness(108%)";
  }
  context.drawImage(
    source,
    sx,
    sy,
    boundedSw,
    boundedSh,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return canvas;
}

function createBarcodeScanCandidateCanvases(
  source: HTMLCanvasElement,
): HTMLCanvasElement[] {
  const candidates = [source];
  for (const spec of BARCODE_SCAN_CROP_SPECS) {
    const crop = createBarcodeScanCropCanvas(source, spec);
    if (crop) {
      candidates.push(crop);
    }
  }
  return candidates;
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
  zxingCore: typeof import("@zxing/library"),
  keys: readonly string[],
  options: { tryHarder?: boolean } = {},
): import("@zxing/browser").BrowserMultiFormatReader {
  const hints = new Map();
  const formats = zxingFormats(zxing, keys);
  hints.set(zxingCore.DecodeHintType.POSSIBLE_FORMATS, formats);
  if (options.tryHarder) {
    hints.set(zxingCore.DecodeHintType.TRY_HARDER, true);
  }
  const reader = new zxing.BrowserMultiFormatReader(hints);
  reader.possibleFormats = formats;
  return reader;
}

function decodeZxingCanvasCandidates(input: {
  canvases: HTMLCanvasElement[];
  readers: import("@zxing/browser").BrowserMultiFormatReader[];
}): BambuFilamentBarcodeDetection[] | null {
  let lastMiss: unknown = null;
  for (const reader of input.readers) {
    for (const canvas of input.canvases) {
      try {
        const result = reader.decodeFromCanvas(canvas);
        return normalizeZxingResult(result);
      } catch (error) {
        if (isBambuFilamentBarcodeDecodeMiss(error)) {
          lastMiss = error;
          continue;
        }
        throw error;
      }
    }
  }
  return lastMiss ? [] : null;
}

function decodeZxingImage(input: {
  image: HTMLImageElement | HTMLVideoElement;
  readers: import("@zxing/browser").BrowserMultiFormatReader[];
}): BambuFilamentBarcodeDetection[] {
  let lastMiss: unknown = null;
  for (const reader of input.readers) {
    try {
      const result = reader.decode(input.image);
      return normalizeZxingResult(result);
    } catch (error) {
      if (isBambuFilamentBarcodeDecodeMiss(error)) {
        lastMiss = error;
        continue;
      }
      throw error;
    }
  }
  return lastMiss ? [] : [];
}

function rawDetectionValues(detections: BambuFilamentBarcodeDetection[]): string[] {
  return detections
    .map((detection) => String(detection.rawValue ?? "").trim())
    .filter(Boolean);
}

function appendUniqueBarcodeDetections(
  base: BambuFilamentBarcodeDetection[],
  additions: BambuFilamentBarcodeDetection[],
): BambuFilamentBarcodeDetection[] {
  const seen = new Set(rawDetectionValues(base));
  const next = [...base];
  for (const detection of additions) {
    const rawValue = String(detection.rawValue ?? "").trim();
    if (!rawValue || seen.has(rawValue)) {
      continue;
    }
    seen.add(rawValue);
    next.push(detection);
  }
  return next;
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
    const zxingCore = await import("@zxing/library");
    const linearReader = createZxingReader(
      zxing,
      zxingCore,
      ZXING_LINEAR_BARCODE_FORMAT_KEYS,
      { tryHarder: true },
    );
    const matrixReader = createZxingReader(
      zxing,
      zxingCore,
      ZXING_MATRIX_BARCODE_FORMAT_KEYS,
    );
    const broadReader = createZxingReader(zxing, zxingCore, ZXING_BARCODE_FORMAT_KEYS, {
      tryHarder: true,
    });

    return {
      detect: async (image: unknown) => {
        const canvas = createCanvasForBarcodeScan(image);
        if (canvas) {
          const candidates = createBarcodeScanCandidateCanvases(canvas);
          const linearDetections = decodeZxingCanvasCandidates({
            canvases: candidates,
            readers: [linearReader],
          });
          if (linearDetections && linearDetections.length > 0) {
            return linearDetections;
          }

          const fallbackDetections = decodeZxingCanvasCandidates({
            canvases: [canvas],
            readers: [matrixReader, broadReader],
          });
          return fallbackDetections ?? [];
        }

        return decodeZxingImage({
          image: image as HTMLImageElement | HTMLVideoElement,
          readers: [linearReader, matrixReader, broadReader],
        });
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
  const nativeDetectors: BambuFilamentBarcodeDetector[] = [];

  if (typeof detectorConstructor === "function") {
    try {
      const nativeLinearDetector = await createBambuFilamentBarcodeDetectorForFormats(
        detectorConstructor,
        BAMBU_FILAMENT_LINEAR_BARCODE_FORMATS,
        { fallbackToUnfiltered: false },
      );
      if (nativeLinearDetector) {
        nativeDetectors.push(nativeLinearDetector);
      }

      const nativeDetector = await createBambuFilamentBarcodeDetector(
        detectorConstructor,
      );
      nativeDetectors.push(nativeDetector);
    } catch (error) {
      if (!fallbackFactory) {
        throw error;
      }
    }
  }

  if (nativeDetectors.length === 0 && !fallbackFactory) {
    return null;
  }

  if (nativeDetectors.length === 0) {
    return fallbackFactory?.() ?? null;
  }

  const fallbackScannerFactory = fallbackFactory;
  return {
    detect: async (image: unknown) => {
      let ignoredNativeDetections: BambuFilamentBarcodeDetection[] = [];
      for (const nativeDetector of nativeDetectors) {
        try {
          const nativeDetections = await nativeDetector.detect(image);
          const hasNativeValue = rawDetectionValues(nativeDetections).length > 0;
          if (!hasNativeValue) {
            continue;
          }

          if (detectionsOnlyContainIgnoredValues(nativeDetections)) {
            ignoredNativeDetections = appendUniqueBarcodeDetections(
              ignoredNativeDetections,
              nativeDetections,
            );
            continue;
          }

          return nativeDetections;
        } catch (error) {
          if (!fallbackScannerFactory) {
            throw error;
          }
        }
      }

      const fallbackScanner = await fallbackScannerFactory?.();
      const fallbackDetections = (await fallbackScanner?.detect(image)) ?? [];
      if (
        ignoredNativeDetections.length > 0 &&
        rawDetectionValues(fallbackDetections).length === 0
      ) {
        return ignoredNativeDetections;
      }
      return ignoredNativeDetections.length > 0
        ? appendUniqueBarcodeDetections(ignoredNativeDetections, fallbackDetections)
        : fallbackDetections;
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
