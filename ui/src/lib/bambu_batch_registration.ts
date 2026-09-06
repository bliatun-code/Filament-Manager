import { appErrorCode, createAppError } from "./error_text";
import type { CatalogSpoolBatchInput, CatalogSpoolBatchReceipt } from "./tauri_catalog_spool_batch_client";

export type BambuBatchRegistrationSnapshot = {
  status: "SAVING" | "UNCERTAIN" | "REJECTED" | "COMPLETE";
  batchId: string;
  rows: readonly { label: string; code: string | null }[];
  spoolIds: readonly string[];
  remainingCount: number;
  error: string | null;
};

export type BambuBatchRegistrationDraft = {
  input: CatalogSpoolBatchInput;
  rows: { label: string; code: string | null }[];
  rawInput: string;
  selections: Record<string, string>;
  remainingInput: string;
  remainingCount: number;
};

type StoredBatch = BambuBatchRegistrationDraft & {
  version: 1;
  targetKey: string;
  receipt: CatalogSpoolBatchReceipt | null;
  rejected: boolean;
};
type Dependencies = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  create: (input: CatalogSpoolBatchInput) => Promise<CatalogSpoolBatchReceipt>;
};

export function bambuBatchRegistrationStorageKey(targetKey: string): string {
  return `filament-manager.catalog-spool-batch.v1:${targetKey}`;
}

function validReceipt(receipt: CatalogSpoolBatchReceipt, input: CatalogSpoolBatchInput): boolean {
  return receipt?.batch_id === input.batch_id && Array.isArray(receipt.spool_ids) &&
    receipt.spool_ids.length === input.master_ids.length &&
    receipt.spool_ids.every(id => typeof id === "string" && id.trim().length > 0) &&
    new Set(receipt.spool_ids).size === receipt.spool_ids.length;
}

function readStored(raw: string, targetKey: string): StoredBatch {
  const value = JSON.parse(raw) as StoredBatch;
  const input = value?.input;
  if (value?.version !== 1 || value.targetKey !== targetKey ||
    !input || typeof input.batch_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(input.batch_id) ||
    !Array.isArray(input.master_ids) || input.master_ids.length < 1 || input.master_ids.length > 100 ||
    !input.master_ids.every(id => typeof id === "string" && id.trim()) ||
    !Number.isSafeInteger(input.initial_weight_g) || input.initial_weight_g <= 0 ||
    !["OWNED", "BORROWED_IN"].includes(input.ownership_type) ||
    ![input.owner_name, input.owner_contact, input.ownership_note, input.location]
      .every(field => field === null || typeof field === "string") ||
    !Array.isArray(value.rows) || value.rows.length !== input.master_ids.length ||
    !value.rows.every(row => typeof row?.label === "string" && (row.code === null || typeof row.code === "string")) ||
    typeof value.rawInput !== "string" || typeof value.remainingInput !== "string" ||
    !Number.isSafeInteger(value.remainingCount) || value.remainingCount < 0 ||
    !value.selections || typeof value.selections !== "object" || Array.isArray(value.selections) ||
    !Object.values(value.selections).every(id => typeof id === "string") ||
    typeof value.rejected !== "boolean" ||
    (value.receipt !== null && !validReceipt(value.receipt, input))) {
    throw createAppError("inventory.batch.storage_failed");
  }
  return value;
}

/** One immutable request survives navigation and restart. Only an explicit retry
 * sends it again, using the backend's atomic, idempotent batch contract. */
export class BambuBatchRegistrationController {
  private record: StoredBatch | null = null;
  private state: BambuBatchRegistrationSnapshot | null = null;
  private listeners = new Set<() => void>();
  private sending = false;
  private storageBlocked = false;
  private readonly key: string;
  private readonly targetKey: string;
  private readonly dependencies: Dependencies;

  constructor(targetKey: string, dependencies: Dependencies) {
    this.targetKey = targetKey;
    this.dependencies = dependencies;
    this.key = bambuBatchRegistrationStorageKey(targetKey);
    try {
      const raw = dependencies.storage.getItem(this.key);
      if (raw !== null) {
        this.record = readStored(raw, targetKey);
        this.publish(this.record.receipt ? "COMPLETE" : this.record.rejected ? "REJECTED" : "UNCERTAIN");
      }
    } catch {
      this.storageBlocked = true;
    }
  }

  snapshot = (): BambuBatchRegistrationSnapshot | null => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(status: BambuBatchRegistrationSnapshot["status"], error: string | null = null) {
    if (!this.record) this.state = null;
    else this.state = {
      status, batchId: this.record.input.batch_id, rows: this.record.rows,
      spoolIds: this.record.receipt?.spool_ids ?? [],
      remainingCount: this.record.remainingCount, error,
    };
    for (const listener of this.listeners) listener();
  }

  private persist(record: StoredBatch) {
    try {
      this.dependencies.storage.setItem(this.key, JSON.stringify(record));
    } catch {
      throw createAppError("inventory.batch.storage_failed");
    }
  }

  async start(draft: BambuBatchRegistrationDraft): Promise<void> {
    if (this.storageBlocked) throw createAppError("inventory.batch.storage_failed");
    if (this.record || this.sending) return;
    // Clone and validate before persistence so later draft edits cannot change a retry.
    const record = readStored(JSON.stringify({
      ...draft, version: 1, targetKey: this.targetKey, receipt: null, rejected: false,
    }), this.targetKey);
    this.persist(record); // A persistence failure must happen before any write.
    this.record = record;
    await this.send(false);
  }

  async retry(): Promise<void> {
    if (this.sending || !this.record || this.state?.status !== "UNCERTAIN") return;
    this.persist(this.record);
    await this.send(true);
  }

  private async send(mayHaveCommitted: boolean): Promise<void> {
    if (!this.record || this.sending) return;
    this.sending = true;
    this.publish("SAVING");
    try {
      const receipt = await this.dependencies.create(structuredClone(this.record.input));
      if (!validReceipt(receipt, this.record.input)) throw createAppError("common.internal");
      this.record.receipt = structuredClone(receipt);
      this.record.rejected = false;
      try {
        this.persist(this.record);
        this.publish("COMPLETE");
      } catch {
        // The original pending request is still durable and safe to replay on restart.
        this.publish("COMPLETE", "inventory.batch.storage_failed");
      }
    } catch (error) {
      const code = appErrorCode(error);
      // Only explicit pre-write/rolled-back validation responses permit editing.
      // A retry rejected before reaching the Host does not resolve an earlier
      // lost response (for example, the Host may have been downgraded meanwhile).
      this.record.rejected = !mayHaveCommitted &&
        (code === "inventory.batch.invalid" || code === "inventory.batch.host_unsupported");
      try { this.persist(this.record); } catch { /* Retain the durable pending request. */ }
      this.publish(this.record.rejected ? "REJECTED" : "UNCERTAIN", code ?? "common.internal");
    } finally {
      this.sending = false;
    }
  }

  nextDraft(): BambuBatchRegistrationDraft | null {
    if (this.sending || !this.record || !["COMPLETE", "REJECTED"].includes(this.state?.status ?? "")) return null;
    const next = structuredClone(this.record);
    try { this.dependencies.storage.removeItem(this.key); }
    catch { throw createAppError("inventory.batch.storage_failed"); }
    if (this.state?.status === "COMPLETE") {
      next.rawInput = next.remainingInput;
      next.selections = {};
      next.input.location = null;
      next.input.ownership_type = "OWNED";
      next.input.owner_name = next.input.owner_contact = next.input.ownership_note = null;
    }
    this.record = null;
    this.publish("UNCERTAIN");
    return next;
  }
}
