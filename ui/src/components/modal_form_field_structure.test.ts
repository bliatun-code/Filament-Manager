import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("modal forms share field label and hint chrome", () => {
  const modalChrome = readComponentSource("modal_chrome.tsx");
  const addPrinter = readComponentSource("add_printer_modal.tsx");
  const incomingWeight = readComponentSource("incoming_weight_modal.tsx");
  const loanOut = readComponentSource("loan_out_modal.tsx");
  const loanReturn = readComponentSource("loan_return_modal.tsx");
  const slotOnboarding = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const rawModalLabelClass =
    /<label className="text-xs font-medium text-slate-(?:600|700) dark:text-slate-300/;

  assert.match(modalChrome, /modalFormLabelClassName/);
  assert.match(modalChrome, /modalFormHintClassName/);
  assert.match(modalChrome, /function ModalFormField/);
  for (const source of [addPrinter, incomingWeight, loanOut, loanReturn, slotOnboarding]) {
    assert.match(source, /ModalFormField/);
    assert.doesNotMatch(source, rawModalLabelClass);
  }
});
