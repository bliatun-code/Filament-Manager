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
const inventoryAddWorkflowSource = readFileSync(
  new URL("../lib/use_inventory_add_workflow.ts", import.meta.url),
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
const inventoryDetailContextActionsSource = readFileSync(
  new URL("../components/inventory_spool_detail_context_actions.tsx", import.meta.url),
  "utf8",
);
const loansPageSource = readFileSync(new URL("./loans.tsx", import.meta.url), "utf8");

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

test("inventory add workflow stays out of the initial inventory bundle", () => {
  assert.match(
    inventoryPageWorkspaceSource,
    /import type \{ InventoryAddModalProps \} from "\.\/inventory_add_modal"/,
  );
  assert.match(inventoryPageWorkspaceSource, /import\("\.\/inventory_add_modal"\)/);
  assert.doesNotMatch(
    inventoryPageWorkspaceSource,
    /import \{ InventoryAddModal, type InventoryAddModalProps \}/,
  );
  assert.match(
    inventoryPageWorkspaceSource,
    /addModalActive \? \([\s\S]*<InventoryAddModalBoundary/,
  );
  assert.match(
    inventoryPageWorkspaceSource,
    /<Suspense[\s\S]*fallback=\{[\s\S]*<AppModal[\s\S]*role="status"[\s\S]*<InventoryAddModalView/,
  );
  assert.match(inventoryPageWorkspaceSource, /returnFocusElement=\{returnFocusElement\}/);
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

test("inventory header leaves loan creation to the loans page and spool detail", () => {
  const headerActionsSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryHeaderActions"),
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );

  assert.doesNotMatch(headerActionsSource, /onLoanOutRoll|inventory\.loanOutRoll/);
  assert.match(loansPageSource, /inventory\.loanOutRoll/);
  assert.match(inventoryDetailContextActionsSource, /inventory\.loanOutAction/);
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
  assert.match(inventoryPageSource, /onReload: \(\) => reloadLocations\(\)/);
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

test("inventory refreshes page data without eagerly loading the add-flow catalog", () => {
  const headerActionsSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryHeaderActions"),
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );
  const refreshStart = inventoryPageDataSource.indexOf("const refreshInventoryData");
  const refreshSource = inventoryPageDataSource.slice(
    refreshStart,
    inventoryPageDataSource.indexOf("\n  return {", refreshStart),
  );

  assert.doesNotMatch(headerActionsSource, /PageRefreshButton/);
  assert.doesNotMatch(headerActionsSource, /onRefresh/);
  assert.match(inventoryPageWorkspaceSource, /PageLoadErrorBanner/);
  assert.match(inventoryPageSource, /onRetryLoadError=\{retryInventoryPageLoad\}/);
  assert.match(inventoryPageDataSource, /usePageRefreshState/);
  assert.match(refreshSource, /reloadSpools\(reportResult\)/);
  assert.match(refreshSource, /reloadWishlist\(reportResult\)/);
  assert.match(refreshSource, /reloadActiveLoans\(reportResult\)/);
  assert.match(refreshSource, /reloadPrinterOverview\(reportResult\)/);
  assert.doesNotMatch(refreshSource, /reloadCatalog\(reportResult\)/);
  assert.match(
    inventoryCatalogReloadSource,
    /!showAddModal[\s\S]*sidePanelMode !== "ADD"[\s\S]*void reloadCatalog\(\)/,
  );
  assert.match(refreshSource, /reloadSpoolDetail\(selectedSpoolId, reportResult\)/);
  assert.match(refreshSource, /const expectedDomains: InventoryDataRequestDomain\[\]/);
  assert.match(refreshSource, /expectedDomains\.push\("detail"\)/);
  assert.match(refreshSource, /const missingDomains = expectedDomains\.filter/);
  assert.match(refreshSource, /resolution === "SUPERSEDED"/);
  assert.match(refreshSource, /completeRefresh\(\)/);
  assert.match(refreshSource, /failRefresh\(/);
});

test("catalog-backed create actions wait for the current catalog request", () => {
  assert.match(
    inventoryAddWorkflowSource,
    /const catalogSelectionUnavailable =[\s\S]*isCatalogCreateMode && catalogLoadState !== "READY"/,
  );
  assert.match(
    inventoryAddWorkflowSource,
    /const disableCreate =[\s\S]*catalogSelectionUnavailable \|\|[\s\S]*isInventoryCreateDisabled/,
  );
  assert.match(
    inventoryAddWorkflowSource,
    /const disableWishlistCreate =[\s\S]*catalogSelectionUnavailable/,
  );
  assert.match(
    inventoryAddWorkflowSource,
    /disabledBambuBatchCreate:[\s\S]*catalogLoadState !== "READY" \|\| bambuBatchCreateState\.disabled/,
  );
});

test("inventory Host feedback waits for a settled role and initial load", () => {
  assert.match(inventoryPageDataSource, /useState<ClientSnapshotSource>\("UNRESOLVED"\)/);
  assert.match(inventoryPageDataSource, /setClientInventorySource\("UNRESOLVED"\)/);
  assert.match(
    inventoryPageWorkspaceSource,
    /shouldShowClientSnapshotWarning\(\{[\s\S]*clientReadOnly,[\s\S]*initialLoadSettled: librarySyncReady && !loading/,
  );
  assert.match(inventoryPageDataSource, /isClientCompositeSnapshotPartial/);
  assert.match(inventoryPageDataSource, /clientInventoryDomainSourcesRef/);
  assert.match(inventoryPageDataSource, /recordClientInventoryDomainSource/);
  assert.match(inventoryPageDataSource, /new Map<InventoryDataRequestDomain, InventoryReloadResolution>/);
  assert.match(
    inventoryPageDataSource,
    /setClientInventoryPartial\([\s\S]*primarySource: clientInventorySourceRef\.current,[\s\S]*secondarySources/,
  );
  assert.match(
    inventoryPageDataSource,
    /clientInventorySourceRef\.current = "UNRESOLVED";[\s\S]*beginRefresh\(\)/,
  );
  assert.match(
    inventoryPageDataSource,
    /result\.source === "OFFLINE"[\s\S]*setSpools\(result\.rows\)/,
  );
  assert.match(
    inventoryPageWorkspaceSource,
    /showOfflineSourceWarning=\{[\s\S]*clientReadOnly &&[\s\S]*!clientDataWarningVisible &&[\s\S]*!loadError &&[\s\S]*librarySyncReady &&[\s\S]*!loading/,
  );
  assert.match(inventoryPageWorkspaceSource, /clientPartialWarningVisible/);
  assert.match(inventoryPageWorkspaceSource, /!loadError && \(clientHostWarningVisible \|\| clientPartialWarningVisible\)/);
  assert.match(inventoryPageWorkspaceSource, /<PageDataFallbackBanner/);
  assert.match(inventoryPageWorkspaceSource, /onRetry=\{onRetryLoadError\}/);
});

test("loan client fallback completes cleanly and uses only settled Host feedback", () => {
  const reloadSource = loansPageSource.slice(
    loansPageSource.indexOf("const reload = useCallback"),
    loansPageSource.indexOf("useEffect(() =>", loansPageSource.indexOf("const reload = useCallback")),
  );
  assert.doesNotMatch(reloadSource, /result\.source === "OFFLINE"[\s\S]*failRefresh/);
  assert.match(reloadSource, /setLoans\(result\.rows\);[\s\S]*completeRefresh\(\)/);
  assert.match(
    loansPageSource,
    /shouldShowClientSnapshotWarning\(\{[\s\S]*initialLoadSettled: librarySyncReady && !loading/,
  );
  assert.match(loansPageSource, /<PageDataFallbackBanner/);
  assert.match(
    loansPageSource,
    /clientHostWarningVisible && !librarySyncError && !loadError/,
  );
  assert.match(loansPageSource, /onRetry=\{\(\) => void reload\(\)\}/);
});

test("inventory role resolution stays fail-closed and retryable before enabling writes", () => {
  assert.match(
    inventoryPageDataSource,
    /const \[clientReadOnly, setClientReadOnly\] = useState\(tauriAvailable\)/,
  );
  assert.match(
    inventoryPageDataSource,
    /tauriAvailable \? "LOADING" : "READY"/,
  );
  assert.match(
    inventoryPageDataSource,
    /setLibrarySyncResolution\("ERROR"\);[\s\S]*failRefresh\(/,
  );
  assert.match(inventoryPageDataSource, /const retryLibrarySyncRole = useCallback/);
  assert.match(
    inventoryPageSource,
    /!librarySyncReady \|\| \(clientReadOnly \? !clientHostWritePaired : false\)/,
  );
  assert.match(
    inventoryPageSource,
    /tauri &&[\s\S]*librarySyncReady &&[\s\S]*\(!clientReadOnly \|\| clientHostWritePaired\)/,
  );
});

test("inventory data requests cannot land after a role or target transition", () => {
  assert.match(inventoryPageDataSource, /type InventoryDataRequestDomain/);
  assert.match(inventoryPageDataSource, /invalidateInventoryDataRequests\(\)/);
  assert.match(inventoryPageDataSource, /clearTargetScopedData\(\)/);
  const targetClearSource = inventoryPageDataSource.slice(
    inventoryPageDataSource.indexOf("const clearTargetScopedData"),
    inventoryPageDataSource.indexOf("const resolveLibrarySyncRole"),
  );
  assert.match(targetClearSource, /setLocationsLoading\(false\)/);
  assert.match(targetClearSource, /setWishlistLoading\(false\)/);
  assert.match(targetClearSource, /setHistoryLoading\(false\)/);
  assert.match(targetClearSource, /setUsageLoading\(false\)/);
  assert.match(
    inventoryPageDataSource,
    /const requestId = beginDataRequest\("spools"\);[\s\S]*?if \(!dataRequestIsCurrent\("spools", requestId\)\) \{[\s\S]*?"SUPERSEDED"[\s\S]*?return;/,
  );
  assert.match(
    inventoryPageDataSource,
    /const requestId = refreshRequestRef\.current \+ 1;[\s\S]*?if \(refreshRequestRef\.current !== requestId\) \{\s*return;/,
  );
  assert.doesNotMatch(inventoryPageDataSource, /refreshInFlightRef/);
});

test("inventory loaders clear unavailable client-only state without clearing local failures", () => {
  const transientLoaderSource = inventoryPageDataSource.slice(
    inventoryPageDataSource.indexOf("const reloadLocations"),
    inventoryPageDataSource.indexOf("const refreshInventoryData"),
  );
  assert.match(
    transientLoaderSource,
    /if \(clientReadOnly\) \{[\s\S]*?if \(reportResult\) \{\s*setLocations\(\[\]\);\s*\}[\s\S]*?setLocationMutationsSupported\(false\);[\s\S]*?setLocationSource\("OFFLINE"\);/,
  );
  assert.match(
    transientLoaderSource,
    /loadWishlistItemsSnapshot[\s\S]*result\.source === "OFFLINE" && !reportResult[\s\S]*recordClientInventoryDomainSource\("wishlist", "OFFLINE"\)[\s\S]*setWishlistItems\(result\.rows\)[\s\S]*recordClientInventoryDomainSource\("wishlist", result\.source\)/,
  );
  assert.match(
    transientLoaderSource,
    /loadActiveLoanRowsSnapshot[\s\S]*result\.source === "OFFLINE" && !reportResult[\s\S]*recordClientInventoryDomainSource\("loans", "OFFLINE"\)[\s\S]*setActiveLoans\(result\.rows\)[\s\S]*recordClientInventoryDomainSource\("loans", result\.source\)/,
  );
  assert.match(
    transientLoaderSource,
    /overview\.source === "OFFLINE"[\s\S]*setPrinterOverview\(\[\]\)[\s\S]*reportResult\?\.\("printers", "OFFLINE"\)/,
  );
  assert.match(
    transientLoaderSource,
    /if \(reportResult && clientReadOnly\) \{\s*setHistoryRows\(\[\]\);\s*setUsagePoints\(\[\]\);\s*\}[\s\S]*?recordClientInventoryDomainSource\("detail", "OFFLINE"\)[\s\S]*?reportResult\?\.\("detail", clientReadOnly \? "OFFLINE" : "ERROR"\)/,
  );
  assert.match(
    transientLoaderSource,
    /result\.source === "OFFLINE" && !reportResult[\s\S]*Keep their last-good rows[\s\S]*return;/,
  );
  assert.match(
    transientLoaderSource,
    /const hasLastGoodSnapshot =[\s\S]*clientInventorySourceRef\.current === "LIVE"[\s\S]*clientInventorySourceRef\.current === "CACHED"[\s\S]*result\.source === "OFFLINE" && !reportResult && hasLastGoodSnapshot[\s\S]*\? "CACHED"/,
  );
  assert.match(
    transientLoaderSource,
    /setLocationMutationsSupported\(false\);[\s\S]*setLocationSource\("OFFLINE"\);[\s\S]*recordClientInventoryDomainSource\("locations", "OFFLINE"\)/,
  );
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
