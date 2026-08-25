import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InventoryPageWorkspace } from "../components/inventory_page_workspace";
import { InventoryLocationDatalist } from "../components/inventory_location_datalist";
import { InventoryLoadSpoolModal } from "../components/inventory_load_spool_modal";
import type { InventoryWorkspaceView } from "../components/inventory_workspace_navigation";
import { InventoryRfidCaptureModal } from "../components/inventory_rfid_capture_modal";
import { InventoryLabelSheetModal } from "../components/inventory_label_sheet_modal";
import { LoanOutModal } from "../components/loan_out_modal";
import type { InventoryNavigationIntent } from "../lib/app_navigation_model";
import { commandErrorText } from "../lib/error_text";
import { useI18n } from "../lib/i18n";
import {
  chooseDesktopVisualQaLoanSpool,
  chooseDesktopVisualQaSpoolId,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import {
  isInventorySpoolLoanTrackingCandidate,
  type InventoryLocationFilter,
} from "../lib/inventory_list_model";
import {
  archiveLocationForInventory,
  createLocationForInventory,
  deleteLocationForInventory,
  mergeLocationsForInventory,
  renameLocationForInventory,
  restoreLocationForInventory,
  selectableInventoryLocations,
  type InventoryLocationMutationContext,
} from "../lib/inventory_location_data_source";
import type { RfidCaptureField } from "../lib/inventory_rfid_capture";
import { inventoryLocationUsageById } from "../lib/inventory_location_model";
import {
  buildInventoryDetailVisualFixture,
  isInventoryDetailVisualFixtureEnabled,
} from "../lib/inventory_visual_fixture";
import { useResolvedTheme } from "../lib/theme_mode";
import { useInventoryAddWorkflow } from "../lib/use_inventory_add_workflow";
import { useInventoryBulkActions } from "../lib/use_inventory_bulk_actions";
import { useInventoryDetailVisualFixture } from "../lib/use_inventory_detail_visual_fixture";
import { useInventoryFeedbackTimeout } from "../lib/use_inventory_feedback_timeout";
import { useInventoryFilters } from "../lib/use_inventory_filters";
import { useInventoryHistoryFormatters } from "../lib/use_inventory_history_formatters";
import { useInventoryLoanTrackingModal } from "../lib/use_inventory_loan_tracking_modal";
import { useInventoryLabelSheetAction } from "../lib/use_inventory_label_sheet_action";
import { useInventoryLoadSpoolAction } from "../lib/use_inventory_load_spool_action";
import { useInventoryPageData } from "../lib/use_inventory_page_data";
import { useInventoryPrinterSlots } from "../lib/use_inventory_printer_slots";
import { useInventoryRfidCaptureRefresh } from "../lib/use_inventory_rfid_capture_refresh";
import { useInventoryRfidCaptureViewModel } from "../lib/use_inventory_rfid_capture_view_model";
import { useInventoryRollModalEscape } from "../lib/use_inventory_roll_modal_escape";
import { useInventorySelectedSpool } from "../lib/use_inventory_selected_spool";
import { useInventorySelectedSpoolDetailState } from "../lib/use_inventory_selected_spool_detail_state";
import { useInventorySelectedSpoolViewModel } from "../lib/use_inventory_selected_spool_view_model";
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

const InventorySpoolDetailModal = lazy(() =>
  import("../components/inventory_spool_detail_modal").then((module) => ({
    default: module.InventorySpoolDetailModal,
  })),
);

type InventoryPageProps = {
  navigationIntent?: InventoryNavigationIntent;
  onConsumeNavigationIntent?: () => void;
  onNavigationGuardChange?: (guard: InventoryNavigationGuard | null) => void;
};

export default function InventoryPage({
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
    useState<InventoryWorkspaceView>("STOCK");
  const [rfidCaptureFieldsBySlotId, setRfidCaptureFieldsBySlotId] = useState<
    Record<string, RfidCaptureField[]>
  >({});
  const {
    activeLoans,
    bambuLiveIntegrations,
    clientHostBaseUrl,
    clientHostDeviceName,
    clientHostWritePaired,
    clientInventorySource,
    clientInventoryUpdatedAt,
    clientLibraryId,
    clientReadOnly,
    completeDataLoad,
    historyLoading,
    historyRows,
    librarySyncReady,
    loadError,
    loading,
    locations,
    locationsLoading,
    locationMutationsSupported,
    locationSource,
    printerOverview,
    refreshInventoryData,
    refreshing,
    reloadActiveLoans,
    reloadPrinterOverview,
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
    wishlistItems,
    wishlistLoading,
  } = useInventoryPageData({
    setRfidCaptureFieldsBySlotId,
    tauriAvailable: tauri,
    t,
  });
  const defaultPurchaseCurrency = useDefaultPurchaseCurrency({
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    tauriAvailable: tauri,
  });
  const locationUsageById = useMemo(
    () => inventoryLocationUsageById(spools),
    [spools],
  );
  const {
    activeFilterCount,
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
  const openLinkedLocationSpools = useCallback(
    (location: InventoryLocationFilter) => {
      showLocationSpools(location);
      setActiveWorkspaceView("STOCK");
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          document.getElementById("inventory-location-filter-chip")?.focus();
        });
      }
    },
    [showLocationSpools],
  );
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
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
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

  const locationMutationContext = useMemo<InventoryLocationMutationContext>(
    () => ({
      clientHostBaseUrl,
      clientHostWritePaired,
      clientLibraryId,
      clientReadOnly,
      mutationsSupported: locationMutationsSupported,
    }),
    [
      clientHostBaseUrl,
      clientHostWritePaired,
      clientLibraryId,
      clientReadOnly,
      locationMutationsSupported,
    ],
  );

  const runLocationMutation = useCallback(
    async (
      operation: () => Promise<unknown>,
      successMessage: string,
      reloadOnFailure = false,
    ): Promise<boolean> => {
      if (!tauri || manageBusy) {
        return false;
      }
      setManageBusy(true);
      setError(null);
      setInfoMessage(null);
      try {
        await operation();
        await reloadSpools();
        setInfoMessage(successMessage);
        return true;
      } catch (locationError) {
        setError(
          commandErrorText(
            locationError,
            t("errors.requestFailed", "The request could not be completed."),
            t,
          ),
        );
        if (reloadOnFailure) {
          await reloadSpools();
        }
        return false;
      } finally {
        setManageBusy(false);
      }
    },
    [manageBusy, reloadSpools, t, tauri],
  );

  const createLocation = useCallback(
    (name: string) =>
      runLocationMutation(
        () => createLocationForInventory(locationMutationContext, name),
        t("inventory.locationCreated", "Location created."),
      ),
    [locationMutationContext, runLocationMutation, t],
  );

  const renameLocation = useCallback(
    (locationId: string, name: string) =>
      runLocationMutation(
        () => renameLocationForInventory(locationMutationContext, locationId, name),
        t("inventory.locationRenamed", "Location renamed."),
      ),
    [locationMutationContext, runLocationMutation, t],
  );

  const archiveLocation = useCallback(
    (locationId: string) =>
      runLocationMutation(
        () => archiveLocationForInventory(locationMutationContext, locationId),
        t("inventory.locationArchived", "Location archived."),
      ),
    [locationMutationContext, runLocationMutation, t],
  );

  const restoreLocation = useCallback(
    (locationId: string) =>
      runLocationMutation(
        () => restoreLocationForInventory(locationMutationContext, locationId),
        t("inventory.locationRestored", "Location restored."),
      ),
    [locationMutationContext, runLocationMutation, t],
  );

  const deleteLocation = useCallback(
    (locationId: string) =>
      runLocationMutation(
        () => deleteLocationForInventory(locationMutationContext, locationId),
        t("inventory.locationDeleted", "Location deleted."),
        true,
      ),
    [locationMutationContext, runLocationMutation, t],
  );

  const mergeLocations = useCallback(
    (sourceId: string, targetId: string) =>
      runLocationMutation(
        () => mergeLocationsForInventory(locationMutationContext, sourceId, targetId),
        t("inventory.locationsMerged", "Locations merged."),
      ),
    [locationMutationContext, runLocationMutation, t],
  );

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
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    defaultPurchaseCurrency,
    ensureLocalWriteAllowed,
    error,
    infoMessage,
    librarySyncReady,
    onOpenPurchaseQueue: openPurchaseQueue,
    purchaseActionsDisabled: clientReadOnly ? !clientHostWritePaired : false,
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
    wishlistLoading,
  });
  const { onBambuBatchInputChange, onCatalogQueryChange, onCreateModeChange } = addModalProps;
  const inventoryAddModalProps = {
    ...addModalProps,
    autoOpenBambuBatch: desktopVisualQaScenario === "bambu-batch-add",
  };

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    void refreshInventoryData({ reloadCatalog });
  }, [librarySyncReady, refreshInventoryData, reloadCatalog, tauri]);

  const refreshInventoryPage = useCallback(() => {
    void refreshInventoryData({
      reloadCatalog,
      selectedSpoolId: showRollModal ? selectedSpoolId : null,
    });
  }, [refreshInventoryData, reloadCatalog, selectedSpoolId, showRollModal]);

  useEffect(() => {
    if (!navigationIntent) {
      return;
    }
    if (navigationIntent.kind === "SPOOL_DETAIL") {
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
      resetPurchaseQueue(navigationIntent.status);
      openPurchaseQueue();
      if (navigationIntent.notice === "CREATED") {
        setInfoMessage(
          t(
            "dashboard.actionPurchaseAdded",
            "Added to the wishlist. Opening Purchases.",
          ),
        );
      } else if (navigationIntent.notice === "REUSED") {
        setInfoMessage(
          t(
            "dashboard.actionPurchaseReused",
            "An open purchase already exists. Reusing it and opening Purchases.",
          ),
        );
      }
    }
    onConsumeNavigationIntent?.();
  }, [
    navigationIntent,
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

  const selectedSpool = useInventorySelectedSpool(spools, selectedSpoolId);

  const {
    confirmDelete,
    confirmPurge,
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
    setConfirmDelete,
    setConfirmPurge,
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

  const cancelDangerZoneConfirmation = useCallback(() => {
    setConfirmDelete(false);
    setConfirmPurge(false);
  }, [setConfirmDelete, setConfirmPurge]);

  const discardSelectedSpoolDetail = useCallback(() => {
    resetDetailDrafts();
    cancelDangerZoneConfirmation();
    closeRollModal();
  }, [cancelDangerZoneConfirmation, closeRollModal, resetDetailDrafts]);

  const hasUnsavedDetailChanges = commonDetailsDirty || masterMetadataDirty;
  const closeSelectedSpoolDetailModal = useInventoryUnsavedChangesGuard({
    active: showRollModal,
    hasUnsavedChanges: hasUnsavedDetailChanges,
    message: t(
      "inventory.discardUnsavedChanges",
      "Discard unsaved roll changes? Your edits will be lost.",
    ),
    onDiscard: discardSelectedSpoolDetail,
    onNavigationGuardChange,
  });

  const {
    companionShellUrl: selectedSpoolQrCompanionShellUrl,
    dataUrl: selectedSpoolQrDataUrl,
    loading: selectedSpoolQrLoading,
    target: selectedSpoolQrTarget,
  } = useInventorySpoolQrArtifacts({
    clientHostBaseUrl,
    clientReadOnly,
    selectedSpool,
    showRollModal,
  });

  const activeLoanSpoolIds = useMemo(
    () => new Set(activeLoans.map((loan) => loan.loan.spool_id)),
    [activeLoans],
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
    if (
      showRollModal &&
      selectedSpoolId !== spoolId &&
      !closeSelectedSpoolDetailModal()
    ) {
      return;
    }
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
  }, [
    clientHostWritePaired,
    clientReadOnly,
    closeSelectedSpoolDetailModal,
    openRollModal,
    selectedSpoolId,
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
    showLoadSpoolModal,
  } = useInventoryLoadSpoolAction({
    assignedSlot: selectedSpoolAssignedSlot,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    ensureLocalWriteAllowed,
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
    collectionProps: inventoryBulkCollectionProps,
    panelProps: inventoryBulkActionsProps,
    selectionModeTriggerProps: inventoryBulkSelectionTriggerProps,
  } = useInventoryBulkActions({
    activeLoanSpoolIds,
    busy: manageBusy,
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    filteredSpools,
    loading,
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

  const clearSelectedSpoolDetail = useCallback(() => {
    setSelectedSpoolId(null);
    setHistoryRows([]);
    setUsagePoints([]);
  }, [setHistoryRows, setSelectedSpoolId, setUsagePoints]);

  const {
    handleDeleteSelected,
    handleMarkEmpty,
    handlePurgeSelected,
    handleRefillSpool,
    handleSaveMasterMetadata,
    handleSaveSpoolCommonDetails,
    handleToggleLostStatus,
    handleWeightSubmit,
  } = useInventorySpoolDetailActions({
    canUseClientHostWrite,
    clearSelectedSpoolDetail,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    confirmDelete,
    confirmPurge,
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
    selectedSpool,
    selectedSpoolAssignedSlot,
    selectedSpoolLocationDraft,
    selectedSpoolOwnerContactDraft,
    selectedSpoolOwnerNameDraft,
    selectedSpoolOwnershipDraft,
    selectedSpoolOwnershipNoteDraft,
    selectedSpoolPurchasePriceBatchLockedDraft,
    selectedSpoolPurchaseMetadataDraft,
    selectedSpoolResolvedTare,
    selectedSpoolTareDraft,
    setConfirmDelete,
    setConfirmPurge,
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
    handleStartRfidCapture,
  } = useInventorySpoolDetailUtilityActions({
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

    if (desktopVisualQaScenario === "inventory-overview") {
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
    <div className="page-shell">
      <LoanOutModal
        open={showLoanTrackingModal}
        onClose={closeLoanTrackingModal}
        preferredSpoolId={loanTrackingSpoolId}
        clientReadOnly={clientReadOnly}
        clientHostWritePaired={clientHostWritePaired}
        clientHostBaseUrl={clientHostBaseUrl}
        clientLibraryId={clientLibraryId}
        onLoanCreated={handleLoanCreated}
      />

      <InventoryLoadSpoolModal
        busy={manageBusy}
        onClose={closeLoadSpoolModal}
        onConfirm={(slotId) => void confirmLoadSpool(slotId)}
        open={showLoadSpoolModal}
        slotLabelById={slotLabelById}
        slots={availableLoadSlots}
        spool={selectedSpool}
      />

      <InventoryLabelSheetModal {...inventoryLabelSheetModalProps} />

      <InventoryLocationDatalist rows={locations} />

      {showRollModal ? (
        <Suspense fallback={null}>
          <InventorySpoolDetailModal
            assignedSlot={selectedSpoolAssignedSlot}
            canLoadInPrinter={canLoadSelectedSpool}
            canLoanOut={canLoanSelectedSpool}
            colorName={editMasterColorName}
            confirmDelete={confirmDelete}
            confirmPurge={confirmPurge}
            deterministicLabelPreferences={desktopVisualQaScenario === "selected-roll-label"}
            displayTitle={selectedSpoolDisplayTitle}
            defaultPurchaseCurrency={defaultPurchaseCurrency}
            error={error}
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
            onClose={closeSelectedSpoolDetailModal}
            onDelete={handleDeleteSelected}
            onLoadInPrinter={openLoadSpoolModal}
            onLoanOut={() => openLoanTrackingModal(selectedSpool)}
            onMarkEmpty={handleMarkEmpty}
            onPrintLabel={handlePrintLabel}
            onPurge={handlePurgeSelected}
            onRefill={handleRefillSpool}
            onSaveCommonDetails={handleSaveSpoolCommonDetails}
            onSaveMasterMetadata={handleSaveMasterMetadata}
            onStartRfidCapture={handleStartRfidCapture}
            onSubmitWeight={handleWeightSubmit}
            onToggleEditUnlocked={toggleMasterEditUnlocked}
            onToggleLostStatus={handleToggleLostStatus}
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
        addModalActive={addModalActive}
        addModalProps={inventoryAddModalProps}
        bulkActionsProps={inventoryBulkActionsProps}
        bulkSelectionTriggerProps={inventoryBulkSelectionTriggerProps}
        clientHostDeviceName={clientHostDeviceName}
        clientInventorySource={clientInventorySource}
        clientInventoryUpdatedAt={clientInventoryUpdatedAt}
        clientReadOnly={clientReadOnly}
        collectionProps={{
          ...inventoryBulkCollectionProps,
          filteredSpools,
          groupedSpools,
          inventoryView,
          loading,
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
          materialOptions,
          onAdvancedFiltersOpenChange: setAdvancedFiltersOpen,
          onInventoryViewChange: setInventoryView,
          onLocationFilterClear: clearLocationFilter,
          onMaterialFilterChange: setMaterialFilter,
          onOwnershipFilterChange: setOwnershipFilter,
          onResetFilters: resetFilters,
          onVendorFilterChange: setVendorFilter,
          ownershipFilter,
          vendorFilter,
          vendorOptions,
          visibleInventoryCount,
        }}
        error={error}
        loadError={loadError}
        loadErrorRetryDisabled={!tauri || loading || manageBusy}
        loadErrorRetrying={refreshing}
        locationPanelProps={{
          busy: manageBusy,
          canMutate: tauri && (!clientReadOnly || clientHostWritePaired),
          loading: locationsLoading,
          mutationsSupported: locationMutationsSupported,
          onArchive: archiveLocation,
          onCreate: createLocation,
          onDelete: deleteLocation,
          onOpenLinkedSpools: openLinkedLocationSpools,
          onMerge: mergeLocations,
          onRename: renameLocation,
          onRestore: restoreLocation,
          rows: locations,
          source: locationSource,
          usageByLocationId: locationUsageById,
        }}
        onActiveViewChange={setActiveWorkspaceView}
        onRetryLoadError={refreshInventoryPage}
        purchaseQueueProps={purchaseQueueProps}
        headerActionsProps={{
          labelSheetDisabled: !tauri || manageBusy || loading,
          lowStockOnly,
          onAddSpool: () => openAddModal(),
          onCreateLabelSheet: () => void openInventoryLabelSheet(),
          onLoanOutRoll: openLoanTrackingModal,
          onLowStockOnlyChange: setLowStockOnly,
          onSearchChange: setSearch,
          onStatusFilterChange: setStatusFilter,
          primaryActionsDisabled: clientReadOnly ? !clientHostWritePaired : false,
          search,
          showStockFilters: activeWorkspaceView === "STOCK",
          statusFilter,
        }}
        infoMessage={infoMessage}
        showRollModal={showRollModal}
        totalInventoryCount={spools.length}
        totalLocationCount={selectableInventoryLocations(locations).length}
        totalPurchaseCount={wishlistItems.length}
      />
    </div>
  );
}
