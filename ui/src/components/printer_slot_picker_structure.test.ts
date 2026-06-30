import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./printer_slot_picker.tsx", import.meta.url), "utf8");

test("PrinterSlotPicker keeps focus-visible treatment on selector and options", () => {
  assert.match(source, /slotSelectorButtonClassName/);
  assert.match(source, /slotOptionButtonClassName/);
  assert.match(source, /aria-expanded=\{isDropdownOpen\}/);
  assert.equal((source.match(/focus-visible:border-sky-300/g) ?? []).length, 2);
  assert.equal((source.match(/disabled:cursor-not-allowed/g) ?? []).length, 2);
  assert.doesNotMatch(
    source,
    /flex w-full items-center justify-between gap-2 rounded-xl bg-white\/70 px-2\.5 py-2 text-left text-sm text-slate-800 disabled:opacity-50/,
  );
  assert.doesNotMatch(
    source,
    /flex w-full items-center justify-between gap-2\.5 rounded-xl px-3 text-left text-sm \$\{/,
  );
});
