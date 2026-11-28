import { invoke } from "./tauri_invoke";
import { createAppError } from "./error_text";

export type CatalogSpoolBatchInput = {
  batch_id: string;
  ams_assignment?: { printer_id: string; slot_id: string; rfid_tag: string; observed_at: string };
  master_ids: string[];
  initial_weight_g: number;
  ownership_type: "OWNED" | "BORROWED_IN";
  owner_name: string | null;
  owner_contact: string | null;
  ownership_note: string | null;
  location: string | null;
};

export type CatalogSpoolBatchReceipt = { batch_id: string; spool_ids: string[] };
export type CatalogSpoolBatchTarget = {
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
};

export function catalogSpoolBatchTargetKey(target: CatalogSpoolBatchTarget): string | null {
  const library = target.clientLibraryId?.trim();
  const generation = target.clientTargetGeneration;
  const host = target.clientHostBaseUrl?.trim().replace(/\/+$/, "");
  if (!library || !Number.isSafeInteger(generation) || (generation ?? -1) < 0 ||
    (target.clientReadOnly && !host)) return null;
  return JSON.stringify([target.clientReadOnly ? host : "local", library, generation]);
}

function hostBatchInput<T>(target: CatalogSpoolBatchTarget, batch: T) {
  return {
    base_url: target.clientHostBaseUrl?.trim(),
    expected_library_id: target.clientLibraryId?.trim(),
    expected_target_generation: target.clientTargetGeneration,
    batch,
  };
}

export function supportsHostAmsRegistration(target: CatalogSpoolBatchTarget, batch: CatalogSpoolBatchInput) {
  return invoke<boolean>("supports_library_sync_host_ams_registration", { input: hostBatchInput(target, batch) });
}

export async function createCatalogSpoolBatch(
  input: CatalogSpoolBatchInput,
  target: CatalogSpoolBatchTarget,
): Promise<CatalogSpoolBatchReceipt> {
  if (!catalogSpoolBatchTargetKey(target)) throw createAppError("common.forbidden");
  if (target.clientReadOnly) {
    return invoke<CatalogSpoolBatchReceipt>("create_library_sync_host_catalog_spool_batch", {
      input: hostBatchInput(target, input),
    });
  }
  return invoke<CatalogSpoolBatchReceipt>("create_catalog_spool_batch", {
    input,
    expectedLibraryId: target.clientLibraryId!.trim(),
    expectedTargetGeneration: target.clientTargetGeneration!,
  });
}

export type ExistingSpoolRfidRegistration = {
  request_id: string;
  spool_id: string;
  expected_rfid: string | null;
  assign_empty_slot: boolean;
  observation: NonNullable<CatalogSpoolBatchInput["ams_assignment"]>;
};

// Only a capability check before the POST can return null.
export async function writeReviewedSpoolRfid(target: CatalogSpoolBatchTarget, registration: ExistingSpoolRfidRegistration) {
  if (!catalogSpoolBatchTargetKey(target)) throw createAppError("common.invalid_request");
  if (target.clientReadOnly) {
    return invoke<CatalogSpoolBatchReceipt | { preflight_error: string } | null>("register_library_sync_host_existing_spool_rfid", {
      input: hostBatchInput(target, registration),
    });
  }
  return invoke<CatalogSpoolBatchReceipt>("register_existing_spool_rfid", {
    input: registration, expectedLibraryId: target.clientLibraryId, expectedTargetGeneration: target.clientTargetGeneration,
  });
}
