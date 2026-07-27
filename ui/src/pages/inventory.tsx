import { useCallback, useEffect, useMemo, useState } from "react";
import { InventoryPageWorkspace } from "../components/inventory_page_workspace";
import { InventoryRfidCaptureModal } from "../components/inventory_rfid_capture_modal";
import { InventorySpoolDetailModal } from "../components/inventory_spool_detail_modal";
import { LoanOutModal } from "../components/loan_out_modal";
import type { InventoryNavigationIntent } from "../lib/app_navigation_model";
import { useI18n } from "../lib/i18n";
import {
  chooseDesktopVisualQaLoanSpool,
  chooseDesktopVisualQaSpoolId,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import { isInventorySpoolLoanTrackingCandidate } from "../lib/inventory_list_model";
import type { RfidCaptureField } from "../lib/inventory_rfid_capture";
import {
  buildInventoryDetailVisualFixture,
  isInventoryDetailVisualFixtureEnabled,
} from "../lib/inventory_visual_fixture";
import { useResolvedTheme } from "../lib/theme_mode";
import { useInventoryAddWorkflow } from "../lib/use_inventory_add_workflow";
import { useInventoryDetailVisualFixture } from "../lib/use_inventory_detail_visual_fixture";
import { useInventoryFeedbackTimeout } from "../lib/use_inventory_feedback_timeout";
import { useInventoryFilters } from "../lib/use_inventory_filters";
import { useInventoryHistoryFormatters } from "../lib/use_inventory_history_formatters";
import { useInventoryLoanTrackingModal } from "../lib/use_inventory_loan_tracking_modal";
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
import { isTauri } from "../lib/tauri_client";

type InventoryPageProps = {
  navigationIntent?: InventoryNavigationIntent;
  onConsumeNavigationIntent?: () => void;
};

export default function InventoryPage({
  navigationIntent = null,
  onConsumeNavigationIntent,
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
  const {
    activeFilterCount,
    advancedFiltersOpen,
    filteredSpools,
    groupedSpools,
    inventoryView,
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
    reloadCatalog,
    setMasters,
    switchToManageMode,
  } = useInventoryAddWorkflow({
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    ensureLocalWriteAllowed,
    error,
    infoMessage,
    librarySyncReady,
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
    autoFocusWishlistQueue: desktopVisualQaScenario === "wishlist-queue",
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
    if (navigationIntent.kind === "LOW_STOCK") {
      showLowStockList();
    } else if (navigationIntent.kind === "ADD_SPOOL") {
      openAddModal();
    }
    onConsumeNavigationIntent?.();
  }, [navigationIntent, onConsumeNavigationIntent, openAddModal, showLowStockList]);

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
    editMasterColorName,
    editMasterFilamentName,
    editMasterHexColor,
    editMasterMaterial,
    editMasterVendor,
    masterEditUnlocked,
    selectedSpoolLocationDraft,
    selectedSpoolOwnerContactDraft,
    selectedSpoolOwnerNameDraft,
    selectedSpoolOwnershipDraft,
    selectedSpoolOwnershipNoteDraft,
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

  const closeSelectedSpoolDetailModal = useCallback(() => {
    cancelDangerZoneConfirmation();
    closeRollModal();
  }, [cancelDangerZoneConfirmation, closeRollModal]);

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
    openRollModal,
    setShowRollHistory,
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

  useInventoryRollModalEscape({
    closeRollModal,
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
    handleSaveSpoolOwnership,
    handleSaveSpoolLocation,
    handleSaveSpoolTareWeight,
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

    if (
      desktopVisualQaScenario === "add-filament" ||
      desktopVisualQaScenario === "wishlist-queue" ||
      desktopVisualQaScenario === "bambu-batch-add"
    ) {
      if (desktopVisualQaScenario === "bambu-batch-add") {
        onBambuBatchInputChange("40500\n40200\n65103");
      } else if (desktopVisualQaScenario === "add-filament") {
        onCreateModeChange("esun");
      }
      openAddModal({
        wishlistFilter: desktopVisualQaScenario === "wishlist-queue" ? "ON_ORDER" : undefined,
      });
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
    openLoanTrackingModal,
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

      <InventorySpoolDetailModal
        assignedSlot={selectedSpoolAssignedSlot}
        colorName={editMasterColorName}
        confirmDelete={confirmDelete}
        confirmPurge={confirmPurge}
        displayTitle={selectedSpoolDisplayTitle}
        error={error}
        filamentName={editMasterFilamentName}
        formatHistoryEventDetails={formatHistoryEventDetails}
        formatHistoryEventType={formatHistoryEventType}
        hasHiddenHistoryRows={hasHiddenHistoryRows}
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
        onChangeTare={setSelectedSpoolTareDraft}
        onChangeVendor={setEditMasterVendor}
        onCancelDangerZoneConfirmation={cancelDangerZoneConfirmation}
        onClose={closeSelectedSpoolDetailModal}
        onDelete={handleDeleteSelected}
        onMarkEmpty={handleMarkEmpty}
        onPrintLabel={handlePrintLabel}
        onPurge={handlePurgeSelected}
        onRefill={handleRefillSpool}
        onSaveLocation={handleSaveSpoolLocation}
        onSaveMasterMetadata={handleSaveMasterMetadata}
        onSaveOwnership={handleSaveSpoolOwnership}
        onSaveTareWeight={handleSaveSpoolTareWeight}
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
        addModalActive={addModalActive}
        addModalProps={inventoryAddModalProps}
        clientHostDeviceName={clientHostDeviceName}
        clientInventorySource={clientInventorySource}
        clientInventoryUpdatedAt={clientInventoryUpdatedAt}
        clientReadOnly={clientReadOnly}
        collectionProps={{
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
          materialFilter,
          materialOptions,
          onAdvancedFiltersOpenChange: setAdvancedFiltersOpen,
          onInventoryViewChange: setInventoryView,
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
        onRetryLoadError={refreshInventoryPage}
        headerActionsProps={{
          lowStockOnly,
          onAddSpool: () => openAddModal(),
          onLoanOutRoll: openLoanTrackingModal,
          onLowStockOnlyChange: setLowStockOnly,
          onSearchChange: setSearch,
          onStatusFilterChange: setStatusFilter,
          primaryActionsDisabled: clientReadOnly ? !clientHostWritePaired : false,
          search,
          statusFilter,
        }}
        infoMessage={infoMessage}
        showRollModal={showRollModal}
      />
    </div>
  );
}
