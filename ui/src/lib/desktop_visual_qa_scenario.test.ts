import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseDesktopVisualQaSpoolId,
  normalizeDesktopVisualQaScenario,
  resolveDesktopVisualQaScenario,
} from "./desktop_visual_qa_scenario";
import type { InventorySpool } from "./inventory_list_model";

function spool(overrides: Partial<InventorySpool>): InventorySpool {
  return {
    colorName: "Black",
    filamentName: "Matte",
    hexColor: "#000000",
    id: "spool-1",
    initialWeightGrams: 1000,
    material: "PLA",
    masterId: "master-1",
    ownershipType: "OWNED",
    remainingGrams: 800,
    status: "IN_STOCK",
    vendor: "Bambu",
    ...overrides,
  };
}

test("desktop visual QA scenario parser accepts stable aliases in dev only", () => {
  assert.equal(normalizeDesktopVisualQaScenario("inventory-add"), "add-filament");
  assert.equal(normalizeDesktopVisualQaScenario("DETAIL"), "selected-roll");
  assert.equal(normalizeDesktopVisualQaScenario("inventory-rfid"), "rfid-capture");
  assert.equal(normalizeDesktopVisualQaScenario("unknown"), null);

  assert.equal(resolveDesktopVisualQaScenario("?bfm_visual_qa=loan-out", true), "loan-out");
  assert.equal(resolveDesktopVisualQaScenario("?bfm_visual_qa=loan-out", false), null);
});

test("desktop visual QA spool chooser prefers assigned RFID rolls for RFID capture", () => {
  const spools = [
    spool({ id: "empty", status: "EMPTY" }),
    spool({ id: "stock", rfidTag: "stock-rfid" }),
    spool({ id: "assigned", rfidTag: "assigned-rfid", status: "ASSIGNED" }),
  ];

  assert.equal(
    chooseDesktopVisualQaSpoolId(spools, new Set(["assigned"]), "rfid-capture"),
    "assigned",
  );
  assert.equal(chooseDesktopVisualQaSpoolId(spools, new Set(), "selected-roll"), "stock");
});
