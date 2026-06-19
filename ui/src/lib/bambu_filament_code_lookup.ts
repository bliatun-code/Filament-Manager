import type { MasterCatalogRow } from "./tauri_client";

export type BambuFilamentCodeLookupStatus =
  | "no_code"
  | "no_match"
  | "single_active"
  | "multiple_active"
  | "discontinued_only";

export type BambuFilamentCodeLookup = {
  code: string | null;
  status: BambuFilamentCodeLookupStatus;
  matches: MasterCatalogRow[];
  activeMatches: MasterCatalogRow[];
  discontinuedMatches: MasterCatalogRow[];
};

// Avoid lookbehind so Companion/manual lookup works in older mobile browsers too.
const FILAMENT_CODE_GLOBAL_PATTERN = /(?:^|\D)(\d{5})(?!\d)/g;

const BAMBU_BOX_CODE_ALIASES: Record<string, string> = {
  "6975337031338": "11101",
  "A01-K1-1.75-1000-SPL": "11101",
};

function isBambuCatalogMaster(master: MasterCatalogRow): boolean {
  return master.vendor.trim().toLowerCase().includes("bambu");
}

function catalogSortKey(master: MasterCatalogRow): string {
  return `${master.material} ${master.filament_name} ${master.color_name}`.toLowerCase();
}

export function extractBambuFilamentCode(value: string | null | undefined): string | null {
  return extractBambuFilamentCodes(value)[0] ?? null;
}

export function extractBambuFilamentCodes(value: string | null | undefined): string[] {
  return Array.from(
    String(value ?? "").matchAll(FILAMENT_CODE_GLOBAL_PATTERN),
    (match) => match[1],
  ).filter((code): code is string => Boolean(code));
}

function normalizedBambuBoxValue(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—―]/g, "-");
}

function uniqueCodes(codes: string[]): string[] {
  return Array.from(new Set(codes));
}

export function resolveBambuFilamentCodes(value: string | null | undefined): string[] {
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

export function resolveBambuFilamentCode(value: string | null | undefined): string | null {
  return resolveBambuFilamentCodes(value)[0] ?? null;
}

export function catalogMasterBambuFilamentCode(master: MasterCatalogRow): string | null {
  if (!isBambuCatalogMaster(master)) {
    return null;
  }
  return extractBambuFilamentCode(master.color_name);
}

export function catalogMasterMatchesBambuFilamentCode(
  master: MasterCatalogRow,
  code: string | null | undefined,
): boolean {
  return code ? catalogMasterBambuFilamentCode(master) === code : false;
}

export function buildBambuFilamentCodeLookup(
  masters: MasterCatalogRow[],
  rawQuery: string,
): BambuFilamentCodeLookup {
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

  const matches = masters
    .filter((master) => catalogMasterMatchesBambuFilamentCode(master, code))
    .sort((left, right) => {
      if (left.is_discontinued !== right.is_discontinued) {
        return Number(left.is_discontinued) - Number(right.is_discontinued);
      }
      return catalogSortKey(left).localeCompare(catalogSortKey(right));
    });
  const activeMatches = matches.filter((master) => !master.is_discontinued);
  const discontinuedMatches = matches.filter((master) => master.is_discontinued);

  let status: BambuFilamentCodeLookupStatus = "no_match";
  if (activeMatches.length === 1) {
    status = "single_active";
  } else if (activeMatches.length > 1) {
    status = "multiple_active";
  } else if (discontinuedMatches.length > 0) {
    status = "discontinued_only";
  }

  return {
    code,
    status,
    matches,
    activeMatches,
    discontinuedMatches,
  };
}

export function bambuFilamentCodeLookupRequiresExplicitSelection(
  lookup: BambuFilamentCodeLookup,
): boolean {
  return lookup.status === "multiple_active" || lookup.status === "discontinued_only";
}
