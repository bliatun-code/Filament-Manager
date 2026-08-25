import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inventoryPageWorkspaceSource = readFileSync(
  "ui/src/components/inventory_page_workspace.tsx",
  "utf8",
);
const inventoryControlsSource = readFileSync(
  "ui/src/components/inventory_controls_panel.tsx",
  "utf8",
);
const inventoryAddModalSource = readFileSync(
  "ui/src/components/inventory_add_modal.tsx",
  "utf8",
);
const inventoryPageSource = readFileSync(
  new URL("./inventory.tsx", import.meta.url),
  "utf8",
);
const inventoryDetailModalSource = readFileSync(
  new URL("../components/inventory_spool_detail_modal.tsx", import.meta.url),
  "utf8",
);
const inventoryPageDataSource = readFileSync(
  new URL("../lib/use_inventory_page_data.ts", import.meta.url),
  "utf8",
);
const inventoryCatalogReloadSource = readFileSync(
  new URL("../lib/use_inventory_catalog_reload.ts", import.meta.url),
  "utf8",
);
const inventorySelectedDetailStateSource = readFileSync(
  new URL("../lib/use_inventory_selected_spool_detail_state.ts", import.meta.url),
  "utf8",
);
const inventorySpoolDetailActionsSource = readFileSync(
  new URL("../lib/use_inventory_spool_detail_actions.ts", import.meta.url),
  "utf8",
);
const inventoryLabelSheetActionSource = readFileSync(
  new URL("../lib/use_inventory_label_sheet_action.ts", import.meta.url),
  "utf8",
);
const inventoryFiltersSource = readFileSync(
  new URL("../lib/use_inventory_filters.ts", import.meta.url),
  "utf8",
);

test("inventory header actions stay inside the page header", () => {
  const headerIndex = inventoryPageWorkspaceSource.indexOf('<div className="page-header">');
  const headerActionsIndex = inventoryPageWorkspaceSource.indexOf(
    "<InventoryHeaderActions",
    headerIndex,
  );
  const filterPanelIndex = inventoryPageWorkspaceSource.indexOf(
    "<InventoryControlsPanel",
    headerIndex,
  );

  assert.notEqual(headerIndex, -1);
  assert.notEqual(headerActionsIndex, -1);
  assert.notEqual(filterPanelIndex, -1);
  assert.ok(
    headerIndex < headerActionsIndex && headerActionsIndex < filterPanelIndex,
    "header actions must render in the header before the separate filter panel",
  );
});

test("inventory label sheets preserve lazy QR and label rendering chunks", () => {
  assert.match(inventoryLabelSheetActionSource, /import\("\.\/spool_qr_artifacts"\)/);
  assert.match(inventoryLabelSheetActionSource, /import\("\.\/filament_label_print"\)/);
  assert.doesNotMatch(
    inventoryLabelSheetActionSource,
    /import \{ resolveSpoolQrCompanionShellUrl \} from "\.\/spool_qr_artifacts"/,
  );
});

test("inventory filters do not own header search and primary actions", () => {
  const headerActionsSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryHeaderActions"),
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );
  const filterPanelSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );

  assert.match(headerActionsSource, /page-header-actions/);
  assert.match(headerActionsSource, /page-header-search/);
  assert.match(headerActionsSource, /PageHeaderButton/);
  assert.match(headerActionsSource, /variant="primary"/);
  assert.doesNotMatch(filterPanelSource, /page-header-actions/);
  assert.doesNotMatch(filterPanelSource, /page-header-search/);
  assert.doesNotMatch(filterPanelSource, /PageHeaderButton/);
});

test("inventory exposes purchases as a page view and keeps queue management out of add spool", () => {
  assert.match(inventoryPageWorkspaceSource, /<InventoryWorkspaceNavigation/);
  assert.match(inventoryPageWorkspaceSource, /activeView === "STOCK"/);
  assert.match(inventoryPageWorkspaceSource, /<WishlistQueuePanel \{\.\.\.purchaseQueueProps\} \/>/);
  assert.match(inventoryPageWorkspaceSource, /id="inventory-purchases-panel"/);
  assert.match(
    inventoryPageWorkspaceSource,
    /id="inventory-purchases-panel"[\s\S]*hidden=\{activeView !== "PURCHASES"\}/,
  );
  assert.match(inventoryPageSource, /setActiveWorkspaceView\("PURCHASES"\)/);
  assert.match(inventoryPageSource, /resetPurchaseQueue\("ON_ORDER"\)/);
  assert.match(inventoryPageSource, /navigationIntent\.kind === "PURCHASES"/);
  assert.match(inventoryPageSource, /resetPurchaseQueue\(navigationIntent\.status\)/);
  assert.doesNotMatch(inventoryAddModalSource, /WishlistQueuePanel/);
});

