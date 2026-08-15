import QRCode from "qrcode";
import { formatSpoolReference } from "./display_format";
import {
  FILAMENT_LABEL_DPI,
  filamentLabelPixelSize,
  resolveFilamentLabelSize,
  type FilamentLabelSizeInput,
} from "./filament_label_profiles";

type QrEncoder = {
  toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
};

export type FilamentLabelImageInput = {
  vendor: string;
  material: string;
  filamentName: string;
  colorName?: string | null;
  reference: string;
  qrDataUrl: string;
};

type FilamentLabelCanvasDependencies = {
  createCanvas?: () => HTMLCanvasElement;
  loadImage?: (dataUrl: string) => Promise<CanvasImageSource>;
};

const QR_QUIET_ZONE_MODULES = 4;
const QR_SOURCE_MODULE_SCALE = 12;

function defaultCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function loadCanvasImage(dataUrl: string): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the label QR image."));
    image.src = dataUrl;
  });
}

function fitCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  const normalized = value.trim();
  if (context.measureText(normalized).width <= maxWidth) {
    return normalized;
  }
  let clipped = normalized;
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripRepeatedLabelPrefix(value: string, prefix: string): string {
  const normalizedValue = value.trim();
  const normalizedPrefix = prefix.trim();
  if (!normalizedValue || !normalizedPrefix) {
    return normalizedValue;
  }
  return normalizedValue
    .replace(
      new RegExp(`^${escapeRegExp(normalizedPrefix)}(?:\\s*[\u00b7:|/-]\\s*|\\s+)`, "i"),
      "",
    )
    .trim();
}

function labelVendor(value: string): string {
  return /^bambu$/i.test(value.trim()) ? "Bambu Lab" : value.trim();
}

