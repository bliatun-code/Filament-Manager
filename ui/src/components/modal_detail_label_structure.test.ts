import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("modal detail labels share compact metadata typography", () => {
  const modalChrome = readComponentSource("modal_chrome.tsx");
  const rfidOverrideModal = readComponentSource("rfid_override_modal.tsx");
  const saveOnlyModal = readComponentSource("save_only_modal.tsx");
  const slotOnboardingModal = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const rawEyebrowClass =
    /text-\[11px\] font-semibold uppercase tracking-\[0\.14em\] text-slate-500/;
  const rawDetailLabelClass =
    /text-xs font-medium uppercase tracking-\[0\.16em\] text-slate-500/;

  assert.match(modalChrome, /modalEyebrowClassName/);
  assert.match(modalChrome, /modalDetailLabelClassName/);
  assert.match(modalChrome, /modalDetailValueClassName/);
  assert.match(modalChrome, /ModalDetailGrid/);
  assert.match(modalChrome, /ModalDetailItem/);
  assert.match(modalChrome, /ModalNotice/);
  assert.match(rfidOverrideModal, /ModalDetailGrid/);
  assert.match(rfidOverrideModal, /ModalDetailItem/);
  assert.match(rfidOverrideModal, /ModalNotice/);
  assert.match(saveOnlyModal, /modalEyebrowClassName/);
  assert.match(slotOnboardingModal, /ModalDetailGrid/);
  assert.match(slotOnboardingModal, /ModalDetailItem/);
  assert.match(slotOnboardingModal, /ModalNotice/);
  assert.doesNotMatch(saveOnlyModal, rawEyebrowClass);
  assert.doesNotMatch(rfidOverrideModal, rawDetailLabelClass);
  assert.doesNotMatch(slotOnboardingModal, rawDetailLabelClass);
});
