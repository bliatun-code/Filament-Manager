import test from "node:test";
import assert from "node:assert/strict";
import {
  assessRfidCaptureMatch,
  rfidCaptureMatchMeta,
  type RfidCaptureSummary,
} from "./inventory_rfid_capture";
import type { InventorySpool } from "./inventory_list_model";

function createSpool(overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id: "spool-1",
    masterId: "master-1",
    vendor: "Bambu",
    material: "PLA-CF",
    filamentName: "PLA-CF",
    colorName: "Blue",
    hexColor: "#2563EB",
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
    ...overrides,
  };
}

function createSummary(overrides: Partial<RfidCaptureSummary> = {}): RfidCaptureSummary {
  return {
    material: "pla cf",
    colorHex: "#2563EB",
    ...overrides,
  };
}

test("assessRfidCaptureMatch returns exact when normalized material and color match", () => {
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary()), "EXACT");
});

test("assessRfidCaptureMatch allows near color matches as partial", () => {
  assert.equal(
    assessRfidCaptureMatch(createSpool(), createSummary({ colorHex: "#2563CC" })),
    "PARTIAL",
  );
});

test("assessRfidCaptureMatch rejects missing material, material mismatches, and distant colors", () => {
  assert.equal(assessRfidCaptureMatch(null, createSummary()), "NONE");
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary({ material: null })), "NONE");
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary({ material: "PETG" })), "NONE");
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary({ colorHex: "#EF4444" })), "NONE");
});

test("rfidCaptureMatchMeta maps confidence to localized chip metadata", () => {
  const t = (key: string, fallback: string) => `${key}:${fallback}`;
  assert.deepEqual(rfidCaptureMatchMeta("NONE", t), null);
  const exact = rfidCaptureMatchMeta("EXACT", t);
  assert.equal(exact?.label, "inventory.rfidMatchExact:Sikker");
  assert.match(exact?.className ?? "", /emerald|green|success/);
});
