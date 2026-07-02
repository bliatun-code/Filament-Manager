type TranslateFn = (key: string, fallback?: string) => string;

export type PlacementLocation =
  | { kind: "unassigned" }
  | { kind: "freeform"; label: string }
  | { kind: "printer_slot"; printerName: string; slotId: string };

const PRINTER_SLOT_LOCATION_PREFIX = "Printer:";

export function normalizeDisplayToken(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitDisplayTokens(value?: string | null): string[] {
  const normalized = normalizeDisplayToken(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function tokenStartsWithToken(baseToken: string, nextToken: string): boolean {
  const base = baseToken.trim().toLowerCase();
  const next = nextToken.trim().toLowerCase();
  if (!base || !next) {
    return false;
  }
  return (
    next === base ||
    next.startsWith(`${base} `) ||
    next.startsWith(`${base}-`) ||
    next.startsWith(`${base}+`) ||
    next.startsWith(`${base}/`)
  );
}

export function formatFilamentDisplayTitle(
  materialRaw?: string | null,
  filamentRaw?: string | null,
  colorRaw?: string | null,
): string {
  const tokens = [
    ...splitDisplayTokens(materialRaw),
    ...splitDisplayTokens(filamentRaw),
    ...splitDisplayTokens(colorRaw),
  ].filter((token, index, allTokens) => {
    if (index === 0) {
      return true;
    }
    return allTokens[index - 1].toLowerCase() !== token.toLowerCase();
  });

  if (tokens.length >= 2 && tokenStartsWithToken(tokens[0], tokens[1])) {
    tokens.shift();
  }

  return tokens.length > 0 ? tokens.join(" · ") : "—";
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

export function formatPrinterSlotLocation(printerNameRaw: string, slotIdRaw: string): string {
  const printerName = normalizeDisplayToken(printerNameRaw) ?? "";
  const slotId = normalizeDisplayToken(slotIdRaw) ?? "";
  return `${PRINTER_SLOT_LOCATION_PREFIX}${printerName}:${slotId}`;
}

export function parsePlacementLocation(locationRaw?: string | null): PlacementLocation {
  const location = normalizeDisplayToken(locationRaw);
  if (!location) {
    return { kind: "unassigned" };
  }

  if (!location.startsWith(PRINTER_SLOT_LOCATION_PREFIX)) {
    return { kind: "freeform", label: location };
  }

  const match = location.match(/^Printer:([^:]+):(.+)$/);
  if (!match) {
    return {
      kind: "freeform",
      label: location.replace(new RegExp(`^${PRINTER_SLOT_LOCATION_PREFIX}`), ""),
    };
  }

  const [, printerName, slotId] = match;
  const normalizedPrinterName = normalizeDisplayToken(printerName);
  const normalizedSlotId = normalizeDisplayToken(slotId);
  if (!normalizedPrinterName || !normalizedSlotId) {
    return {
      kind: "freeform",
      label: location.replace(new RegExp(`^${PRINTER_SLOT_LOCATION_PREFIX}`), ""),
    };
  }

  return { kind: "printer_slot", printerName: normalizedPrinterName, slotId: normalizedSlotId };
}

export function formatPrinterSlotTokenLabel(
  t: TranslateFn,
  slotIdRaw?: string | null,
): string | null {
  const slotId = normalizeDisplayToken(slotIdRaw);
  if (!slotId) {
    return null;
  }

  const extMatch = slotId.match(/(?:^|_)(?:ext|external)(?:_slot(?:_(\d+))?)?$/i);
  if (extMatch) {
    const extSlot = t("printers.extSlot", "EXT Slot");
    const slotIndex = extMatch[1] ? Number.parseInt(extMatch[1], 10) : Number.NaN;
    return Number.isNaN(slotIndex) ? extSlot : `${extSlot} ${slotIndex}`;
  }

  const amsMatch = slotId.match(/(?:^|_)ams[_-](\d+)[_-]slot[_-](\d+)$/i);
  if (amsMatch) {
    return `AMS ${amsMatch[1]} · ${t("printers.slot", "Slot")} ${amsMatch[2]}`;
  }

  const mmuMatch = slotId.match(/(?:^|_)mmu3?[_-](?:channel|slot)[_-](\d+)$/i);
  if (mmuMatch) {
    return `MMU3 · ${t("printers.channel", "Channel")} ${mmuMatch[1]}`;
  }

  const toolheadMatch = slotId.match(/(?:^|_)toolhead[_-](\d+)$/i);
  if (toolheadMatch) {
    return `${t("printers.toolhead", "Toolhead")} ${toolheadMatch[1]}`;
  }

  return slotId;
}

function formatFreeformPlacementLabel(t: TranslateFn, label: string): string {
  const rawPrinterSlotMatch = label.match(
    /printer_[A-Za-z0-9_]+(?:_ams_\d+_slot_\d+|(?:_ext|_external)(?:_slot(?:_\d+)?)?|_mmu3?_(?:channel|slot)_\d+|_toolhead_\d+)/i,
  );
  if (!rawPrinterSlotMatch) {
    return label;
  }

  const slotLabel = formatPrinterSlotTokenLabel(t, rawPrinterSlotMatch[0]);
  if (!slotLabel) {
    return label;
  }
  return label.replace(rawPrinterSlotMatch[0], slotLabel);
}

export function formatPlacementLabel(
  t: TranslateFn,
  locationRaw?: string | null,
  slotLabelById?: ReadonlyMap<string, string>,
): string {
  const placement = parsePlacementLocation(locationRaw);
  if (placement.kind === "unassigned") {
    return t("inventory.unassigned", "Unassigned");
  }

  if (placement.kind === "freeform") {
    return formatFreeformPlacementLabel(t, placement.label);
  }

  const { printerName, slotId: rawSlotId } = placement;
  const mappedLabel = slotLabelById?.get(rawSlotId);
  if (mappedLabel) {
    return mappedLabel;
  }

  const slotLabel = formatPrinterSlotTokenLabel(t, rawSlotId);
  return slotLabel ? `${printerName} · ${slotLabel}` : printerName;
}
