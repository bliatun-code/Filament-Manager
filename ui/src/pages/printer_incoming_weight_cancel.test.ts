import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SlotSwapDraft } from "../lib/printer_slot_model";
import type {
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import {
  buildClosedSlotWeightDialog,
  discardIncomingWeightSlotDraft,
  prepareEmptySlotWeightDialog,
  prepareIncomingWeightDialog,
} from "./printer_slot_weight_interaction_model";

const draft = (targetSpoolId: string): SlotSwapDraft => ({
  targetSpoolId,
  search: "",
  outgoingWeight: "600",
  incomingWeight: "1000",
});

const slot = (
  spoolId: string | null,
  remainingGrams: number | null,
): PrinterAmsSlotRow =>
  ({
    slot_id: "slot-1",
    ams_id: "ams-1",
    slot_index: 1,
    spool_id: spoolId,
    spool_remaining_g: remainingGrams,
    spool_material: spoolId ? "PLA" : null,
    spool_filament_name: spoolId ? "Basic PLA" : null,
    spool_color_name: spoolId ? "Black" : null,
    spool_hex_color: spoolId ? "#000000" : null,
  }) as PrinterAmsSlotRow;

const spool = (
  spoolId: string,
  remainingGrams: number,
  tareWeightGrams: number,
): SpoolWithMasterRow =>
  ({
    spool: {
      id: spoolId,
      remaining_g: remainingGrams,
      spool_tare_weight_g: tareWeightGrams,
    },
    master: {
      vendor: "Bambu Lab",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "White",
      hex_color: "#FFFFFF",
    },
  }) as SpoolWithMasterRow;

const resolveCurrentTare = (spoolId: string | null | undefined) =>
  spoolId === "current" ? 200 : 0;

test("cancelling an incoming-weight prompt discards only that slot's unsaved draft", () => {
  const current = {
    "slot-1": draft("replacement"),
    "slot-2": draft("unchanged"),
  };

  const next = discardIncomingWeightSlotDraft(current, "slot-1");

  assert.notEqual(next, current);
  assert.equal(next["slot-1"], undefined);
  assert.equal(next["slot-2"], current["slot-2"]);
  assert.ok("slot-1" in current);
});

test("cancelling without a matching draft preserves the current state object", () => {
  const current = { "slot-2": draft("unchanged") };

  assert.equal(discardIncomingWeightSlotDraft(current, "slot-1"), current);
  assert.equal(discardIncomingWeightSlotDraft(current, null), current);
});

test("closing a weight dialog clears its values and identifies its unsaved slot draft", () => {
  const prepared = prepareIncomingWeightDialog(
    "printer-1",
    slot("current", 500),
    spool("replacement", 700, 250),
    resolveCurrentTare,
  );

  assert.deepEqual(buildClosedSlotWeightDialog(prepared.prompt), {
    discardSlotId: "slot-1",
    prompt: null,
    incomingWeightValue: "",
    outgoingWeightValue: "",
  });
});

test("closing without an active weight dialog has no slot draft to discard", () => {
  assert.deepEqual(buildClosedSlotWeightDialog(null), {
    discardSlotId: null,
    prompt: null,
    incomingWeightValue: "",
    outgoingWeightValue: "",
  });
});

test("replacement preparation includes measured weights for both rolls", () => {
  const prepared = prepareIncomingWeightDialog(
    "printer-1",
    slot("current", 500),
    spool("replacement", 700, 250),
    resolveCurrentTare,
  );

  assert.equal(prepared.prompt.targetSpoolId, "replacement");
  assert.equal(prepared.prompt.requiresIncomingWeight, true);
  assert.equal(prepared.prompt.requiresOutgoingWeight, true);
  assert.equal(prepared.incomingWeightValue, "950");
  assert.equal(prepared.outgoingWeightValue, "700");
});

test("empty-slot preparation leaves outgoing weight blank", () => {
  const prepared = prepareIncomingWeightDialog(
    "printer-1",
    slot(null, null),
    spool("incoming", 700, 250),
    resolveCurrentTare,
  );

  assert.equal(prepared.prompt.targetSpoolId, "incoming");
  assert.equal(prepared.prompt.requiresOutgoingWeight, false);
  assert.equal(prepared.incomingWeightValue, "950");
  assert.equal(prepared.outgoingWeightValue, "");
});

test("clear-occupied preparation only requests outgoing measured weight", () => {
  const prepared = prepareEmptySlotWeightDialog(
    "printer-1",
    slot("current", 500),
    resolveCurrentTare,
  );

  assert.equal(prepared.prompt.targetSpoolId, null);
  assert.equal(prepared.prompt.requiresIncomingWeight, false);
  assert.equal(prepared.prompt.requiresOutgoingWeight, true);
  assert.equal(prepared.incomingWeightValue, "");
  assert.equal(prepared.outgoingWeightValue, "700");
});

test("same-roll preparation does not create an outgoing weight draft", () => {
  const prepared = prepareIncomingWeightDialog(
    "printer-1",
    slot("current", 500),
    spool("current", 500, 200),
    resolveCurrentTare,
  );

  assert.equal(prepared.prompt.requiresIncomingWeight, true);
  assert.equal(prepared.prompt.requiresOutgoingWeight, false);
  assert.equal(prepared.prompt.updatesCurrentRollWeight, true);
  assert.equal(prepared.incomingWeightValue, "700");
  assert.equal(prepared.outgoingWeightValue, "");
});

test("printer page wires cancel through the interaction reset handler", () => {
  const printersSource = readFileSync(new URL("./printers.tsx", import.meta.url), "utf8");

  assert.match(printersSource, /onCancel=\{cancelIncomingWeightDialog\}/);
});
