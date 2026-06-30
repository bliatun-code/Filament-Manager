import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("inventory detail labels use shared detail typography classes", () => {
  const detailPanelClasses = readComponentSource("inventory_detail_panel_class.ts");
  const rfidCapturePanels = readComponentSource("inventory_rfid_capture_panels.tsx");
  const rollHistoryPanel = readComponentSource("inventory_roll_history_panel.tsx");
  const spoolDetailSummary = readComponentSource("inventory_spool_detail_summary.tsx");

  assert.match(detailPanelClasses, /inventoryDetailLabelClassName/);
  assert.match(detailPanelClasses, /inventoryDetailSectionLabelClassName/);
  assert.match(detailPanelClasses, /inventoryPanelToggleButtonClassName/);
  assert.match(detailPanelClasses, /focus-visible:border-sky-300/);
  assert.match(spoolDetailSummary, /inventoryDetailLabelClassName/);
  assert.match(rfidCapturePanels, /inventoryDetailSectionLabelClassName/);
  assert.match(rfidCapturePanels, /inventoryPanelToggleButtonClassName/);
  assert.match(rollHistoryPanel, /inventoryPanelToggleButtonClassName/);
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
