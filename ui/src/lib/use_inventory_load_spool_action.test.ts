import assert from "node:assert/strict";
import test from "node:test";

import { runInventoryLoadSpoolAssignment } from "./use_inventory_load_spool_action";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

const t = (_key: string, fallback = "", params: Record<string, string | number> = {}) =>
  fallback.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder));

function slot(overrides: Partial<InventoryPrinterSlotOption> = {}): InventoryPrinterSlotOption {
  return {
    printerId: "printer-a",
    printerName: "Workshop P1S",
    printerModel: "Bambu P1S",
    amsId: "printer-a_ams_2",
    slotId: "printer-a_ams_2_slot_3",
    slotIndex: 3,
    spoolId: null,
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function callbacks() {
  const events: string[] = [];
  const messages: string[] = [];
  const errors: unknown[] = [];
  const reloadErrors: unknown[] = [];
  return {
    events,
    messages,
    errors,
    reloadErrors,
    input: {
      isCurrent: () => true,
      onError: (error: unknown) => { errors.push(error); },
      onReloadError: (error: unknown) => { reloadErrors.push(error); },
      onSettled: () => { events.push("settled"); },
      onSuccess: (message: string) => { messages.push(message); },
      reload: async () => { events.push("reload"); },
      slot: slot(),
      t,
      write: async () => { events.push("write"); },
    },
  };
}

test("contextual load receipt names the exact printer, AMS unit and selected slot", async () => {
  const result = callbacks();
  await runInventoryLoadSpoolAssignment(result.input);
  assert.deepEqual(result.messages, ["Roll loaded in Workshop P1S · AMS 2 · Slot 3."]);
  assert.deepEqual(result.events, ["write", "reload", "settled"]);
  assert.deepEqual(result.errors, []);
});

test("contextual load receipt uses localized EXT labels for the selected printer", async () => {
  const result = callbacks();
  await runInventoryLoadSpoolAssignment({
    ...result.input,
    slot: slot({
      printerName: "Studio A1",
      amsId: "printer-a_ext",
      slotId: "printer-a_ext_slot_1",
      slotIndex: 1,
    }),
    t: (key, fallback, params) => t(
      key,
      key === "printers.extSlot" ? "Eksternt spor" : fallback,
      params,
    ),
  });
  assert.deepEqual(result.messages, ["Roll loaded in Studio A1 · Eksternt spor."]);
});

test("contextual load receipt uses the dialog's model-specific MMU channel label", async () => {
  const result = callbacks();
  await runInventoryLoadSpoolAssignment({
    ...result.input,
    slot: slot({ printerName: "Prusa bench", printerModel: "Prusa MK4S", slotIndex: 4 }),
    t: (key, fallback, params) => t(key, key === "printers.channel" ? "Kanal" : fallback, params),
  });
  assert.deepEqual(result.messages, ["Roll loaded in Prusa bench · MMU3 · Kanal 4."]);
});

test("contextual load captures its selected destination before writes and reloads", async () => {
  const write = deferred();
  const reload = deferred();
  const reloading = deferred();
  const selected = slot();
  const result = callbacks();
  const pending = runInventoryLoadSpoolAssignment({
    ...result.input,
    slot: selected,
    write: () => write.promise,
    reload: async () => { reloading.resolve(); await reload.promise; },
  });
  Object.assign(selected, { printerName: "Later printer", amsId: "later_ext", slotIndex: 1 });
  assert.deepEqual(result.messages, []);
  write.resolve();
  await reloading.promise;
  Object.assign(selected, { printerName: "Refreshed printer", amsId: "later_ams_4", slotIndex: 2 });
  assert.deepEqual(result.messages, ["Roll loaded in Workshop P1S · AMS 2 · Slot 3."]);
  reload.resolve();
  await pending;
  assert.deepEqual(result.messages, ["Roll loaded in Workshop P1S · AMS 2 · Slot 3."]);
});

test("a stale contextual load callback performs no write or receipt update", async () => {
  const result = callbacks();
  await runInventoryLoadSpoolAssignment({ ...result.input, isCurrent: () => false });
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.errors, []);
});

test("contextual load leaves later feedback and busy ownership alone after a scope change", async () => {
  const write = deferred();
  const originalScope = {};
  let currentScope = originalScope;
  const result = callbacks();
  let busy = true;
  const pending = runInventoryLoadSpoolAssignment({
    ...result.input,
    isCurrent: () => currentScope === originalScope,
    write: () => write.promise,
    onSettled: () => { busy = false; },
  });
  currentScope = {};
  write.resolve();
  await pending;
  assert.equal(busy, true, "the old request must not clear a later operation's busy state");
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.errors, []);
});

test("contextual load acknowledges the write before reload and suppresses later stale feedback", async () => {
  const reloading = deferred();
  const reload = deferred();
  const result = callbacks();
  let current = true;
  const pending = runInventoryLoadSpoolAssignment({
    ...result.input,
    isCurrent: () => current,
    reload: async () => { reloading.resolve(); await reload.promise; throw new Error("Old refresh failed"); },
  });
  await reloading.promise;
  current = false;
  reload.resolve();
  await pending;
  assert.deepEqual(result.messages, ["Roll loaded in Workshop P1S · AMS 2 · Slot 3."]);
  assert.deepEqual(result.reloadErrors, []);
  assert.deepEqual(result.events, ["write"]);
});

test("contextual load retains committed success and separates a failed refresh from a failed write", async () => {
  const result = callbacks();
  const error = new Error("Refresh failed");
  await runInventoryLoadSpoolAssignment({ ...result.input, reload: async () => { throw error; } });
  assert.deepEqual(result.messages, ["Roll loaded in Workshop P1S · AMS 2 · Slot 3."]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.reloadErrors, [error]);
  assert.deepEqual(result.events, ["write", "settled"]);
});

test("contextual load reports a current failure and never publishes a success receipt", async () => {
  const result = callbacks();
  const error = new Error("The selected slot is occupied");
  await runInventoryLoadSpoolAssignment({ ...result.input, write: async () => { throw error; } });
  assert.deepEqual(result.errors, [error]);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.events, ["settled"]);
});

test("contextual load cannot overwrite newer feedback with an old Host failure", async () => {
  const write = deferred();
  const result = callbacks();
  let current = true;
  const pending = runInventoryLoadSpoolAssignment({
    ...result.input,
    isCurrent: () => current,
    write: () => write.promise,
  });
  current = false;
  write.reject(new Error("Old Host disconnected"));
  await pending;
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.events, []);
});
