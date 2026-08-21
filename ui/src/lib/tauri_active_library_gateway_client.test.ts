import assert from "node:assert/strict";
import test from "node:test";

import { updateActiveLibrarySpoolDetails } from "./tauri_active_library_gateway_client";
import type { UpdateSpoolDetailsInput } from "./tauri_inventory_client";

test("active-library client invokes one target-agnostic atomic details command", async () => {
  const previousWindow = globalThis.window;
  const calls: Array<{ command: string; payload?: Record<string, unknown> }> = [];
  globalThis.window = {
    __TAURI__: {
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        calls.push({ command, payload });
        return undefined as T;
      },
    },
  } as unknown as Window & typeof globalThis;

  const input: UpdateSpoolDetailsInput = {
    spool_id: "spool-1",
    qr_code: "FM-SPOOL-1",
    status: "IN_STOCK",
    location: "Shelf A",
    home_location: "Drybox 2",
    spool_tare_weight_g: 241,
    ownership: {
      ownership_type: "BORROWED_IN",
      owner_name: "Nora",
      owner_contact: "nora@example.com",
      ownership_note: "Return next week",
    },
    purchase_metadata: {
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2026-08-21",
      batch_code: "LOT-7",
      supplier_reference: "PO-42",
    },
  };

  try {
    await updateActiveLibrarySpoolDetails(input);
  } finally {
    globalThis.window = previousWindow;
  }

  assert.deepEqual(calls, [
    {
      command: "update_active_library_spool_details",
      payload: { input },
    },
  ]);
});
