import { PDFDocument, rgb, type PDFImage } from "pdf-lib";
import {
  inventoryLabelSheetLayout,
  type InventoryLabelSheetItem,
  type InventoryLabelSheetPaperId,
} from "./inventory_label_sheet_layout";

export type InventoryOverviewPrintRow = {
  reference: string;
  vendor: string;
  ownershipMarker?: string | null;
  material: string;
  filamentName: string;
  colorName: string;
  homeLocation?: string | null;
  swatchHex: string;
  qrDataUrl: string;
};

const POINTS_PER_MM = 72 / 25.4;
const CUT_GUIDE_WIDTH_POINTS = 0.35;

function mmToPoints(value: number): number {
  return value * POINTS_PER_MM;
}

function parsePngDataUrl(dataUrl: string, reference: string): Uint8Array {
  const raw = dataUrl.trim();
  const match = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error(`Invalid label PNG for ${reference || "unknown spool"}.`);
  }
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function embeddedLabelImage(
  pdf: PDFDocument,
  item: InventoryLabelSheetItem,
  cache: Map<string, PDFImage>,
): Promise<PDFImage> {
  const key = item.pngDataUrl.trim();
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const image = await pdf.embedPng(parsePngDataUrl(key, item.reference));
  cache.set(key, image);
  return image;
}

export async function buildInventoryLabelSheetPdfBase64(
  items: InventoryLabelSheetItem[],
  paperId: InventoryLabelSheetPaperId,
): Promise<string> {
  const pdf = await PDFDocument.create();
  const layout = inventoryLabelSheetLayout(paperId);
  const paperWidthPoints = mmToPoints(layout.paper.widthMm);
  const paperHeightPoints = mmToPoints(layout.paper.heightMm);
  const labelWidthPoints = mmToPoints(layout.labelWidthMm);
  const labelHeightPoints = mmToPoints(layout.labelHeightMm);
  const pageCount = Math.max(1, Math.ceil(items.length / layout.itemsPerPage));
  const pages = Array.from({ length: pageCount }, () =>
    pdf.addPage([paperWidthPoints, paperHeightPoints]),
  );
  const imageCache = new Map<string, PDFImage>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const indexOnPage = index % layout.itemsPerPage;
    const page = pages[Math.floor(index / layout.itemsPerPage)];
    const column = indexOnPage % layout.columns;
    const row = Math.floor(indexOnPage / layout.columns);
    const xMm =
      layout.offsetXmm + column * (layout.labelWidthMm + layout.horizontalGapMm);
    const topMm =
      layout.offsetYmm + row * (layout.labelHeightMm + layout.verticalGapMm);
    const x = mmToPoints(xMm);
    const y = paperHeightPoints - mmToPoints(topMm + layout.labelHeightMm);
    const image = await embeddedLabelImage(pdf, item, imageCache);

    page.drawImage(image, {
      x,
      y,
      width: labelWidthPoints,
      height: labelHeightPoints,
    });
    page.drawRectangle({
      x,
      y,
      width: labelWidthPoints,
      height: labelHeightPoints,
      borderColor: rgb(0.72, 0.76, 0.82),
      borderWidth: CUT_GUIDE_WIDTH_POINTS,
      borderOpacity: 0.55,
    });
  }

  return toBase64(await pdf.save({ useObjectStreams: false }));
}
