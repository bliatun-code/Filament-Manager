function normalizedText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPOSITE_SWATCH_PATTERN = /^(multi|gradient)\((.*)\)$/i;
const LIVE_COLOR_MATCH_DISTANCE = 48;
const MATERIAL_FAMILY_TOKENS = [
  "pla",
  "petg",
  "abs",
  "asa",
  "tpu",
  "pc",
  "pa",
  "cpe",
  "hips",
  "pva",
  "pet",
  "pp",
  "pom",
  "support",
];

function normalizedHex(value) {
  const hex = String(value || "").trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) {
    return `#${hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : "";
}

function materialFamilyFromText(value) {
  const tokens = normalizedText(value).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }
  return (
    MATERIAL_FAMILY_TOKENS.find((family) => tokens.some((token) => token === family)) ||
    MATERIAL_FAMILY_TOKENS.find((family) => tokens.some((token) => token.startsWith(family))) ||
    ""
  );
}

function normalizedSwatchHexes(value) {
  const raw = String(value || "").trim();
  const solid = normalizedHex(raw);
  if (solid) {
    return [solid];
  }
  const compositeMatch = raw.match(COMPOSITE_SWATCH_PATTERN);
  const colorSource = compositeMatch ? compositeMatch[2] : raw;
  return colorSource
    .split(/[;,]/)
    .map(normalizedHex)
    .filter(Boolean);
}

function rgbFromHex(value) {
  const hex = normalizedHex(value).slice(1);
  if (hex.length !== 6) {
    return null;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return [red, green, blue].some((channel) => Number.isNaN(channel))
    ? null
    : [red, green, blue];
}

function colorDistance(left, right) {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function swatchMatchesObservedColor(observedHex, candidateHexes) {
  const observedRgb = rgbFromHex(observedHex);
  if (!observedRgb || candidateHexes.length === 0) {
    return false;
  }
  return candidateHexes.some((candidateHex) => {
    const candidateRgb = rgbFromHex(candidateHex);
    return candidateRgb
      ? colorDistance(observedRgb, candidateRgb) <= LIVE_COLOR_MATCH_DISTANCE
      : false;
  });
}

export function liveSlotObservedRfid(slot) {
  return String(slot?.live_tray_uuid || slot?.live_observed_rfid_tag || "").trim();
}

export function liveSlotHasLoadedRoll(slot) {
  return slot?.live_loaded === true || slot?.loaded === true;
}

export function rowCanReceiveLiveBambuRfid(row) {
  const vendor = normalizedText(row?.master?.vendor);
  const status = String(row?.spool?.status || "").trim().toUpperCase();
  return (
    vendor.includes("bambu") &&
    !String(row?.spool?.rfid_tag || "").trim() &&
    !["EMPTY", "LOST", "DELETED", "MISSING", "BORROWED"].includes(status)
  );
}

export function rowMatchesLiveBambuSlot(slot, row) {
  if (!rowCanReceiveLiveBambuRfid(row)) {
    return false;
  }
  const liveMaterialFamily = materialFamilyFromText(
    slot?.live_filament_type || slot?.live_filament_name || slot?.live_tray_id_name,
  );
  const rowMaterialFamily = materialFamilyFromText(
    row?.master?.material || row?.master?.filament_name,
  );
  if (!liveMaterialFamily || liveMaterialFamily !== rowMaterialFamily) {
    return false;
  }

  const liveHex = normalizedHex(slot?.live_color_hex);
  const rowHexes = normalizedSwatchHexes(row?.master?.hex_color);
  if (liveHex) {
    return rowHexes.length > 0 ? swatchMatchesObservedColor(liveHex, rowHexes) : false;
  }

  const liveName = normalizedText(slot?.live_filament_name || slot?.live_tray_id_name);
  const rowColor = normalizedText(row?.master?.color_name);
  const rowFilament = normalizedText(row?.master?.filament_name);
  if (!liveName || !rowColor) {
    return false;
  }
  return liveName.includes(rowColor) || rowColor.includes(liveName) || rowFilament.includes(liveName);
}

export function buildLiveInventoryCandidateRows(slot, spoolRows) {
  const observedRfid = liveSlotObservedRfid(slot);
  if (
    slot?.spool_id ||
    slot?.live_match_status !== "unknown_rfid" ||
    !observedRfid ||
    !liveSlotHasLoadedRoll(slot)
  ) {
    return [];
  }

  const rows = Array.isArray(spoolRows) ? spoolRows : [];
  const candidates = [];
  const seenIds = new Set();
  const preferredId = String(slot?.live_matched_inventory_spool_id || "").trim();
  if (preferredId) {
    const preferred = rows.find((row) => String(row?.spool?.id || "").trim() === preferredId);
    if (preferred && rowMatchesLiveBambuSlot(slot, preferred)) {
      candidates.push(preferred);
      seenIds.add(preferredId);
    }
  }

  for (const row of rows) {
    const spoolId = String(row?.spool?.id || "").trim();
    if (!spoolId || seenIds.has(spoolId)) {
      continue;
    }
    if (!rowMatchesLiveBambuSlot(slot, row)) {
      continue;
    }
    candidates.push(row);
    seenIds.add(spoolId);
  }

  return candidates.slice(0, 3);
}
