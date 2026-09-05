import {
  auditBambuCatalogSource,
  auditEsunCatalogSource,
  auditLibrarySyncHostVendorCatalog,
  refreshBambuCatalog,
  refreshEsunCatalog,
  refreshLibrarySyncHostVendorCatalog,
  startCatalogRefreshJob,
  getCatalogRefreshJob,
  startLibrarySyncHostCatalogRefreshJob,
  getLibrarySyncHostCatalogRefreshJob,
  updateLibrarySyncHostMasterCatalogEntry,
  updateMasterCatalogEntry,
  type CatalogRefreshResult,
  type CatalogSourceAuditResult,
  type UpdateMasterCatalogEntryInput,
  type StartCatalogRefreshJobInput,
} from "./tauri_client";
import { requireClientHostWriteTarget } from "./host_write_target";

export type CatalogWriteTarget = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
};

export async function startManagedCatalogRefreshJob(
  input: StartCatalogRefreshJobInput,
  target: CatalogWriteTarget,
) {
  if (target.clientReadOnly) {
    const host = requireClientHostWriteTarget(target, "Host connection details are missing for this catalog action.");
    return startLibrarySyncHostCatalogRefreshJob(host.baseUrl, host.libraryId, input);
  }
  return startCatalogRefreshJob(input);
}

export async function getManagedCatalogRefreshJob(
  jobId: string | null,
  target: CatalogWriteTarget,
) {
  if (target.clientReadOnly) {
    const host = requireClientHostWriteTarget(target, "Host connection details are missing for this catalog action.");
    return getLibrarySyncHostCatalogRefreshJob(host.baseUrl, host.libraryId, jobId);
  }
  return getCatalogRefreshJob(jobId);
}

type CatalogWriteDependencies = {
  auditHostVendorCatalog?: typeof auditLibrarySyncHostVendorCatalog;
  auditLocalBambuCatalog?: typeof auditBambuCatalogSource;
  auditLocalEsunCatalog?: typeof auditEsunCatalogSource;
  refreshHostVendorCatalog?: typeof refreshLibrarySyncHostVendorCatalog;
  refreshLocalBambuCatalog?: typeof refreshBambuCatalog;
  refreshLocalEsunCatalog?: typeof refreshEsunCatalog;
  updateHostMasterCatalogEntry?: typeof updateLibrarySyncHostMasterCatalogEntry;
  updateLocalMasterCatalogEntry?: typeof updateMasterCatalogEntry;
};

export async function auditManagedVendorCatalog(
  vendor: "Bambu" | "eSUN",
  target: CatalogWriteTarget = {},
  dependencies: CatalogWriteDependencies = {},
): Promise<CatalogSourceAuditResult> {
  const auditHostVendorCatalog =
    dependencies.auditHostVendorCatalog ?? auditLibrarySyncHostVendorCatalog;
  const auditLocalBambuCatalog =
    dependencies.auditLocalBambuCatalog ?? auditBambuCatalogSource;
  const auditLocalEsunCatalog = dependencies.auditLocalEsunCatalog ?? auditEsunCatalogSource;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this catalog action.",
    );
    return auditHostVendorCatalog(hostTarget.baseUrl, hostTarget.libraryId, vendor);
  }

  return vendor === "Bambu" ? auditLocalBambuCatalog() : auditLocalEsunCatalog();
}

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
  materialType: string,
  target: CatalogWriteTarget = {},
  dependencies: CatalogWriteDependencies = {},
): Promise<CatalogRefreshResult> {
  const normalizedMaterialType = materialType.trim();
  if (!normalizedMaterialType) {
    throw new Error("Choose exactly one material type before refreshing the catalog.");
  }
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
      [normalizedMaterialType],
    );
  }

  return vendor === "Bambu"
    ? refreshLocalBambuCatalog([normalizedMaterialType])
    : refreshLocalEsunCatalog([normalizedMaterialType]);
}
