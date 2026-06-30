import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./printer_slot_assignment_status.tsx", import.meta.url),
  "utf8",
);

test("PrinterSlotAssignmentStatus shares mini action button focus chrome", () => {
  assert.match(source, /printerSlotMiniActionButtonClassName/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /printerSlotMiniActionButtonClassName\("candidate"\)/);
  assert.match(source, /printerSlotMiniActionButtonClassName\("inline"\)/);
  assert.doesNotMatch(
    source,
    /ml-auto shrink-0 rounded-md border border-slate-300\/70 bg-white\/55 px-2 py-0\.5/,
  );
  assert.doesNotMatch(
    source,
    /rounded-md border border-slate-300\/70 bg-transparent px-2 py-0\.5/,
  );
});
