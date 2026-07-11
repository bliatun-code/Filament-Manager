import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./printer_slot_picker.tsx", import.meta.url), "utf8");

test("PrinterSlotPicker keeps focus-visible treatment on selector and options", () => {
  assert.match(source, /slotSelectorButtonClassName/);
  assert.match(source, /slotOptionButtonClassName/);
  assert.match(source, /border border-slate-600\/70/);
  assert.match(source, /dark:border-transparent/);
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

test("PrinterSlotPicker gives light selectors and options explicit hover semantics", () => {
  assert.match(source, /const \[selectorHovered, setSelectorHovered\] = useState\(false\)/);
  assert.match(source, /const \[hoveredTargetSpoolId, setHoveredTargetSpoolId\]/);
  assert.match(source, /selectorEmphasis/);
  assert.match(source, /borderWidth: 1/);
  assert.match(source, /\? "hovered"/);
  assert.ok((source.match(/onMouseEnter=/g) ?? []).length >= 3);
  assert.ok((source.match(/onMouseLeave=/g) ?? []).length >= 3);
  assert.doesNotMatch(source, /isDropdownOpen \|\| selectedTargetSpool/);
});

test("PrinterSlotPicker names its slot-specific popup and visible search field", () => {
  assert.match(source, /aria-controls=\{popupId\}/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /aria-label=\{`\$\{t\("printers\.chooseRollForSlot"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /htmlFor=\{searchInputId\}/);
  assert.match(source, /id=\{searchInputId\}/);
  assert.match(source, /printers\.rollResultCount/);
  assert.match(source, /\{count, plural, one \{# roll\} other \{# rolls\}\}/);
  assert.match(source, /max-h-44/);
  assert.match(source, /const displayTitle = formatFilamentDisplayTitle/);
  assert.match(source, /title=\{displayTitle\}/);
});

test("PrinterSlotPicker brings an overflowing popup into the compact viewport", () => {
  assert.match(source, /const selectorButtonRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(source, /const popupRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(source, /spaceBelow < popupHeight && spaceAbove > spaceBelow/);
  assert.match(source, /Math\.max\(spaceAbove, spaceBelow\) < popupHeight/);
  assert.match(source, /selectorButtonRef\.current\?\.scrollIntoView/);
  assert.match(source, /block: "center"/);
  assert.match(source, /new ResizeObserver\(syncDropdownPlacement\)/);
  assert.match(source, /\[100, 350, 900\]\.map/);
  assert.match(source, /const \[dropdownPlacement, setDropdownPlacement\]/);
  assert.match(source, /spaceBelow < 352 && spaceAbove > spaceBelow/);
  assert.match(source, /dropdownPlacement === "above" \? "bottom-full mb-2" : "top-full mt-2"/);
});
