import { BrowserQRCodeReader } from "@zxing/browser";
import {
  decodePDFRawStream,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";

import {
  buildFilamentLabelPngDataUrl,
  buildFilamentLabelQrDataUrl,
} from "../src/lib/filament_label_print";
import { buildInventoryLabelSheetPdfBase64 } from "../src/lib/inventory_overview_print";
import { buildBrandedFilamentQrDataUrl } from "../src/lib/filament_qr_branding";
import {
  FILAMENT_LABEL_PROFILES,
  type FilamentLabelSizeInput,
} from "../src/lib/filament_label_profiles";

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

async function imageCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.drawImage(image, 0, 0);
  return canvas;
}

function coloredPixelCount(canvas: HTMLCanvasElement): number {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let colored = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colored += 1;
  }
  return colored;
}

type CameraSampleOptions = {
  scale?: number;
  rotation?: number;
  blur?: number;
  grayscale?: boolean;
  pixelated?: boolean;
};

function cameraSample(
  source: HTMLCanvasElement,
  options: CameraSampleOptions,
): HTMLCanvasElement {
  const width = Math.round(source.width * (options.scale ?? 1));
  const height = Math.round(source.height * (options.scale ?? 1));
  const radians = ((options.rotation ?? 0) * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const canvas = document.createElement("canvas");
  // Keep the complete quiet zone when the simulated camera view is rotated.
  canvas.width = Math.ceil(width * cosine + height * sine) + 16;
  canvas.height = Math.ceil(height * cosine + width * sine) + 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.imageSmoothingEnabled = !options.pixelated;
  context.filter = `blur(${options.blur ?? 0}px) grayscale(${options.grayscale ? 1 : 0})`;
  context.drawImage(source, -width / 2, -height / 2, width, height);
  return canvas;
}

function decodedSample(canvas: HTMLCanvasElement, scenario: string): string {
  try {
    return new BrowserQRCodeReader().decodeFromCanvas(canvas).getText();
  } catch (error) {
    throw new Error(`QR could not be decoded in ${scenario}: ${String(error)}`, {
      cause: error,
    });
  }
}

function scannedSample(canvas: HTMLCanvasElement, id: string): {
  id: string;
  decodedPayload: string | null;
  error?: string;
} {
  try {
    return { id, decodedPayload: decodedSample(canvas, id) };
  } catch (error) {
    return { id, decodedPayload: null, error: String(error) };
  }
}

type ComparedCameraSample = ReturnType<typeof scannedSample> & {
  plainDecodedPayload: string | null;
  recoveredPayload?: string | null;
  plainRecoveredPayload?: string | null;
  recoveryView?: "scale-0.8" | "scale-1.2" | "tilt-2" | "tilt-5";
};

function comparedSample(
  canvas: HTMLCanvasElement,
  plainCanvas: HTMLCanvasElement,
  id: string,
): ComparedCameraSample {
  const branded = scannedSample(canvas, id);
  const plain = scannedSample(plainCanvas, `${id}-plain-control`);
  const result: ComparedCameraSample = {
    ...branded,
    plainDecodedPayload: plain.decodedPayload,
  };
  if (branded.decodedPayload !== null || plain.decodedPayload !== null) {
    return result;
  }
  // ZXing's finder sampling can miss the same undamaged QR at particular raster
  // sizes. Require both controls to recover in an identical bounded camera view;
  // a branded-only miss is never hidden by this diagnostic fallback.
  const recoveryViews = [
    { id: "scale-0.8", options: { scale: 0.8 } },
    { id: "scale-1.2", options: { scale: 1.2 } },
    { id: "tilt-2", options: { rotation: 2 } },
    { id: "tilt-5", options: { rotation: 5 } },
  ] as const;
  for (const view of recoveryViews) {
    const recovered = scannedSample(
      cameraSample(canvas, view.options),
      `${id}-${view.id}`,
    );
    const plainRecovered = scannedSample(
      cameraSample(plainCanvas, view.options),
      `${id}-plain-${view.id}`,
    );
    if (recovered.decodedPayload !== null && plainRecovered.decodedPayload !== null) {
      return {
        ...result,
        recoveredPayload: recovered.decodedPayload,
        plainRecoveredPayload: plainRecovered.decodedPayload,
        recoveryView: view.id,
      };
    }
  }
  return result;
}

export async function decodeBrandedQrMatrix(payloads: string[]): Promise<Array<{
  payload: string;
  scenarios: ComparedCameraSample[];
  coloredPixels: number;
  monochromePixels: number;
}>> {
  const result = [];
  const sizes: Array<{ id: string; size: FilamentLabelSizeInput }> = [
    ...FILAMENT_LABEL_PROFILES.map(({ id }) => ({ id, size: id })),
    { id: "minimum-custom", size: { widthMm: 45, heightMm: 24 } },
    { id: "maximum-custom", size: { widthMm: 150, heightMm: 80 } },
  ];
  for (const payload of payloads) {
    const plainDataUrl = await buildFilamentLabelQrDataUrl(payload);
    const plainCanvas = await imageCanvas(plainDataUrl);
    const colorCanvas = await imageCanvas(
      await buildBrandedFilamentQrDataUrl(payload),
    );
    const monochromeDataUrl = await buildBrandedFilamentQrDataUrl(
      payload,
      "monochrome",
    );
    const monochromeCanvas = await imageCanvas(monochromeDataUrl);
    const scenarios = [];
    for (const [appearance, canvas] of [
      ["color", colorCanvas],
      ["monochrome", monochromeCanvas],
    ] as const) {
      const screenScale = 192 / canvas.width;
      const views: Array<{ id: string; options?: CameraSampleOptions }> = [
        { id: `${appearance}-native` },
        {
          id: `${appearance}-138px-screen`,
          options: { scale: 138 / canvas.width, pixelated: true },
        },
        { id: `${appearance}-192px`, options: { scale: screenScale } },
        {
          id: `${appearance}-192px-rotated`,
          options: { scale: screenScale, rotation: 15 },
        },
        {
          id: `${appearance}-192px-grayscale-blur`,
          options: { scale: screenScale, blur: 0.35, grayscale: true },
        },
      ];
      for (const view of views) {
        scenarios.push(comparedSample(
          view.options ? cameraSample(canvas, view.options) : canvas,
          view.options ? cameraSample(plainCanvas, view.options) : plainCanvas,
          view.id,
        ));
      }
    }
    for (const { id, size } of sizes) {
      const canvas = await imageCanvas(await buildFilamentLabelPngDataUrl({
        vendor: "Bambu",
        material: "PLA",
        filamentName: "PLA Basic",
        colorName: "Jade White (10100)",
        reference: "spool_1775592053186",
        qrDataUrl: monochromeDataUrl,
      }, size));
      const plainLabel = await imageCanvas(await buildFilamentLabelPngDataUrl({
        vendor: "Bambu",
        material: "PLA",
        filamentName: "PLA Basic",
        colorName: "Jade White (10100)",
        reference: "spool_1775592053186",
        qrDataUrl: plainDataUrl,
      }, size));
      if (coloredPixelCount(canvas) !== 0) {
        throw new Error(`${id} tape output contains colored pixels.`);
      }
      const views: Array<{ id: string; options?: CameraSampleOptions }> = [
        { id: `${id}-300dpi` },
        { id: `${id}-203dpi`, options: { scale: 203 / 300 } },
        {
          id: `${id}-203dpi-rotated-blur`,
          options: { scale: 203 / 300, rotation: 15, blur: 0.25 },
        },
      ];
      for (const view of views) {
        scenarios.push(comparedSample(
          view.options ? cameraSample(canvas, view.options) : canvas,
          view.options ? cameraSample(plainLabel, view.options) : plainLabel,
          view.id,
        ));
      }
    }
    result.push({
      payload,
      scenarios,
      coloredPixels: coloredPixelCount(colorCanvas),
      monochromePixels: coloredPixelCount(monochromeCanvas),
    });
  }
  return result;
}

export async function decodeColorLabelSheetImages(payload: string): Promise<Array<{
  paper: "a4" | "letter";
  decodedPayload: string;
  coloredPixels: number;
}>> {
  const qrDataUrl = await buildBrandedFilamentQrDataUrl(payload, "color");
  const pngDataUrl = await buildFilamentLabelPngDataUrl({
    vendor: "Bambu",
    material: "PLA",
    filamentName: "PLA Basic",
    colorName: "Jade White (10100)",
    reference: "spool_1775592053186",
    qrDataUrl,
  }, "ptouch-24");
  const result = [];
  for (const paper of ["a4", "letter"] as const) {
    const base64 = await buildInventoryLabelSheetPdfBase64(
      [{ reference: "spool_1775592053186", pngDataUrl }],
      paper,
    );
    const pdf = await PDFDocument.load(
      Uint8Array.from(atob(base64), (value) => value.charCodeAt(0)),
    );
    const images = pdf.context.enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFRawStream =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image") &&
        object.dict.get(PDFName.of("ColorSpace")) === PDFName.of("DeviceRGB"));
    if (images.length !== 1) {
      throw new Error(`${paper} did not preserve exactly one RGB label image.`);
    }
    const image = images[0];
    const canvas = document.createElement("canvas");
    canvas.width = image.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
    canvas.height = image.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    const pixels = context.createImageData(canvas.width, canvas.height);
    const rgb = decodePDFRawStream(image).decode();
    if (rgb.length !== canvas.width * canvas.height * 3) {
      throw new Error(`${paper} has an unexpected RGB image format.`);
    }
    for (let offset = 0; offset < canvas.width * canvas.height; offset += 1) {
      pixels.data[offset * 4] = rgb[offset * 3];
      pixels.data[offset * 4 + 1] = rgb[offset * 3 + 1];
      pixels.data[offset * 4 + 2] = rgb[offset * 3 + 2];
      pixels.data[offset * 4 + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    result.push({
      paper,
      decodedPayload: decodedSample(canvas, `${paper}-embedded-color-image`),
      coloredPixels: coloredPixelCount(canvas),
    });
  }
  return result;
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

export async function renderDecodeCustomLabel(
  payload: string,
  dimensions: { widthMm: number; heightMm: number },
): Promise<{
  decodedPayload: string;
  labelHeight: number;
  labelWidth: number;
  pngByteLength: number;
}> {
  const qrDataUrl = await buildFilamentLabelQrDataUrl(payload);
  const labelPngDataUrl = await buildFilamentLabelPngDataUrl(
    {
      vendor: "Éléments Génériques et partenaires",
      material: "PLA-CF",
      filamentName: "Précision renforcée très longue série spéciale",
      colorName: "Brûlé d’été violet extrêmement détaillé (40402)",
      reference: "spool_1780069566047",
      qrDataUrl,
    },
    dimensions,
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

  return {
    decodedPayload: new BrowserQRCodeReader().decodeFromCanvas(canvas).getText(),
    labelHeight: image.naturalHeight,
    labelWidth: image.naturalWidth,
    pngByteLength: dataUrlBytes(labelPngDataUrl).length,
  };
}

export async function renderCenteredQrExamples(payload: string) {
  const color = await buildBrandedFilamentQrDataUrl(payload);
  const monochrome = await buildBrandedFilamentQrDataUrl(payload, "monochrome");
  const label = await buildFilamentLabelPngDataUrl({
    vendor: "Bambu", material: "ABS", filamentName: "ABS",
    colorName: "Black (40101)", reference: "spool_592e99a56bc81250c588e1100aa44954",
    qrDataUrl: monochrome,
  }, "ptouch-24");
  return { color, monochrome, label };
}
