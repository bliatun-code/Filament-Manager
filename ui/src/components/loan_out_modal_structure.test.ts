import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_out_modal.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(
  new URL("./loan_out_modal_styles.ts", import.meta.url),
  "utf8",
);

test("LoanOutModal uses shared wide modal layout rhythm", () => {
  assert.match(source, /inventoryModalOverlayClassName/);
  assert.match(source, /inventoryTwoColumnModalGridClassName/);
  assert.match(source, /inventoryWideModalPanelClassName/);
  assert.match(source, /<ModalActionButton/);
  assert.match(source, /variant="solid"/);
  assert.match(source, /size="roomy"/);
  assert.match(source, /fullWidth/);
  assert.match(source, /inventoryCatalogRowStyle/);
  assert.match(source, /inventorySwatchPanelStyle/);
  assert.match(source, /inventorySwatchInsetStyle/);
  assert.match(source, /SwatchSelectionPreviewHeader/);
  assert.match(source, /swatchColor=\{selectedSpool\.hexColor\}/);
  assert.match(source, /hoveredLoanSpoolId/);
  assert.match(source, /setHoveredLoanSpoolId\(spool\.id\)/);
  assert.match(source, /setHoveredLoanSpoolId\(null\)/);
  assert.match(source, /hoveredLoanSpoolId === spool\.id/);
  assert.match(source, /loanOutSpoolButtonClassName/);
  assert.match(stylesSource, /loanOutSpoolButtonClassName/);
  assert.match(stylesSource, /focus-visible:border-sky-300/);
  assert.doesNotMatch(stylesSource, /focus:border-slate-400/);
  assert.doesNotMatch(stylesSource, /dark:focus:border-slate-500/);
  assert.doesNotMatch(source, /modalPanelClassName\("wide"/);
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,0\.96fr\)_minmax\(22rem,0\.9fr\)\]/);
  assert.doesNotMatch(source, /titleClassName="text-2xl"/);
  assert.doesNotMatch(source, /rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3/);
  assert.doesNotMatch(source, /border-slate-200\/80 bg-white\/94 p-4/);
  assert.doesNotMatch(
    source,
    /flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2\.5 text-left text-\[13px\] transition/,
  );
});
