import assert from "node:assert/strict";
import test from "node:test";
import { registerPrinterSlotCatalogSpool } from "./printer_slot_writes";
import type { PrinterAmsSlotRow } from "./tauri_client";

test("catalog registration keeps its original Host for creation, RFID and assignment", async context => {
  const create = "create_library_sync_host_spool";
  const rfid = "update_library_sync_host_spool_rfid_tag";
  const assign = "assign_library_sync_host_printer_slot";
  const target = { clientReadOnly: true, clientHostBaseUrl: "http://a", clientLibraryId: "library", clientTargetGeneration: 1 };
  let host = "http://a";
  let generation = 1;
  let switchAfter = "";
  const writes: string[] = [];
  const calls: string[] = [];
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { __TAURI__: {
    invoke(command: string, { input }: { input: Record<string, unknown> }) {
      calls.push(command);
      assert.equal(input.expected_library_id, "library");
      assert.equal(input.expected_target_generation, 1);
      if (input.base_url !== host || input.expected_target_generation !== generation) {
        throw new Error("stale target");
      }
      if (command !== create) assert.equal(input.spool_id, "host-created-id");
      writes.push(command);
      if (command === switchAfter) {
        for (const next of ["http://b", "http://a"]) {
          host = next;
          generation += 1;
        }
      }
      return "host-created-id";
    },
  } } });
  context.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  for (const boundary of [create, rfid, "none"]) {
    await context.test("switch after " + boundary, async () => {
      writes.length = calls.length = 0;
      generation = 1;
      switchAfter = boundary;
      const save = registerPrinterSlotCatalogSpool(target, {
        id: "local-request", master_id: "m", status: "IN_STOCK",
      }, {
        printerId: "printer", slot: { slot_id: "slot" } as PrinterAmsSlotRow,
        observedRfid: "tag", rfidObservedAt: "2026-01-01T00:00:00Z",
      });
      if (boundary === "none") await save;
      else await assert.rejects(save, /stale target/);
      assert.deepEqual(writes, boundary === create ? [create] : boundary === rfid ? [create, rfid] : [create, rfid, assign]);
      assert.deepEqual(calls, boundary === create ? [create, rfid] : [create, rfid, assign]);
    });
  }
});
