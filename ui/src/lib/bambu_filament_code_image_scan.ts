import {
  appendBambuFilamentCodeBatchScanValues,
  isIgnoredBambuFilamentBatchScanValue,
  type BambuFilamentCodeBatchScanAppendResult,
} from "./bambu_filament_code_batch";
import { BAMBU_BOX_CODE_ALIASES } from "./bambu_filament_code_lookup";

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
const KNOWN_BAMBU_BOX_EAN_CANDIDATE_LIMIT = 6;
const KNOWN_BAMBU_BOX_EAN_MIN_RANK = 110;
const BARCODE_SCAN_CROP_SPECS: BarcodeScanCropSpec[] = [
  { x: 0.28, y: 0.3, width: 0.44, height: 0.28, scale: 2.5, enhance: true },
  { x: 0.32, y: 0.32, width: 0.36, height: 0.24, scale: 3, enhance: true },
  { x: 0.36, y: 0.34, width: 0.3, height: 0.22, scale: 3.3 },
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

const EAN13_FIRST_DIGIT_TO_PARITY: Record<string, string> = Object.fromEntries(
  Object.entries(EAN13_PARITY_TO_FIRST_DIGIT).map(([parity, digit]) => [
    digit,
    parity,
  ]),
);

const CODE128_KNOWN_PATTERNS: Record<number, readonly number[]> = {
  3: [1, 2, 1, 2, 2, 3],
  6: [1, 2, 2, 2, 1, 3],
  13: [1, 2, 2, 1, 3, 2],
  16: [1, 2, 3, 1, 2, 2],
  17: [1, 2, 3, 2, 2, 1],
  19: [2, 2, 1, 1, 3, 2],
  21: [2, 1, 3, 2, 1, 2],
  22: [2, 2, 3, 1, 1, 2],
  23: [3, 1, 2, 1, 3, 1],
  24: [3, 1, 1, 2, 2, 2],
  25: [3, 2, 1, 1, 2, 2],
  31: [2, 1, 2, 3, 2, 1],
  33: [1, 1, 1, 3, 2, 3],
  37: [1, 3, 2, 1, 1, 3],
  38: [1, 3, 2, 3, 1, 1],
  44: [1, 3, 2, 1, 3, 1],
  53: [2, 1, 3, 1, 3, 1],
  63: [1, 1, 1, 2, 2, 4],
  69: [1, 1, 2, 2, 1, 4],
  70: [1, 1, 2, 4, 1, 2],
  75: [2, 4, 1, 2, 1, 1],
  86: [4, 1, 1, 2, 1, 2],
  94: [1, 3, 1, 1, 4, 1],
  97: [4, 1, 1, 1, 1, 3],
  99: [1, 1, 3, 1, 4, 1],
  100: [1, 1, 4, 1, 3, 1],
  104: [2, 1, 1, 2, 1, 4],
  105: [2, 1, 1, 2, 3, 2],
  106: [2, 3, 3, 1, 1, 1, 2],
};

type KnownBambuBoxEanPattern = {
  bits: boolean[];
  code: string;
};

function ean13BitPatternForCode(code: string): boolean[] | null {
  if (!ean13ChecksumIsValid(code)) {
    return null;
  }

  const digits = code.split("");
  const parity = EAN13_FIRST_DIGIT_TO_PARITY[digits[0] ?? ""];
  if (!parity) {
    return null;
  }

  const pattern: string[] = ["101"];
  digits.slice(1, 7).forEach((digit, index) => {
    const digitIndex = Number(digit);
    pattern.push(
      parity[index] === "L"
        ? EAN13_LEFT_ODD_PATTERNS[digitIndex]
        : EAN13_LEFT_EVEN_PATTERNS[digitIndex],
    );
  });
  pattern.push("01010");
  digits.slice(7).forEach((digit) => {
    pattern.push(EAN13_RIGHT_PATTERNS[Number(digit)]);
  });
  pattern.push("101");

  return pattern
    .join("")
    .split("")
    .map((value) => value === "1");
}

function code128Checksum(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  let checksum = values[0] ?? 0;
  for (let index = 1; index < values.length; index += 1) {
    checksum += (values[index] ?? 0) * index;
  }
  return checksum % 103;
}

function code128BitsForValues(values: number[]): boolean[] | null {
  const bits: boolean[] = [];
  for (const value of values) {
    const widths = CODE128_KNOWN_PATTERNS[value];
    if (!widths) {
      return null;
    }

    let black = true;
    widths.forEach((width) => {
      for (let index = 0; index < width; index += 1) {
        bits.push(black);
      }
      black = !black;
    });
  }
  return bits;
}

function code128BValuesForNumericCode(code: string): number[] | null {
  if (!/^\d+$/.test(code)) {
    return null;
  }

  const values = [
    104,
    ...code.split("").map((digit) => digit.charCodeAt(0) - 32),
  ];
  const checksum = code128Checksum(values);
  return checksum === null ? null : [...values, checksum, 106];
}

function code128CValuesForEvenNumericCode(code: string): number[] | null {
  if (!/^\d+$/.test(code) || code.length % 2 !== 0) {
    return null;
  }

  const values = [
    105,
    ...Array.from(code.matchAll(/\d{2}/g), (match) => Number(match[0])),
  ];
  const checksum = code128Checksum(values);
  return checksum === null ? null : [...values, checksum, 106];
}

function code128HybridValuesForNumericCode(code: string): number[][] {
  if (!/^\d+$/.test(code) || code.length < 3 || code.length % 2 === 0) {
    return [];
  }

  const firstAsBThenC = [
    104,
    code.charCodeAt(0) - 32,
    99,
    ...Array.from(code.slice(1).matchAll(/\d{2}/g), (match) => Number(match[0])),
  ];
  const firstChecksum = code128Checksum(firstAsBThenC);
  const lastAsBAfterC = [
    105,
    ...Array.from(code.slice(0, -1).matchAll(/\d{2}/g), (match) => Number(match[0])),
    100,
    code.charCodeAt(code.length - 1) - 32,
  ];
  const lastChecksum = code128Checksum(lastAsBAfterC);
  return [
    firstChecksum === null ? null : [...firstAsBThenC, firstChecksum, 106],
    lastChecksum === null ? null : [...lastAsBAfterC, lastChecksum, 106],
  ].filter((values): values is number[] => Boolean(values));
}

function code128BitPatternsForNumericCode(code: string): boolean[][] {
  const values = [
    code128BValuesForNumericCode(code),
    code128CValuesForEvenNumericCode(code),
    /^\d+$/.test(code) && code.length % 2 !== 0
      ? code128CValuesForEvenNumericCode(`0${code}`)
      : null,
    ...code128HybridValuesForNumericCode(code),
  ].filter((candidate): candidate is number[] => Boolean(candidate));

  return values
    .map((candidate) => code128BitsForValues(candidate))
    .filter((bits): bits is boolean[] => Boolean(bits));
}

const KNOWN_BAMBU_BOX_EAN_PATTERNS: KnownBambuBoxEanPattern[] = Object.keys(
  BAMBU_BOX_CODE_ALIASES,
)
  .filter((code) => /^\d{13}$/.test(code))
  .flatMap((code) => {
    const ean13Bits = ean13BitPatternForCode(code);
    return [
      ean13Bits ? { code, bits: ean13Bits } : null,
      ...code128BitPatternsForNumericCode(code).map((bits) => ({ code, bits })),
    ];
  })
  .filter((pattern): pattern is KnownBambuBoxEanPattern => Boolean(pattern));

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

function prefixSums(values: number[]): number[] {
  const prefix = [0];
  values.forEach((value) => {
    prefix.push((prefix[prefix.length - 1] ?? 0) + value);
  });
  return prefix;
}

function averagePrefixRange(prefix: number[], start: number, end: number): number {
  const maxIndex = Math.max(0, prefix.length - 2);
  const boundedStart = Math.max(0, Math.min(maxIndex, Math.floor(start)));
  const boundedEnd = Math.max(
    boundedStart,
    Math.min(maxIndex, Math.ceil(end)),
  );
  const count = boundedEnd - boundedStart + 1;
  if (count <= 0) {
    return 0;
  }
  return ((prefix[boundedEnd + 1] ?? 0) - (prefix[boundedStart] ?? 0)) / count;
}

function barcodeKnownEanBandSpecs(height: number): Array<{ y0: number; y1: number }> {
  const specs: Array<{ y0: number; y1: number }> = [];
  const seen = new Set<string>();
  const bandHeights = [8, 12, 18, 26, 38].filter(
    (bandHeight) => bandHeight < height * 0.75,
  );
  const minY = Math.max(0, Math.floor(height * 0.18));
  const maxY = Math.min(height - 1, Math.ceil(height * 0.86));

  for (const bandHeight of bandHeights) {
    const step = Math.max(3, Math.floor(bandHeight / 2));
    for (let centerY = minY; centerY <= maxY; centerY += step) {
      const y0 = Math.max(0, centerY - Math.floor(bandHeight / 2));
      const y1 = Math.min(height - 1, centerY + Math.floor(bandHeight / 2));
      const key = `${y0}:${y1}`;
      if (!seen.has(key)) {
        seen.add(key);
        specs.push({ y0, y1 });
      }
    }
  }

  return specs;
}

function darkColumnAverages(input: {
  data: Uint8ClampedArray;
  width: number;
  y0: number;
  y1: number;
}): number[] {
  const columns: number[] = [];
  for (let x = 0; x < input.width; x += 1) {
    let total = 0;
    let count = 0;
    for (let y = input.y0; y <= input.y1; y += 1) {
      const offset = (y * input.width + x) * 4;
      total +=
        255 -
        luminanceFromRgb(
          input.data[offset] ?? 255,
          input.data[offset + 1] ?? 255,
          input.data[offset + 2] ?? 255,
        );
      count += 1;
    }
    columns.push(count > 0 ? total / count : 0);
  }
  return columns;
}

type KnownBambuBoxEanScore = {
  code: string;
  contrast: number;
  correlation: number;
  left: number;
  moduleWidth: number;
  quietContrast: number;
  rank: number;
};

type KnownBambuBoxEanPosition = {
  left: number;
  moduleCount: number;
  moduleWidth: number;
  rank: number;
};

function knownBambuBoxEanColumnPositions(columns: number[]): KnownBambuBoxEanPosition[] {
  if (columns.length < 120) {
    return [];
  }

  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let total = 0;
  columns.forEach((value) => {
    min = Math.min(min, value);
    max = Math.max(max, value);
    total += value;
  });

  const contrast = max - min;
  if (max < 36 || contrast < 24) {
    return [];
  }

  const mean = total / columns.length;
  const threshold = Math.max(mean + contrast * 0.12, min + contrast * 0.38);
  const maxGap = Math.max(4, Math.round(columns.length * 0.012));
  const minSpan = Math.max(76, Math.round(columns.length * 0.08));
  const maxSpan = Math.round(columns.length * 0.88);
  const spans: Array<{ end: number; rank: number; start: number }> = [];
  let start: number | null = null;
  let end = -1;
  let gap = 0;
  let darkTotal = 0;
  let darkCount = 0;

  const finishSpan = () => {
    if (start === null || end < start) {
      return;
    }
    const width = end - start + 1;
    if (width >= minSpan && width <= maxSpan && darkCount > 8) {
      const center = (start + end) / 2;
      const centrality = 1 - Math.min(1, Math.abs(center - columns.length / 2) / (columns.length / 2));
      spans.push({
        end,
        rank: (darkTotal / darkCount) * 0.7 + centrality * 24 + width * 0.02,
        start,
      });
    }
  };

  columns.forEach((value, index) => {
    if (value >= threshold) {
      if (start === null) {
        start = index;
      }
      end = index;
      gap = 0;
      darkTotal += value;
      darkCount += 1;
      return;
    }

    if (start !== null) {
      gap += 1;
      if (gap > maxGap) {
        end -= gap - 1;
        finishSpan();
        start = null;
        end = -1;
        gap = 0;
        darkTotal = 0;
        darkCount = 0;
      }
    }
  });
  finishSpan();

  const firstDark = columns.findIndex((value) => value >= threshold);
  let lastDark = -1;
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    if (columns[index] >= threshold) {
      lastDark = index;
      break;
    }
  }
  if (firstDark >= 0 && lastDark > firstDark) {
    const width = lastDark - firstDark + 1;
    if (width >= minSpan && width <= maxSpan) {
      spans.push({
        end: lastDark,
        rank: max * 0.45 + width * 0.01,
        start: firstDark,
      });
    }
  }

  const candidates: KnownBambuBoxEanPosition[] = [];
  const seen = new Set<string>();
  const moduleCounts = Array.from(
    new Set(KNOWN_BAMBU_BOX_EAN_PATTERNS.map((pattern) => pattern.bits.length)),
  );
  const addCandidate = (
    left: number,
    moduleCount: number,
    moduleWidth: number,
    rank: number,
  ) => {
    if (
      moduleWidth < 1.35 ||
      moduleWidth > Math.min(9, columns.length / moduleCount) ||
      left < 0 ||
      left + moduleWidth * moduleCount > columns.length
    ) {
      return;
    }
    const key = `${moduleCount}:${Math.round(left * 2) / 2}:${
      Math.round(moduleWidth * 100) / 100
    }`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ left, moduleCount, moduleWidth, rank });
  };

  spans
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 8)
    .forEach((span) => {
      const spanWidth = span.end - span.start + 1;
      const center = (span.start + span.end) / 2;
      for (const moduleCount of moduleCounts) {
        for (const widthScale of [1, 0.97, 1.03, 0.94, 1.06, 0.9, 1.1]) {
          const moduleWidth = (spanWidth * widthScale) / moduleCount;
          const barcodeWidth = moduleWidth * moduleCount;
          const centeredLeft = center - barcodeWidth / 2;
          for (const offsetModules of [0, -0.6, 0.6, -1.2, 1.2]) {
            addCandidate(
              centeredLeft + offsetModules * moduleWidth,
              moduleCount,
              moduleWidth,
              span.rank,
            );
          }
        }
      }
    });

  return candidates.sort((a, b) => b.rank - a.rank).slice(0, 96);
}

