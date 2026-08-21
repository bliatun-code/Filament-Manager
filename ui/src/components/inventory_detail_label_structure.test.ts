import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { InventorySpool } from "../lib/inventory_list_model";
import { InventoryHeaderActions } from "./inventory_controls_panel";
import { InventorySpoolQrRfidPanel } from "./inventory_spool_qr_rfid_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("inventory detail labels use shared detail typography classes", () => {
  const detailPanelClasses = readComponentSource("inventory_detail_panel_class.ts");
  const catalogMetadataPanel = readComponentSource("inventory_catalog_metadata_panel.tsx");
  const detailModal = readComponentSource("inventory_spool_detail_modal.tsx");
  const detailFactCard = readComponentSource("inventory_detail_fact_card.tsx");
  const maintenancePanels = readComponentSource("inventory_spool_maintenance_panels.tsx");
  const qrRfidPanel = readComponentSource("inventory_spool_qr_rfid_panel.tsx");
  const rfidCapturePanels = readComponentSource("inventory_rfid_capture_panels.tsx");
  const rollHistoryPanel = readComponentSource("inventory_roll_history_panel.tsx");
  const spoolDetailSummary = readComponentSource("inventory_spool_detail_summary.tsx");
  const rawEyebrowClass =
    /text-xs uppercase tracking-\[0\.2em\] text-slate-500 dark:text-slate-400/;

  assert.match(detailPanelClasses, /inventoryDetailActionButtonClassName/);
  assert.match(detailPanelClasses, /inventoryDetailCompactActionButtonClassName/);
  assert.match(detailPanelClasses, /inventoryDetailCompactFormControlClassName/);
  assert.match(detailPanelClasses, /inventoryDetailDangerActionButtonClassName/);
  assert.match(detailPanelClasses, /inventoryDetailEyebrowClassName/);
  assert.match(detailPanelClasses, /inventoryDetailFormControlClassName/);
  assert.match(detailPanelClasses, /inventoryDetailLabelClassName/);
  assert.match(detailPanelClasses, /inventoryDetailSectionLabelClassName/);
  assert.match(detailPanelClasses, /inventoryDetailSaveButtonClassName/);
  assert.match(detailPanelClasses, /inventoryPanelToggleButtonClassName/);
  assert.match(detailPanelClasses, /focus-visible:border-sky-300/);
  assert.match(catalogMetadataPanel, /inventoryDetailCompactActionButtonClassName/);
  assert.match(catalogMetadataPanel, /inventoryDetailCompactFormControlClassName/);
  assert.match(catalogMetadataPanel, /inventoryDetailEyebrowClassName/);
  assert.match(detailFactCard, /inventoryDetailFactCardClassName/);
  assert.match(detailFactCard, /inventoryDetailTintPanelClassName/);
  assert.match(detailFactCard, /function InventoryDetailTintPanel/);
  assert.match(detailFactCard, /inventoryDetailLabelClassName/);
  assert.match(detailFactCard, /joinClassNames/);
  assert.match(catalogMetadataPanel, /InventoryDetailTintPanel/);
  assert.match(detailModal, /inventoryDetailEyebrowClassName/);
  assert.match(maintenancePanels, /inventoryDetailEyebrowClassName/);
  assert.match(maintenancePanels, /inventoryDetailDangerActionButtonClassName/);
  assert.match(maintenancePanels, /inventoryDetailFormControlClassName/);
  assert.match(maintenancePanels, /inventoryDetailSaveButtonClassName/);
  assert.match(maintenancePanels, /SegmentedChoiceRow/);
  assert.match(maintenancePanels, /groupClassName="w-full"/);
  assert.match(maintenancePanels, /optionSizeClassName="flex-1 justify-center px-3 py-2 text-sm"/);
  assert.match(qrRfidPanel, /inventoryDetailActionButtonClassName/);
  assert.match(qrRfidPanel, /inventoryDetailEyebrowClassName/);
  assert.match(qrRfidPanel, /InventoryDetailTintPanel/);
  assert.match(qrRfidPanel, /inventory\.labelSheetInventoryHint/);
  assert.match(rollHistoryPanel, /inventoryDetailEyebrowClassName/);
  assert.match(spoolDetailSummary, /InventoryDetailFactCard/);
  assert.match(rfidCapturePanels, /inventoryDetailSectionLabelClassName/);
  assert.match(rfidCapturePanels, /inventoryPanelToggleButtonClassName/);
  assert.match(rollHistoryPanel, /inventoryPanelToggleButtonClassName/);
  assert.doesNotMatch(catalogMetadataPanel, rawEyebrowClass);
  assert.doesNotMatch(
    catalogMetadataPanel,
    /w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900/,
  );
  assert.doesNotMatch(
    catalogMetadataPanel,
    /rounded-lg border border-slate-200 bg-white px-3 py-1\.5 text-xs font-semibold/,
  );
  assert.doesNotMatch(
    catalogMetadataPanel,
    /rounded-xl border border-slate-200 bg-slate-50 p-4/,
  );
  assert.doesNotMatch(detailModal, rawEyebrowClass);
  assert.doesNotMatch(maintenancePanels, rawEyebrowClass);
  assert.doesNotMatch(
    maintenancePanels,
    /w-full rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold/,
  );
  assert.doesNotMatch(
    maintenancePanels,
    /rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed/,
  );
  assert.doesNotMatch(maintenancePanels, /ownershipSegmentBaseClass/);
  assert.doesNotMatch(maintenancePanels, /inventoryMaintenanceInputClass/);
  assert.doesNotMatch(maintenancePanels, /inventoryMaintenanceSaveButtonClass/);
  assert.doesNotMatch(qrRfidPanel, /qrRfidActionButtonClassName/);
  assert.doesNotMatch(qrRfidPanel, /rounded-xl border border-slate-200 bg-slate-50 p-4/);
  assert.doesNotMatch(qrRfidPanel, rawEyebrowClass);
  assert.doesNotMatch(rollHistoryPanel, rawEyebrowClass);
  assert.doesNotMatch(
    spoolDetailSummary,
    /text-\[10px\] font-semibold uppercase tracking-\[0\.18em\]/,
  );
  assert.doesNotMatch(
    spoolDetailSummary,
    /rounded-xl border border-white\/70 bg-white\/70 px-3\.5 py-3/,
  );
  assert.doesNotMatch(
    spoolDetailSummary,
    /rounded-xl border border-slate-200 bg-slate-50 p-3\.5/,
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

test("multi-roll label workflow is rendered in Inventory and linked from roll detail", () => {
  const i18nValue: I18nContextValue = {
    locale: "en",
    setLocale: () => {},
    t: (_key, fallback = "") => fallback,
  };
  const spool: InventorySpool = {
    id: "spool-label-placement",
    masterId: "master-label-placement",
    vendor: "Bambu Lab",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Blue",
    initialWeightGrams: 1_000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
  };
  const noop = () => {};
  const html = renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(
        React.Fragment,
        null,
        React.createElement(InventoryHeaderActions, {
          labelSheetDisabled: false,
          lowStockOnly: false,
          onAddSpool: noop,
          onCreateLabelSheet: noop,
          onLoanOutRoll: noop,
          onLowStockOnlyChange: noop,
          onSearchChange: noop,
          onStatusFilterChange: noop,
          primaryActionsDisabled: false,
          search: "",
          showStockFilters: true,
          statusFilter: "ALL",
        }),
        React.createElement(InventorySpoolQrRfidPanel, {
          companionAvailable: true,
          dataUrl: "data:image/png;base64,AA==",
          loading: false,
          onPrintLabel: async () => {},
          onStartRfidCapture: noop,
          resolvedTheme: "light",
          runtimeAvailable: true,
          spool,
          supportsRfidCapture: false,
          target: "http://127.0.0.1/spools/spool-label-placement",
        }),
      ),
    ),
  );

  assert.match(html, />Create inventory label sheet<\/button>/);
  assert.match(
    html,
    /Need labels for several rolls\? Create an inventory label sheet from the Inventory header\./,
  );
  assert.doesNotMatch(html, /Settings → General/);
});
