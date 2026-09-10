import assert from "node:assert/strict";
import test from "node:test";
import { writePrinterSlotOperation } from "./printer_slot_writes";
import {
  operateLibrarySyncHostPrinterSlot,
  operatePrinterSlot,
  type PrinterSlotOperationInput,
} from "./tauri_printer_client";

const operation: PrinterSlotOperationInput = {
  printer_id: "printer/a",
  slot_id: "slot/1",
  expected_current_spool_id: "outgoing",
  target_spool_id: null,
  outgoing_measured_total_g: 600,
  incoming_measured_total_g: null,
};
const hostTarget = {
  clientReadOnly: true,
  clientHostBaseUrl: " http://host.local ",
  clientLibraryId: " library-1 ",
  clientTargetGeneration: 7,
};

test("atomic slot routing sends one complete operation to the captured Host target", async () => {
  const calls: unknown[][] = [];
  await writePrinterSlotOperation(hostTarget, operation, {
    operateHostPrinterSlot: async (...args) => { calls.push(args); },
    operateLocalPrinterSlot: async () => { assert.fail("Client must not write locally"); },
    assignHostPrinterSlot: async () => { assert.fail("No separate assignment"); },
    recordHostPrintUsage: async () => { assert.fail("No separate usage write"); },
    updateHostSpoolWeight: async () => { assert.fail("No separate weight write"); },
  });
  assert.deepEqual(calls, [["http://host.local", "library-1", 7, operation]]);
});

test("atomic slot routing rejects an unresolved target before any command", async () => {
  for (const invalid of [
    { clientTargetGeneration: null }, { clientTargetGeneration: -1 },
    { clientTargetGeneration: Number.NaN }, { clientTargetGeneration: 1.5 },
    { clientHostBaseUrl: " " }, { clientLibraryId: null },
  ]) {
    let writes = 0;
    await assert.rejects(writePrinterSlotOperation({ ...hostTarget, ...invalid }, operation, {
      operateHostPrinterSlot: async () => { writes += 1; },
      operateLocalPrinterSlot: async () => { writes += 1; },
    }), /common.invalid_request/);
    assert.equal(writes, 0);
  }
});

test("rejected atomic Host operation has no retry or sequential fallback", async () => {
  let hostCalls = 0;
  await assert.rejects(writePrinterSlotOperation(hostTarget, operation, {
    operateHostPrinterSlot: async () => { hostCalls += 1; throw new Error("rejected"); },
    operateLocalPrinterSlot: async () => { assert.fail("No local fallback"); },
    assignHostPrinterSlot: async () => { assert.fail("No assignment fallback"); },
    recordHostPrintUsage: async () => { assert.fail("No usage fallback"); },
  }), /rejected/);
  assert.equal(hostCalls, 1);
});

test("local measured slot writes preserve one atomic operation", async () => {
  const measured = { ...operation, target_spool_id: "outgoing",
    outgoing_measured_total_g: null, incoming_measured_total_g: 600 };
  const calls: PrinterSlotOperationInput[] = [];
  await writePrinterSlotOperation({ ...hostTarget, clientReadOnly: false,
    clientHostBaseUrl: null, clientLibraryId: null, clientTargetGeneration: null }, measured, {
    operateLocalPrinterSlot: async input => { calls.push(input); },
    operateHostPrinterSlot: async () => { assert.fail("Local target must not use Host"); },
    recordLocalPrintUsage: async () => { assert.fail("No separate usage write"); },
  });
  assert.deepEqual(calls, [measured]);
});

test("Tauri slot commands retain explicit null expectations and original target generation", async () => {
  const previousWindow = globalThis.window;
  const calls: { command: string; payload?: Record<string, unknown> }[] = [];
  globalThis.window = {
    __TAURI__: { invoke: async (command: string, payload?: Record<string, unknown>) => {
      calls.push({ command, payload });
    } },
  } as unknown as Window & typeof globalThis;
  const emptySlot = { ...operation, expected_current_spool_id: null, target_spool_id: "incoming",
    outgoing_measured_total_g: null, incoming_measured_total_g: 1_200 };
  try {
    await operatePrinterSlot(emptySlot);
    await operateLibrarySyncHostPrinterSlot("http://host.local", "library-1", 7, operation);
  } finally {
    globalThis.window = previousWindow;
  }
  assert.deepEqual(calls, [
    { command: "operate_printer_slot", payload: { input: emptySlot } },
    { command: "operate_library_sync_host_printer_slot", payload: { input: {
      base_url: "http://host.local", expected_library_id: "library-1",
      expected_target_generation: 7, operation,
    } } },
  ]);
});