function scoreKnownBambuBoxEanPattern(input: {
  left: number;
  moduleWidth: number;
  pattern: KnownBambuBoxEanPattern;
  prefix: number[];
}): KnownBambuBoxEanScore | null {
  const moduleValues: number[] = [];
  let blackTotal = 0;
  let blackCount = 0;
  let whiteTotal = 0;
  let whiteCount = 0;

  for (let moduleIndex = 0; moduleIndex < input.pattern.bits.length; moduleIndex += 1) {
    const start = input.left + (moduleIndex + 0.24) * input.moduleWidth;
    const end = input.left + (moduleIndex + 0.76) * input.moduleWidth;
    const value = averagePrefixRange(input.prefix, start, end);
    moduleValues.push(value);
    if (input.pattern.bits[moduleIndex]) {
      blackTotal += value;
      blackCount += 1;
    } else {
      whiteTotal += value;
      whiteCount += 1;
    }
  }

  if (blackCount === 0 || whiteCount === 0) {
    return null;
  }

  const blackMean = blackTotal / blackCount;
  const whiteMean = whiteTotal / whiteCount;
  const leftQuiet = averagePrefixRange(
    input.prefix,
    input.left - input.moduleWidth * 8,
    input.left - input.moduleWidth,
  );
  const rightQuiet = averagePrefixRange(
    input.prefix,
    input.left + input.moduleWidth * (input.pattern.bits.length + 1),
    input.left + input.moduleWidth * (input.pattern.bits.length + 8),
  );
  const quietMean = (leftQuiet + rightQuiet) / 2;
  const contrast = blackMean - whiteMean;
  const quietContrast = blackMean - quietMean;

  const moduleMean =
    moduleValues.reduce((total, value) => total + value, 0) / moduleValues.length;
  let numerator = 0;
  let expectedMagnitude = 0;
  let actualMagnitude = 0;
  for (let index = 0; index < input.pattern.bits.length; index += 1) {
    const expected = input.pattern.bits[index] ? 1 : -1;
    const actual = (moduleValues[index] ?? 0) - moduleMean;
    numerator += expected * actual;
    expectedMagnitude += expected * expected;
    actualMagnitude += actual * actual;
  }
  const correlation =
    actualMagnitude > 0
      ? numerator / Math.sqrt(expectedMagnitude * actualMagnitude)
      : 0;
  const rank = contrast * 1.8 + correlation * 45 + Math.max(0, quietContrast) * 0.8;

  if (
    contrast < 22 ||
    correlation < 0.22 ||
    quietContrast < 45 ||
    rank < KNOWN_BAMBU_BOX_EAN_MIN_RANK
  ) {
    return null;
  }

  return {
    code: input.pattern.code,
    contrast,
    correlation,
    left: input.left,
    moduleWidth: input.moduleWidth,
    quietContrast,
    rank,
  };
}

