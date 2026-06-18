function normalizedText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedHex(value) {
  const hex = String(value || "").trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : "";
}

function normalizedSwatchHexes(value) {
  return String(value || "")
    .split(/[;,]/)
    .map(normalizedHex)
    .filter(Boolean);
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
  const liveMaterial = normalizedText(slot?.live_filament_type);
  const rowMaterial = normalizedText(row?.master?.material);
  const rowFilament = normalizedText(row?.master?.filament_name);
  const materialMatches =
    Boolean(liveMaterial) &&
    (rowMaterial === liveMaterial ||
      rowFilament === liveMaterial ||
      rowFilament.includes(liveMaterial) ||
      liveMaterial.includes(rowMaterial));
  if (!materialMatches) {
    return false;
  }

  const liveHex = normalizedHex(slot?.live_color_hex);
  const rowHexes = normalizedSwatchHexes(row?.master?.hex_color);
  if (liveHex && rowHexes.length > 0) {
    return rowHexes.includes(liveHex);
  }

  const liveName = normalizedText(slot?.live_filament_name || slot?.live_tray_id_name);
  const rowColor = normalizedText(row?.master?.color_name);
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
    if (preferred && rowCanReceiveLiveBambuRfid(preferred)) {
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
