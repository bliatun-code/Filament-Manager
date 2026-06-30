import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("inventory detail labels use shared detail typography classes", () => {
  const detailPanelClasses = readComponentSource("inventory_detail_panel_class.ts");
  const detailModal = readComponentSource("inventory_spool_detail_modal.tsx");
  const maintenancePanels = readComponentSource("inventory_spool_maintenance_panels.tsx");
  const qrRfidPanel = readComponentSource("inventory_spool_qr_rfid_panel.tsx");
  const rfidCapturePanels = readComponentSource("inventory_rfid_capture_panels.tsx");
  const rollHistoryPanel = readComponentSource("inventory_roll_history_panel.tsx");
  const spoolDetailSummary = readComponentSource("inventory_spool_detail_summary.tsx");
  const rawEyebrowClass =
    /text-xs uppercase tracking-\[0\.2em\] text-slate-500 dark:text-slate-400/;

  assert.match(detailPanelClasses, /inventoryDetailEyebrowClassName/);
  assert.match(detailPanelClasses, /inventoryDetailFormControlClassName/);
  assert.match(detailPanelClasses, /inventoryDetailLabelClassName/);
  assert.match(detailPanelClasses, /inventoryDetailSectionLabelClassName/);
  assert.match(detailPanelClasses, /inventoryDetailSaveButtonClassName/);
  assert.match(detailPanelClasses, /inventoryPanelToggleButtonClassName/);
  assert.match(detailPanelClasses, /focus-visible:border-sky-300/);
  assert.match(detailModal, /inventoryDetailEyebrowClassName/);
  assert.match(maintenancePanels, /inventoryDetailEyebrowClassName/);
  assert.match(maintenancePanels, /inventoryDetailFormControlClassName/);
  assert.match(maintenancePanels, /inventoryDetailSaveButtonClassName/);
  assert.match(qrRfidPanel, /inventoryDetailEyebrowClassName/);
  assert.match(rollHistoryPanel, /inventoryDetailEyebrowClassName/);
  assert.match(spoolDetailSummary, /inventoryDetailLabelClassName/);
  assert.match(rfidCapturePanels, /inventoryDetailSectionLabelClassName/);
  assert.match(rfidCapturePanels, /inventoryPanelToggleButtonClassName/);
  assert.match(rollHistoryPanel, /inventoryPanelToggleButtonClassName/);
  assert.doesNotMatch(detailModal, rawEyebrowClass);
  assert.doesNotMatch(maintenancePanels, rawEyebrowClass);
  assert.doesNotMatch(maintenancePanels, /inventoryMaintenanceInputClass/);
  assert.doesNotMatch(maintenancePanels, /inventoryMaintenanceSaveButtonClass/);
  assert.doesNotMatch(qrRfidPanel, rawEyebrowClass);
  assert.doesNotMatch(rollHistoryPanel, rawEyebrowClass);
  assert.doesNotMatch(
    spoolDetailSummary,
    /text-\[10px\] font-semibold uppercase tracking-\[0\.18em\]/,
  );
  assert.doesNotMatch(
    rfidCapturePanels,
    /text-\[11px\] font-semibold uppercase tracking-\[0\.18em\]/,
  );
  assert.doesNotMatch(
    rfidCapturePanels,
    /rounded-lg border border-slate-200 px-2\.5 py-1 text-\[11px\] font-semibold/,
  );
  assert.doesNotMatch(
    rollHistoryPanel,
    /rounded-lg border border-slate-200 px-2\.5 py-1 text-\[11px\] font-semibold/,
  );
});