function scoreKnownBambuBoxEanColumns(input: {
  best: KnownBambuBoxEanScore | null;
  columns: number[];
}): KnownBambuBoxEanScore | null {
  const prefix = prefixSums(input.columns);
  const positions = knownBambuBoxEanColumnPositions(input.columns);
  let best = input.best;
  for (const position of positions) {
    for (const pattern of KNOWN_BAMBU_BOX_EAN_PATTERNS) {
      if (pattern.bits.length !== position.moduleCount) {
        continue;
      }
      const score = scoreKnownBambuBoxEanPattern({
        left: position.left,
        moduleWidth: position.moduleWidth,
        pattern,
        prefix,
      });
      if (score && (!best || score.rank > best.rank)) {
        best = score;
      }
    }
  }
  return best;
}

export function detectKnownBambuBoxEanFromCanvas(
  canvas: Pick<HTMLCanvasElement, "getContext" | "height" | "width">,
): string | null {
  if (
    KNOWN_BAMBU_BOX_EAN_PATTERNS.length === 0 ||
    canvas.width < 120 ||
    canvas.height < 32
  ) {
    return null;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let best: KnownBambuBoxEanScore | null = null;
  const maxModuleWidth = Math.min(9, canvas.width / 95);
  const minModuleWidth = 1.35;
  if (maxModuleWidth < minModuleWidth) {
    return null;
  }

  for (const band of barcodeKnownEanBandSpecs(canvas.height)) {
    const columns = darkColumnAverages({
      data,
      width: canvas.width,
      y0: band.y0,
      y1: band.y1,
    });
    best = scoreKnownBambuBoxEanColumns({ best, columns });
    const currentBest = best as KnownBambuBoxEanScore | null;
    if (currentBest && currentBest.rank >= KNOWN_BAMBU_BOX_EAN_MIN_RANK + 16) {
      return currentBest.code;
    }
    best = scoreKnownBambuBoxEanColumns({
      best,
      columns: [...columns].reverse(),
    });
    const mirroredBest = best as KnownBambuBoxEanScore | null;
    if (mirroredBest && mirroredBest.rank >= KNOWN_BAMBU_BOX_EAN_MIN_RANK + 16) {
      return mirroredBest.code;
    }
  }

  return (best as KnownBambuBoxEanScore | null)?.code ?? null;
}

function detectKnownBambuBoxEanFromBarcodeCanvasCandidates(
  canvases: HTMLCanvasElement[],
): BambuFilamentBarcodeDetection[] {
  const scanCanvases =
    canvases.length > 1
      ? canvases.slice(1, KNOWN_BAMBU_BOX_EAN_CANDIDATE_LIMIT + 1)
      : canvases;
  for (const canvas of scanCanvases) {
    const ean13 = detectKnownBambuBoxEanFromCanvas(canvas);
    if (ean13) {
      return [{ rawValue: ean13 }];
    }
  }
  return [];
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
  return detectKnownBambuBoxEanFromBarcodeCanvasCandidates(canvases);
}

export function createFastBambuFilamentBoxBarcodeScanner(): BambuFilamentBarcodeDetector {
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
      return createFastBambuFilamentBoxBarcodeScanner();
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
  })().catch(() => createFastBambuFilamentBoxBarcodeScanner());

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
