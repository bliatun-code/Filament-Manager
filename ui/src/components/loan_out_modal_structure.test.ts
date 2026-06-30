import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_out_modal.tsx", import.meta.url), "utf8");

test("LoanOutModal uses shared wide modal layout rhythm", () => {
  assert.match(source, /inventoryModalOverlayClassName/);
  assert.match(source, /inventoryTwoColumnModalGridClassName/);
  assert.match(source, /inventoryWideModalPanelClassName/);
  assert.match(source, /modalActionButtonClassName\("solid", "roomy"\)/);
  assert.doesNotMatch(source, /modalPanelClassName\("wide"/);
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,0\.96fr\)_minmax\(22rem,0\.9fr\)\]/);
  assert.doesNotMatch(source, /titleClassName="text-2xl"/);
  assert.doesNotMatch(source, /rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3/);
});
