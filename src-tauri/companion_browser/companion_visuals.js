import { FilamentSpoolVisual } from "./filament_spool_visual.js";
import { parseSwatchSpec } from "./companion_theme.js";
import { printerImageCatalog } from "./printer_image_catalog.js";
import { companionIcon } from "./companion_icons.js";
import { printerImagePresentation } from "./printer_image_presentation.js";

const spoolImages = new Map();
export function renderFilamentSpool(color) {
  const spec = parseSwatchSpec(color);
  const canonical = spec.kind === "solid" ? spec.colors[0] : `${spec.kind}(${spec.colors.join(",")})`;
  let source = spoolImages.get(canonical);
  if (!source) {
    source = `data:image/svg+xml;base64,${btoa(FilamentSpoolVisual({color:canonical}))}`;
    if (spoolImages.size >= 128) spoolImages.delete(spoolImages.keys().next().value);
    spoolImages.set(canonical, source);
  }
  return `<img class="companion-spool-visual" src="${source}" alt="" width="200" height="220" loading="lazy" decoding="async" />`;
}

export function printerImageFilename(model, hasMultiMaterial = false) {
  const key = Object.keys(printerImageCatalog).find(key => key.toLowerCase() === String(model ?? "").trim().toLowerCase());
  if (!key) return null;
  const entry = printerImageCatalog[key];
  return hasMultiMaterial && entry.multi ? entry.multi : entry.single;
}

export function renderPrinterImage(model, hasMultiMaterial = false) {
  const original = printerImageFilename(model, hasMultiMaterial);
  const presentation=printerImagePresentation[original];
  return presentation ? `<svg class="companion-printer-image" viewBox="${presentation.viewBox}" width="100" height="100" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"><image href="/companion/${presentation.file}" width="${presentation.width}" height="${presentation.height}" /></svg>` : `<span class="companion-printer-placeholder" aria-hidden="true">${companionIcon("printers")}</span>`;
}
