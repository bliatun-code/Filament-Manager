const FILAMENT_CODE_PATTERN = /(?<!\d)\d{5}(?!\d)/;

function isBambuCatalogMaster(master) {
  return String(master?.vendor || "").trim().toLowerCase().includes("bambu");
}

function catalogSortKey(master) {
  return `${master?.material || ""} ${master?.filament_name || ""} ${master?.color_name || ""}`.toLowerCase();
}

export function extractBambuFilamentCode(value) {
  return String(value || "").match(FILAMENT_CODE_PATTERN)?.[0] || null;
}

export function catalogMasterBambuFilamentCode(master) {
  if (!isBambuCatalogMaster(master)) {
    return null;
  }
  return extractBambuFilamentCode(master?.color_name);
}

export function catalogMasterMatchesBambuFilamentCode(master, code) {
  return code ? catalogMasterBambuFilamentCode(master) === code : false;
}

export function buildBambuFilamentCodeLookup(masters, rawQuery) {
  const code = extractBambuFilamentCode(rawQuery);
  if (!code) {
    return {
      code: null,
      status: "no_code",
      matches: [],
      activeMatches: [],
      discontinuedMatches: [],
    };
  }

  const matches = (Array.isArray(masters) ? masters : [])
    .filter((master) => catalogMasterMatchesBambuFilamentCode(master, code))
    .sort((left, right) => {
      if (Boolean(left.is_discontinued) !== Boolean(right.is_discontinued)) {
        return Number(Boolean(left.is_discontinued)) - Number(Boolean(right.is_discontinued));
      }
      return catalogSortKey(left).localeCompare(catalogSortKey(right));
    });
  const activeMatches = matches.filter((master) => !master.is_discontinued);
  const discontinuedMatches = matches.filter((master) => master.is_discontinued);
  let status = "no_match";
  if (activeMatches.length === 1) {
    status = "single_active";
  } else if (activeMatches.length > 1) {
    status = "multiple_active";
  } else if (discontinuedMatches.length > 0) {
    status = "discontinued_only";
  }

  return { code, status, matches, activeMatches, discontinuedMatches };
}
