import logoSvg from "../assets/filament-qr-logo.svg?raw";
import { findFilamentQrLogoPlate } from "./filament_qr_geometry";

export type FilamentQrAppearance = "color" | "monochrome";

const SOURCE_MODULE_SCALE = 12;
const QUIET_ZONE_MODULES = 4;
const logoImages = new Map<FilamentQrAppearance, Promise<HTMLImageElement>>();

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render the filament QR image."));
    image.src = source;
  });
}

function loadLogo(appearance: FilamentQrAppearance): Promise<HTMLImageElement> {
  const cached = logoImages.get(appearance);
  if (cached) return cached;
  // One vector geometry keeps the transparent color and one-ink variants aligned.
  const svg = appearance === "monochrome"
    ? logoSvg.replace(/#[0-9a-f]{6}/gi, (color) =>
        color.toUpperCase() === "#FFFFFF" ? "#FFFFFF" : "#000000")
    : logoSvg;
  const loading = loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  logoImages.set(appearance, loading);
  void loading.catch(() => logoImages.delete(appearance));
  return loading;
}

export async function buildBrandedFilamentQrDataUrl(
  payload: string,
  appearance: FilamentQrAppearance = "color",
): Promise<string> {
  const { buildFilamentLabelQrDataUrl, filamentQrModuleLayout } =
    await import("./filament_label_print");
  const plainDataUrl = await buildFilamentLabelQrDataUrl(payload);
  const qr = await loadImage(plainDataUrl);
  const gridSize = qr.naturalWidth / SOURCE_MODULE_SCALE;
  const matrixSize = gridSize - QUIET_ZONE_MODULES * 2;
  const modules = filamentQrModuleLayout(payload);
  if (qr.naturalHeight !== qr.naturalWidth || !Number.isInteger(gridSize) ||
      matrixSize !== modules.size) {
    throw new Error("Filament QR module geometry is invalid.");
  }

  // Keep finder, timing, alignment, format and version patterns fully intact,
  // with one clear module around them. Long URLs may need a slightly offset logo.
  const plate = findFilamentQrLogoPlate(modules);
  if (!plate) return plainDataUrl;

  const logo = await loadLogo(appearance);
  const canvas = document.createElement("canvas");
  canvas.width = qr.naturalWidth;
  canvas.height = qr.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable for filament QR.");
  context.imageSmoothingEnabled = false;
  context.drawImage(qr, 0, 0);
  const plateSize = plate.size * SOURCE_MODULE_SCALE;
  const plateX = (plate.x + QUIET_ZONE_MODULES) * SOURCE_MODULE_SCALE;
  const plateY = (plate.y + QUIET_ZONE_MODULES) * SOURCE_MODULE_SCALE;
  context.fillStyle = "#FFFFFF";
  context.fillRect(plateX, plateY, plateSize, plateSize);
  const availableWidth = plateSize - SOURCE_MODULE_SCALE * 2;
  const logoHeight = availableWidth * logo.naturalHeight / logo.naturalWidth;
  // Smooth only the reel curves; QR cells and its white margin stay pixel aligned.
  context.imageSmoothingEnabled = true;
  context.drawImage(logo, plateX + SOURCE_MODULE_SCALE,
    plateY + (plateSize - logoHeight) / 2, availableWidth, logoHeight);
  return canvas.toDataURL("image/png");
}
