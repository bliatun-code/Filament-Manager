type TranslateFn = (key: string, fallback?: string) => string;

export type PlacementLocation =
  | { kind: "unassigned" }
  | { kind: "freeform"; label: string }
  | { kind: "printer_slot"; printerName: string; slotId: string };

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

export function parsePlacementLocation(locationRaw?: string | null): PlacementLocation {
  const location = normalizeDisplayToken(locationRaw);
  if (!location) {
    return { kind: "unassigned" };
  }

  if (!location.startsWith("Printer:")) {
    return { kind: "freeform", label: location };
  }

  const match = location.match(/^Printer:([^:]+):(.+)$/);
  if (!match) {
    return { kind: "freeform", label: location.replace(/^Printer:/, "") };
  }

  const [, printerName, slotId] = match;
  return { kind: "printer_slot", printerName, slotId };
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
    return placement.label;
  }

  const { printerName, slotId: rawSlotId } = placement;
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
