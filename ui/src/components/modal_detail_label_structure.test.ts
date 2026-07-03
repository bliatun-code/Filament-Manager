import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("modal detail labels share compact metadata typography", () => {
  const modalChrome = readComponentSource("modal_chrome.tsx");
  const inventoryAddModal = readComponentSource("inventory_add_modal.tsx");
  const inventorySpoolDetailModal = readComponentSource("inventory_spool_detail_modal.tsx");
  const loanOutModal = readComponentSource("loan_out_modal.tsx");
  const loanReturnModal = readComponentSource("loan_return_modal.tsx");
  const rfidOverrideModal = readComponentSource("rfid_override_modal.tsx");
  const saveOnlyModal = readComponentSource("save_only_modal.tsx");
  const settingsLibraryRoleModal = readComponentSource("settings_library_role_modal.tsx");
  const slotOnboardingModal = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const rawEyebrowClass =
    /text-\[11px\] font-semibold uppercase tracking-\[0\.14em\] text-slate-500/;
  const rawDetailLabelClass =
    /text-xs font-medium uppercase tracking-\[0\.16em\] text-slate-500/;

  assert.match(modalChrome, /modalEyebrowClassName/);
  assert.match(modalChrome, /modalDetailLabelClassName/);
  assert.match(modalChrome, /modalDetailValueClassName/);
  assert.match(modalChrome, /function ModalBody/);
  assert.match(modalChrome, /function ModalFooter/);
  assert.match(modalChrome, /ModalDetailGrid/);
  assert.match(modalChrome, /ModalDetailItem/);
  assert.match(modalChrome, /ModalNotice/);
  assert.match(
    modalChrome,
    /type ModalNoticeTone = "danger" \| "info" \| "neutral" \| "success" \| "warning"/,
  );
  assert.match(modalChrome, /modalNoticeToneClass/);
  assert.match(inventoryAddModal, /ModalNotice/);
  assert.match(inventorySpoolDetailModal, /ModalNotice/);
  assert.match(loanOutModal, /ModalNotice/);
  assert.match(loanReturnModal, /ModalNotice/);
  assert.match(rfidOverrideModal, /ModalDetailGrid/);
  assert.match(rfidOverrideModal, /ModalDetailItem/);
  assert.match(rfidOverrideModal, /ModalNotice/);
  assert.match(saveOnlyModal, /modalEyebrowClassName/);
  assert.match(settingsLibraryRoleModal, /ModalNotice/);
  assert.match(slotOnboardingModal, /ModalDetailGrid/);
  assert.match(slotOnboardingModal, /ModalDetailItem/);
  assert.match(slotOnboardingModal, /ModalNotice/);
  assert.doesNotMatch(inventoryAddModal, /FeedbackBanner/);
  assert.doesNotMatch(inventorySpoolDetailModal, /FeedbackBanner/);
  assert.doesNotMatch(inventorySpoolDetailModal, /rounded-xl border border-rose/);
  assert.doesNotMatch(loanOutModal, /FeedbackBanner/);
  assert.doesNotMatch(loanReturnModal, /FeedbackBanner/);
  assert.doesNotMatch(settingsLibraryRoleModal, /FeedbackBanner/);
  assert.doesNotMatch(saveOnlyModal, rawEyebrowClass);
  assert.doesNotMatch(rfidOverrideModal, rawDetailLabelClass);
  assert.doesNotMatch(slotOnboardingModal, rawDetailLabelClass);
});
