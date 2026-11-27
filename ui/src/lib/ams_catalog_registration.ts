import { appErrorCode, createAppError } from "./error_text";
import { catalogSpoolBatchTargetKey, createCatalogSpoolBatch, supportsHostAmsRegistration, type CatalogSpoolBatchInput, type CatalogSpoolBatchReceipt, type CatalogSpoolBatchTarget } from "./tauri_catalog_spool_batch_client";
import { registerPrinterSlotCatalogSpool as registerOnLegacyHost } from "./printer_slot_writes";
import type { CreateSpoolInput, PrinterAmsSlotRow } from "./tauri_client";

type Observation = { printerId: string; slot: PrinterAmsSlotRow; observedRfid: string; rfidObservedAt: string };
export type PendingAmsRegistration = { batch: CatalogSpoolBatchInput; legacy: boolean };

export function amsRegistrationKey(target: CatalogSpoolBatchTarget, printer: string, slot: string, tag: string) {
  // Keep ambiguous legacy creates discoverable after reconnecting to the same library.
  return "filament-manager.ams-registration.v1:" + JSON.stringify([
    target.clientReadOnly ? target.clientHostBaseUrl : "local", target.clientLibraryId, printer, slot, tag,
  ]);
}

export function readAmsRegistration(key: string): PendingAmsRegistration | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const pending = JSON.parse(raw) as PendingAmsRegistration;
    if (typeof pending.legacy !== "boolean" || !pending.batch?.ams_assignment ||
        typeof pending.batch.batch_id !== "string" || pending.batch.master_ids?.length !== 1) {
      throw Error();
    }
    return pending;
  } catch { throw createAppError("inventory.batch.storage_failed"); }
}

export function clearAmsRegistration(key: string, batchId: string) {
  try {
    if (readAmsRegistration(key)?.batch.batch_id === batchId) localStorage.removeItem(key);
  }
  catch { throw createAppError("inventory.batch.storage_failed"); }
}

function persist(key: string, pending: PendingAmsRegistration) {
  try { localStorage.setItem(key, JSON.stringify(pending)); }
  catch { throw createAppError("inventory.batch.storage_failed"); }
}

export async function registerAmsCatalogSpool(
  target: CatalogSpoolBatchTarget, spool: CreateSpoolInput, observation: Observation, isCurrent: () => boolean,
  reviewed: PendingAmsRegistration | null,
) {
  if (!isCurrent() || !catalogSpoolBatchTargetKey(target)) throw createAppError("common.invalid_request");
  const { printerId, slot, observedRfid, rfidObservedAt } = observation;
  const key = amsRegistrationKey(target, printerId, slot.slot_id, observedRfid);
  const stored = readAmsRegistration(key);
  if (stored && stored.batch.batch_id !== reviewed?.batch.batch_id) throw createAppError("inventory.batch.conflict");
  const prior = reviewed;
  if (prior?.legacy) throw createAppError("inventory.batch.conflict");
  if (spool.initial_weight_g == null) throw createAppError("inventory.batch.invalid");
  const batch: CatalogSpoolBatchInput = prior?.batch ?? {
    batch_id: crypto.randomUUID(), master_ids: [spool.master_id],
    initial_weight_g: spool.initial_weight_g, ownership_type: spool.ownership_type === "BORROWED_IN" ? "BORROWED_IN" : "OWNED",
    owner_name: spool.owner_name ?? null, owner_contact: spool.owner_contact ?? null,
    ownership_note: spool.ownership_note ?? null, location: spool.location_id ?? null,
    ams_assignment: { printer_id: printerId, slot_id: slot.slot_id, rfid_tag: observedRfid, observed_at: rfidObservedAt },
  };
  if (batch.master_ids[0] !== spool.master_id || batch.ams_assignment?.printer_id !== printerId ||
      batch.ams_assignment.slot_id !== slot.slot_id || batch.ams_assignment.rfid_tag !== observedRfid) {
    throw createAppError("inventory.batch.conflict");
  }
  const legacy = !prior && target.clientReadOnly && !await supportsHostAmsRegistration(target, batch);
  if (!isCurrent()) throw createAppError("common.invalid_request");
  if (!stored) persist(key, { batch, legacy });
  if (legacy) {
    await registerOnLegacyHost(target, spool, observation);
  } else {
    let receipt: CatalogSpoolBatchReceipt;
    try {
      receipt = await createCatalogSpoolBatch(batch, target);
    } catch (error) {
      if (["inventory.batch.invalid", "printers.slot_operation_stale"].includes(appErrorCode(error) ?? "")) {
        clearAmsRegistration(key, batch.batch_id);
      }
      throw error;
    }
    if (receipt.batch_id !== batch.batch_id || receipt.spool_ids.length !== 1 || !receipt.spool_ids[0]?.trim()) {
      throw createAppError("common.internal");
    }
  }
  clearAmsRegistration(key, batch.batch_id);
}
