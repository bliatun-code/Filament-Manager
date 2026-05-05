import {
  fetchLibrarySyncCatalogMasters,
  listMasterCatalog,
  type MasterCatalogRow,
} from "./tauri_client";

export type CatalogDataSourceOptions = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  limit?: number;
  search?: string | null;
};

type CatalogDataSourceDependencies = {
  fetchHostCatalog?: typeof fetchLibrarySyncCatalogMasters;
  listLocalCatalog?: typeof listMasterCatalog;
};

export type CatalogSelectionDefaults = {
  bambuMasterId: string;
  esunMasterId: string;
};

export async function loadCatalogMasters(
  options: CatalogDataSourceOptions = {},
  dependencies: CatalogDataSourceDependencies = {},
): Promise<MasterCatalogRow[]> {
  const fetchHostCatalog = dependencies.fetchHostCatalog ?? fetchLibrarySyncCatalogMasters;
  const listLocalCatalog = dependencies.listLocalCatalog ?? listMasterCatalog;
  const { clientReadOnly = false, clientHostBaseUrl, clientLibraryId, limit = 1000, search } =
    options;

  if (clientReadOnly && clientHostBaseUrl && clientLibraryId) {
    return fetchHostCatalog(clientHostBaseUrl, clientLibraryId, limit, search ?? null);
  }

  return listLocalCatalog(limit, search ?? undefined);
}

export function resolveCatalogSelectionDefaults(
  rows: MasterCatalogRow[],
  currentBambuMasterId = "",
  currentEsunMasterId = "",
): CatalogSelectionDefaults {
  if (rows.length === 0) {
    return {
      bambuMasterId: currentBambuMasterId,
      esunMasterId: currentEsunMasterId,
    };
  }

  const firstBambu = rows.find((row) => row.vendor.toLowerCase().includes("bambu"));
  const firstEsun = rows.find((row) => row.vendor.toLowerCase().includes("esun"));

  return {
    bambuMasterId: currentBambuMasterId || firstBambu?.id || rows[0].id,
    esunMasterId: currentEsunMasterId || firstEsun?.id || "",
  };
}
