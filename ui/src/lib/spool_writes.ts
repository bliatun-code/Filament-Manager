import {
  createLibrarySyncHostSpool,
  createManualSpool,
  createSpool,
  type CreateManualSpoolInput,
  type CreateSpoolInput,
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
