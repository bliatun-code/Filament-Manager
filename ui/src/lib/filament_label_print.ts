import QRCode from "qrcode";
import { formatSpoolReference } from "./display_format";
import {
  filamentLabelPixelSize,
  filamentLabelProfile,
  type FilamentLabelProfileId,
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

const LABEL_DPI = 300;

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

export async function buildFilamentLabelPngDataUrl(
  input: FilamentLabelImageInput,
  profileId: FilamentLabelProfileId,
  dependencies: FilamentLabelCanvasDependencies = {},
): Promise<string> {
  const profile = filamentLabelProfile(profileId);
  const size = filamentLabelPixelSize(profileId);
  const canvas = (dependencies.createCanvas ?? defaultCanvas)();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable for label export.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);

  const pxPerMm = LABEL_DPI / 25.4;
  const outerPadding = Math.max(8, Math.round(0.8 * pxPerMm));
  const qrSize = size.height - outerPadding * 2;
  const qrImage = await (dependencies.loadImage ?? loadCanvasImage)(input.qrDataUrl);
  context.imageSmoothingEnabled = false;
  context.drawImage(qrImage, outerPadding, outerPadding, qrSize, qrSize);

  const textLeft = outerPadding + qrSize + Math.round(1.6 * pxPerMm);
  const textWidth = size.width - textLeft - outerPadding;
  const text = buildFilamentLabelTextLines(input);
  const lineGap = Math.round(0.8 * pxPerMm);
  const titlePx = Math.max(30, Math.round((profile.heightMm >= 30 ? 4.1 : 3.5) * pxPerMm));
  const identityPreferredPx = Math.max(
    24,
    Math.round((profile.heightMm >= 30 ? 3.1 : 2.65) * pxPerMm),
  );
  const detailPx = Math.max(21, Math.round((profile.heightMm >= 30 ? 2.8 : 2.4) * pxPerMm));
  const vendorPx = fittedCanvasFontSize({
    context,
    text: text.vendor,
    maxWidth: textWidth,
    preferredSize: titlePx,
    minimumSize: detailPx,
    weight: 800,
  });
  const identityLines = text.identityLines.map((identity) => ({
    text: identity,
    size: fittedCanvasFontSize({
      context,
      text: identity,
      maxWidth: textWidth,
      preferredSize: identityPreferredPx,
      minimumSize: Math.max(20, detailPx - 4),
      weight: 600,
    }),
    weight: 600,
  }));
  const lines = [
    { text: text.vendor, size: vendorPx, weight: 800, gapBefore: 0 },
    ...identityLines.map((line) => ({ ...line, gapBefore: 0 })),
    { text: text.material, size: detailPx, weight: 600, gapBefore: 0 },
    { text: text.reference, size: detailPx, weight: 700, gapBefore: lineGap },
  ];
  let baseline = outerPadding + vendorPx;

  context.fillStyle = "#000000";
  context.textBaseline = "alphabetic";
  for (const line of lines) {
    baseline += line.gapBefore;
    context.font = `${line.weight} ${line.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.fillText(fitCanvasText(context, line.text, textWidth), textLeft, baseline);
    baseline += line.size + lineGap;
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
    margin: 2,
    width: 512,
    color: {
      dark: "#0f172a",
      light: "#ffffffff",
    },
  });
}
