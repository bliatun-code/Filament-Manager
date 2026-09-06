import assert from "node:assert/strict";
import test from "node:test";
import { BambuBatchRegistrationController, bambuBatchRegistrationStorageKey, type BambuBatchRegistrationDraft } from "./bambu_batch_registration";
import { createAppError } from "./error_text";
import { catalogSpoolBatchTargetKey, type CatalogSpoolBatchReceipt } from "./tauri_catalog_spool_batch_client";

function draft(): BambuBatchRegistrationDraft {
  return {
    input: { batch_id: "batch-1", master_ids: ["same-master", "same-master"], initial_weight_g: 850,
      ownership_type: "BORROWED_IN", owner_name: "Synthetic owner", owner_contact: null,
      ownership_note: null, location: "Dry box" },
    rows: [{ label: "PLA Black", code: "10101" }, { label: "PLA Black", code: "10101" }],
    rawInput: "10101\n10101\nunknown", selections: { "0-10101": "same-master", "1-10101": "same-master" },
    remainingInput: "unknown", remainingCount: 1,
  };
}
const receipt: CatalogSpoolBatchReceipt = { batch_id: "batch-1", spool_ids: ["host-first", "host-second"] };
function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("lost acknowledgement survives reconstruction and retries only the immutable request", async () => {
  const storage = memory(), first = deferred<CatalogSpoolBatchReceipt>();
  const requests: unknown[] = [];
  const controller = new BambuBatchRegistrationController("library-A:1", { storage,
    create: async input => { requests.push(input); return first.promise; } });
  const input = draft();
  const pending = controller.start(input);
  assert.equal(controller.snapshot()?.status, "SAVING");
  assert.equal(storage.values.size, 1, "persist before sending");
  input.input.master_ids[0] = "edited-later";
  await controller.start(draft());
  await controller.retry();
  assert.equal(requests.length, 1);
  first.reject(new Error("response dropped after Host commit"));
  await pending;
  assert.equal(controller.snapshot()?.status, "UNCERTAIN");
  assert.equal(controller.nextDraft(), null);

  const recovered = new BambuBatchRegistrationController("library-A:1", { storage,
    create: async input => { requests.push(input); return receipt; } });
  assert.equal(requests.length, 1, "recovery never sends automatically");
  assert.equal(recovered.snapshot()?.status, "UNCERTAIN");
  await recovered.retry();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(recovered.snapshot()?.status, "COMPLETE");
  assert.deepEqual(recovered.snapshot()?.spoolIds, ["host-first", "host-second"]);
  await recovered.start(draft());
  await recovered.retry();
  assert.equal(requests.length, 2, "completed batch cannot submit again");
  const next = recovered.nextDraft()!;
  assert.equal(next.rawInput, "unknown");
  assert.deepEqual(next.selections, {});
  assert.equal(next.input.ownership_type, "OWNED");
  assert.equal(next.input.owner_name, null);
  assert.equal(next.input.location, null);
  assert.equal(storage.values.size, 0);
});

test("only a fresh acknowledged rejection permits editing; earlier uncertainty remains unresolved", async () => {
  for (const code of ["inventory.batch.invalid", "inventory.batch.host_unsupported"]) {
    const storage = memory();
    let failure: unknown = createAppError(code);
    const controller = new BambuBatchRegistrationController("A", { storage, create: async () => { throw failure; } });
    await controller.start(draft());
    assert.equal(controller.snapshot()?.status, "REJECTED");
    assert.deepEqual(controller.nextDraft()?.input, draft().input, "rejected draft retains owned/borrowed details");
    failure = new Error("lost response");
    await controller.start(draft());
    failure = createAppError(code);
    await controller.retry();
    assert.equal(controller.snapshot()?.status, "UNCERTAIN", "pre-write rejection now cannot disprove earlier commit");
    assert.equal(controller.nextDraft(), null);
  }
});

test("storage read/write failure or corrupt recovery data prevents any submission", async () => {
  for (const failure of ["read", "write", "corrupt"]) {
    const storage = memory();
    let writes = 0;
    if (failure === "read") storage.getItem = () => { throw new Error("denied"); };
    if (failure === "write") storage.setItem = () => { throw new Error("quota"); };
    if (failure === "corrupt") storage.values.set(bambuBatchRegistrationStorageKey("A"), "{broken");
    const controller = new BambuBatchRegistrationController("A", { storage, create: async () => { writes++; return receipt; } });
    await assert.rejects(controller.start(draft()), /inventory.batch.storage_failed/);
    assert.equal(writes, 0);
  }
});

test("failed terminal persistence preserves confirmed success and safe recovery identity", async () => {
  const storage = memory();
  let saved = 0;
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => { if (++saved > 1) throw new Error("quota"); originalSet(key, value); };
  const controller = new BambuBatchRegistrationController("A", { storage, create: async () => receipt });
  await controller.start(draft());
  assert.equal(controller.snapshot()?.status, "COMPLETE");
  assert.deepEqual(controller.snapshot()?.spoolIds, receipt.spool_ids);
  assert.equal(controller.snapshot()?.error, "inventory.batch.storage_failed");
  storage.setItem = originalSet;
  const recovered = new BambuBatchRegistrationController("A", { storage, create: async input => {
    assert.deepEqual(input, draft().input); return receipt;
  } });
  assert.equal(recovered.snapshot()?.status, "UNCERTAIN");
  await recovered.retry();
  assert.equal(recovered.snapshot()?.status, "COMPLETE");
  storage.removeItem = () => { throw new Error("denied"); };
  assert.throws(() => recovered.nextDraft(), /inventory.batch.storage_failed/);
  assert.equal(recovered.snapshot()?.status, "COMPLETE");
});

test("mismatched, missing or duplicate returned IDs never become a completed receipt", async () => {
  for (const result of [{ ...receipt, batch_id: "wrong" }, { ...receipt, spool_ids: ["one"] },
    { ...receipt, spool_ids: ["duplicate", "duplicate"] }]) {
    const controller = new BambuBatchRegistrationController("A", { storage: memory(), create: async () => result });
    await controller.start(draft());
    assert.equal(controller.snapshot()?.status, "UNCERTAIN");
    assert.deepEqual(controller.snapshot()?.spoolIds, []);
  }
});

test("target storage includes local and Host library identity plus durable generation", async () => {
  const target = { clientReadOnly: true, clientHostBaseUrl: "http://host-a/", clientLibraryId: "library-a", clientTargetGeneration: 4 };
  const key = catalogSpoolBatchTargetKey(target)!;
  assert.notEqual(key, catalogSpoolBatchTargetKey({ ...target, clientTargetGeneration: 6 }));
  assert.notEqual(key, catalogSpoolBatchTargetKey({ ...target, clientHostBaseUrl: "http://host-b" }));
  assert.notEqual(key, catalogSpoolBatchTargetKey({ ...target, clientReadOnly: false }));
  assert.equal(catalogSpoolBatchTargetKey({ ...target, clientTargetGeneration: null }), null);
  const storage = memory();
  const old = new BambuBatchRegistrationController(key, { storage, create: async () => receipt });
  await old.start(draft());
  const changed = new BambuBatchRegistrationController(catalogSpoolBatchTargetKey({ ...target, clientTargetGeneration: 6 })!,
    { storage, create: async () => { assert.fail("changed target must not replay old request"); } });
  assert.equal(changed.snapshot(), null);
  await changed.retry();
});
