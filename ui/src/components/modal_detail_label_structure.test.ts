import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("modal detail labels share compact metadata typography", () => {
  const modalChrome = readComponentSource("modal_chrome.tsx");
  const rfidOverrideModal = readComponentSource("rfid_override_modal.tsx");
  const slotOnboardingModal = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const rawDetailLabelClass =
    /text-xs font-medium uppercase tracking-\[0\.16em\] text-slate-500/;

  assert.match(modalChrome, /modalDetailLabelClassName/);
  assert.match(rfidOverrideModal, /modalDetailLabelClassName/);
  assert.match(slotOnboardingModal, /modalDetailLabelClassName/);
  assert.doesNotMatch(rfidOverrideModal, rawDetailLabelClass);
  assert.doesNotMatch(slotOnboardingModal, rawDetailLabelClass);
});
