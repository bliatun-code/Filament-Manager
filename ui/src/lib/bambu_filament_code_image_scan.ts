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
const NATIVE_BARCODE_CROP_CANDIDATE_LIMIT = 6;
const BARCODE_SCAN_CROP_SPECS: BarcodeScanCropSpec[] = [
  { x: 0.24, y: 0.42, width: 0.52, height: 0.26, scale: 2.1 },
  { x: 0.26, y: 0.46, width: 0.48, height: 0.24, scale: 2.4, enhance: true },
  { x: 0.3, y: 0.46, width: 0.4, height: 0.24, scale: 2.8 },
  { x: 0.3, y: 0.5, width: 0.4, height: 0.2, scale: 3, enhance: true },
  { x: 0.04, y: 0.32, width: 0.92, height: 0.34, scale: 1.35 },
  { x: 0.04, y: 0.5, width: 0.92, height: 0.34, scale: 1.45 },
  { x: 0.04, y: 0.16, width: 0.92, height: 0.34, scale: 1.35 },
  { x: 0.12, y: 0.24, width: 0.76, height: 0.5, scale: 1.55 },
  { x: 0.04, y: 0.32, width: 0.92, height: 0.34, scale: 1.45, enhance: true },
  { x: 0.04, y: 0.5, width: 0.92, height: 0.34, scale: 1.55, enhance: true },
];

const EAN13_LEFT_ODD_PATTERNS = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
] as const;

const EAN13_LEFT_EVEN_PATTERNS = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
] as const;

const EAN13_RIGHT_PATTERNS = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
] as const;

const EAN13_PARITY_TO_FIRST_DIGIT: Record<string, string> = {
  LLLLLL: "0",
  LLGLGG: "1",
  LLGGLG: "2",
  LLGGGL: "3",
  LGLLGG: "4",
  LGGLLG: "5",
  LGGGLL: "6",
  LGLGLG: "7",
  LGLGGL: "8",
  LGGLGL: "9",
};

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

function luminanceFromRgb(red: number, green: number, blue: number): number {
  return Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
}

function otsuThreshold(values: number[]): number {
  const histogram = new Array<number>(256).fill(0);
  let min = 255;
  let max = 0;
  let total = 0;
  values.forEach((value) => {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    histogram[clamped] += 1;
    min = Math.min(min, clamped);
    max = Math.max(max, clamped);
    total += clamped;
  });

  if (max - min < 24) {
    return -1;
  }

  let backgroundWeight = 0;
  let backgroundTotal = 0;
  let bestVariance = -1;
  let bestThreshold = Math.round((min + max) / 2);
  for (let threshold = min; threshold <= max; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (backgroundWeight === 0) {
      continue;
    }
    const foregroundWeight = values.length - backgroundWeight;
    if (foregroundWeight === 0) {
      break;
    }

    backgroundTotal += threshold * histogram[threshold];
    const backgroundMean = backgroundTotal / backgroundWeight;
    const foregroundMean = (total - backgroundTotal) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) *
      (backgroundMean - foregroundMean);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }
  return bestThreshold;
}

type BinaryRun = {
  end: number;
  start: number;
  value: boolean;
};

function binaryRuns(row: boolean[]): BinaryRun[] {
  if (row.length === 0) {
    return [];
  }
  const runs: BinaryRun[] = [];
  let start = 0;
  let value = row[0];
  for (let index = 1; index < row.length; index += 1) {
    if (row[index] === value) {
      continue;
    }
    runs.push({ start, end: index - 1, value });
    start = index;
    value = row[index];
  }
  runs.push({ start, end: row.length - 1, value });
  return runs;
}

type BarcodeSpanCandidate = {
  left: number;
  right: number;
  score: number;
};

