// Avoid lookbehind so manual lookup works in older mobile browsers too.
const FILAMENT_CODE_GLOBAL_PATTERN = /(?:^|\D)(\d{5})(?!\d)/g;
const BAMBU_BOX_CODE_ALIASES = {
  "6975337031338": "11101",
  "A01-K1-1.75-1000-SPL": "11101",
};

function isBambuCatalogMaster(master) {
  return String(master?.vendor || "").trim().toLowerCase().includes("bambu");
}

function catalogSortKey(master) {
  return `${master?.material || ""} ${master?.filament_name || ""} ${master?.color_name || ""}`.toLowerCase();
}

export function extractBambuFilamentCode(value) {
  return extractBambuFilamentCodes(value)[0] || null;
}

export function extractBambuFilamentCodes(value) {
  return Array.from(
    String(value ?? "").matchAll(FILAMENT_CODE_GLOBAL_PATTERN),
    (match) => match[1],
  ).filter(Boolean);
}

function normalizedBambuBoxValue(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—―]/g, "-");
}

function uniqueCodes(codes) {
  return Array.from(new Set(codes));
}

export function resolveBambuFilamentCodes(value) {
  const directCodes = extractBambuFilamentCodes(value);
  if (directCodes.length > 0) {
    return uniqueCodes(directCodes);
  }

  const normalized = normalizedBambuBoxValue(value);
  if (!normalized) {
    return [];
  }

  return uniqueCodes(
    Object.entries(BAMBU_BOX_CODE_ALIASES).flatMap(([alias, code]) =>
      normalized.includes(alias) ? [code] : [],
    ),
  );
}

export function resolveBambuFilamentCode(value) {
  return resolveBambuFilamentCodes(value)[0] || null;
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
  const code = resolveBambuFilamentCode(rawQuery);
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

export function bambuFilamentCodeLookupRequiresExplicitSelection(lookup) {
  return lookup?.status === "multiple_active" || lookup?.status === "discontinued_only";
}