test("spool-detail navigation waits for inventory readiness before revealing its target", () => {
  assert.match(inventoryPageSource, /navigationIntent\.kind === "SPOOL_DETAIL"/);
  assert.match(inventoryPageSource, /!librarySyncReady \|\| loading/);
  assert.match(
    inventoryPageSource,
    /spools\.find\(\(spool\) => spool\.id === navigationIntent\.spoolId\)/,
  );
  assert.match(
    inventoryPageSource,
    /resetFilters\(\);[\s\S]*setActiveWorkspaceView\("STOCK"\);[\s\S]*openRollModal\(targetSpool\.id\);[\s\S]*onConsumeNavigationIntent\?\.\(\)/,
  );
});

test("inventory exposes managed location objects and autocomplete in one click", () => {
  assert.match(inventoryPageWorkspaceSource, /id="inventory-locations-panel"/);
  assert.match(
    inventoryPageWorkspaceSource,
    /id="inventory-locations-panel"[\s\S]*hidden=\{activeView !== "LOCATIONS"\}/,
  );
  assert.match(inventoryPageWorkspaceSource, /<InventoryLocationManagementPanel/);
  assert.match(inventoryPageSource, /<InventoryLocationDatalist rows=\{locations\}/);
  assert.match(inventoryPageSource, /locationPanelProps=\{\{/);
  assert.match(inventoryPageSource, /onOpenLinkedSpools: openLinkedLocationSpools/);
  assert.match(
    inventoryPageSource,
    /showLocationSpools\(location\);\s*setActiveWorkspaceView\("STOCK"\)/,
  );
  assert.match(inventoryPageSource, /totalLocationCount=\{selectableInventoryLocations/);
});

test("inventory search and filter controls expose accessible names and state", () => {
  assert.match(inventoryControlsSource, /aria-label=\{t\(/);
  assert.match(inventoryControlsSource, /aria-pressed=\{lowStockOnly\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{statusFilter === status\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{inventoryView === "CARDS"\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{inventoryView === "LIST"\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{ownershipFilter === ownership\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{vendorFilter === vendor\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{materialFilter === material\}/);
  assert.match(inventoryControlsSource, /aria-expanded=\{advancedFiltersOpen\}/);
  assert.match(inventoryControlsSource, /aria-controls="inventory-advanced-filters"/);
  assert.match(inventoryControlsSource, /id="inventory-advanced-filters"/);
  assert.match(inventoryControlsSource, /onClick=\{onLocationFilterClear\}/);
  assert.match(inventoryControlsSource, /id="inventory-location-filter-chip"/);
  assert.match(inventoryControlsSource, /common\.remove/);
  assert.match(inventoryControlsSource, /locationFilter\.name/);
  assert.match(
    inventoryPageSource,
    /getElementById\("inventory-location-filter-chip"\)\?\.focus\(\)/,
  );
});

test("inventory result summary counts all active filters and offers reset", () => {
  assert.match(inventoryControlsSource, /aria-live="polite"/);
  assert.match(inventoryControlsSource, /visibleInventoryCount === 1/);
  assert.match(inventoryControlsSource, /activeFilterCount > 0/);
  assert.match(inventoryControlsSource, /onClick=\{onResetFilters\}/);
  assert.match(inventoryControlsSource, /inventory\.resetFilters/);
  assert.match(inventoryControlsSource, /aria-expanded=\{bulkSelectionActive\}/);
  assert.match(inventoryControlsSource, /inventory\.bulkSelectionModeStart/);
  assert.match(inventoryControlsSource, /inventory\.bulkSelectionModeDone/);
  assert.match(inventoryPageWorkspaceSource, /bulkActionsProps\.active \? \(/);
  assert.match(inventoryPageWorkspaceSource, /bulkSelectionTriggerProps\.onActiveChange/);
});

test("inventory layout preferences stay deterministic in visual QA and separate from filters", () => {
  assert.match(
    inventoryPageSource,
    /deterministicPagePreferences: Boolean\(desktopVisualQaScenario \|\| detailVisualFixture\)/,
  );
  const resetFiltersSource = inventoryFiltersSource.slice(
    inventoryFiltersSource.indexOf("const resetFilters"),
    inventoryFiltersSource.indexOf("const showLowStockList"),
  );
  const lowStockSource = inventoryFiltersSource.slice(
    inventoryFiltersSource.indexOf("const showLowStockList"),
    inventoryFiltersSource.indexOf("return {"),
  );
  assert.doesNotMatch(resetFiltersSource, /setInventoryView/);
  assert.match(lowStockSource, /setInventoryViewState\("LIST"\)/);
  assert.doesNotMatch(lowStockSource, /writeInventoryPagePreferences/);
});

test("inventory refreshes every page dataset without a persistent header action", () => {
  const headerActionsSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryHeaderActions"),
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );
  const refreshSource = inventoryPageDataSource.slice(
    inventoryPageDataSource.indexOf("const refreshInventoryData"),
    inventoryPageDataSource.indexOf("return {"),
  );

  assert.doesNotMatch(headerActionsSource, /PageRefreshButton/);
  assert.doesNotMatch(headerActionsSource, /onRefresh/);
  assert.match(inventoryPageWorkspaceSource, /PageLoadErrorBanner/);
  assert.match(inventoryPageSource, /onRetryLoadError=\{refreshInventoryPage\}/);
  assert.match(inventoryPageDataSource, /usePageRefreshState/);
  assert.match(refreshSource, /reloadSpools\(reportResult\)/);
  assert.match(refreshSource, /reloadWishlist\(reportResult\)/);
  assert.match(refreshSource, /reloadActiveLoans\(reportResult\)/);
  assert.match(refreshSource, /reloadPrinterOverview\(reportResult\)/);
  assert.match(refreshSource, /reloadCatalog\(reportResult\)/);
  assert.match(refreshSource, /reloadSpoolDetail\(selectedSpoolId, reportResult\)/);
  assert.match(refreshSource, /completeRefresh\(\)/);
  assert.match(refreshSource, /failRefresh\(/);
});

test("inventory loaders preserve last-good state on transient failures", () => {
  assert.doesNotMatch(inventoryPageDataSource, /setWishlistItems\(\[\]\)/);
  assert.doesNotMatch(inventoryPageDataSource, /setActiveLoans\(\[\]\)/);
  assert.doesNotMatch(inventoryPageDataSource, /setPrinterOverview\(\[\]\)/);
  assert.doesNotMatch(inventoryPageDataSource, /setHistoryRows\(\[\]\)/);
  assert.doesNotMatch(inventoryPageDataSource, /setUsagePoints\(\[\]\)/);
  assert.doesNotMatch(inventoryCatalogReloadSource, /setMasters\(\[\]\)/);
  assert.match(inventorySelectedDetailStateSource, /detailSpoolIdRef\.current === selectedSpool\.id/);
  assert.match(inventoryPageSource, /error=\{error\}/);
  assert.match(inventoryPageSource, /loadError=\{loadError\}/);
});

test("individual price protection stays in the common-detail draft and atomic save", () => {
  const purchaseFieldsIndex = inventoryDetailModalSource.indexOf(
    "<PurchaseReceiptMetadataFields",
  );
  const protectionIndex = inventoryDetailModalSource.indexOf(
    "<InventoryPurchasePriceProtectionControl",
  );
  const lostStatusIndex = inventoryDetailModalSource.indexOf(
    "<InventorySpoolLostStatusPanel",
  );

  assert.ok(purchaseFieldsIndex >= 0 && protectionIndex > purchaseFieldsIndex);
  assert.ok(lostStatusIndex > protectionIndex);
  assert.match(
    inventorySelectedDetailStateSource,
    /draftBaseline\.common\.purchasePriceBatchLocked/,
  );
  assert.match(
    inventorySelectedDetailStateSource,
    /setSelectedSpoolPurchasePriceBatchLockedDraft\(false\)/,
  );
  assert.match(
    inventorySpoolDetailActionsSource,
    /purchase_price_batch_locked: parsed\.value\.purchasePriceBatchLocked/,
  );
  assert.match(
    inventoryPageSource,
    /onChangePurchasePriceBatchLocked=\{[\s\S]*setSelectedSpoolPurchasePriceBatchLockedDraft/,
  );
  assert.match(
    inventoryPageSource,
    /purchasePriceBatchLockedDraft=\{selectedSpoolPurchasePriceBatchLockedDraft\}/,
  );
});

test("history visual QA waits for rows and targets the modal scroll container", () => {
  assert.match(inventoryDetailModalSource, /data-inventory-detail-scroll/);
  assert.match(
    inventoryPageSource,
    /historyLoading \|\|[\s\S]*usageLoading \|\|[\s\S]*selectedSpoolQrLoading \|\|[\s\S]*visibleHistoryRows\.length === 0/,
  );
  assert.match(inventoryPageSource, /visibleHistoryRows\.length,/);
  assert.match(inventoryPageSource, /scrollContainer\.scrollTop =/);
  assert.match(inventoryPageSource, /\[150, 450, 900\]\.map/);
  assert.match(inventoryPageSource, /window\.addEventListener\("resize", scheduleScrollToTarget\)/);
  assert.match(inventoryPageSource, /new ResizeObserver\(scheduleScrollToTarget\)/);
  assert.match(inventoryPageSource, /block: "start"/);
});
