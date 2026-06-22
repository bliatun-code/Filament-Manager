import {
  refreshBambuCatalog,
  refreshEsunCatalog,
  refreshLibrarySyncHostVendorCatalog,
  updateLibrarySyncHostMasterCatalogEntry,
  updateMasterCatalogEntry,
  type CatalogRefreshResult,
  type UpdateMasterCatalogEntryInput,
} from "./tauri_client";
import { requireClientHostWriteTarget } from "./host_write_target";

export type CatalogWriteTarget = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

type CatalogWriteDependencies = {
  refreshHostVendorCatalog?: typeof refreshLibrarySyncHostVendorCatalog;
  refreshLocalBambuCatalog?: typeof refreshBambuCatalog;
  refreshLocalEsunCatalog?: typeof refreshEsunCatalog;
  updateHostMasterCatalogEntry?: typeof updateLibrarySyncHostMasterCatalogEntry;
  updateLocalMasterCatalogEntry?: typeof updateMasterCatalogEntry;
};

export async function updateManagedMasterCatalogEntry(
  input: UpdateMasterCatalogEntryInput,
  target: CatalogWriteTarget = {},
  dependencies: CatalogWriteDependencies = {},
): Promise<string | void> {
  const updateHostMasterCatalogEntry =
    dependencies.updateHostMasterCatalogEntry ?? updateLibrarySyncHostMasterCatalogEntry;
  const updateLocalMasterCatalogEntry =
    dependencies.updateLocalMasterCatalogEntry ?? updateMasterCatalogEntry;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this catalog action.",
    );
    await updateHostMasterCatalogEntry(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  return updateLocalMasterCatalogEntry(input);
}

export async function refreshManagedVendorCatalog(
  vendor: "Bambu" | "eSUN",
  materialTypes: string[],
  target: CatalogWriteTarget = {},
  dependencies: CatalogWriteDependencies = {},
): Promise<CatalogRefreshResult> {
  const refreshHostVendorCatalog =
    dependencies.refreshHostVendorCatalog ?? refreshLibrarySyncHostVendorCatalog;
  const refreshLocalBambuCatalog = dependencies.refreshLocalBambuCatalog ?? refreshBambuCatalog;
  const refreshLocalEsunCatalog = dependencies.refreshLocalEsunCatalog ?? refreshEsunCatalog;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this catalog action.",
    );
    return refreshHostVendorCatalog(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      vendor,
      materialTypes,
    );
  }

  return vendor === "Bambu"
    ? refreshLocalBambuCatalog(materialTypes)
    : refreshLocalEsunCatalog(materialTypes);
}
