import {
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

export type CatalogSourceVendor = "Bambu" | "eSUN";

export type CatalogSourcePreferences = {
  Bambu: string[];
  eSUN: string[];
};

type CatalogSourcePreferenceOptions = {
  cacheScope?: string | null;
  storage?: LocalPreferenceStorage | null;
};

export const CATALOG_SOURCE_PREFERENCES_STORAGE_KEY_PREFIX =
  "filament-manager:catalog-source-materials";
export const CATALOG_SOURCE_PREFERENCES_VERSION = 1;
export const MAX_CATALOG_SOURCE_CACHE_SCOPE_LENGTH = 256;
export const MAX_CATALOG_SOURCE_MATERIAL_LENGTH = 80;
export const MAX_CATALOG_SOURCE_MATERIALS_PER_VENDOR = 64;

export function emptyCatalogSourcePreferences(): CatalogSourcePreferences {
  return { Bambu: [], eSUN: [] };
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizeMaterials(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const materials: string[] = [];
  const seen = new Set<string>();
  for (const rawMaterial of value) {
    const material = normalizeText(rawMaterial, MAX_CATALOG_SOURCE_MATERIAL_LENGTH);
    const comparisonKey = material?.toLocaleUpperCase("en-US");
    if (!material || !comparisonKey || seen.has(comparisonKey)) {
      continue;
    }
    materials.push(material);
    seen.add(comparisonKey);
    if (materials.length >= MAX_CATALOG_SOURCE_MATERIALS_PER_VENDOR) {
      break;
    }
  }

  return materials.sort((left, right) => left.localeCompare(right));
}

export function normalizeCatalogSourcePreferences(
  value: unknown,
): CatalogSourcePreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<Record<CatalogSourceVendor, unknown>>;
  const bambu = normalizeMaterials(candidate.Bambu);
  const esun = normalizeMaterials(candidate.eSUN);
  return bambu && esun ? { Bambu: bambu, eSUN: esun } : null;
}

export function catalogSourcePreferencesStorageKey(
  cacheScope: string | null | undefined,
): string | null {
  const normalizedScope = normalizeText(
    cacheScope,
    MAX_CATALOG_SOURCE_CACHE_SCOPE_LENGTH,
  );
  return normalizedScope
    ? `${CATALOG_SOURCE_PREFERENCES_STORAGE_KEY_PREFIX}:${normalizedScope}`
    : null;
}

export function readCatalogSourcePreferences({
  cacheScope,
  storage,
}: CatalogSourcePreferenceOptions = {}): CatalogSourcePreferences {
  const key = catalogSourcePreferencesStorageKey(cacheScope);
  if (!key) {
    return emptyCatalogSourcePreferences();
  }
  return readVersionedLocalPreference({
    fallback: emptyCatalogSourcePreferences(),
    key,
    normalize: normalizeCatalogSourcePreferences,
    storage,
    version: CATALOG_SOURCE_PREFERENCES_VERSION,
  });
}

export function writeCatalogSourcePreferences(
  value: CatalogSourcePreferences,
  { cacheScope, storage }: CatalogSourcePreferenceOptions = {},
): boolean {
  const key = catalogSourcePreferencesStorageKey(cacheScope);
  if (!key) {
    return false;
  }
  return writeVersionedLocalPreference({
    key,
    normalize: normalizeCatalogSourcePreferences,
    storage,
    value,
    version: CATALOG_SOURCE_PREFERENCES_VERSION,
  });
}

export function replaceCatalogSourceMaterials(
  preferences: CatalogSourcePreferences,
  vendor: CatalogSourceVendor,
  materials: string[],
): CatalogSourcePreferences {
  const normalized = normalizeMaterials(materials) ?? [];
  return {
    ...preferences,
    [vendor]: normalized,
  };
}
