import { clientPairingActionHint } from "../lib/error_text";
import {
  lazy,
  Suspense,
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InventoryPageWorkspace } from "../components/inventory_page_workspace";
import { InventoryLocationDatalist } from "../components/inventory_location_datalist";
import type { InventoryWorkspaceView } from "../components/inventory_workspace_navigation";
import { InventoryRfidCaptureModal } from "../components/inventory_rfid_capture_modal";
import { InventoryLabelSheetModal } from "../components/inventory_label_sheet_modal";

import { isLocationSpoolTargetCurrent, type LocationSpoolTarget } from "../lib/tauri_location_client";
import type { LoanWorkspaceCounts } from "../lib/tauri_loan_client";
import { matchesWishlistPurchaseTarget } from "../lib/tauri_wishlist_client";
import { dashboardPurchaseNotice, type InventoryNavigationIntent } from "../lib/app_navigation_model";
import { useInventoryMarkEmptyAction } from "../lib/use_inventory_mark_empty_action";
import { useI18n } from "../lib/i18n";
import {
  chooseDesktopVisualQaLoanSpool,
  chooseDesktopVisualQaSpoolId,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import {
  isInventorySpoolLoanedOut,
  hasInventorySpoolLoan,
  isInventorySpoolLoanTrackingCandidate,
  type InventoryLocationFilter,
} from "../lib/inventory_list_model";
import { isOutboundLoanDirection } from "../lib/inventory_domain";
import {
  selectableInventoryLocations,
  type InventoryLocationMutationContext,
} from "../lib/inventory_location_data_source";
import { useInventoryLocationActions } from "../lib/use_inventory_location_actions";
import type { RfidCaptureField } from "../lib/inventory_rfid_capture";
import {
  buildInventoryDetailVisualFixture,
  isInventoryDetailVisualFixtureEnabled,
} from "../lib/inventory_visual_fixture";
import { useResolvedTheme } from "../lib/theme_mode";
import { useWishlistQueue } from "../lib/use_wishlist_queue";
import { useInventoryAddWorkflow } from "../lib/use_inventory_add_workflow";
import { useInventoryBulkActions } from "../lib/use_inventory_bulk_actions";
import { useInventoryDetailVisualFixture } from "../lib/use_inventory_detail_visual_fixture";
import { useInventoryFeedbackTimeout } from "../lib/use_inventory_feedback_timeout";
import { useInventoryFilters } from "../lib/use_inventory_filters";
import { useInventoryHistoryFormatters } from "../lib/use_inventory_history_formatters";
import { useInventoryLoanTrackingModal } from "../lib/use_inventory_loan_tracking_modal";
import { useInventoryLabelSheetAction } from "../lib/use_inventory_label_sheet_action";
import { useInventoryLoadSpoolAction } from "../lib/use_inventory_load_spool_action";
import type { ClientSnapshotSource } from "../lib/page_refresh_state";
import { useInventoryPageData, type InventoryReloadReporter } from "../lib/use_inventory_page_data";
import { useInventoryPrinterSlots } from "../lib/use_inventory_printer_slots";
import { useInventoryRfidCaptureRefresh } from "../lib/use_inventory_rfid_capture_refresh";
import { useInventoryRfidCaptureViewModel } from "../lib/use_inventory_rfid_capture_view_model";
import { useInventoryRollModalEscape } from "../lib/use_inventory_roll_modal_escape";
import { useInventorySelectedSpool } from "../lib/use_inventory_selected_spool";
import { useInventorySelectedSpoolDetailState } from "../lib/use_inventory_selected_spool_detail_state";
import { useInventorySelectedSpoolViewModel } from "../lib/use_inventory_selected_spool_view_model";
import { useInventoryWeightAction } from "../lib/use_inventory_weight_action";
import { useInventoryStatusActions } from "../lib/use_inventory_status_actions";
import { useInventoryRemovalActions } from "../lib/use_inventory_removal_actions";
import { useInventorySpoolDetailActions } from "../lib/use_inventory_spool_detail_actions";
import { useInventorySpoolDetailUtilityActions } from "../lib/use_inventory_spool_detail_utility_actions";
import { useInventorySpoolQrArtifacts } from "../lib/use_inventory_spool_qr_artifacts";
import { useInventorySpoolSelection } from "../lib/use_inventory_spool_selection";
import { useInventoryWriteGuards } from "../lib/use_inventory_write_guards";
import { useDefaultPurchaseCurrency } from "../lib/use_default_purchase_currency";
import {
  useInventoryUnsavedChangesGuard,
  type InventoryNavigationGuard,
} from "../lib/use_inventory_unsaved_changes_guard";
import { isTauri } from "../lib/tauri_client";

const LoanOutModal = lazy(() => import("../components/loan_out_modal").then(module => ({ default: module.LoanOutModal })));

const LoansPage = lazy(() => import("./loans"));
type LocationPanelComponent = typeof import("../components/inventory_location_spools_panel").InventoryLocationSpoolsPanel;

// Keep the drilldown out of the Inventory bundle. A regular async import lets
// the first result paint as soon as it arrives, including on small libraries.
function LinkedLocationView(props: ComponentProps<LocationPanelComponent>) {
  const { t } = useI18n();
  const [Panel, setPanel] = useState<LocationPanelComponent | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void import("../components/inventory_location_spools_panel")
      .then(module => { if (current) setPanel(() => module.InventoryLocationSpoolsPanel); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, []);
  if (Panel) return <Panel {...props} />;
  return <div className="surface-card p-5">
    <p role="status">{failed ? t("inventory.error.loadInventory", "Failed to load inventory.") : t("inventory.loading", "Loading spools...")}</p>
    <button type="button" className="mt-2 underline" onClick={props.onBack}>{t("common.back", "Back")}</button>
  </div>;
}

type LinkedLocation = {
  location: InventoryLocationFilter;
  target: LocationSpoolTarget;
  authority: string;
};

const InventoryLoadSpoolModal = lazy(() =>
  import("../components/inventory_load_spool_modal").then(module => ({ default: module.InventoryLoadSpoolModal })),
);

const InventorySpoolDetailModal = lazy(() =>
  import("../components/inventory_spool_detail_modal").then((module) => ({
    default: module.InventorySpoolDetailModal,
  })),
);

type InventoryPageProps = {
  onOpenPrinters?: () => void;
  initialWorkspaceView?: InventoryWorkspaceView;
  navigationIntent?: InventoryNavigationIntent;
  onConsumeNavigationIntent?: () => void;
  onNavigationGuardChange?: (guard: InventoryNavigationGuard | null) => void;
};

function hasCount(source: ClientSnapshotSource): boolean {
  return source === "LIVE" || source === "CACHED";
}

export default function InventoryPage({
  onOpenPrinters,
  initialWorkspaceView = "STOCK",
  navigationIntent = null,
  onConsumeNavigationIntent,
  onNavigationGuardChange,
}: InventoryPageProps) {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const detailVisualFixture = useMemo(
    () => (isInventoryDetailVisualFixtureEnabled() ? buildInventoryDetailVisualFixture() : null),
    [],
  );
  const desktopVisualQaScenario = useMemo(() => resolveDesktopVisualQaScenario(), []);
  const [error, setError] = useState<string | null>(null);
  const [activeWorkspaceView, setActiveWorkspaceView] =
    useState<InventoryWorkspaceView>(initialWorkspaceView);
  const [reviewedPurchase, setReviewedPurchase] =
    useState<Extract<InventoryNavigationIntent, { kind: "PURCHASES" }> | null>(null);
  const pendingLoanNavigation = navigationIntent?.kind === "LOANS";
  const loansOnly = activeWorkspaceView === "LOANS";
  const [loanCounts, setLoanCounts] = useState<LoanWorkspaceCounts | null>(null);
  const locationsOnly = activeWorkspaceView === "LOCATIONS";
  const purchasesOnly = activeWorkspaceView === "PURCHASES";
  const purchaseQueue = useWishlistQueue(purchasesOnly);
  const [rfidCaptureFieldsBySlotId, setRfidCaptureFieldsBySlotId] = useState<
    Record<string, RfidCaptureField[]>
  >({});
  const {
    activeLoans,
    bambuLiveIntegrations,
    clientHostBaseUrl,
    clientHostDeviceName,
    clientHostWritePaired,
    clientInventoryPartial,
    clientInventorySource,
    clientInventoryUpdatedAt,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    domainSources,
    invalidateInventoryDataRequests,
    cardPage,
    completeDataLoad,
    detailUnavailable,
    historyLoading,
    historyRows,
    librarySyncReady,
    libraryStatus,
    infoMessage,
    setInfoMessage,
    librarySyncResolving,
    loadError,
    loading,
    locations,
    locationCounts,
    locationsUpdatedAt,
    locationsLoading,
    locationMutationsSupported,
    locationSource,
    printerOverview,
    refreshInventoryData,
    refreshing,
    reloadActiveLoans,
    reloadLocations,
    reloadPrinterOverview,
    retryLibrarySyncRole,
    reloadSpoolDetail,
    reloadSpools,
    reloadWishlist,
    setBambuLiveIntegrations,
    setHistoryLoading,
    setHistoryRows,
    setPrinterOverview,
    setSpools,
    setUsageLoading,
    setUsagePoints,
    spools,
    usageLoading,
    usagePoints,
    purchaseCount,
    queuePage,
    wishlistItems,
    wishlistLoading,
  } = useInventoryPageData({
    setPurchaseSearchText: purchaseQueue.setWishlistQueueQuery,
    queueQuery: purchasesOnly ? purchaseQueue.query : undefined,
    purchaseIntent: purchasesOnly ? reviewedPurchase : null,
    setRfidCaptureFieldsBySlotId,
    tauriAvailable: tauri,
    t,
  });
  useEffect(() => invalidateInventoryDataRequests, [activeWorkspaceView, invalidateInventoryDataRequests]);
  const compactCounts = loansOnly ? loanCounts : locationCounts;
  const compactBadges = loansOnly || locationsOnly;
  const defaultPurchaseCurrency = useDefaultPurchaseCurrency({
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    tauriAvailable: tauri && librarySyncReady && !loansOnly && !locationsOnly && !pendingLoanNavigation,
  });
  const {
    activeFilterCount,
    otherFilterCount,
    advancedFiltersOpen,
    clearLocationFilter,
    filteredSpools,
    groupedSpools,
    inventoryView,
    locationFilter,
    lowStockOnly,
    materialFilter,
    materialOptions,
    ownershipFilter,
    resetFilters,
    search,
    setAdvancedFiltersOpen,
    setInventoryView,
    setLowStockOnly,
    setMaterialFilter,
    setOwnershipFilter,
    setSearch,
    setStatusFilter,
    setVendorFilter,
    showLowStockList,
    showLocationSpools,
    statusFilter,
    vendorFilter,
    vendorOptions,
    visibleInventoryCount,
  } = useInventoryFilters(spools, {
    deterministicPagePreferences: Boolean(desktopVisualQaScenario || detailVisualFixture),
  });
  const {
    closeRfidCaptureModal,
    closeRollModal,
    openRfidCaptureModal,
    openRollModal,
    selectedSpoolId,
    setSelectedSpoolId,
    setShowRfidCaptureModal,
    setShowRollModal,
    showRfidCaptureModal,
    showRollModal,
  } = useInventorySpoolSelection();
  const [manageBusy, setManageBusy] = useState(false);
  const [recentlyAddedSpoolId, setRecentlyAddedSpoolId] = useState<string | null>(null);
  const [desktopVisualQaStage, setDesktopVisualQaStage] = useState<
    | "pending"
    | "add-esun-opened"
    | "detail-opened"
    | "danger-confirmation-requested"
    | "detail-section-opened"
    | "done"
  >(() => (desktopVisualQaScenario ? "pending" : "done"));

  const [selectedRfidCaptureSlotId, setSelectedRfidCaptureSlotId] = useState<string | null>(null);
  const [rfidCaptureError, setRfidCaptureError] = useState<string | null>(null);
  const [rfidCaptureLoading, setRfidCaptureLoading] = useState(false);

  const locationMutationContext = useMemo<InventoryLocationMutationContext>(() => ({
    clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly, clientTargetGeneration,
    mutationsSupported: locationMutationsSupported,
  }), [clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly,
    clientTargetGeneration, locationMutationsSupported]);
  const refreshLocations = useCallback((report?: InventoryReloadReporter) =>
    reloadLocations(undefined, report), [reloadLocations]);
  const { authorityKey: locationAuthorityKey, locationError, locationInfo,
    createLocation, renameLocation, archiveLocation, restoreLocation, deleteLocation, mergeLocations,
  } = useInventoryLocationActions({
    active: locationsOnly, ready: librarySyncReady,
    loading: locationsLoading, source: locationSource, context: locationMutationContext,
    tauri, manageBusy, setManageBusy, setError, setInfoMessage, refreshLocations, reloadSpools, t,
  });

  const [linkedLocation, setLinkedLocation] = useState<LinkedLocation | null>(null);
  const linkedOrigin = useRef<HTMLElement | null>(null);
  const pendingLocationStock = useRef<(LinkedLocation & { spoolId?: string }) | null>(null);
  const stockFilterAuthority = useRef<string | null>(null);
  const currentLinkedLocation = locationsOnly && linkedLocation?.authority === locationAuthorityKey ? linkedLocation : null;
  useEffect(() => {
    if (!locationsOnly || linkedLocation?.authority !== locationAuthorityKey) setLinkedLocation(null);
    if (stockFilterAuthority.current && stockFilterAuthority.current !== locationAuthorityKey) {
      stockFilterAuthority.current = null;
      clearLocationFilter();
      setSearch("");
    }
  }, [locationsOnly, linkedLocation, locationAuthorityKey, clearLocationFilter, setSearch]);
  const openLinkedLocationSpools = (location: InventoryLocationFilter) => {
    if (!librarySyncReady || !clientLibraryId || clientTargetGeneration == null || (clientReadOnly && !clientHostBaseUrl)) return;
    linkedOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLinkedLocation({ location, authority: locationAuthorityKey, target: {
      base_url: clientReadOnly ? clientHostBaseUrl : null, expected_library_id: clientLibraryId, target_generation: clientTargetGeneration,
    } });
  };

  const openPurchaseQueue = useCallback(() => {
    setActiveWorkspaceView("PURCHASES");
  }, []);

  const { canUseClientHostWrite, ensureLocalWriteAllowed } = useInventoryWriteGuards({
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    setError,
    setInfoMessage,
    t,
  });

  const {
    addModalActive,
    modalProps: addModalProps,
    openAddModal,
    purchaseQueueProps,
    reloadCatalog,
    resetPurchaseQueue,
    setMasters,
    switchToManageMode,
  } = useInventoryAddWorkflow({
    purchaseQueue,
    queuePage,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    defaultPurchaseCurrency,
    ensureLocalWriteAllowed,
    error,
    infoMessage,
    librarySyncReady,
    onOpenCreatedSpool: (spoolId) => {
      if (!spools.some((spool) => spool.id === spoolId)) {
        setError(t("inventory.error.loadInventory", "Failed to load inventory."));
        void reloadSpools();
        return false;
      }
      setActiveWorkspaceView("STOCK");
      openRollModal(spoolId);
      return true;
    },
    onOpenPurchaseQueue: openPurchaseQueue,
    purchaseActionsDisabled:
      !librarySyncReady || (clientReadOnly ? !clientHostWritePaired : false),
    reloadSpools,
    reloadWishlist,
    resolvedTheme,
    setError,
    setInfoMessage,
    setRecentlyAddedSpoolId,
    setSelectedSpoolId,
    tauriAvailable: tauri,
    t,
    wishlistItems,
    wishlistLoading: wishlistLoading || (tauri && purchasesOnly && domainSources.wishlist === "UNRESOLVED" && !loadError),
  });
  const { onBambuBatchInputChange, onCatalogQueryChange, onCreateModeChange } = addModalProps;
  const inventoryAddModalProps = {
    ...addModalProps,
    autoOpenBambuBatch: desktopVisualQaScenario === "bambu-batch-add",
  };

  const [requiresFullStock, setRequiresFullStock] = useState(false);
  const [pendingStockAction, setPendingStockAction] = useState<{authority: string; kind: "labels" | "bulk"} | null>(null);
  useEffect(() => {
    setRequiresFullStock(false);
    setPendingStockAction(null);
  }, [activeWorkspaceView, locationAuthorityKey]);
  const requestCards = !requiresFullStock && inventoryView === "CARDS" && !navigationIntent && !showRollModal &&
    !recentlyAddedSpoolId && !detailVisualFixture;
  useEffect(() => {
    if (cardPage && !requestCards && activeWorkspaceView === "STOCK" && librarySyncReady) {
      void refreshInventoryData();
    }
  }, [cardPage, requestCards, activeWorkspaceView, librarySyncReady, refreshInventoryData]);
  const cardFilters = useMemo(() => advancedFiltersOpen || otherFilterCount ? {
    status: statusFilter === "ALL" ? undefined : statusFilter,
    ownership: ownershipFilter === "ALL" ? undefined : ownershipFilter,
    material: materialFilter === "ALL" ? undefined : materialFilter,
    vendor: vendorFilter === "ALL" ? undefined : vendorFilter,
    location_id: locationFilter?.id, low_stock: lowStockOnly, include_options: advancedFiltersOpen,
  } : undefined, [advancedFiltersOpen, otherFilterCount, statusFilter, ownershipFilter, materialFilter,
    vendorFilter, locationFilter?.id, lowStockOnly]);
  const cardSearch = search.trim();
  const stockViewRef = useRef({ requestCards, search: cardSearch, filters: cardFilters });
  useEffect(() => {
    stockViewRef.current = { requestCards, search: cardSearch, filters: cardFilters };
  }, [requestCards, cardSearch, cardFilters]);
  const lastCardSearchAt = useRef(-Infinity);
  const pendingCardSearch = requestCards && cardPage != null && (cardPage.search !== cardSearch || cardPage.filters !== cardFilters);
  const loadingLocationStock = Boolean(locationFilter && (loading || refreshing));
  useEffect(() => {
    if (loadingLocationStock || !pendingCardSearch || activeWorkspaceView !== "STOCK" || !librarySyncReady) return;
    let current = true;
    const delay = cardSearch ? Math.max(0, 100 - (performance.now() - lastCardSearchAt.current)) : 0;
    const timer = window.setTimeout(() => {
      lastCardSearchAt.current = performance.now();
      void reloadSpools(undefined, undefined, true, undefined, undefined, {
        text: cardSearch, filters: cardFilters, current: () => current,
      });
    }, delay);
    return () => { current = false; window.clearTimeout(timer); };
  }, [activeWorkspaceView, cardFilters, cardSearch, librarySyncReady, locationAuthorityKey, pendingCardSearch, reloadSpools, loadingLocationStock]);
  const waitingForAllRows = Boolean(cardPage && (!requestCards || pendingCardSearch));
  const cardTotals = useMemo(() => new Map(cardPage?.cards.map(card =>
    [card.rows[0]?.id, {count: card.count, remaining: card.remaining}])), [cardPage]);
  const pendingPurchaseNavigation = navigationIntent?.kind === "PURCHASES" && !purchasesOnly;
  useEffect(() => {
    if (activeWorkspaceView !== "STOCK" || pendingLocationStock.current?.authority !== locationAuthorityKey) {
      pendingLocationStock.current = null;
    }
    if (!tauri || !librarySyncReady || pendingPurchaseNavigation || loansOnly || pendingLoanNavigation) return;
    let current = true;
    const handoff = pendingLocationStock.current;
    const { requestCards: useCards, search, filters } = stockViewRef.current;
    const cardPage = useCards && !handoff?.spoolId && (handoff ? { search, filters } : true);
    void refreshInventoryData({ purchasesOnly, locationsOnly, cardPage, onStockLoaded: handoff ? async rows => {
      if (!current || pendingLocationStock.current !== handoff) return;
      try {
        const sameTarget = await isLocationSpoolTargetCurrent(handoff.target);
        if (!current || pendingLocationStock.current !== handoff) return;
        pendingLocationStock.current = null;
        if (!sameTarget) { retryLibrarySyncRole(); return; }
        if (handoff.spoolId) {
          if (rows.some(row => row.id === handoff.spoolId &&
            (row.locationId === handoff.location.id || row.homeLocationId === handoff.location.id))) {
            openRollModal(handoff.spoolId);
          } else {
            setError(t("inventory.noMatch", "No spools match current filters."));
          }
        } else {
          window.requestAnimationFrame(() => document.getElementById("inventory-location-filter-chip")?.focus());
        }
      } catch {
        if (current && pendingLocationStock.current === handoff) {
          pendingLocationStock.current = null;
          setError(t("inventory.error.loadInventory", "Failed to load inventory."));
        }
      }
    } : undefined });
    return () => { current = false; };
  }, [activeWorkspaceView, librarySyncReady, locationAuthorityKey, pendingPurchaseNavigation, loansOnly,
    pendingLoanNavigation, purchasesOnly, locationsOnly, refreshInventoryData, tauri, openRollModal,
    retryLibrarySyncRole, t]);

  const refreshInventoryPage = useCallback(() => {
    if (loansOnly) return;
    void refreshInventoryData({
      // Explicit Client refresh also renews the complete offline inventory.
      purchasesOnly, locationsOnly, cardPage: requestCards && !clientReadOnly,
      selectedSpoolId: showRollModal ? selectedSpoolId : null,
    });
  }, [requestCards, clientReadOnly, loansOnly, purchasesOnly, locationsOnly, refreshInventoryData, selectedSpoolId, showRollModal]);

  const retryInventoryPageLoad = useCallback(() => {
    if (!librarySyncReady) {
      retryLibrarySyncRole();
      return;
    }
    refreshInventoryPage();
  }, [librarySyncReady, refreshInventoryPage, retryLibrarySyncRole]);

  useEffect(() => {
    if (!navigationIntent) {
      return;
    }
    if (navigationIntent.kind === "LOANS") {
      setActiveWorkspaceView("LOANS");
    } else if (navigationIntent.kind === "SPOOL_DETAIL") {
      if (!librarySyncReady || loading) {
        return;
      }
      const targetSpool = spools.find((spool) => spool.id === navigationIntent.spoolId);
      if (!targetSpool) {
        return;
      }
      resetFilters();
      setActiveWorkspaceView("STOCK");
      openRollModal(targetSpool.id);
    } else if (navigationIntent.kind === "LOW_STOCK") {
      setActiveWorkspaceView("STOCK");
      showLowStockList();
    } else if (navigationIntent.kind === "ADD_SPOOL") {
      setActiveWorkspaceView("STOCK");
      openAddModal();
    } else if (navigationIntent.kind === "PURCHASES") {
      if (navigationIntent.notice) {
        if (!librarySyncReady) return;
        const target = navigationIntent.purchaseTarget;
        if (!target || !matchesWishlistPurchaseTarget(libraryStatus, target) ||
            (clientReadOnly && !clientHostWritePaired)) {
          onConsumeNavigationIntent?.();
          return;
        }
      }
      setReviewedPurchase(navigationIntent);
      resetPurchaseQueue(navigationIntent.status);
      openPurchaseQueue();
      if (navigationIntent.notice) setInfoMessage(dashboardPurchaseNotice(navigationIntent.notice, t));
    }
    onConsumeNavigationIntent?.();
  }, [
    navigationIntent,
    libraryStatus,
    clientHostWritePaired,
    clientReadOnly,
    librarySyncReady,
    loading,
    onConsumeNavigationIntent,
    openAddModal,
    openPurchaseQueue,
    openRollModal,
    resetFilters,
    resetPurchaseQueue,
    setInfoMessage,
    showLowStockList,
    spools,
    t,
  ]);

  useInventoryDetailVisualFixture({
    completeDataLoad,
    detailVisualFixture,
    resetFilters,
    setBambuLiveIntegrations,
    setError,
    setHistoryLoading,
    setHistoryRows,
    setInfoMessage,
    setMasters,
    setPrinterOverview,
    setRfidCaptureFieldsBySlotId,
    setSelectedRfidCaptureSlotId,
    setSelectedSpoolId,
    setShowRollModal,
    setSpools,
    setUsageLoading,
    setUsagePoints,
    switchToManageMode,
    t,
  });

  useInventoryFeedbackTimeout({
    infoMessage,
    setInfoMessage,
    setRecentlyAddedSpoolId,
  });

  const activeLoanSpoolIds = useMemo(
    () => new Set(activeLoans.map((loan) => loan.loan.spool_id)),
    [activeLoans],
  );
  const selectedSpool = useInventorySelectedSpool(spools, selectedSpoolId);

  const {
    commonDetailsDirty,
    editMasterColorName,
    editMasterFilamentName,
    editMasterHexColor,
    editMasterMaterial,
    editMasterVendor,
    markCommonDetailsSaved,
    markMasterMetadataSaved,
    masterEditUnlocked,
    masterMetadataDirty,
    resetDetailDrafts,
    selectedSpoolLocationDraft,
    selectedSpoolOwnerContactDraft,
    selectedSpoolOwnerNameDraft,
    selectedSpoolOwnershipDraft,
    selectedSpoolOwnershipNoteDraft,
    selectedSpoolPurchasePriceBatchLockedDraft,
    selectedSpoolPurchaseMetadataDraft,
    selectedSpoolPurchaseMetadataErrors,
    selectedSpoolTareDraft,
    setEditMasterColorName,
    setEditMasterFilamentName,
    setEditMasterHexColor,
    setEditMasterMaterial,
    setEditMasterVendor,
    setMasterEditUnlocked,
    setSelectedSpoolLocationDraft,
    setSelectedSpoolOwnerContactDraft,
    setSelectedSpoolOwnerNameDraft,
    setSelectedSpoolOwnershipDraft,
    setSelectedSpoolOwnershipNoteDraft,
    setSelectedSpoolPurchasePriceBatchLockedDraft,
    setSelectedSpoolPurchaseMetadataDraft,
    setSelectedSpoolPurchaseMetadataErrors,
    setSelectedSpoolTareDraft,
    setShowRfidCapturedFields,
    setShowRollHistory,
    showRfidCapturedFields,
    showRollHistory,
  } = useInventorySelectedSpoolDetailState({
    closeRfidCaptureModal,
    closeRollModal,
    detailVisualFixture,
    reloadSpoolDetail,
    selectedSpool,
    setHistoryRows,
    setRfidCaptureFieldsBySlotId,
    setRfidCaptureError,
    setRfidCaptureLoading,
    setSelectedRfidCaptureSlotId,
    setShowRfidCaptureModal,
    setShowRollModal,
    setUsagePoints,
  });

  const clearSelectedSpoolDetail = useCallback(() => {
    setSelectedSpoolId(null);
    setHistoryRows([]);
    setUsagePoints([]);
  }, [setHistoryRows, setSelectedSpoolId, setUsagePoints]);

  const {
    confirmDelete, confirmPurge, handleDeleteSelected, handlePurgeSelected, removalError,
    cancelConfirmation: cancelDangerZoneConfirmation,
  } = useInventoryRemovalActions({
    selectedSpool: showRollModal ? selectedSpool : null,
    activeLoan: hasInventorySpoolLoan(selectedSpool, activeLoanSpoolIds),
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration,
    tauriAvailable: tauri, manageBusy, canUseClientHostWrite, ensureLocalWriteAllowed,
    setManageBusy, setError, setInfoMessage, onRemoved: clearSelectedSpoolDetail,
    reloadSpools, reloadPrinterOverview, reloadActiveLoans, t,
  });

  const discardSelectedSpoolDetail = useCallback(() => {
    resetDetailDrafts();
    cancelDangerZoneConfirmation();
    closeRollModal();
  }, [cancelDangerZoneConfirmation, closeRollModal, resetDetailDrafts]);

  const hasUnsavedDetailChanges = commonDetailsDirty || masterMetadataDirty;
  const {
    cancelDiscardConfirmation: cancelSelectedSpoolDiscardConfirmation,
    confirmDiscard: confirmSelectedSpoolDiscard,
    discardConfirmationOpen: selectedSpoolDiscardConfirmationOpen,
    requestDiscard: closeSelectedSpoolDetailModal,
    requestDiscardThen: closeSelectedSpoolDetailModalThen,
  } = useInventoryUnsavedChangesGuard({
    active: showRollModal,
    hasUnsavedChanges: hasUnsavedDetailChanges,
    onDiscard: discardSelectedSpoolDetail,
    onNavigationGuardChange,
  });

  const {
    authorityKey: selectedSpoolQrAuthorityKey,
    companionShellUrl: selectedSpoolQrCompanionShellUrl,
    dataUrl: selectedSpoolQrDataUrl,
    loading: selectedSpoolQrLoading,
    target: selectedSpoolQrTarget,
    retry: retrySelectedSpoolQr,
  } = useInventorySpoolQrArtifacts({
    clientHostBaseUrl,
    clientLibraryId,
    clientTargetGeneration,
    clientReadOnly,
    selectedSpool,
    showRollModal,
  });

  const activeOutboundLoanSpoolIds = useMemo(
    () =>
      new Set(
        activeLoans
          .filter((loan) => isOutboundLoanDirection(loan.loan.loan_direction))
          .map((loan) => loan.loan.spool_id),
      ),
    [activeLoans],
  );
  const selectedSpoolLoanedOut = isInventorySpoolLoanedOut(
    selectedSpool,
    activeOutboundLoanSpoolIds,
  );

  const { printerNameById, printerSlotBySpoolId, printerSlotOptions, slotLabelById } =
    useInventoryPrinterSlots(printerOverview, t);
  const assignedDesktopVisualQaSpoolIds = useMemo(
    () => new Set(printerSlotBySpoolId.keys()),
    [printerSlotBySpoolId],
  );

  const selectedSpoolAssignedSlot = useMemo(
    () => (selectedSpool ? printerSlotBySpoolId.get(selectedSpool.id) ?? null : null),
    [printerSlotBySpoolId, selectedSpool],
  );

  const {
    effectiveRfidCaptureFields,
    observedTrayCaptureSnapshot,
    rfidCaptureFields,
    rfidCaptureLastSeenAt,
    rfidCaptureMatchMetaForSelected,
    rfidCaptureSlotSummaries,
    rfidCaptureSummary,
    selectedRfidCaptureLiveIntegration,
    selectedRfidCaptureSlot,
    selectedSpoolRfidBindingMeta,
    selectedSpoolRfidCaptureSlots,
    selectedSpoolRfidSlotLabel,
    selectedSpoolSupportsRfidCapture,
  } = useInventoryRfidCaptureViewModel({
    bambuLiveIntegrations,
    clientReadOnly,
    printerSlotOptions,
    rfidCaptureFieldsBySlotId,
    selectedRfidCaptureSlotId,
    selectedSpool,
    selectedSpoolAssignedSlot,
    tauriAvailable: tauri,
    t,
    useObservedSlotFixture: desktopVisualQaScenario === "rfid-capture",
  });

  const loanTrackingCandidates = useMemo(
    () =>
      spools.filter((spool) =>
        isInventorySpoolLoanTrackingCandidate(spool, activeLoanSpoolIds),
      ),
    [activeLoanSpoolIds, spools],
  );

  const {
    formatHistoryEventDetails,
    formatHistoryEventType,
    hasHiddenHistoryRows,
    visibleHistoryRows,
  } = useInventoryHistoryFormatters({
    historyRows,
    locale,
    printerNameById,
    slotLabelById,
    t,
  });

  const {
    selectedSpoolDisplayTitle,
    selectedSpoolLocationValue,
    selectedSpoolMeasuredTotal,
    selectedSpoolOwnershipLabel,
    selectedSpoolOwnershipTone,
    selectedSpoolQrCompanionAvailable,
    selectedSpoolResolvedTare,
    selectedSpoolStatusLabel,
    selectedSpoolStatusTone,
  } = useInventorySelectedSpoolViewModel({
    assignedSlot: selectedSpoolAssignedSlot,
    qrCompanionShellUrl: selectedSpoolQrCompanionShellUrl,
    selectedSpool,
    slotLabelById,
    t,
  });

  const selectRollForManage = useCallback((spoolId: string) => {
    // An explicit selection supersedes any pending drilldown into Stock.
    pendingLocationStock.current = null;
    const openSelectedRoll = () => {
      setActiveWorkspaceView("STOCK");
      if (clientReadOnly && !clientHostWritePaired) {
        setInfoMessage(
          t(
            "inventory.clientReadOnlyManage",
            "This device is connected as a client. You can review the roll here, and paired host actions will stay limited and explicit.",
          ),
        );
      } else {
        setInfoMessage(null);
      }
      switchToManageMode();
      setShowRollHistory(false);
      openRollModal(spoolId);
    };
    if (
      showRollModal &&
      selectedSpoolId !== spoolId &&
      !closeSelectedSpoolDetailModalThen(openSelectedRoll)
    ) {
      return;
    }
    openSelectedRoll();
  }, [
    clientHostWritePaired,
    clientReadOnly,
    closeSelectedSpoolDetailModalThen,
    openRollModal,
    selectedSpoolId,
    setInfoMessage,
    setShowRollHistory,
    showRollModal,
    switchToManageMode,
    t,
  ]);

  const {
    closeLoanTrackingModal,
    handleLoanCreated,
    loanTrackingSpoolId,
    openLoanTrackingModal,
    showLoanTrackingModal,
  } = useInventoryLoanTrackingModal({
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    loanTrackingCandidates,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    selectedSpool,
    setInfoMessage,
    t,
  });

  const canLoanSelectedSpool = Boolean(
    selectedSpool && loanTrackingCandidates.some((candidate) => candidate.id === selectedSpool.id),
  );
  const {
    availableSlots: availableLoadSlots,
    canLoadSelectedSpool,
    closeLoadSpoolModal,
    confirmLoadSpool,
    openLoadSpoolModal,
    loadSpoolError,
    showLoadSpoolModal,
  } = useInventoryLoadSpoolAction({
    assignedSlot: selectedSpoolAssignedSlot,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    ensureLocalWriteAllowed,
    loanedOut: selectedSpoolLoanedOut,
    manageBusy,
    printerSlots: printerSlotOptions,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    selectedSpool,
    setError,
    setInfoMessage,
    setManageBusy,
    tauriAvailable: tauri,
    t,
  });
  const {
    modalProps: inventoryLabelSheetModalProps,
    openLabelSheet: openInventoryLabelSheet,
  } = useInventoryLabelSheetAction({
    workspaceView: activeWorkspaceView, ready: librarySyncReady,
    loadingInventory: loading, clientLibraryId, clientTargetGeneration,
    busy: manageBusy,
    clientHostBaseUrl,
    clientReadOnly,
    locale,
    setError,
    setInfoMessage,
    spools,
    tauriAvailable: tauri,
    t,
  });
  const inventoryLabelSheetVisualQaOpenedRef = useRef(false);

  const {
    bulkError, bulkInfo,
    collectionProps: inventoryBulkCollectionProps,
    panelProps: inventoryBulkActionsProps,
    selectionModeTriggerProps: inventoryBulkSelectionTriggerProps,
  } = useInventoryBulkActions({
    active: activeWorkspaceView === "STOCK", ready: librarySyncReady, clientTargetGeneration,
    clientDataLive: !clientReadOnly || (clientInventorySource === "LIVE" && !clientInventoryPartial),
    activeLoanSpoolIds,
    busy: manageBusy,
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    filteredSpools,
    loading: loading || !librarySyncReady,
    locations,
    openLabelSheet: openInventoryLabelSheet,
    printerSlotBySpoolId,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpools,
    setBusy: setManageBusy,
    setError,
    setInfoMessage,
    spools,
    tauriAvailable: tauri,
    t,
  });

  useEffect(() => {
    if (!pendingStockAction || pendingStockAction.authority !== locationAuthorityKey ||
        activeWorkspaceView !== "STOCK" || cardPage || loading || refreshing || !librarySyncReady) return;
    setPendingStockAction(null);
    if (loadError) return;
    if (pendingStockAction.kind === "labels") void openInventoryLabelSheet();
    else inventoryBulkSelectionTriggerProps.onActiveChange(true);
  }, [activeWorkspaceView, cardPage, inventoryBulkSelectionTriggerProps, librarySyncReady, loadError, loading,
    locationAuthorityKey, openInventoryLabelSheet, pendingStockAction, refreshing]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "settings-inventory-label-sheet" ||
      inventoryLabelSheetVisualQaOpenedRef.current ||
      !tauri ||
      loading
    ) {
      return;
    }
    inventoryLabelSheetVisualQaOpenedRef.current = true;
    void openInventoryLabelSheet();
  }, [desktopVisualQaScenario, loading, openInventoryLabelSheet, tauri]);

  useInventoryRollModalEscape({
    closeRollModal: closeSelectedSpoolDetailModal,
    showRollModal,
  });

  useInventoryRfidCaptureRefresh({
    clientReadOnly,
    observedTrayCaptureSnapshot,
    rfidCaptureFieldsLength: rfidCaptureFields.length,
    reloadPrinterOverview,
    selectedRfidCaptureSlot,
    selectedSpoolRfidCaptureSlots,
    setBambuLiveIntegrations,
    setRfidCaptureError,
    setRfidCaptureFieldsBySlotId,
    setRfidCaptureLoading,
    showRfidCaptureModal,
    tauriAvailable: tauri,
    t,
  });

  const { handleRefillSpool, handleToggleLostStatus, statusError, clearStatusError } = useInventoryStatusActions({
    selectedSpool: showRollModal ? selectedSpool : null,
    assignedSlot: selectedSpoolAssignedSlot,
    activeLoan: hasInventorySpoolLoan(selectedSpool, activeLoanSpoolIds),
    loanedOut: selectedSpoolLoanedOut,
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration,
    tauriAvailable: tauri, manageBusy, canUseClientHostWrite, ensureLocalWriteAllowed,
    cancelDangerZoneConfirmation, setManageBusy, setError, setInfoMessage,
    reloadSpools, reloadPrinterOverview, reloadSpoolDetail, t,
  });

  const { handleWeightSubmit, weightError, clearWeightError } = useInventoryWeightAction({
    selectedSpool: showRollModal ? selectedSpool : null,
    assignedSlot: selectedSpoolAssignedSlot, resolvedTare: selectedSpoolResolvedTare,
    activeLoan: hasInventorySpoolLoan(selectedSpool, activeLoanSpoolIds), loanedOut: selectedSpoolLoanedOut,
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration,
    tauriAvailable: tauri, manageBusy, canUseClientHostWrite, ensureLocalWriteAllowed,
    cancelDangerZoneConfirmation, setManageBusy, setError, setInfoMessage,
    reloadSpools, reloadPrinterOverview, reloadSpoolDetail, t,
  });

  const handleMarkEmpty = useInventoryMarkEmptyAction({
    selectedSpool: showRollModal ? selectedSpool : null,
    assignedSlot: selectedSpoolAssignedSlot,
    activeLoan: hasInventorySpoolLoan(selectedSpool, activeLoanSpoolIds),
    loanedOut: selectedSpoolLoanedOut,
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration,
    tauriAvailable: tauri, manageBusy, canUseClientHostWrite, ensureLocalWriteAllowed,
    setManageBusy, setError, setInfoMessage, reloadSpools, reloadPrinterOverview,
    reloadSpoolDetail, t,
  });

  const {
    handleSaveMasterMetadata,
    handleSaveSpoolCommonDetails,
    detailSaveError,
  } = useInventorySpoolDetailActions({
    canUseClientHostWrite,
    cancelDangerZoneConfirmation,
    clientHostBaseUrl,
    clientLibraryId,
    clientTargetGeneration,
    clientReadOnly,
    editMasterColorName,
    editMasterFilamentName,
    editMasterHexColor,
    editMasterMaterial,
    editMasterVendor,
    ensureLocalWriteAllowed,
    manageBusy,
    locations,
    markCommonDetailsSaved,
    markMasterMetadataSaved,
    masterEditUnlocked,
    reloadActiveLoans,
    reloadCatalog,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    selectedSpool: showRollModal ? selectedSpool : null,
    selectedSpoolLocationDraft,
    selectedSpoolLoanedOut,
    selectedSpoolOwnerContactDraft,
    selectedSpoolOwnerNameDraft,
    selectedSpoolOwnershipDraft,
    selectedSpoolOwnershipNoteDraft,
    selectedSpoolPurchasePriceBatchLockedDraft,
    selectedSpoolPurchaseMetadataDraft,
    selectedSpoolResolvedTare,
    selectedSpoolTareDraft,
    setError,
    setInfoMessage,
    setManageBusy,
    setMasterEditUnlocked,
    setSelectedSpoolOwnerContactDraft,
    setSelectedSpoolOwnerNameDraft,
    setSelectedSpoolOwnershipNoteDraft,
    setSelectedSpoolPurchaseMetadataErrors,
    setSelectedSpoolTareDraft,
    tauriAvailable: tauri,
    t,
  });

  const {
    handlePrintLabel,
    handleSaveCapturedRfid,
    handleRemoveRfid,
    handleStartRfidCapture,
  } = useInventorySpoolDetailUtilityActions({
    active: showRollModal, ready: librarySyncReady, captureOpen: showRfidCaptureModal,
    selectedRfidCaptureSlotId, clientTargetGeneration,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    closeRfidCaptureModal,
    ensureLocalWriteAllowed,
    manageBusy,
    openRfidCaptureModal,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    rfidCaptureLastSeenAt,
    rfidCaptureSummary,
    selectedRfidCaptureLiveIntegration,
    selectedSpool,
    selectedSpoolAssignedSlot,
    selectedSpoolRfidCaptureSlots,
    setError,
    setInfoMessage,
    setManageBusy,
    setRfidCaptureError,
    setSelectedRfidCaptureSlotId,
    setShowRfidCapturedFields,
    tauriAvailable: tauri,
    t,
  });

  const toggleMasterEditUnlocked = useCallback(() => {
    setMasterEditUnlocked((value) => !value);
  }, [setMasterEditUnlocked]);

  const toggleRollHistory = useCallback(() => {
    setShowRollHistory((current) => !current);
  }, [setShowRollHistory]);

  const saveCapturedRfid = useCallback(() => {
    void handleSaveCapturedRfid();
  }, [handleSaveCapturedRfid]);

  const selectRfidCaptureSlot = useCallback(
    (slotId: string) => {
      setSelectedRfidCaptureSlotId(slotId);
      setRfidCaptureError(null);
    },
    [setSelectedRfidCaptureSlotId],
  );

  const toggleRfidCapturedFields = useCallback(() => {
    setShowRfidCapturedFields((current) => !current);
  }, [setShowRfidCapturedFields]);

  useEffect(() => {
    if (!desktopVisualQaScenario || desktopVisualQaStage !== "pending" || loading) {
      return;
    }

    if (desktopVisualQaScenario === "inventory-overview" || desktopVisualQaScenario === "loans-overview" ||
        desktopVisualQaScenario === "return-loan" || desktopVisualQaScenario === "return-inbound-loan") {
      setDesktopVisualQaStage("done");
      return;
    }

    if (desktopVisualQaScenario === "inventory-locations") {
      setActiveWorkspaceView("LOCATIONS");
      setDesktopVisualQaStage("done");
      return;
    }

    if (desktopVisualQaScenario === "wishlist-queue") {
      resetPurchaseQueue("ON_ORDER");
      openPurchaseQueue();
      setDesktopVisualQaStage("done");
      return;
    }

    if (
      desktopVisualQaScenario === "add-filament" ||
      desktopVisualQaScenario === "bambu-batch-add"
    ) {
      if (desktopVisualQaScenario === "bambu-batch-add") {
        onBambuBatchInputChange("40500\n40200\n65103");
      } else if (desktopVisualQaScenario === "add-filament") {
        onCreateModeChange("esun");
      }
      openAddModal();
      setDesktopVisualQaStage(
        desktopVisualQaScenario === "add-filament" ? "add-esun-opened" : "done",
      );
      return;
    }

    if (desktopVisualQaScenario === "loan-out") {
      if (loanTrackingCandidates.length === 0) {
        return;
      }
      openLoanTrackingModal(chooseDesktopVisualQaLoanSpool(loanTrackingCandidates));
      setDesktopVisualQaStage("done");
      return;
    }

    const spoolId = chooseDesktopVisualQaSpoolId(
      spools,
      assignedDesktopVisualQaSpoolIds,
      desktopVisualQaScenario,
    );
    if (!spoolId) {
      return;
    }

    selectRollForManage(spoolId);
    setDesktopVisualQaStage(
      desktopVisualQaScenario === "rfid-capture" ||
        desktopVisualQaScenario === "selected-roll-label" ||
        desktopVisualQaScenario === "selected-roll-history" ||
        desktopVisualQaScenario === "selected-roll-danger-zone"
        ? "detail-opened"
        : "done",
    );
  }, [
    assignedDesktopVisualQaSpoolIds,
    desktopVisualQaScenario,
    desktopVisualQaStage,
    loading,
    loanTrackingCandidates,
    onBambuBatchInputChange,
    onCreateModeChange,
    openAddModal,
    openPurchaseQueue,
    openLoanTrackingModal,
    resetPurchaseQueue,
    selectRollForManage,
    spools,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "add-filament" ||
      desktopVisualQaStage !== "add-esun-opened" ||
      !addModalActive
    ) {
      return;
    }
    onCatalogQueryChange("Dark Blue");
    setDesktopVisualQaStage("done");
  }, [
    addModalActive,
    desktopVisualQaScenario,
    desktopVisualQaStage,
    onCatalogQueryChange,
  ]);

  useEffect(() => {
    if (desktopVisualQaScenario !== "rfid-capture" || desktopVisualQaStage !== "detail-opened") {
      return;
    }
    if (!showRollModal || !selectedSpool) {
      return;
    }
    if (!selectedSpoolSupportsRfidCapture || selectedSpoolRfidCaptureSlots.length === 0) {
      return;
    }
    handleStartRfidCapture();
    setDesktopVisualQaStage("done");
  }, [
    desktopVisualQaScenario,
    desktopVisualQaStage,
    handleStartRfidCapture,
    selectedSpool,
    selectedSpoolRfidCaptureSlots.length,
    selectedSpoolSupportsRfidCapture,
    showRollModal,
  ]);

  useEffect(() => {
    if (desktopVisualQaStage !== "detail-opened" || !showRollModal || !selectedSpool) {
      return;
    }

    if (desktopVisualQaScenario === "selected-roll-label") {
      const target = document.querySelector<HTMLElement>("#inventory-label-builder");
      const preview = target?.querySelector("img");
      if (!target || !preview || selectedSpoolQrLoading) {
        return;
      }
      const timer = window.setTimeout(() => {
        const scrollContainer = target.closest<HTMLElement>("[data-inventory-detail-scroll]");
        if (scrollContainer) {
          const targetOffset =
            scrollContainer.scrollTop +
            target.getBoundingClientRect().top -
            scrollContainer.getBoundingClientRect().top;
          scrollContainer.scrollTop = Math.max(0, targetOffset - 20);
        } else {
          target.scrollIntoView({ behavior: "auto", block: "center" });
        }
        setDesktopVisualQaStage("done");
      }, 250);
      return () => window.clearTimeout(timer);
    }

    if (desktopVisualQaScenario === "selected-roll-history") {
      const toggle = document.querySelector<HTMLButtonElement>("#inventory-roll-history-toggle");
      if (!toggle) {
        return;
      }
      if (toggle.getAttribute("aria-expanded") !== "true") {
        toggle.click();
      }
      setDesktopVisualQaStage("detail-section-opened");
      return;
    }

    if (desktopVisualQaScenario === "selected-roll-danger-zone") {
      const panel = document.querySelector<HTMLElement>("#inventory-danger-zone-panel");
      if (!panel) {
        return;
      }
      if (panel instanceof HTMLDetailsElement) {
        panel.open = true;
      }
      const frame = window.requestAnimationFrame(() => {
        const markEmptyRequest = document.querySelector<HTMLButtonElement>(
          "#inventory-mark-empty-request",
        );
        if (!markEmptyRequest) {
          return;
        }
        markEmptyRequest.click();
        setDesktopVisualQaStage("danger-confirmation-requested");
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [
    desktopVisualQaScenario,
    desktopVisualQaStage,
    selectedSpool,
    selectedSpoolQrLoading,
    showRollModal,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "selected-roll-danger-zone" ||
      desktopVisualQaStage !== "danger-confirmation-requested"
    ) {
      return;
    }
    if (!document.querySelector("#inventory-mark-empty-confirmation")) {
      return;
    }
    setDesktopVisualQaStage("detail-section-opened");
  }, [desktopVisualQaScenario, desktopVisualQaStage]);

  useEffect(() => {
    if (
      desktopVisualQaStage !== "detail-section-opened" &&
      desktopVisualQaStage !== "done"
    ) {
      return;
    }
    if (
      desktopVisualQaScenario === "selected-roll-history" &&
      (historyLoading ||
        usageLoading ||
        selectedSpoolQrLoading ||
        !showRollHistory ||
        visibleHistoryRows.length === 0)
    ) {
      return;
    }

    const targetSelector =
      desktopVisualQaScenario === "selected-roll-history"
        ? "#inventory-roll-history-panel"
        : desktopVisualQaScenario === "selected-roll-danger-zone"
          ? "#inventory-danger-zone-panel"
          : null;
    if (!targetSelector) {
      return;
    }
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) {
      return;
    }

    const scrollContainer = target.closest<HTMLElement>("[data-inventory-detail-scroll]");
    const scrollToTarget = () => {
      if (scrollContainer) {
        const targetOffset =
          scrollContainer.scrollTop +
          target.getBoundingClientRect().top -
          scrollContainer.getBoundingClientRect().top;
        scrollContainer.scrollTop = Math.max(0, targetOffset - 16);
      } else {
        target.scrollIntoView({ behavior: "auto", block: "start" });
      }
    };
    let scheduledFrameId: number | null = null;
    const scheduleScrollToTarget = () => {
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = null;
        scrollToTarget();
      });
    };

    scrollToTarget();
    window.addEventListener("resize", scheduleScrollToTarget);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleScrollToTarget);
    if (scrollContainer) {
      resizeObserver?.observe(scrollContainer);
    }
    resizeObserver?.observe(target);

    const timerIds =
      desktopVisualQaStage === "detail-section-opened"
        ? [150, 450, 900].map((delay) =>
            window.setTimeout(() => {
              scrollToTarget();
              if (delay === 900) {
                setDesktopVisualQaStage("done");
              }
            }, delay),
          )
        : [];
    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener("resize", scheduleScrollToTarget);
      resizeObserver?.disconnect();
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
    };
  }, [
    desktopVisualQaScenario,
    desktopVisualQaStage,
    historyLoading,
    selectedSpoolQrLoading,
    showRollHistory,
    usageLoading,
    visibleHistoryRows.length,
  ]);

  return (
    <div className="page-shell inventory-balanced-page">
      {showLoanTrackingModal ? <Suspense fallback={null}><LoanOutModal
        open={showLoanTrackingModal}
        onClose={closeLoanTrackingModal}
        onRetryLibrarySyncRole={retryLibrarySyncRole}
        preferredSpoolId={loanTrackingSpoolId}
        clientReadOnly={clientReadOnly}
        clientHostWritePaired={clientHostWritePaired}
        clientHostBaseUrl={clientHostBaseUrl}
        clientLibraryId={clientLibraryId}
        clientTargetGeneration={clientTargetGeneration}
        onLoanCreated={handleLoanCreated}
      /></Suspense> : null}

      {showLoadSpoolModal ? <Suspense fallback={null}>
      <InventoryLoadSpoolModal
        busy={manageBusy}
        error={loadSpoolError}
        onClose={closeLoadSpoolModal}
        onConfirm={(slotId) => void confirmLoadSpool(slotId)}
        open={showLoadSpoolModal}
        slotLabelById={slotLabelById}
        slots={availableLoadSlots}
        spool={selectedSpool}
      />
      </Suspense> : null}

      <InventoryLabelSheetModal {...inventoryLabelSheetModalProps} />

      <InventoryLocationDatalist rows={locations} />

      {showRollModal ? (
        <Suspense fallback={null}>
          <InventorySpoolDetailModal
            clientDataWarning={clientReadOnly && !clientHostWritePaired
              ? `${t("inventory.clientWriteRequiresPairing", "Pair this desktop client with the host before running protected sync actions.")} ${clientPairingActionHint(t)}`
              : clientReadOnly && (clientInventorySource === "CACHED" || clientInventorySource === "OFFLINE")
                ? t("errors.hostUnavailable", "Host is unavailable. Changes cannot be saved until it reconnects. Check the host and network, then refresh.")
                : null}
            detailUnavailable={detailUnavailable}
            onRefreshData={() => void refreshInventoryData({ selectedSpoolId: selectedSpool?.id })}
            refreshingData={refreshing}
            assignedSlot={selectedSpoolAssignedSlot}
            canLoadInPrinter={canLoadSelectedSpool}
            canLoanOut={canLoanSelectedSpool}
            colorName={editMasterColorName}
            confirmDelete={confirmDelete}
            confirmPurge={confirmPurge}
            deterministicLabelPreferences={desktopVisualQaScenario === "selected-roll-label"}
            displayTitle={selectedSpoolDisplayTitle}
            defaultPurchaseCurrency={defaultPurchaseCurrency}
            discardConfirmationOpen={selectedSpoolDiscardConfirmationOpen}
            error={detailSaveError ?? weightError ?? statusError ?? removalError ?? error}
            filamentName={editMasterFilamentName}
            formatHistoryEventDetails={formatHistoryEventDetails}
            formatHistoryEventType={formatHistoryEventType}
            hasCommonChanges={commonDetailsDirty}
            hasHiddenHistoryRows={hasHiddenHistoryRows}
            hasUnsavedChanges={hasUnsavedDetailChanges}
            hexColor={editMasterHexColor}
            historyLoading={historyLoading}
            initialLabelPanelOpen={desktopVisualQaScenario === "selected-roll-label"}
            infoMessage={infoMessage}
            homeLocationLocked={selectedSpoolLoanedOut}
            locationDraft={selectedSpoolLocationDraft}
            locationValue={selectedSpoolLocationValue}
            manageBusy={manageBusy}
            masterEditUnlocked={masterEditUnlocked}
            material={editMasterMaterial}
            measuredTotal={selectedSpoolMeasuredTotal}
            onChangeColorName={setEditMasterColorName}
            onChangeFilamentName={setEditMasterFilamentName}
            onChangeHexColor={setEditMasterHexColor}
            onChangeLocation={setSelectedSpoolLocationDraft}
            onChangeMaterial={setEditMasterMaterial}
            onChangeOwnerContact={setSelectedSpoolOwnerContactDraft}
            onChangeOwnerName={setSelectedSpoolOwnerNameDraft}
            onChangeOwnershipNote={setSelectedSpoolOwnershipNoteDraft}
            onChangeOwnershipType={setSelectedSpoolOwnershipDraft}
            onChangePurchasePriceBatchLocked={
              setSelectedSpoolPurchasePriceBatchLockedDraft
            }
            onChangePurchaseMetadata={setSelectedSpoolPurchaseMetadataDraft}
            onChangeTare={setSelectedSpoolTareDraft}
            onChangeVendor={setEditMasterVendor}
            onCancelDangerZoneConfirmation={cancelDangerZoneConfirmation}
            onCancelDiscardConfirmation={cancelSelectedSpoolDiscardConfirmation}
            onClose={closeSelectedSpoolDetailModal}
            onConfirmDiscard={confirmSelectedSpoolDiscard}
            onDelete={() => { clearWeightError(); clearStatusError(); void handleDeleteSelected(); }}
            onOpenPrinters={onOpenPrinters}
            onLoadInPrinter={openLoadSpoolModal}
            onLoanOut={() => openLoanTrackingModal(selectedSpool)}
            onMarkEmpty={() => { clearWeightError(); void handleMarkEmpty(); }}
            onRetryQr={retrySelectedSpoolQr}
            onPrintLabel={handlePrintLabel}
            onPurge={() => { clearWeightError(); clearStatusError(); void handlePurgeSelected(); }}
            onRefill={() => { clearWeightError(); void handleRefillSpool(); }}
            onSaveCommonDetails={handleSaveSpoolCommonDetails}
            onSaveMasterMetadata={handleSaveMasterMetadata}
            onRemoveRfid={() => void handleRemoveRfid()}
            onStartRfidCapture={handleStartRfidCapture}
            onSubmitWeight={handleWeightSubmit}
            onToggleEditUnlocked={toggleMasterEditUnlocked}
            onToggleLostStatus={() => { clearWeightError(); void handleToggleLostStatus(); }}
            onToggleRollHistory={toggleRollHistory}
            open={showRollModal}
            ownershipLabel={selectedSpoolOwnershipLabel}
            ownershipTone={selectedSpoolOwnershipTone}
            ownershipTypeDraft={selectedSpoolOwnershipDraft}
            ownerContactDraft={selectedSpoolOwnerContactDraft}
            ownerNameDraft={selectedSpoolOwnerNameDraft}
            ownershipNoteDraft={selectedSpoolOwnershipNoteDraft}
            purchasePriceBatchLockedDraft={selectedSpoolPurchasePriceBatchLockedDraft}
            purchaseMetadataDraft={selectedSpoolPurchaseMetadataDraft}
            purchaseMetadataErrors={selectedSpoolPurchaseMetadataErrors}
            qrCompanionAvailable={selectedSpoolQrCompanionAvailable}
            qrAuthorityKey={selectedSpoolQrAuthorityKey}
            qrDataUrl={selectedSpoolQrDataUrl}
            qrLoading={selectedSpoolQrLoading}
            qrTarget={selectedSpoolQrTarget}
            rfidBindingMeta={selectedSpoolRfidBindingMeta}
            resolvedTheme={resolvedTheme}
            runtimeAvailable={tauri}
            showRollHistory={showRollHistory}
            spool={selectedSpool}
            statusLabel={selectedSpoolStatusLabel}
            statusTone={selectedSpoolStatusTone}
            supportsRfidCapture={selectedSpoolSupportsRfidCapture}
            tareDraft={selectedSpoolTareDraft}
            usageLoading={usageLoading}
            usagePoints={usagePoints}
            vendor={editMasterVendor}
            visibleHistoryRows={visibleHistoryRows}
          />
        </Suspense>
      ) : null}

      <InventoryRfidCaptureModal
        canSave={Boolean(rfidCaptureSummary.rfidTag)}
        clientReadOnly={clientReadOnly}
        displayTitle={selectedSpoolDisplayTitle}
        error={rfidCaptureError}
        fields={effectiveRfidCaptureFields}
        hasObservedSnapshotFields={Boolean(observedTrayCaptureSnapshot?.fields.length)}
        lastSlotDataAt={rfidCaptureLastSeenAt}
        liveIntegration={selectedRfidCaptureLiveIntegration}
        loading={rfidCaptureLoading}
        manageBusy={manageBusy}
        matchMeta={rfidCaptureMatchMetaForSelected}
        onCancel={closeRfidCaptureModal}
        onClose={closeRfidCaptureModal}
        onSave={saveCapturedRfid}
        onSelectSlot={selectRfidCaptureSlot}
        onToggleCapturedFields={toggleRfidCapturedFields}
        open={showRfidCaptureModal && showRollModal}
        selectedSlot={selectedRfidCaptureSlot}
        showCapturedFields={showRfidCapturedFields}
        slotLabel={selectedSpoolRfidSlotLabel}
        slotSummaries={rfidCaptureSlotSummaries}
        slots={selectedSpoolRfidCaptureSlots}
        spool={selectedSpool}
        summary={rfidCaptureSummary}
        supportsRfidCapture={selectedSpoolSupportsRfidCapture}
      />

      <InventoryPageWorkspace
        activeView={activeWorkspaceView}
        totalLoanCount={compactBadges ? compactCounts?.loans ?? null : hasCount(domainSources.loans) && hasCount(domainSources.spools)
          ? activeLoans.length + (cardPage?.borrowed ?? spools.filter(spool => spool.ownershipType === "BORROWED_IN").length) : null}
        loansPanel={<Suspense fallback={<div role="status">{t("loans.loading", "Loading loans...")}</div>}>
          <LoansPage embedded onCountsChange={setLoanCounts}
            library={{ clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration, clientHostWritePaired,
              clientHostDeviceName, librarySyncReady, librarySyncResolving, librarySyncError: !librarySyncReady && !librarySyncResolving,
              retryLibrarySyncRole }}
            onOpenSpool={selectRollForManage} />
        </Suspense>}
        addModalActive={addModalActive}
        addModalProps={inventoryAddModalProps}
        bulkActionsProps={inventoryBulkActionsProps}
        bulkSelectionTriggerProps={{...inventoryBulkSelectionTriggerProps, onActiveChange: active => {
          if (active && cardPage) {
            setPendingStockAction({authority: locationAuthorityKey, kind: "bulk"});
            setRequiresFullStock(true);
            return;
          }
          inventoryBulkSelectionTriggerProps.onActiveChange(active);
        }}}
        clientHostDeviceName={clientHostDeviceName}
        clientHostWritePaired={clientHostWritePaired}
        clientInventoryPartial={!purchasesOnly && !locationsOnly && clientInventoryPartial}
        clientInventorySource={purchasesOnly ? domainSources.wishlist : locationsOnly ? domainSources.locations : clientInventorySource}
        clientInventoryUpdatedAt={purchasesOnly ? null : locationsOnly ? locationsUpdatedAt : clientInventoryUpdatedAt}
        clientReadOnly={clientReadOnly}
        librarySyncReady={librarySyncReady}
        loading={loading}
        collectionProps={{
          ...inventoryBulkCollectionProps,
          cardPage: cardPage && !waitingForAllRows ? {
            totals: cardTotals, visible: cardPage.visible, hasMore: cardPage.cards.length < cardPage.groups,
            next: () => void reloadSpools(undefined, undefined, true, cardPage),
            moreRolls: id => void reloadSpools(undefined, undefined, true, cardPage, id),
          } : undefined,
          filteredSpools: waitingForAllRows ? [] : filteredSpools,
          groupedSpools: waitingForAllRows ? [] : groupedSpools,
          slotLabelById,
          inventoryView,
          loading: loading || waitingForAllRows,
          onSelectRoll: selectRollForManage,
          recentlyAddedSpoolId,
          resolvedTheme,
          selectedSpoolId,
        }}
        controlsProps={{
          activeFilterCount,
          advancedFiltersOpen,
          inventoryView,
          locationFilter,
          materialFilter,
          materialOptions: cardPage ? cardPage.options?.materials ?? ["ALL"] : materialOptions,
          onAdvancedFiltersOpenChange: setAdvancedFiltersOpen,
          onInventoryViewChange: setInventoryView,
          onLocationFilterClear: clearLocationFilter,
          onMaterialFilterChange: setMaterialFilter,
          onOwnershipFilterChange: setOwnershipFilter,
          onResetFilters: resetFilters,
          onVendorFilterChange: setVendorFilter,
          ownershipFilter,
          vendorFilter,
          vendorOptions: cardPage ? cardPage.options?.vendors ?? ["ALL"] : vendorOptions,
          visibleInventoryCount: waitingForAllRows ? null : cardPage?.visible ?? visibleInventoryCount,
        }}
        error={activeWorkspaceView === "LOCATIONS" ? locationError ?? error : activeWorkspaceView === "STOCK" ? bulkError ?? error : error}
        loadError={loadError}
        loadErrorRetryDisabled={!tauri || librarySyncResolving || manageBusy}
        loadErrorRetrying={librarySyncResolving || refreshing}
        linkedLocationPanel={currentLinkedLocation &&
          <LinkedLocationView key={currentLinkedLocation.authority + currentLinkedLocation.location.id}
            location={currentLinkedLocation.location} target={currentLinkedLocation.target}
            onTargetChanged={retryLibrarySyncRole}
            onBack={() => {
              setLinkedLocation(null);
              const origin = linkedOrigin.current;
              window.requestAnimationFrame(() => (origin?.isConnected ? origin : document.getElementById("inventory-location-active-heading"))?.focus());
            }}
            onOpenInventory={(query, spoolId) => {
              pendingLocationStock.current = { ...currentLinkedLocation, spoolId };
              stockFilterAuthority.current = currentLinkedLocation.authority;
              showLocationSpools(currentLinkedLocation.location);
              setSearch(query);
              setActiveWorkspaceView("STOCK");
            }} />}
        locationPanelProps={{
          authorityKey: locationAuthorityKey,
          busy: manageBusy,
          canMutate:
            tauri &&
            librarySyncReady &&
            (!clientReadOnly || clientHostWritePaired),
          loading: locationsLoading,
          mutationsSupported: locationMutationsSupported,
          onArchive: archiveLocation,
          onCreate: createLocation,
          onDelete: deleteLocation,
          onOpenLinkedSpools: openLinkedLocationSpools,
          onMerge: mergeLocations,
          onReload: () => reloadLocations(),
          onRename: renameLocation,
          onRestore: restoreLocation,
          rows: locations,
          source: locationSource,
        }}
        onActiveViewChange={(view) => {
          if (view !== "PURCHASES") setReviewedPurchase(null);
          setActiveWorkspaceView(view);
        }}
        onRetryLoadError={retryInventoryPageLoad}
        purchaseQueueProps={purchaseQueueProps}
        headerActionsProps={{
          labelSheetDisabled: !tauri || manageBusy || loading || !librarySyncReady,
          lowStockOnly,
          onAddSpool: () => openAddModal(),
          onCreateLabelSheet: () => {
            if (cardPage) {
              setPendingStockAction({authority: locationAuthorityKey, kind: "labels"});
              setRequiresFullStock(true);
            } else void openInventoryLabelSheet();
          },
          onLowStockOnlyChange: setLowStockOnly,
          onSearchChange: setSearch,
          onStatusFilterChange: setStatusFilter,
          primaryActionsDisabled:
            !librarySyncReady || (clientReadOnly ? !clientHostWritePaired : false),
          search,
          showStockFilters: activeWorkspaceView === "STOCK",
          statusFilter,
        }}
        infoMessage={activeWorkspaceView === "LOCATIONS" ? locationInfo ?? infoMessage : activeWorkspaceView === "STOCK" ? bulkInfo ?? infoMessage : infoMessage}
        showRollModal={showRollModal}
        totalInventoryCount={compactBadges ? compactCounts?.stock ?? null : hasCount(domainSources.spools) || detailVisualFixture ? (cardPage?.total ?? spools.length) : null}
        totalLocationCount={loansOnly ? loanCounts?.locations ?? null : hasCount(domainSources.locations) ? selectableInventoryLocations(locations).length : null}
        totalPurchaseCount={compactBadges ? compactCounts?.purchases ?? null : hasCount(domainSources.wishlist) ? purchaseCount ?? wishlistItems.length : null}
      />
    </div>
  );
}
