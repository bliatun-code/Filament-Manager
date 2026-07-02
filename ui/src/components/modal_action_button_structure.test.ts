import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("modal action buttons share secondary and primary chrome", () => {
  const addPrinterModal = readComponentSource("add_printer_modal.tsx");
  const actionButtonComponent = readComponentSource("modal_action_button.tsx");
  const actionButtonClass = readComponentSource("modal_action_button_class.ts");
  const batchModal = readComponentSource("inventory_bambu_batch_modal.tsx");
  const createActions = readComponentSource("inventory_create_actions_panel.tsx");
  const loanReturnModal = readComponentSource("loan_return_modal.tsx");
  const modalChrome = readComponentSource("modal_chrome.tsx");
  const rfidCapturePanels = readComponentSource("inventory_rfid_capture_panels.tsx");
  const rfidOverrideModal = readComponentSource("rfid_override_modal.tsx");
  const saveOnlyModal = readComponentSource("save_only_modal.tsx");
  const slotOnboardingModal = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const spoolDetailSummary = readComponentSource("inventory_spool_detail_summary.tsx");
  const rawSecondaryClass =
    /rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold/;
  const rawPrimaryClass =
    /rounded-lg border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold/;

  assert.match(actionButtonClass, /modalActionButtonClassName/);
  assert.match(actionButtonClass, /appControlFocusClassName/);
  assert.match(actionButtonClass, /joinClassNames/);
  assert.match(actionButtonClass, /variant === "primary"/);
  assert.match(actionButtonClass, /variant === "solid"/);
  assert.match(actionButtonClass, /variant === "success"/);
  assert.match(actionButtonClass, /variant === "danger"/);
  assert.match(actionButtonClass, /variant === "dangerQuiet"/);
  assert.match(actionButtonClass, /variant === "critical"/);
  assert.match(actionButtonClass, /size === "roomy" \? "px-4 py-3" : "px-4 py-2"/);
  assert.match(actionButtonComponent, /function ModalActionButton/);
  assert.match(actionButtonComponent, /inventorySwatchActionButtonStyle/);
  assert.match(modalChrome, /function ModalFactCard/);
  assert.match(modalChrome, /modalFactCardClassName/);
  assert.match(rfidOverrideModal, /inventorySwatchPanelStyle/);
  assert.match(rfidOverrideModal, /SwatchSelectionPreviewHeader/);
  assert.match(rfidCapturePanels, /SwatchSelectionPreviewHeader/);
  assert.match(saveOnlyModal, /SwatchSelectionPreviewHeader/);
  assert.match(spoolDetailSummary, /SwatchSelectionPreviewHeader/);
  assert.match(slotOnboardingModal, /inventorySwatchPanelStyle/);
  assert.match(slotOnboardingModal, /SwatchSelectionPreviewHeader/);
  assert.match(createActions, /<ModalActionButton/);
  assert.match(createActions, /variant="solid"/);
  assert.match(createActions, /size="roomy"/);
  assert.match(createActions, /fullWidth/);
  for (const source of [
    addPrinterModal,
    batchModal,
    createActions,
    loanReturnModal,
    rfidCapturePanels,
    rfidOverrideModal,
    saveOnlyModal,
    slotOnboardingModal,
  ]) {
    assert.match(source, /<ModalActionButton/);
    assert.doesNotMatch(source, /modalActionButtonClassName/);
  }
  for (const source of [
    loanReturnModal,
    rfidCapturePanels,
    rfidOverrideModal,
    saveOnlyModal,
    slotOnboardingModal,
  ]) {
    assert.match(source, /swatchColor=/);
  }
  assert.match(batchModal, /fullWidth/);
  assert.match(batchModal, /variant="solid"/);
  assert.match(batchModal, /size="roomy"/);
  assert.match(rfidCapturePanels, /<ModalFactCard/);
  assert.doesNotMatch(addPrinterModal, /rounded-xl bg-slate-900 px-4 py-2/);
  assert.doesNotMatch(createActions, /rounded-xl border px-4 py-3 text-sm font-semibold/);
  assert.doesNotMatch(createActions, /rounded-xl border px-3 py-2\.5 text-sm font-semibold/);
  assert.doesNotMatch(saveOnlyModal, /rounded-lg border border-slate-800 bg-slate-900 px-4 py-3/);
  for (const source of [rfidCapturePanels, rfidOverrideModal, slotOnboardingModal]) {
    assert.match(source, /variant="primary"/);
    assert.doesNotMatch(source, rawSecondaryClass);
    assert.doesNotMatch(source, rawPrimaryClass);
  }
});
