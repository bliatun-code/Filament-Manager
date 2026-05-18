import { useCallback, useEffect, useMemo, useState } from "react";
import { InventoryPageWorkspace } from "../components/inventory_page_workspace";
import { InventoryRfidCaptureModal } from "../components/inventory_rfid_capture_modal";
import { InventorySpoolDetailModal } from "../components/inventory_spool_detail_modal";
import { LoanOutModal } from "../components/loan_out_modal";
import { useI18n } from "../lib/i18n";
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
  navigationIntent?: {
    kind: "LOW_STOCK";
    seq: number;
  } | null;
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
    historyLoading,
    historyRows,
    librarySyncReady,
    loading,
    printerOverview,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    reloadWishlist,
    setBambuLiveIntegrations,
    setHistoryLoading,
    setHistoryRows,
    setLoading,
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
    setError,
    setRfidCaptureFieldsBySlotId,
    tauriAvailable: tauri,
    t,
  });
  const {
    activeAdvancedFilterCount,
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
  } = useInventoryFilters(spools);
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
    reloadActiveLoans,
    reloadPrinterOverview,
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

  useEffect(() => {
    if (navigationIntent?.kind !== "LOW_STOCK") {
      return;
    }
    showLowStockList();
    onConsumeNavigationIntent?.();
  }, [navigationIntent, onConsumeNavigationIntent, showLowStockList]);

  useInventoryDetailVisualFixture({
    detailVisualFixture,
    resetFilters,
    setBambuLiveIntegrations,
    setError,
    setHistoryLoading,
    setHistoryRows,
    setInfoMessage,
    setLoading,
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

  const {
    buildArtifacts: buildSelectedSpoolQrArtifacts,
    companionShellUrl: selectedSpoolQrCompanionShellUrl,
    dataUrl: selectedSpoolQrDataUrl,
    loading: selectedSpoolQrLoading,
    mode: selectedSpoolQrMode,
    resolvedMode: selectedSpoolQrResolvedMode,
    setMode: setSelectedSpoolQrMode,
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
    selectedSpoolIdentityFreshnessMeta,
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
  });

  const loanTrackingCandidates = useMemo(
    () =>
      spools.filter(
        (spool) =>
          spool.ownershipType !== "BORROWED_IN" &&
          spool.status !== "EMPTY" &&
          spool.status !== "LOST" &&
          !activeLoanSpoolIds.has(spool.id),
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
    selectedSpoolResolvedTare,
    selectedSpoolTareDraft,
    setConfirmDelete,
    setConfirmPurge,
    setError,
    setInfoMessage,
    setManageBusy,
    setMasterEditUnlocked,
    setSelectedSpoolTareDraft,
    tauriAvailable: tauri,
    t,
  });

  const {
    handlePrintLabel,
    handleSaveCapturedRfid,
    handleStartRfidCapture,
  } = useInventorySpoolDetailUtilityActions({
    buildSelectedSpoolQrArtifacts,
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
    selectedSpoolQrMode,
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
        identityFreshnessMeta={selectedSpoolIdentityFreshnessMeta}
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
        onChangeQrMode={setSelectedSpoolQrMode}
        onChangeTare={setSelectedSpoolTareDraft}
        onChangeVendor={setEditMasterVendor}
        onClose={closeRollModal}
        onDelete={handleDeleteSelected}
        onMarkEmpty={handleMarkEmpty}
        onPrintLabel={handlePrintLabel}
        onPurge={handlePurgeSelected}
        onRefill={handleRefillSpool}
        onSaveLocation={handleSaveSpoolLocation}
        onSaveMasterMetadata={handleSaveMasterMetadata}
        onSaveTareWeight={handleSaveSpoolTareWeight}
        onStartRfidCapture={handleStartRfidCapture}
        onSubmitWeight={handleWeightSubmit}
        onToggleEditUnlocked={toggleMasterEditUnlocked}
        onToggleLostStatus={handleToggleLostStatus}
        onToggleRollHistory={toggleRollHistory}
        open={showRollModal}
        ownershipLabel={selectedSpoolOwnershipLabel}
        ownershipTone={selectedSpoolOwnershipTone}
        qrCompanionAvailable={selectedSpoolQrCompanionAvailable}
        qrDataUrl={selectedSpoolQrDataUrl}
        qrLoading={selectedSpoolQrLoading}
        qrMode={selectedSpoolQrMode}
        qrResolvedMode={selectedSpoolQrResolvedMode}
        qrTarget={selectedSpoolQrTarget}
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
        addModalProps={addModalProps}
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
          activeAdvancedFilterCount,
          advancedFiltersOpen,
          inventoryView,
          materialFilter,
          materialOptions,
          onAdvancedFiltersOpenChange: setAdvancedFiltersOpen,
          onInventoryViewChange: setInventoryView,
          onMaterialFilterChange: setMaterialFilter,
          onOwnershipFilterChange: setOwnershipFilter,
          onVendorFilterChange: setVendorFilter,
          ownershipFilter,
          vendorFilter,
          vendorOptions,
          visibleInventoryCount,
        }}
        error={error}
        headerActionsProps={{
          lowStockOnly,
          onAddSpool: openAddModal,
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
