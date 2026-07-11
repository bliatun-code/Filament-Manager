import { normalizeCompanionLocale, t } from "./companion_i18n.js";
import { isBorrowedInOwnership, normalizeDomainToken, parseSpoolStatus } from "./companion_domain.js";
import {
  createLocaleCollator,
  formatLocaleDateTime,
  formatLocaleNumber,
} from "./locale_format.js";

const PRINTER_SLOT_LOCATION_PREFIX = "Printer:";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatGrams(value, locale = "en") {
  const normalizedLocale = normalizeCompanionLocale(locale);
  if (value == null || Number.isNaN(Number(value))) {
    return t(normalizedLocale, "format.unknown", "Unknown");
  }
  return `${formatLocaleNumber(Number(value), normalizedLocale)} g`;
}

function normalizeDisplayToken(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
}

function splitDisplayTokens(value) {
  const normalized = normalizeDisplayToken(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const TERMINAL_BASE_COLOR_PATTERN =
  /\b(black|blue|brown|gray|grey|green|orange|pink|purple|red|silver|white|yellow)\b(?=\s*(?:\(\d{5}\))?$)/;

function normalizeColorDisplayToken(value) {
  const normalizedCodeSpacing = String(value || "").replace(/\s*\((\d{5})\)\s*$/, " ($1)");
  return normalizedCodeSpacing.replace(
    TERMINAL_BASE_COLOR_PATTERN,
    (color) => `${color[0].toUpperCase()}${color.slice(1)}`,
  );
}

function tokenStartsWithToken(baseToken, nextToken) {
  const base = String(baseToken || "").trim().toLowerCase();
  const next = String(nextToken || "").trim().toLowerCase();
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

export function formatInventoryDisplayTitle(
  materialRaw,
  filamentRaw,
  colorRaw = "",
  locale = "en",
) {
  const tokens = [
    ...splitDisplayTokens(materialRaw),
    ...splitDisplayTokens(filamentRaw),
    ...splitDisplayTokens(colorRaw).map(normalizeColorDisplayToken),
  ].filter((token, index, allTokens) => {
    if (index === 0) {
      return true;
    }
    return allTokens[index - 1].toLowerCase() !== token.toLowerCase();
  });

  if (tokens.length >= 2 && tokenStartsWithToken(tokens[0], tokens[1])) {
    tokens.shift();
  }

  return tokens.length > 0
    ? tokens.join(" · ")
    : t(normalizeCompanionLocale(locale), "format.unknownFilament", "Unknown filament");
}

function compareDisplayStrings(left, right, locale) {
  return createLocaleCollator(locale, {
    sensitivity: "base",
    numeric: true,
  }).compare(String(left || ""), String(right || ""));
}

export function sortCatalogMastersAlphabetically(rows, locale = "en") {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.sort((left, right) => {
    const titleCompare = compareDisplayStrings(
      formatInventoryDisplayTitle(left?.material, left?.filament_name, left?.color_name, locale),
      formatInventoryDisplayTitle(right?.material, right?.filament_name, right?.color_name, locale),
      locale,
    );
    if (titleCompare !== 0) {
      return titleCompare;
    }
    const vendorCompare = compareDisplayStrings(left?.vendor, right?.vendor, locale);
    if (vendorCompare !== 0) {
      return vendorCompare;
    }
    return compareDisplayStrings(left?.id, right?.id, locale);
  });
}

export function sortSpoolRowsAlphabetically(rows, locale = "en") {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.sort((left, right) => {
    const titleCompare = compareDisplayStrings(
      formatInventoryDisplayTitle(left?.master?.material, left?.master?.filament_name, left?.master?.color_name, locale),
      formatInventoryDisplayTitle(right?.master?.material, right?.master?.filament_name, right?.master?.color_name, locale),
      locale,
    );
    if (titleCompare !== 0) {
      return titleCompare;
    }
    const vendorCompare = compareDisplayStrings(left?.master?.vendor, right?.master?.vendor, locale);
    if (vendorCompare !== 0) {
      return vendorCompare;
    }
    const locationCompare = compareDisplayStrings(
      left?.spool?.location_id,
      right?.spool?.location_id,
      locale,
    );
    if (locationCompare !== 0) {
      return locationCompare;
    }
    return compareDisplayStrings(left?.spool?.id, right?.spool?.id, locale);
  });
}

export function formatRollReference(spool, locale = "en") {
  const normalizedId = String(spool?.id ?? "").trim().replace(/^spool[-_]?/, "");
  if (!normalizedId) {
    return t(normalizeCompanionLocale(locale), "format.noReference", "No reference");
  }

  return `#${normalizedId.slice(-6)}`;
}

export function formatDate(value, locale = "en") {
  if (!value) {
    return t(normalizeCompanionLocale(locale), "format.unknown", "Unknown");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return formatLocaleDateTime(date, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatPrinterSlotLocation(printerName, slotId) {
  return `${PRINTER_SLOT_LOCATION_PREFIX}${normalizeDisplayToken(printerName)}:${normalizeDisplayToken(slotId)}`;
}

function parsePrinterSlotPlacementPayload(placement) {
  const payload = placement.slice(PRINTER_SLOT_LOCATION_PREFIX.length);
  const separatorIndex = payload.lastIndexOf(":");
  if (separatorIndex < 0) {
    return { printerName: "", slotId: "" };
  }
  return {
    printerName: normalizeDisplayToken(payload.slice(0, separatorIndex)),
    slotId: normalizeDisplayToken(payload.slice(separatorIndex + 1)),
  };
}

export function parsePlacementLocation(value) {
  const placement = normalizeDisplayToken(value);
  if (!placement) {
    return { kind: "unassigned" };
  }
  if (!placement.startsWith(PRINTER_SLOT_LOCATION_PREFIX)) {
    return { kind: "freeform", label: placement };
  }

  const { printerName, slotId } = parsePrinterSlotPlacementPayload(placement);
  if (!printerName || !slotId) {
    return {
      kind: "freeform",
      label: placement.replace(new RegExp(`^${PRINTER_SLOT_LOCATION_PREFIX}`), ""),
    };
  }

  return { kind: "printer_slot", printerName, slotId };
}

export function formatPrinterSlotTokenLabel(token, locale = "en") {
  const normalizedLocale = normalizeCompanionLocale(locale);
  const slotLabel = t(normalizedLocale, "printers.slot", "Slot");
  const extSlotLabel = t(normalizedLocale, "printers.extSlot", "EXT Slot");
  const channelLabel = t(normalizedLocale, "printers.channel", "Channel");
  const toolheadLabel = t(normalizedLocale, "printers.toolhead", "Toolhead");
  const normalized = normalizeDisplayToken(token);
  if (!normalized) {
    return "";
  }

  const extMatch = normalized.match(/(?:^|_)(?:ext|external)(?:_slot(?:_(\d+))?)?$/i);
  if (extMatch) {
    const extSlotIndex = Number.parseInt(extMatch[1] || "", 10);
    if (!Number.isNaN(extSlotIndex)) {
      return `${extSlotLabel} ${extSlotIndex}`;
    }
    return extSlotLabel;
  }

  const amsMatch = normalized.match(/(?:^|_)ams[_-](\d+)[_-]slot[_-](\d+)$/i);
  if (amsMatch) {
    return `AMS ${Number.parseInt(amsMatch[1], 10)} · ${slotLabel} ${Number.parseInt(amsMatch[2], 10)}`;
  }

  const mmuMatch = normalized.match(/(?:^|_)mmu3?[_-](?:channel|slot)[_-](\d+)$/i);
  if (mmuMatch) {
    return `MMU3 · ${channelLabel} ${Number.parseInt(mmuMatch[1], 10)}`;
  }

  const toolheadMatch = normalized.match(/(?:^|_)toolhead[_-](\d+)$/i);
  if (toolheadMatch) {
    return `${toolheadLabel} ${Number.parseInt(toolheadMatch[1], 10)}`;
  }

  return normalized;
}

function formatFreeformPlacementLabel(label, locale = "en") {
  const rawPrinterSlotMatch = String(label || "").match(
    /printer_[A-Za-z0-9_]+(?:_ams_\d+_slot_\d+|(?:_ext|_external)(?:_slot(?:_\d+)?)?|_mmu3?_(?:channel|slot)_\d+|_toolhead_\d+)/i,
  );
  if (!rawPrinterSlotMatch) {
    return label;
  }

  const slotLabel = formatPrinterSlotTokenLabel(rawPrinterSlotMatch[0], locale);
  if (!slotLabel) {
    return label;
  }
  return label.replace(rawPrinterSlotMatch[0], slotLabel);
}

export function formatPlacementLabel(value, locale = "en") {
  const normalizedLocale = normalizeCompanionLocale(locale);
  const placement = parsePlacementLocation(value);
  if (placement.kind === "unassigned") {
    return t(normalizedLocale, "format.unassigned", "Unassigned");
  }

  if (placement.kind === "freeform") {
    return formatFreeformPlacementLabel(placement.label, normalizedLocale);
  }

  return `${placement.printerName} · ${formatPrinterSlotTokenLabel(placement.slotId, normalizedLocale)}`;
}

export function formatStatusLabel(value, locale = "en") {
  const normalizedLocale = normalizeCompanionLocale(locale);
  const normalized = parseSpoolStatus(value) || normalizeDomainToken(value);
  switch (normalized) {
    case "IN_STOCK":
      return t(normalizedLocale, "format.inStock", "In stock");
    case "ASSIGNED":
    case "IN_USE":
      return t(normalizedLocale, "format.assigned", "Assigned");
    case "BORROWED":
      return t(normalizedLocale, "format.loanedOut", "Loaned out");
    case "EMPTY":
      return t(normalizedLocale, "format.empty", "Empty");
    case "LOST":
      return t(normalizedLocale, "format.lost", "Lost");
    default:
      return normalized
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(" ") || t(normalizedLocale, "format.unknown", "Unknown");
  }
}

export function ownershipLabel(spool, locale = "en") {
  const normalizedLocale = normalizeCompanionLocale(locale);
  return isBorrowedInOwnership(spool?.ownership_type)
    ? t(normalizedLocale, "format.borrowedIn", "Borrowed in")
    : t(normalizedLocale, "format.owned", "Owned");
}
