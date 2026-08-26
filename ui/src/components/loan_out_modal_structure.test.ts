import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_out_modal.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(
  new URL("./loan_out_modal_styles.ts", import.meta.url),
  "utf8",
);
const candidateSource = readFileSync(
  new URL("./loan_out_candidate_list.tsx", import.meta.url),
  "utf8",
);

test("LoanOutModal uses shared wide modal layout rhythm", () => {
  assert.match(source, /inventoryModalOverlayClassName/);
  assert.match(source, /inventoryTwoColumnModalGridClassName/);
  assert.match(source, /inventoryWideModalPanelClassName/);
  assert.match(source, /<ModalBody/);
  assert.match(source, /<ModalBody scroll=\{false\}/);
  assert.match(source, /flex min-h-0 flex-1 flex-col space-y-4/);
  assert.match(source, /flex min-h-0 flex-col overflow-hidden/);
  assert.match(source, /min-h-0 overflow-y-auto rounded-\[1\.4rem\]/);
  assert.match(source, /<ModalActionButton/);
  assert.match(source, /variant="solid"/);
  assert.match(source, /size="roomy"/);
  assert.match(source, /fullWidth/);
  assert.match(candidateSource, /inventoryCatalogRowStyle/);
  assert.match(source, /inventorySwatchPanelStyle/);
  assert.match(source, /inventorySwatchInsetStyle/);
  assert.match(source, /SwatchSelectionPreviewHeader/);
  assert.match(source, /swatchColor=\{selectedSpool\.hexColor\}/);
  assert.match(source, /modalFormInputClassName/);
  assert.match(source, /ModalDetailGrid/);
  assert.match(source, /ModalDetailItem/);
  assert.match(source, /ModalFormField/);
  assert.match(source, /ModalNotice/);
  assert.match(source, /LoanOutCandidateList/);
  assert.match(source, /setSpoolSearchQuery\(""\)/);
  assert.match(source, /clientTargetGeneration/);
  assert.match(source, /clientTargetGeneration,\s*\}\);/);
  assert.match(source, /const reloadRequestRef = useRef\(0\)/);
  assert.match(
    source,
    /if \(reloadRequestRef\.current !== requestId\) \{\s*return;/,
  );
  assert.match(candidateSource, /loanOutSpoolButtonClassName/);
  assert.match(candidateSource, /hoveredSpoolId/);
  assert.match(candidateSource, /setHoveredSpoolId\(spool\.id\)/);
  assert.match(candidateSource, /setHoveredSpoolId\(null\)/);
  assert.match(candidateSource, /hoveredSpoolId === spool\.id/);
  assert.match(stylesSource, /loanOutSpoolButtonClassName/);
  assert.match(stylesSource, /focus-visible:border-sky-300/);
  assert.doesNotMatch(source, /FeedbackBanner/);
  assert.doesNotMatch(source, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(stylesSource, /formInputClassName/);
  assert.doesNotMatch(stylesSource, /detailLabelClassName/);
  assert.doesNotMatch(stylesSource, /detailValueClassName/);
  assert.doesNotMatch(source, /modalDetailLabelClassName/);
  assert.doesNotMatch(source, /modalDetailValueClassName/);
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

test("LoanOutCandidateList names search, selection and contained scrolling", () => {
  assert.match(candidateSource, /<label\s+htmlFor=\{searchId\}/);
  assert.match(candidateSource, /type="search"/);
  assert.match(candidateSource, /aria-controls=\{listId\}/);
  assert.match(candidateSource, /aria-live="polite"/);
  assert.match(candidateSource, /aria-pressed=\{isActive\}/);
  assert.match(candidateSource, /t\("common\.selected", "Selected"\)/);
  assert.match(candidateSource, /filterLoanableSpoolsBySearch/);
  assert.match(candidateSource, /resolveContainedSelectionScrollTop/);
  assert.match(candidateSource, /list\.scrollTop = Math\.min\(maxScrollTop, nextScrollTop\)/);
  assert.doesNotMatch(candidateSource, /scrollIntoView/);
  assert.doesNotMatch(candidateSource, /window\.scroll/);
});
