import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SlotSwapDraft } from "../lib/printer_slot_model";
import { discardIncomingWeightSlotDraft } from "./use_printer_slot_interactions";

const draft = (targetSpoolId: string): SlotSwapDraft => ({
  targetSpoolId,
  search: "",
  outgoingWeight: "600",
  incomingWeight: "1000",
});

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

test("printer page wires cancel through the interaction reset handler", () => {
  const printersSource = readFileSync(new URL("./printers.tsx", import.meta.url), "utf8");
  const interactionsSource = readFileSync(
    new URL("./use_printer_slot_interactions.ts", import.meta.url),
    "utf8",
  );

  assert.match(printersSource, /onCancel=\{cancelIncomingWeightDialog\}/);
  assert.match(interactionsSource, /setIncomingWeightPrompt\(null\)/);
  assert.match(interactionsSource, /setIncomingWeightValue\(""\)/);
  assert.match(interactionsSource, /setOutgoingWeightValue\(""\)/);
  assert.match(interactionsSource, /discardIncomingWeightSlotDraft\(current, slotId\)/);
});
