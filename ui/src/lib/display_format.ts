type TranslateFn = (key: string, fallback?: string) => string;

export function normalizeDisplayToken(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function compactReferenceLabel(
  valueRaw?: string | null,
  prefix = "#",
  maxVisibleLength = 20,
): string {
  const value = normalizeDisplayToken(valueRaw);
  if (!value) {
    return "—";
  }

  const normalized = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (normalized.length <= maxVisibleLength) {
    return `${prefix}${normalized}`;
  }

  return `${prefix}${normalized.slice(0, 12)}…${normalized.slice(-6)}`;
}

export function formatSpoolReference(valueRaw?: string | null): string {
  const value = normalizeDisplayToken(valueRaw);
  if (!value) {
    return "—";
  }
  const normalized = value.replace(/^spool_/, "");
  if (normalized.length <= 6) {
    return `#${normalized}`;
  }
  return `#${normalized.slice(-6)}`;
}

export function formatPlacementLabel(
  t: TranslateFn,
  locationRaw?: string | null,
  slotLabelById?: ReadonlyMap<string, string>,
): string {
  const location = normalizeDisplayToken(locationRaw);
  if (!location) {
    return t("inventory.unassigned", "Unassigned");
  }

  if (!location.startsWith("Printer:")) {
    return location;
  }

  const match = location.match(/^Printer:([^:]+):(.+)$/);
  if (!match) {
    return location.replace(/^Printer:/, "");
  }

  const [, printerName, rawSlotId] = match;
  const mappedLabel = slotLabelById?.get(rawSlotId);
  if (mappedLabel) {
    return mappedLabel;
  }

  if (/ext/i.test(rawSlotId)) {
    return `${printerName} · ${t("printers.extSlot", "EXT Slot")}`;
  }

  const amsMatch = rawSlotId.match(/ams[_-](\d+)[_-]slot[_-](\d+)/i);
  if (amsMatch) {
    return `${printerName} · AMS ${amsMatch[1]} · ${t("printers.slot", "Slot")} ${amsMatch[2]}`;
  }

  const mmuMatch = rawSlotId.match(/mmu3?[_-](?:channel|slot)[_-](\d+)/i);
  if (mmuMatch) {
    return `${printerName} · MMU3 · ${t("printers.channel", "Channel")} ${mmuMatch[1]}`;
  }

  const toolheadMatch = rawSlotId.match(/toolhead[_-](\d+)/i);
  if (toolheadMatch) {
    return `${printerName} · ${t("printers.toolhead", "Toolhead")} ${toolheadMatch[1]}`;
  }

  return printerName;
}
