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
  const title = input.colorName?.trim() || input.filamentName.trim();
  const materialLine = [input.material.trim(), input.filamentName.trim()]
    .filter(Boolean)
    .join(" · ");
  const reference = formatSpoolReference(input.reference);
  const lineGap = Math.round(0.8 * pxPerMm);
  const titlePx = Math.max(30, Math.round((profile.heightMm >= 30 ? 4.1 : 3.5) * pxPerMm));
  const detailPx = Math.max(21, Math.round((profile.heightMm >= 30 ? 2.8 : 2.4) * pxPerMm));
  const lines = [
    { text: title, size: titlePx, weight: 800 },
    { text: materialLine, size: detailPx, weight: 700 },
    { text: input.vendor, size: detailPx, weight: 500 },
    { text: reference, size: detailPx, weight: 700 },
  ];
  const contentHeight = lines.reduce((sum, line) => sum + line.size, 0) + lineGap * 3;
  let baseline = Math.max(outerPadding + titlePx, Math.round((size.height - contentHeight) / 2) + titlePx);

  context.fillStyle = "#000000";
  context.textBaseline = "alphabetic";
  for (const line of lines) {
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
