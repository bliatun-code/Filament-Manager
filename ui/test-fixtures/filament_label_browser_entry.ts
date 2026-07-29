import { BrowserQRCodeReader } from "@zxing/browser";

import {
  buildFilamentLabelPngDataUrl,
  buildFilamentLabelQrDataUrl,
} from "../src/lib/filament_label_print";
import { buildInventoryLabelSheetPdfBase64 } from "../src/lib/inventory_overview_print";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the rendered label PNG."));
    image.src = dataUrl;
  });
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(encoded);
  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
}

function pdfSignature(base64: string): string {
  return atob(base64.slice(0, 16)).slice(0, 4);
}

export async function renderDecodeAndEmbedPtouchLabel(payload: string): Promise<{
  decodedPayload: string;
  labelHeight: number;
  labelWidth: number;
  pdfs: Array<{ id: "a4" | "letter"; byteLength: number; signature: string }>;
  pngByteLength: number;
  pngSignature: number[];
}> {
  const qrDataUrl = await buildFilamentLabelQrDataUrl(payload);
  const labelPngDataUrl = await buildFilamentLabelPngDataUrl(
    {
      vendor: "Bambu",
      material: "ABS",
      filamentName: "ABS",
      colorName: "ABS Tangerine Yellow (40402)",
      reference: "spool_1775592053186",
      qrDataUrl,
    },
    "ptouch-24",
  );
  const image = await loadImage(labelPngDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable.");
  }
  context.drawImage(image, 0, 0);

  const decodedPayload = new BrowserQRCodeReader()
    .decodeFromCanvas(canvas)
    .getText();
  const pngBytes = dataUrlBytes(labelPngDataUrl);
  const pdfs = await Promise.all(
    (["a4", "letter"] as const).map(async (id) => {
      const base64 = await buildInventoryLabelSheetPdfBase64(
        [
          {
            reference: "spool_1775592053186",
            pngDataUrl: labelPngDataUrl,
          },
        ],
        id,
      );
      return {
        id,
        byteLength: atob(base64).length,
        signature: pdfSignature(base64),
      };
    }),
  );

  return {
    decodedPayload,
    labelHeight: image.naturalHeight,
    labelWidth: image.naturalWidth,
    pdfs,
    pngByteLength: pngBytes.length,
    pngSignature: Array.from(pngBytes.slice(0, 8)),
  };
}
