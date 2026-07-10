import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cardSource = readFileSync(new URL("./printer_overview_card.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../pages/printers.tsx", import.meta.url), "utf8");

test("multi-printer overview collapses slot grids behind an accessible disclosure", () => {
  assert.match(cardSource, /defaultSlotsExpanded = true/);
  assert.match(cardSource, /aria-controls=\{slotGridId\}/);
  assert.match(cardSource, /aria-expanded=\{showSlots\}/);
  assert.match(cardSource, /printers\.showSlots/);
  assert.match(cardSource, /printers\.hideSlots/);
  assert.match(cardSource, /showSlots \? \(/);
  assert.match(pageSource, /defaultSlotsExpanded=\{printers\.length === 1\}/);
});
