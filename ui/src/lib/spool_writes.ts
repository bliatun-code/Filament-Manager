import {
  createLibrarySyncHostSpool,
  createManualSpool,
  createSpool,
  deleteLibrarySyncHostSpool,
  deleteSpool,
  purgeLibrarySyncHostSpool,
  purgeSpool,
  updateLibrarySyncHostSpoolDetails,
  updateLibrarySyncHostSpoolRfidTag,
  updateLibrarySyncHostSpoolTareWeight,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolDetails,
  updateSpoolRfidTag,
  updateSpoolStatus,
  updateSpoolTareWeight,
  updateSpoolWeight,
  type CreateManualSpoolInput,
  type CreateSpoolInput,
  type DeleteSpoolInput,
  type PurgeSpoolInput,
  type UpdateSpoolDetailsInput,
  type UpdateSpoolRfidTagInput,
} from "./tauri_client";
import { requireClientHostWriteTarget } from "./host_write_target";

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
  updateHostSpoolWeight?: typeof updateLibrarySyncHostSpoolWeight;
  updateLocalSpoolWeight?: typeof updateSpoolWeight;
  updateHostSpoolTareWeight?: typeof updateLibrarySyncHostSpoolTareWeight;
  updateLocalSpoolTareWeight?: typeof updateSpoolTareWeight;
  updateHostSpoolRfidTag?: typeof updateLibrarySyncHostSpoolRfidTag;
  updateLocalSpoolRfidTag?: typeof updateSpoolRfidTag;
};

const missingSpoolHostTargetMessage =
  "Host connection details are missing for this spool action.";

export async function createInventorySpoolFromMaster(
  input: CreateSpoolInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<string> {
  const createHostSpool = dependencies.createHostSpool ?? createLibrarySyncHostSpool;
  const createLocalSpool = dependencies.createLocalSpool ?? createSpool;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
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
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
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
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
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
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
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
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
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
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
    await purgeHostSpool(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await purgeLocalSpool(input);
}

export async function updateInventorySpoolWeight(
  spoolId: string,
  grams: number,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const updateHostSpoolWeight =
    dependencies.updateHostSpoolWeight ?? updateLibrarySyncHostSpoolWeight;
  const updateLocalSpoolWeight = dependencies.updateLocalSpoolWeight ?? updateSpoolWeight;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
    await updateHostSpoolWeight(hostTarget.baseUrl, hostTarget.libraryId, spoolId, grams);
    return;
  }

  await updateLocalSpoolWeight(spoolId, grams);
}

export async function updateInventorySpoolTareWeight(
  spoolId: string,
  grams: number,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const updateHostSpoolTareWeight =
    dependencies.updateHostSpoolTareWeight ?? updateLibrarySyncHostSpoolTareWeight;
  const updateLocalSpoolTareWeight =
    dependencies.updateLocalSpoolTareWeight ?? updateSpoolTareWeight;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
    await updateHostSpoolTareWeight(hostTarget.baseUrl, hostTarget.libraryId, spoolId, grams);
    return;
  }

  await updateLocalSpoolTareWeight(spoolId, grams);
}

export async function updateInventorySpoolRfidTag(
  input: UpdateSpoolRfidTagInput,
  target: SpoolWriteTarget = {},
  dependencies: SpoolWriteDependencies = {},
): Promise<void> {
  const updateHostSpoolRfidTag =
    dependencies.updateHostSpoolRfidTag ?? updateLibrarySyncHostSpoolRfidTag;
  const updateLocalSpoolRfidTag =
    dependencies.updateLocalSpoolRfidTag ?? updateSpoolRfidTag;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(target, missingSpoolHostTargetMessage);
    await updateHostSpoolRfidTag(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await updateLocalSpoolRfidTag(input);
}
