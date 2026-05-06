import {
  createLibrarySyncHostSpool,
  createManualSpool,
  createSpool,
  deleteLibrarySyncHostSpool,
  deleteSpool,
  purgeLibrarySyncHostSpool,
  purgeSpool,
  updateLibrarySyncHostSpoolDetails,
  updateSpoolDetails,
  updateSpoolStatus,
  type CreateManualSpoolInput,
  type CreateSpoolInput,
  type DeleteSpoolInput,
  type PurgeSpoolInput,
  type UpdateSpoolDetailsInput,
} from "./tauri_client";

export type SpoolWriteTarget = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

type SpoolWriteDependencies = {
  createHostSpool?: typeof createLibrarySyncHostSpool;
  createLocalSpool?: typeof createSpool;
  createLocalManualSpool?: typeof createManualSpool;
  updateHostSpoolDetails?: typeof updateLibrarySyncHostSpoolDetails;
  updateLocalSpoolDetails?: typeof updateSpoolDetails;
  updateLocalSpoolStatus?: typeof updateSpoolStatus;
  deleteHostSpool?: typeof deleteLibrarySyncHostSpool;
  deleteLocalSpool?: typeof deleteSpool;
  purgeHostSpool?: typeof purgeLibrarySyncHostSpool;
  purgeLocalSpool?: typeof purgeSpool;
};

function requireClientHostTarget(target: SpoolWriteTarget): {
  baseUrl: string;
  libraryId: string;
} {
  if (!target.clientHostBaseUrl?.trim() || !target.clientLibraryId?.trim()) {
    throw new Error("Host connection details are missing for this spool action.");
  }
  return {
    baseUrl: target.clientHostBaseUrl,
    libraryId: target.clientLibraryId,
  };
}

export async function createInventorySpoolFromMaster(
  input: CreateSpoolInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<string> {
  const createHostSpool = dependencies.createHostSpool ?? createLibrarySyncHostSpool;
  const createLocalSpool = dependencies.createLocalSpool ?? createSpool;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    return createHostSpool(hostTarget.baseUrl, hostTarget.libraryId, input);
  }

  await createLocalSpool(input);
  return input.id;
}

export async function createManualInventorySpool(
  input: CreateManualSpoolInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<string> {
  const createHostSpool = dependencies.createHostSpool ?? createLibrarySyncHostSpool;
  const createLocalManualSpool =
    dependencies.createLocalManualSpool ?? createManualSpool;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    return createHostSpool(hostTarget.baseUrl, hostTarget.libraryId, input);
  }

  await createLocalManualSpool(input);
  return input.id;
}

export async function updateInventorySpoolDetails(
  input: UpdateSpoolDetailsInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const updateHostSpoolDetails =
    dependencies.updateHostSpoolDetails ?? updateLibrarySyncHostSpoolDetails;
  const updateLocalSpoolDetails = dependencies.updateLocalSpoolDetails ?? updateSpoolDetails;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await updateHostSpoolDetails(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await updateLocalSpoolDetails(input);
}

export async function updateInventorySpoolStatus(
  input: UpdateSpoolDetailsInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const updateHostSpoolDetails =
    dependencies.updateHostSpoolDetails ?? updateLibrarySyncHostSpoolDetails;
  const updateLocalSpoolStatus = dependencies.updateLocalSpoolStatus ?? updateSpoolStatus;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await updateHostSpoolDetails(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await updateLocalSpoolStatus(input.spool_id, input.status);
}

export async function deleteInventorySpool(
  input: DeleteSpoolInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const deleteHostSpool = dependencies.deleteHostSpool ?? deleteLibrarySyncHostSpool;
  const deleteLocalSpool = dependencies.deleteLocalSpool ?? deleteSpool;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await deleteHostSpool(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await deleteLocalSpool(input);
}

export async function purgeInventorySpool(
  input: PurgeSpoolInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const purgeHostSpool = dependencies.purgeHostSpool ?? purgeLibrarySyncHostSpool;
  const purgeLocalSpool = dependencies.purgeLocalSpool ?? purgeSpool;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await purgeHostSpool(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await purgeLocalSpool(input);
}
