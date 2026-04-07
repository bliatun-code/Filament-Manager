import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatSpoolReference } from "./display_format";

export type InventoryOverviewPrintRow = {
  reference: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  swatchHex: string;
  qrDataUrl: string;
};

export type InventoryOverviewPrintLabels = {
  title: string;
  generatedAt: string;
  empty: string;
  groupMaterial: string;
  vendor: string;
  material: string;
  filament: string;
  color: string;
  reference: string;
};

const A4_LANDSCAPE_WIDTH = 841.89;
const A4_LANDSCAPE_HEIGHT = 595.28;

const PAGE_MARGIN_X = 28;
const PAGE_MARGIN_TOP = 26;
const PAGE_MARGIN_BOTTOM = 24;
const COLUMN_GAP = 16;
const HEADER_GAP = 10;
const GROUP_GAP = 8;
const ROW_GAP = 8;
const GROUP_SECTION_GAP = 12;

const CARD_HEIGHT = 96;
const QR_SIZE = 68;
const SWATCH_SIZE = 14;

function normalizeSwatch(hex: string): string {
  const value = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return "#CBD5E1";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeSwatch(hex);
  if (normalized.length === 4) {
    const r = Number.parseInt(`${normalized[1]}${normalized[1]}`, 16) / 255;
    const g = Number.parseInt(`${normalized[2]}${normalized[2]}`, 16) / 255;
    const b = Number.parseInt(`${normalized[3]}${normalized[3]}`, 16) / 255;
    return { r, g, b };
  }
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  return { r, g, b };
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const raw = dataUrl.trim();
  const match = raw.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Invalid QR data URL. Expected base64 image data URL.");
  }
  const mime = match[1].toLowerCase();
  const encoded = match[2];
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { mime, bytes };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const slice = bytes.subarray(offset, offset + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function safeText(value: string | null | undefined, fallback = "Unknown"): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function fitText(font: PDFFont, value: string, fontSize: number, maxWidth: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (font.widthOfTextAtSize(trimmed, fontSize) <= maxWidth) {
    return trimmed;
  }
  const ellipsis = "…";
  let low = 0;
  let high = trimmed.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const candidate = `${trimmed.slice(0, mid)}${ellipsis}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${trimmed.slice(0, low)}${ellipsis}`;
}

function drawLabelValue(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  const labelSize = 9;
  const valueSize = 9;
  const labelText = `${label}: `;
  const labelWidth = fontBold.widthOfTextAtSize(labelText, labelSize);
  const fittedValue = fitText(fontRegular, value, valueSize, Math.max(20, maxWidth - labelWidth));

  page.drawText(labelText, {
    x,
    y,
    size: labelSize,
    font: fontBold,
    color: rgb(0.12, 0.16, 0.24),
  });
  page.drawText(fittedValue, {
    x: x + labelWidth,
    y,
    size: valueSize,
    font: fontRegular,
    color: rgb(0.18, 0.22, 0.29),
  });
}

async function embedQrImage(pdf: PDFDocument, dataUrl: string): Promise<PDFImage> {
  const { mime, bytes } = parseDataUrl(dataUrl);
  if (mime === "image/png") {
    return pdf.embedPng(bytes);
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return pdf.embedJpg(bytes);
  }
  throw new Error(`Unsupported QR image type: ${mime}`);
}

export async function buildInventoryOverviewPrintPdfBase64(
  rows: InventoryOverviewPrintRow[],
  labels: InventoryOverviewPrintLabels,
): Promise<string> {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const columnWidth =
    (A4_LANDSCAPE_WIDTH - PAGE_MARGIN_X * 2 - COLUMN_GAP) / 2;

  const byMaterial = new Map<string, InventoryOverviewPrintRow[]>();
  for (const row of rows) {
    const material = safeText(row.material);
    const bucket = byMaterial.get(material);
    if (bucket) {
      bucket.push(row);
    } else {
      byMaterial.set(material, [row]);
    }
  }

  const sortedGroups = [...byMaterial.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );

  const imageCache = new Map<string, PDFImage>();
  for (const row of rows) {
    const key = row.qrDataUrl.trim();
    if (!key || imageCache.has(key)) {
      continue;
    }
    imageCache.set(key, await embedQrImage(pdf, key));
  }

  const addPage = () => pdf.addPage([A4_LANDSCAPE_WIDTH, A4_LANDSCAPE_HEIGHT]);
  let page = addPage();
  let y = A4_LANDSCAPE_HEIGHT - PAGE_MARGIN_TOP;

  const drawHeader = () => {
    const generatedText = `${labels.generatedAt}: ${new Date().toLocaleString()}`;
    const generatedSize = 9;
    const generatedWidth = fontRegular.widthOfTextAtSize(generatedText, generatedSize);
    const generatedX = Math.max(PAGE_MARGIN_X, A4_LANDSCAPE_WIDTH - PAGE_MARGIN_X - generatedWidth);

    page.drawText(labels.title, {
      x: PAGE_MARGIN_X,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0.08, 0.12, 0.2),
    });

    page.drawText(generatedText, {
      x: generatedX,
      y: y + 6,
      size: generatedSize,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.5),
    });

    y -= 20 + HEADER_GAP;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight >= PAGE_MARGIN_BOTTOM) {
      return;
    }
    page = addPage();
    y = A4_LANDSCAPE_HEIGHT - PAGE_MARGIN_TOP;
    drawHeader();
  };

  drawHeader();

  if (sortedGroups.length === 0) {
    ensureSpace(40);
    page.drawText(labels.empty, {
      x: PAGE_MARGIN_X,
      y: y - 20,
      size: 12,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.5),
    });
  } else {
    for (const [material, materialRows] of sortedGroups) {
      ensureSpace(24 + CARD_HEIGHT + ROW_GAP);

      page.drawText(`${labels.groupMaterial}: ${material}`, {
        x: PAGE_MARGIN_X,
        y,
        size: 13,
        font: fontBold,
        color: rgb(0.1, 0.14, 0.2),
      });
      y -= 13 + GROUP_GAP;

      const sortedRows = [...materialRows].sort((left, right) => {
        const filamentOrder = safeText(left.filamentName).localeCompare(safeText(right.filamentName));
        if (filamentOrder !== 0) {
          return filamentOrder;
        }
        return safeText(left.colorName).localeCompare(safeText(right.colorName));
      });

      for (let index = 0; index < sortedRows.length; index += 2) {
        ensureSpace(CARD_HEIGHT + ROW_GAP);

        const pair = sortedRows.slice(index, index + 2);
        for (let column = 0; column < pair.length; column += 1) {
          const row = pair[column];
          const x = PAGE_MARGIN_X + column * (columnWidth + COLUMN_GAP);
          const cardTop = y;
          const cardBottom = y - CARD_HEIGHT;

          page.drawRectangle({
            x,
            y: cardBottom,
            width: columnWidth,
            height: CARD_HEIGHT,
            borderColor: rgb(0.78, 0.82, 0.89),
            borderWidth: 1,
            color: rgb(0.99, 0.995, 1),
          });

          const qrFrameX = x + 8;
          const qrFrameY = cardTop - 8 - QR_SIZE;
          page.drawRectangle({
            x: qrFrameX,
            y: qrFrameY,
            width: QR_SIZE,
            height: QR_SIZE,
            borderColor: rgb(0.8, 0.84, 0.9),
            borderWidth: 1,
            color: rgb(1, 1, 1),
          });

          const qrImage = imageCache.get(row.qrDataUrl.trim());
          if (qrImage) {
            page.drawImage(qrImage, {
              x: qrFrameX + 4,
              y: qrFrameY + 4,
              width: QR_SIZE - 8,
              height: QR_SIZE - 8,
            });
          }

          const textX = qrFrameX + QR_SIZE + 10;
          const titleY = cardTop - 16;

          const swatch = hexToRgb(row.swatchHex);
          page.drawCircle({
            x: textX + SWATCH_SIZE / 2,
            y: titleY + 1,
            size: SWATCH_SIZE / 2,
            color: rgb(swatch.r, swatch.g, swatch.b),
            borderColor: rgb(0.2, 0.24, 0.31),
            borderWidth: 0.8,
          });

          const titleX = textX + SWATCH_SIZE + 6;
          const titleWidth = x + columnWidth - 10 - titleX;
          page.drawText(
            fitText(fontBold, safeText(row.colorName), 10.5, titleWidth),
            {
              x: titleX,
              y: titleY - 4,
              size: 10.5,
              font: fontBold,
              color: rgb(0.1, 0.14, 0.2),
            },
          );

          const detailWidth = x + columnWidth - 10 - textX;
          drawLabelValue(
            page,
            fontBold,
            fontRegular,
            labels.vendor,
            safeText(row.vendor),
            textX,
            titleY - 18,
            detailWidth,
          );
          drawLabelValue(
            page,
            fontBold,
            fontRegular,
            labels.filament,
            safeText(row.filamentName),
            textX,
            titleY - 30,
            detailWidth,
          );
          drawLabelValue(
            page,
            fontBold,
            fontRegular,
            labels.color,
            safeText(row.colorName),
            textX,
            titleY - 42,
            detailWidth,
          );
          drawLabelValue(
            page,
            fontBold,
            fontRegular,
            labels.reference,
            formatSpoolReference(safeText(row.reference)),
            textX,
            titleY - 54,
            detailWidth,
          );
        }

        y -= CARD_HEIGHT + ROW_GAP;
      }

      y -= GROUP_SECTION_GAP;
    }
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return toBase64(bytes);
}
