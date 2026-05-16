import { resolveSpoolRowTareWeight } from "./companion_spool_weight.js";
import { normalizeHex } from "./companion_theme.js";

function catalogMatchesSource(master, source) {
  const vendor = String(master?.vendor || "").trim().toLowerCase();
  if (source === "esun") {
    return vendor.includes("esun");
  }
  return vendor.includes("bambu");
}

function resolveCatalogMaster(catalogMasters, masterIdValue, sourceValue) {
  const source = String(sourceValue || "").trim().toLowerCase();
  if (source === "manual") {
    return null;
  }

  const masterId = String(masterIdValue || "").trim();
  const selected = catalogMasters.find((master) => master?.id === masterId) || null;
  if (catalogMatchesSource(selected, source)) {
    return selected;
  }
  return catalogMasters.find((master) => catalogMatchesSource(master, source)) || null;
}

export function createCompanionMutationHelpers({ state, fetchJson, tr }) {
  function translateKnownCompanionError(message) {
    const normalized = String(message || "").trim();
    if (!normalized) {
      return "";
    }
    switch (normalized) {
      case "Loaded spools use printer-slot actions instead of manual status/location edits":
        return tr(
          "status.loadedSpoolEditBlocked",
          "Loaded spools use printer-slot actions instead of manual status/location edits",
        );
      case "Loaned-out spools use the companion loan return flow instead of manual status/location edits":
        return tr(
          "status.loanedOutEditBlocked",
          "Loaned-out spools use the companion loan return flow instead of manual status/location edits",
        );
      case "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST":
        return tr(
          "status.browserStatusLocationLimited",
          "Browser status/location edits are limited to IN_STOCK, EMPTY, or LOST",
        );
      default:
        return normalized;
    }
  }

  function findSpoolRow(spoolId) {
    const normalizedSpoolId = String(spoolId || "").trim();
    if (!normalizedSpoolId) {
      return null;
    }
    return (
      (Array.isArray(state.spools) ? state.spools : []).find(
        (row) => String(row?.spool?.id || "").trim() === normalizedSpoolId,
      ) || null
    );
  }

  function normalizeMeasuredFilamentWeight(row, measuredWeight) {
    const tareWeight = resolveSpoolRowTareWeight(row);
    return Math.max(0, Math.round(measuredWeight - tareWeight));
  }

  function normalizeAddSpoolValues(values) {
    const source = String(values.source || "bambu").trim().toLowerCase();
    const ownershipType =
      String(values.ownershipType || "").trim().toUpperCase() === "BORROWED_IN"
        ? "BORROWED_IN"
        : "OWNED";
    const ownerName = String(values.ownerName || "").trim();
    const ownerContact = String(values.ownerContact || "").trim();
    const note = String(values.note || "").trim();
    const location = String(values.location || "").trim();
    const initialWeightText = String(values.initialWeight || "").trim();
    const parsedInitialWeight = Number.parseInt(initialWeightText, 10);
    const manualVendor = String(values.vendor || "").trim() || "Generic";
    const catalogMasters = Array.isArray(state.catalogMasters) ? state.catalogMasters : [];
    const master = resolveCatalogMaster(catalogMasters, values.masterId, source);
    const material =
      source === "manual" ? String(values.material || "").trim() : String(master?.material || "").trim();
    const filamentName =
      source === "manual"
        ? String(values.filamentName || "").trim()
        : String(master?.filament_name || "").trim();
    const colorName =
      source === "manual"
        ? String(values.colorName || "").trim()
        : String(master?.color_name || "").trim();
    const vendor = source === "manual" ? manualVendor : String(master?.vendor || "").trim();
    const hexColorText = String(values.hexColor || "").trim();
    const normalizedHexColor = hexColorText ? normalizeHex(hexColorText) : null;
    const fallbackWeight = master?.default_weight ?? 1000;

    return {
      source,
      ownershipType,
      ownerName,
      ownerContact,
      note,
      location,
      initialWeightText,
      parsedInitialWeight,
      initialWeight: initialWeightText ? parsedInitialWeight : fallbackWeight,
      master,
      material,
      filamentName,
      colorName,
      vendor,
      hexColorText,
      normalizedHexColor,
    };
  }

  async function postJson(path, body) {
    return fetchJson(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": state.csrfToken,
      },
      body: JSON.stringify(body),
    });
  }

  return {
    findSpoolRow,
    normalizeAddSpoolValues,
    normalizeMeasuredFilamentWeight,
    postJson,
    translateKnownCompanionError,
  };
}
