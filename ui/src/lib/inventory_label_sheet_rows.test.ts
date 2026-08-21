import assert from "node:assert/strict";
import test from "node:test";

import { buildInventoryLabelSheetRows } from "./inventory_label_sheet_rows";
import type { InventorySpool } from "./inventory_list_model";

function spool(id: string, overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id,
    masterId: `master-${id}`,
    vendor: "Generic",
    material: "PLA",
    filamentName: "Basic",
    colorName: id,
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
    ...overrides,
  };
}

test("inventory label sheet keeps each on-hand spool reference in its direct QR payload", async () => {
  const payloads: string[] = [];
  const rows = await buildInventoryLabelSheetRows({
    spools: [
      spool("spool-b", { colorName: "Blue", ownershipType: "BORROWED_IN" }),
      spool("spool-empty", { status: "EMPTY" }),
      spool("spool-a", { colorName: "Amber", status: "ASSIGNED" }),
    ],
    locale: "en",
    companionShellUrl: "http://filament.local/companion",
    labels: { borrowedIn: "Borrowed in", unknown: "Unknown" },
    buildFilamentQrPayload: (reference) => ({
      payload: `qr:${reference}`,
      target: `qr:${reference}`,
    }),
    buildFilamentLabelQrDataUrl: async (payload) => {
      payloads.push(payload);
      return `image:${payload}`;
    },
  });

  assert.deepEqual(rows.map((row) => row.reference), ["spool-a", "spool-b"]);
  assert.deepEqual(payloads, ["qr:spool-a", "qr:spool-b"]);
  assert.equal(rows[1]?.ownershipMarker, "Borrowed in");
});
