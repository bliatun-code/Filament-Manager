import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_return_modal.tsx", import.meta.url), "utf8");
const swatchCardSource = readFileSync(new URL("./loan_swatch_card.tsx", import.meta.url), "utf8");

test("LoanReturnModal uses shared modal form inputs", () => {
  assert.match(source, /modalFormInputClassName/);
  assert.match(source, /<ModalActionButton/);
  assert.match(source, /SwatchSelectionPreviewHeader/);
  assert.match(source, /LoanSwatchCard/);
  assert.match(source, /LoanSwatchInsetCard/);
  assert.match(source, /variant="modal"/);
  assert.match(swatchCardSource, /inventorySwatchCardStyle/);
  assert.match(swatchCardSource, /inventorySwatchInsetStyle/);
  assert.match(swatchCardSource, /loanSwatchCardClass/);
  assert.match(source, /ModalDetailGrid/);
  assert.match(source, /ModalDetailItem/);
  assert.match(source, /LoanReturnSummaryCard/);
  assert.match(source, /ModalFormField/);
  assert.match(source, /ModalNotice/);
  assert.match(source, /variant="primary"/);
  assert.doesNotMatch(source, /variant="success"/);
  for (const sourceWithLineEndings of [
    source.replace(/\r?\n/g, "\n"),
    source.replace(/\r?\n/g, "\r\n"),
  ]) {
    const primaryAction = sourceWithLineEndings.match(
      /<ModalActionButton\s+type="button"\s+onClick=\{\(\) => void onConfirm\(\)\}[\s\S]*?<\/ModalActionButton>/,
    )?.[0];
    assert.ok(primaryAction, "expected to find the primary return action with LF or CRLF");
    assert.doesNotMatch(primaryAction, /swatchColor/);
    assert.doesNotMatch(primaryAction, /resolvedTheme/);
  }
  assert.doesNotMatch(source, /FeedbackBanner/);
  assert.doesNotMatch(source, /modalActionButtonClassName/);
  assert.doesNotMatch(source, /loanFactLabelClassName/);
  assert.doesNotMatch(source, /loanFactValueClassName/);
  assert.doesNotMatch(source, /modalDetailLabelClassName/);
  assert.doesNotMatch(source, /modalDetailValueClassName/);
  assert.doesNotMatch(source, /loanSwatchPreviewStyle/);
  assert.doesNotMatch(source, /loanSwatchSurfaceStyle/);
  assert.doesNotMatch(source, /rounded-2xl border border-slate-300\/80/);
  assert.doesNotMatch(source, /rounded-\[1\.05rem\] border px-3\.5 py-3/);
  assert.doesNotMatch(
    source,
    /mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800/,
  );
  assert.doesNotMatch(
    source,
    /rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1\.5/,
  );
});
