import { appErrorCode, createAppError } from "./error_text";
import { writeReviewedSpoolRfid, type CatalogSpoolBatchTarget, type ExistingSpoolRfidRegistration } from "./tauri_catalog_spool_batch_client";

type Review = Omit<ExistingSpoolRfidRegistration, "request_id">;

function storage<T>(action: () => T): T {
  try { return action(); }
  catch { throw createAppError("inventory.batch.storage_failed"); }
}

export async function registerReviewedSpoolRfid(target: CatalogSpoolBatchTarget, review: Review) {
  const { printer_id, slot_id, rfid_tag } = review.observation;
  const key = "filament-manager.existing-spool-rfid.v1:" + JSON.stringify([
    target.clientReadOnly ? target.clientHostBaseUrl : "local", target.clientLibraryId,
    printer_id, slot_id, review.spool_id, rfid_tag, review.expected_rfid, review.assign_empty_slot,
  ]);
  // Preserve the exact time and ID if the operator confirms this review again after losing the reply.
  const saved = storage(() => localStorage.getItem(key));
  const identity: { id: string; observedAt: string } = saved
    ? storage(() => JSON.parse(saved))
    : { id: crypto.randomUUID(), observedAt: review.observation.observed_at };
  if (!identity?.id || !identity.observedAt) throw createAppError("inventory.batch.storage_failed");
  const record = JSON.stringify(identity);
  if (!saved) storage(() => localStorage.setItem(key, record));
  const forget = () => storage(() => {
    if (localStorage.getItem(key) === record) localStorage.removeItem(key);
  });
  try {
    const receipt = await writeReviewedSpoolRfid(target, {
      ...review, request_id: identity.id, observation: { ...review.observation, observed_at: identity.observedAt },
    });
    if (receipt && "preflight_error" in receipt) {
      // No POST was sent. Keep an earlier uncertain request, but release a new one.
      if (!saved) forget();
      throw receipt.preflight_error;
    }
    if (receipt === null && target.clientReadOnly) {
      // A downgraded Host cannot resolve an earlier, possibly committed request.
      if (saved) throw createAppError("inventory.batch.host_unsupported");
      forget();
      return "legacy";
    }
    if (receipt?.batch_id !== identity.id || receipt.spool_ids.length !== 1 || receipt.spool_ids[0] !== review.spool_id) {
      throw createAppError("common.internal");
    }
  } catch (error) {
    if (appErrorCode(error) === "printers.slot_operation_stale") forget();
    throw error;
  }
  forget();
  return "committed";
}
