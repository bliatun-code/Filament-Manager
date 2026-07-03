import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_history_card.tsx", import.meta.url), "utf8");
const swatchCardSource = readFileSync(new URL("./loan_swatch_card.tsx", import.meta.url), "utf8");

test("LoanHistoryCard return action keeps focus-visible treatment", () => {
  assert.match(source, /loanHistoryReturnButtonClassName/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /disabled:cursor-not-allowed/);
  assert.match(swatchCardSource, /inventorySwatchCardStyle/);
  assert.match(swatchCardSource, /inventorySwatchInsetStyle/);
  assert.match(swatchCardSource, /type LoanSwatchCardVariant = "history" \| "modal"/);
  assert.match(source, /LoanSwatchCard/);
  assert.match(source, /LoanSwatchInsetCard/);
  assert.match(source, /InventorySwatchChip/);
  assert.match(source, /ModalDetailItem/);
  assert.doesNotMatch(source, /loanFactLabelClassName/);
  assert.doesNotMatch(source, /loanFactValueClassName/);
  assert.doesNotMatch(source, /modalDetailLabelClassName/);
  assert.doesNotMatch(source, /modalDetailValueClassName/);
  assert.doesNotMatch(source, /loanSwatchPreviewStyle/);
  assert.doesNotMatch(source, /loanSwatchSurfaceStyle/);
  assert.doesNotMatch(source, /rounded-xl border border-slate-300\/80 p-3\.5/);
  assert.doesNotMatch(source, /mt-3 rounded-xl border px-3 py-2\.5/);
  assert.doesNotMatch(
    source,
    /shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2\.5 py-1 text-\[11px\] font-semibold text-emerald-800 shadow-sm shadow-emerald-200\/25 transition/,
  );
});
