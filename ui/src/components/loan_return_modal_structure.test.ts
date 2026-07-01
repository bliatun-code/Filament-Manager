import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_return_modal.tsx", import.meta.url), "utf8");

test("LoanReturnModal uses shared modal form inputs", () => {
  assert.match(source, /modalFormInputClassName/);
  assert.match(source, /<ModalActionButton/);
  assert.match(source, /variant="success"/);
  assert.match(source, /swatchColor=\{loan\.hex_color\}/);
  assert.doesNotMatch(source, /modalActionButtonClassName/);
  assert.doesNotMatch(
    source,
    /mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800/,
  );
  assert.doesNotMatch(
    source,
    /rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1\.5/,
  );
});
