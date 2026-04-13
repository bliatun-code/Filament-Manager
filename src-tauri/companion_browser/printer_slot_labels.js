import { t } from "./companion_i18n.js";

function normalizeModel(model) {
  return String(model || "").trim().toLowerCase();
}

function parsePrinterUnitIndex(amsId) {
  const normalized = String(amsId ?? "").trim();
  if (!normalized) {
    return null;
  }
  if (/^ext(?:ernal)?$/i.test(normalized) || /(?:^|[_-])ext(?:ernal)?(?:$|[_-])/i.test(normalized)) {
    return "EXT";
  }
  const match = normalized.match(/(?:^|[_-])ams[_-](\d+)(?:$|[_-])/i) || normalized.match(/(?:^|[_-])(\d{1,2})(?:$|[_-])/);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value >= 1 && value <= 8 ? value : null;
}

function resolvePrinterSystemKind(model) {
  const normalized = normalizeModel(model);
  if (!normalized) {
    return "GENERIC";
  }
  if (normalized.includes("prusa xl")) {
    return "TOOLHEADS";
  }
  if (normalized.includes("prusa mini")) {
    return "NONE";
  }
  if (normalized.includes("prusa")) {
    return "MMU3";
  }
  if (normalized.includes("bambu")) {
    return "AMS";
  }
  return "GENERIC";
}

export function formatPrinterSlotLabelForModel(slot, locale = "en", printerModel = "") {
  const slotIndex = String(slot?.slot_index ?? slot?.slotIndex ?? "").trim();
  const unitIndex = parsePrinterUnitIndex(slot?.ams_id ?? slot?.amsId ?? "");
  const systemKind = resolvePrinterSystemKind(printerModel);

  if (unitIndex === "EXT") {
    return t(locale, "printers.extSlot", "EXT Slot");
  }
  if (systemKind === "TOOLHEADS" && slotIndex) {
    return `${t(locale, "printers.toolhead", "Toolhead")} ${slotIndex}`;
  }
  if (systemKind === "MMU3" && slotIndex) {
    return `MMU3 · ${t(locale, "printers.channel", "Channel")} ${slotIndex}`;
  }
  if ((systemKind === "AMS" || systemKind === "GENERIC") && unitIndex && slotIndex) {
    return `AMS ${unitIndex} · ${t(locale, "printers.slot", "Slot")} ${slotIndex}`;
  }
  if (slotIndex) {
    return `${t(locale, "printers.slot", "Slot")} ${slotIndex}`;
  }
  return t(locale, "printers.printerSlot", "Printer slot");
}