function barcodeSpanCandidates(row: boolean[]): BarcodeSpanCandidate[] {
  const runs = binaryRuns(row);
  const candidates: BarcodeSpanCandidate[] = [];
  const firstBlack = row.findIndex(Boolean);
  let lastBlack = -1;
  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (row[index]) {
      lastBlack = index;
      break;
    }
  }
  if (firstBlack >= 0 && lastBlack > firstBlack) {
    candidates.push({
      left: firstBlack,
      right: lastBlack,
      score: 0,
    });
  }

  const rowCenter = row.length / 2;
  for (let startIndex = 0; startIndex < runs.length; startIndex += 1) {
    const startRun = runs[startIndex];
    if (!startRun.value) {
      continue;
    }

    const maxEndIndex = Math.min(runs.length - 1, startIndex + 86);
    for (let endIndex = startIndex + 44; endIndex <= maxEndIndex; endIndex += 2) {
      const endRun = runs[endIndex];
      if (!endRun?.value) {
        continue;
      }
      const left = startRun.start;
      const right = endRun.end;
      const width = right - left + 1;
      if (width < 90 || width > row.length * 0.96) {
        continue;
      }

      const center = (left + right) / 2;
      const runCount = endIndex - startIndex + 1;
      candidates.push({
        left,
        right,
        score: Math.abs(center - rowCenter) + Math.abs(runCount - 59) * 4,
      });
    }
  }

  const unique = new Map<string, BarcodeSpanCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.left}:${candidate.right}`;
    const previous = unique.get(key);
    if (!previous || candidate.score < previous.score) {
      unique.set(key, candidate);
    }
  });

  return [...unique.values()].sort((a, b) => a.score - b.score).slice(0, 18);
}

function barcodeRowScanOrder(height: number): number[] {
  const rows: number[] = [];
  const seen = new Set<number>();
  const middle = Math.floor(height / 2);
  const step = Math.max(1, Math.floor(height / 80));
  const addRow = (row: number) => {
    if (row < 0 || row >= height || seen.has(row)) {
      return;
    }
    seen.add(row);
    rows.push(row);
  };

  for (let offset = 0; offset < height; offset += step) {
    addRow(middle + offset);
    addRow(middle - offset);
    if (rows.length >= 120) {
      break;
    }
  }
  return rows;
}

function patternDistance(bits: boolean[], pattern: string): number {
  let distance = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    if (bits[index] !== (pattern[index] === "1")) {
      distance += 1;
    }
  }
  return distance;
}

function sampleModulesFromBinaryRow(input: {
  left: number;
  moduleCount: number;
  right: number;
  row: boolean[];
}): boolean[] {
  const width = input.right - input.left + 1;
  const moduleWidth = width / input.moduleCount;
  const modules: boolean[] = [];
  for (let moduleIndex = 0; moduleIndex < input.moduleCount; moduleIndex += 1) {
    const sampleStart = Math.max(
      0,
      Math.floor(input.left + moduleIndex * moduleWidth + moduleWidth * 0.28),
    );
    const sampleEnd = Math.min(
      input.row.length - 1,
      Math.ceil(input.left + (moduleIndex + 1) * moduleWidth - moduleWidth * 0.28),
    );
    let blackSamples = 0;
    let totalSamples = 0;
    for (let x = sampleStart; x <= sampleEnd; x += 1) {
      blackSamples += input.row[x] ? 1 : 0;
      totalSamples += 1;
    }
    modules.push(totalSamples > 0 && blackSamples / totalSamples >= 0.5);
  }
  return modules;
}

function decodeEan13Digit(input: {
  bits: boolean[];
  patterns: readonly string[];
  type: "L" | "G" | "R";
}): { digit: string; errors: number; type: "L" | "G" | "R" } | null {
  const ranked = input.patterns
    .map((pattern, digit) => ({
      digit: String(digit),
      errors: patternDistance(input.bits, pattern),
      type: input.type,
    }))
    .sort((a, b) => a.errors - b.errors);
  const best = ranked[0];
  const next = ranked[1];
  if (!best || best.errors > 2 || (next && best.errors === next.errors)) {
    return null;
  }
  return best;
}

function ean13ChecksumIsValid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) {
    return false;
  }
  const digits = code.split("").map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (sum % 10)) % 10;
  return expected === digits[12];
}

function decodeEan13Modules(modules: boolean[]): string | null {
  if (modules.length !== 95) {
    return null;
  }

  const startGuard = modules.slice(0, 3);
  const middleGuard = modules.slice(45, 50);
  const endGuard = modules.slice(92, 95);
  if (
    patternDistance(startGuard, "101") > 1 ||
    patternDistance(middleGuard, "01010") > 1 ||
    patternDistance(endGuard, "101") > 1
  ) {
    return null;
  }

  const leftDigits: string[] = [];
  const rightDigits: string[] = [];
  const parity: string[] = [];
  let totalErrors = 0;

  for (let digitIndex = 0; digitIndex < 6; digitIndex += 1) {
    const bits = modules.slice(3 + digitIndex * 7, 3 + (digitIndex + 1) * 7);
    const odd = decodeEan13Digit({
      bits,
      patterns: EAN13_LEFT_ODD_PATTERNS,
      type: "L",
    });
    const even = decodeEan13Digit({
      bits,
      patterns: EAN13_LEFT_EVEN_PATTERNS,
      type: "G",
    });
    const best =
      odd && even ? (odd.errors <= even.errors ? odd : even) : odd ?? even;
    if (!best) {
      return null;
    }
    leftDigits.push(best.digit);
    parity.push(best.type);
    totalErrors += best.errors;
  }

  for (let digitIndex = 0; digitIndex < 6; digitIndex += 1) {
    const bits = modules.slice(50 + digitIndex * 7, 50 + (digitIndex + 1) * 7);
    const decoded = decodeEan13Digit({
      bits,
      patterns: EAN13_RIGHT_PATTERNS,
      type: "R",
    });
    if (!decoded) {
      return null;
    }
    rightDigits.push(decoded.digit);
    totalErrors += decoded.errors;
  }

  if (totalErrors > 10) {
    return null;
  }

  const firstDigit = EAN13_PARITY_TO_FIRST_DIGIT[parity.join("")];
  if (!firstDigit) {
    return null;
  }

  const code = `${firstDigit}${leftDigits.join("")}${rightDigits.join("")}`;
  return ean13ChecksumIsValid(code) ? code : null;
}

function decodeEan13FromBinaryRow(row: boolean[]): string | null {
  for (const span of barcodeSpanCandidates(row)) {
    const width = span.right - span.left + 1;
    const moduleWidth = width / 95;
    for (const padModules of [0, 0.35, -0.35, 0.7, -0.7, 1, -1]) {
      const pad = Math.round(moduleWidth * padModules);
      const left = Math.max(0, span.left - pad);
      const right = Math.min(row.length - 1, span.right + pad);
      if (right - left + 1 < 90) {
        continue;
      }

      const modules = sampleModulesFromBinaryRow({
        row,
        left,
        right,
        moduleCount: 95,
      });
      const code = decodeEan13Modules(modules);
      if (code) {
        return code;
      }
    }
  }
  return null;
}

export function decodeBambuEan13BarcodeFromCanvas(
  canvas: Pick<HTMLCanvasElement, "getContext" | "height" | "width">,
): string | null {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return null;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (const y of barcodeRowScanOrder(canvas.height)) {
    const luminance: number[] = [];
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      luminance.push(
        luminanceFromRgb(
          imageData[offset] ?? 255,
          imageData[offset + 1] ?? 255,
          imageData[offset + 2] ?? 255,
        ),
      );
    }

    const threshold = otsuThreshold(luminance);
    if (threshold < 0) {
      continue;
    }

    const binaryRow = luminance.map((value) => value <= threshold);
    const code = decodeEan13FromBinaryRow(binaryRow);
    if (code) {
      return code;
    }
  }

  return null;
}

function detectEan13FromBarcodeCanvasCandidates(
  canvases: HTMLCanvasElement[],
): BambuFilamentBarcodeDetection[] {
  for (const canvas of canvases) {
    const ean13 = decodeBambuEan13BarcodeFromCanvas(canvas);
    if (ean13) {
      return [{ rawValue: ean13 }];
    }
  }
  return [];
}

function createCanvasEan13BambuFilamentBarcodeScanner(): BambuFilamentBarcodeDetector {
  return {
    detect: async (image: unknown) => {
      const canvas = createCanvasForBarcodeScan(image);
      if (!canvas) {
        return [];
      }
      return detectEan13FromBarcodeCanvasCandidates(
        createBarcodeScanCandidateCanvases(canvas),
      );
    },
  };
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

async function detectWithNativeBarcodeDetectorCandidates(
  detector: BambuFilamentBarcodeDetector,
  image: unknown,
): Promise<BambuFilamentBarcodeDetection[]> {
  let detections = await detector.detect(image);
  const nativeValues = rawDetectionValues(detections);
  if (
    nativeValues.length > 0 &&
    nativeValues.some((value) => !isIgnoredBambuFilamentBatchScanValue(value))
  ) {
    return detections;
  }

  const canvas = createCanvasForBarcodeScan(image);
  if (!canvas) {
    return detections;
  }

  const cropCandidates = createBarcodeScanCandidateCanvases(canvas)
    .slice(1, NATIVE_BARCODE_CROP_CANDIDATE_LIMIT + 1);
  for (const candidate of cropCandidates) {
    const candidateDetections = await detector.detect(candidate);
    if (candidateDetections.length === 0) {
      continue;
    }

    detections = appendUniqueBarcodeDetections(detections, candidateDetections);
    if (
      rawDetectionValues(candidateDetections).some(
        (value) => !isIgnoredBambuFilamentBatchScanValue(value),
      )
    ) {
      return detections;
    }
  }

  return detections;
}

export async function createZxingBambuFilamentBarcodeScanner(): Promise<BambuFilamentBarcodeDetector | null> {
  zxingBarcodeScannerPromise ??= (async () => {
    let zxing: typeof import("@zxing/browser");
    let zxingCore: typeof import("@zxing/library");
    try {
      zxing = await import("@zxing/browser");
      zxingCore = await import("@zxing/library");
    } catch {
      return createCanvasEan13BambuFilamentBarcodeScanner();
    }

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

          const ean13Detections = detectEan13FromBarcodeCanvasCandidates(candidates);
          if (ean13Detections.length > 0) {
            return ean13Detections;
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
  })().catch(() => createCanvasEan13BambuFilamentBarcodeScanner());

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
          const nativeDetections = await detectWithNativeBarcodeDetectorCandidates(
            nativeDetector,
            image,
          );
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