export function buildFilamentLabelTextLines(input: FilamentLabelImageInput): {
  vendor: string;
  identityLines: string[];
  material: string;
  reference: string;
} {
  const material = input.material.trim();
  const filamentName = input.filamentName.trim();
  const rawColor = input.colorName?.trim() || "";
  const series = stripRepeatedLabelPrefix(filamentName, material);
  const colorWithoutMaterial = stripRepeatedLabelPrefix(rawColor, material);
  const colorWithoutFilament = stripRepeatedLabelPrefix(colorWithoutMaterial, filamentName);
  const color = stripRepeatedLabelPrefix(colorWithoutFilament, series);
  const identityLines = [series, color || colorWithoutFilament || colorWithoutMaterial || rawColor]
    .map((value) => value.trim())
    .filter(
      (value, index, values) =>
        Boolean(value) &&
        value.toLocaleLowerCase() !== material.toLocaleLowerCase() &&
        values.findIndex(
          (candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
        ) === index,
    );
  return {
    vendor: labelVendor(input.vendor),
    identityLines: identityLines.length > 0 ? identityLines : [filamentName || material],
    material,
    reference: formatSpoolReference(input.reference),
  };
}

function fittedCanvasFontSize(input: {
  context: CanvasRenderingContext2D;
  maxWidth: number;
  minimumSize: number;
  preferredSize: number;
  text: string;
  weight: number;
}): number {
  let size = input.preferredSize;
  while (size > input.minimumSize) {
    input.context.font = `${input.weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    if (input.context.measureText(input.text).width <= input.maxWidth) {
      break;
    }
    size -= 1;
  }
  return size;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function canvasImageDimension(
  image: CanvasImageSource,
  candidates: readonly string[],
): number | null {
  const record = image as unknown as Record<string, unknown>;
  for (const candidate of candidates) {
    const value = record[candidate];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function crispQrDrawSize(image: CanvasImageSource, maximumSize: number): number {
  const sourceWidth = canvasImageDimension(image, ["naturalWidth", "videoWidth", "width"]);
  const sourceHeight = canvasImageDimension(image, ["naturalHeight", "videoHeight", "height"]);
  if (!sourceWidth || !sourceHeight || Math.abs(sourceWidth - sourceHeight) > 0.01) {
    return maximumSize;
  }

  const moduleGridSize = sourceWidth / QR_SOURCE_MODULE_SCALE;
  if (
    Math.abs(moduleGridSize - Math.round(moduleGridSize)) > 0.01 ||
    moduleGridSize < QR_QUIET_ZONE_MODULES * 2 + 21
  ) {
    return maximumSize;
  }

  const targetModuleScale = Math.floor(maximumSize / Math.round(moduleGridSize));
  return targetModuleScale > 0
    ? Math.round(moduleGridSize) * targetModuleScale
    : maximumSize;
}

type LabelTextLine = {
  gapBefore: number;
  size: number;
  text: string;
  weight: number;
};

function verticallyFitTextLines(
  lines: LabelTextLine[],
  maximumHeight: number,
): LabelTextLine[] {
  const totalHeight = lines.reduce(
    (height, line) => height + line.gapBefore + line.size,
    0,
  );
  if (totalHeight <= maximumHeight) {
    return lines;
  }
  const scale = maximumHeight / totalHeight;
  return lines.map((line) => ({
    ...line,
    gapBefore: Math.max(0, Math.floor(line.gapBefore * scale)),
    size: Math.max(1, Math.floor(line.size * scale)),
  }));
}

export async function buildFilamentLabelPngDataUrl(
  input: FilamentLabelImageInput,
  sizeInput: FilamentLabelSizeInput,
  dependencies: FilamentLabelCanvasDependencies = {},
): Promise<string> {
  const labelSize = resolveFilamentLabelSize(sizeInput);
  const size = filamentLabelPixelSize(labelSize);
  const canvas = (dependencies.createCanvas ?? defaultCanvas)();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable for label export.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);

  const pxPerMm = FILAMENT_LABEL_DPI / 25.4;
  const outerPadding = Math.max(8, Math.round(0.8 * pxPerMm));
  const qrColumnSize = size.height - outerPadding * 2;
  const qrImage = await (dependencies.loadImage ?? loadCanvasImage)(input.qrDataUrl);
  const qrSize = crispQrDrawSize(qrImage, qrColumnSize);
  const qrInset = Math.floor((qrColumnSize - qrSize) / 2);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    qrImage,
    outerPadding + qrInset,
    outerPadding + qrInset,
    qrSize,
    qrSize,
  );

  const textLeft = outerPadding + qrColumnSize + Math.round(0.8 * pxPerMm);
  const textWidth = size.width - textLeft - outerPadding;
  const text = buildFilamentLabelTextLines(input);
  const availableTextHeight = size.height - outerPadding * 2;
  const identityCount = text.identityLines.length;
  const lineGap = Math.max(
    4,
    Math.round(clamp(labelSize.heightMm * 0.018, 0.45, 1.4) * pxPerMm),
  );
  const weightedLineCount = 1.25 + identityCount + 0.9 + 0.9;
  const gapBudget = lineGap * (identityCount + 3.6);
  const adaptiveBasePx = Math.max(
    1,
    (availableTextHeight - gapBudget) / weightedLineCount,
  );
  const titlePx = Math.round(
    clamp((adaptiveBasePx * 1.25) / pxPerMm, 3.5, 10) * pxPerMm,
  );
  const identityPreferredPx = Math.round(
    clamp(adaptiveBasePx / pxPerMm, 2.65, 8) * pxPerMm,
  );
  const detailPx = Math.round(
    clamp((adaptiveBasePx * 0.9) / pxPerMm, 2.4, 7) * pxPerMm,
  );
  const vendorPx = fittedCanvasFontSize({
    context,
    text: text.vendor,
    maxWidth: textWidth,
    preferredSize: titlePx,
    minimumSize: Math.max(Math.round(2.4 * pxPerMm), Math.round(titlePx * 0.55)),
    weight: 800,
  });
  const identityLines = text.identityLines.map((identity) => ({
    text: identity,
    size: fittedCanvasFontSize({
      context,
      text: identity,
      maxWidth: textWidth,
      preferredSize: identityPreferredPx,
      minimumSize: Math.max(Math.round(2.1 * pxPerMm), Math.round(identityPreferredPx * 0.55)),
      weight: 600,
    }),
    weight: 600,
  }));
  const detailMinimumPx = Math.max(
    Math.round(2 * pxPerMm),
    Math.round(detailPx * 0.55),
  );
  const materialPx = fittedCanvasFontSize({
    context,
    text: text.material,
    maxWidth: textWidth,
    preferredSize: detailPx,
    minimumSize: detailMinimumPx,
    weight: 600,
  });
  const referencePx = fittedCanvasFontSize({
    context,
    text: text.reference,
    maxWidth: textWidth,
    preferredSize: detailPx,
    minimumSize: detailMinimumPx,
    weight: 700,
  });
  const lines = verticallyFitTextLines([
    { text: text.vendor, size: vendorPx, weight: 800, gapBefore: 0 },
    ...identityLines.map((line) => ({ ...line, gapBefore: lineGap })),
    { text: text.material, size: materialPx, weight: 600, gapBefore: lineGap },
    {
      text: text.reference,
      size: referencePx,
      weight: 700,
      gapBefore: Math.round(lineGap * 1.6),
    },
  ], availableTextHeight);
  const textBlockHeight = lines.reduce(
    (height, line) => height + line.gapBefore + line.size,
    0,
  );
  let baseline = outerPadding + Math.max(0, Math.floor((availableTextHeight - textBlockHeight) / 2));

  context.fillStyle = "#000000";
  context.textBaseline = "alphabetic";
  for (const line of lines) {
    baseline += line.gapBefore + line.size;
    context.font = `${line.weight} ${line.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.fillText(fitCanvasText(context, line.text, textWidth), textLeft, baseline);
  }

  return canvas.toDataURL("image/png");
}

export async function buildFilamentLabelQrDataUrl(
  payload: string,
  qrEncoder: QrEncoder = QRCode,
): Promise<string> {
  const normalized = payload.trim();
  if (!normalized) {
    throw new Error("QR payload is required to render label QR.");
  }
  return qrEncoder.toDataURL(normalized, {
    errorCorrectionLevel: "H",
    margin: QR_QUIET_ZONE_MODULES,
    scale: QR_SOURCE_MODULE_SCALE,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
