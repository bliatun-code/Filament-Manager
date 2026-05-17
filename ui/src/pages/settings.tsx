import type { SettingsTabKey } from "../App";
import { isTauri } from "../lib/tauri_client";
import { useI18n } from "../lib/i18n";
import { buildTrustedLanCompanionModel } from "./settings_companion_model";
import { buildSettingsCatalogRouteProps } from "./settings_catalog_route_props";
import { buildSettingsGeneralRouteProps } from "./settings_general_route_props";
import { buildSettingsLibraryBrowsersPanelProps } from "./settings_library_browsers_panel_props";
import { buildSettingsLibraryClientPanelProps } from "./settings_library_client_panel_props";
import { buildSettingsLibraryRolePanelProps } from "./settings_library_role_panel_props";
import { buildSettingsLibraryServerPanelProps } from "./settings_library_server_panel_props";
import { buildSettingsLibraryPairingPanelProps } from "./settings_library_pairing_panel_props";
import { buildSettingsLibraryRouteProps } from "./settings_library_route_props";
import { buildSettingsLibraryRoleModalRouteProps } from "./settings_library_role_modal_route_props";
import { buildSettingsMaintenanceRouteProps } from "./settings_maintenance_route_props";
import { buildSettingsLibraryWebappControlProps } from "./settings_library_webapp_control_props";
import { SettingsPageLayout } from "./settings_page_layout";
import { buildSettingsPrintersRouteProps } from "./settings_printers_route_props";
import { buildSettingsRouteMapProps } from "./settings_route_map_props";
import { useSettingsFeedbackState } from "./use_settings_feedback_state";
import { useSettingsCatalogSectionState } from "./use_settings_catalog_section_state";
import { useSettingsBambuLiveToggleActions } from "./use_settings_bambu_live_toggle_actions";
import { useSettingsBackupFileControls } from "./use_settings_backup_file_controls";
import { useSettingsBackupValidationSummary } from "./use_settings_backup_validation_summary";
import { useSettingsCatalogRefreshActions } from "./use_settings_catalog_refresh_actions";
import { useSettingsPrinterActions } from "./use_settings_printer_actions";
import { useSettingsPrinterSectionState } from "./use_settings_printer_section_state";
import { useSettingsSwatchConfirm } from "./use_settings_swatch_confirm";
import { useSettingsPageDataState } from "./use_settings_page_data_state";
import { useSettingsPageReload } from "./use_settings_page_reload";
import { useSettingsPageShellState } from "./use_settings_page_shell_state";
import { useSettingsPreferenceSection } from "./use_settings_preference_section";
import { useSettingsMaintenanceActions } from "./use_settings_maintenance_actions";
import { useSettingsBackupExportActions } from "./use_settings_backup_export_actions";
import { useSettingsBackupFileActions } from "./use_settings_backup_file_actions";
import { useSettingsInventoryPrintAction } from "./use_settings_inventory_print_action";
import { useSettingsInitialLoad } from "./use_settings_initial_load";
import { useSettingsSwatchActions } from "./use_settings_swatch_actions";
import { useSettingsInventoryRowsLoader } from "./use_settings_inventory_rows_loader";
import { useSettingsLibrarySyncState } from "./use_settings_library_sync_state";
import { useSettingsLibrarySyncActions } from "./use_settings_library_sync_actions";
import { useSettingsLibraryDerivedState } from "./use_settings_library_derived_state";
import { useSettingsLibraryClientAdvanced } from "./use_settings_library_client_advanced";
import { useSettingsLibraryRoleFlow } from "./use_settings_library_role_flow";
import { useSettingsLibraryAutoValidation } from "./use_settings_library_auto_validation";
import { useSettingsSilentReload } from "./use_settings_silent_reload";
import { useSettingsTrustedLanState } from "./use_settings_trusted_lan_state";
import { useSettingsMessageLabels } from "./use_settings_message_labels";
import { useTrustedLanBrowserPolling } from "./use_trusted_lan_browser_polling";
import { useSettingsTrustedLanDerivedState } from "./use_settings_trusted_lan_derived_state";
import { useTrustedLanDraftSync } from "./use_trusted_lan_draft_sync";
import { useTrustedLanPairingActions } from "./use_trusted_lan_pairing_actions";
import { useTrustedLanStatusActions } from "./use_trusted_lan_status_actions";
import { useTrustedLanPairingQr } from "./use_trusted_lan_pairing_qr";

type SettingsPageProps = {
  initialTab?: SettingsTabKey;
};

export default function SettingsPage({ initialTab = "GENERAL" }: SettingsPageProps) {
  const tauri = isTauri();
  const { locale, setLocale, t } = useI18n();
  const { busy, error, info, setBusy, setError, setInfo } = useSettingsFeedbackState();
  const { handleLocaleSelection, handleThemeSelection, themeMode } = useSettingsPreferenceSection({
    setInfo,
    setLocale,
    t,
  });
  const {
    activeTab,
    appVersion,
    pageChromeLabels,
    setActiveTab,
    settingsPageMessageLabels,
    settingsTabButtons,
    showTransientInfo,
  } = useSettingsPageShellState({
    initialTab,
    setInfo,
    tauri,
    t,
  });
  const {
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncSettings,
    librarySyncSnapshot,
    librarySyncSnapshotBusy,
    librarySyncValidation,
    librarySyncValidationBusy,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
  } = useSettingsLibrarySyncState();
  const messageLabels = useSettingsMessageLabels(t);
  const {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
  } = messageLabels.librarySync;
  const {
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  } = messageLabels.trustedLan;
  const { settingsPrinterMessageLabels } = messageLabels.printer;
  const {
    settingsCatalogResetMessageLabels,
    settingsMaintenanceResetMessageLabels,
  } = messageLabels.maintenance;
  const {
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    clearBackupValidation,
    clearFullBackupProgress,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastBackupValidation,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    lastFullBackupValidatedAt,
    recordBackupValidation,
    recordExportedBackupValidation,
    recordImportedFullBackup,
  } = useSettingsBackupValidationSummary();
  const {
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
  } = messageLabels.backup;
  const {
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
  } = messageLabels.inventoryPrint;
  const {
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
  } = messageLabels.catalog;
  const {
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
  } = messageLabels.swatch;
  const {
    showTrustedLanNetworkEditor,
    showTrustedLanNetworkSummary,
    showTrustedLanRevokedBrowsers,
    setShowTrustedLanNetworkEditor,
    setShowTrustedLanNetworkSummary,
    setShowTrustedLanRevokedBrowsers,
    setTrustedLanActionBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    setTrustedLanInterfaces,
    setTrustedLanLoading,
    setTrustedLanPairedBrowsers,
    setTrustedLanPairingBrowserLabelDraft,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    setTrustedLanPortDraft,
    setTrustedLanStatus,
    trustedLanActionBusy,
    trustedLanEnabledDraft,
    trustedLanInterfaceAddressDraft,
    trustedLanInterfaces,
    trustedLanLoading,
    trustedLanPairedBrowsers,
    trustedLanPairedBrowsersRef,
    trustedLanPairedBrowsersRefreshInFlightRef,
    trustedLanPairingBrowserLabelDraft,
    trustedLanPairingExpiresAtMs,
    trustedLanPairingLabel,
    trustedLanPairingLink,
    trustedLanPortDraft,
    trustedLanStatus,
  } = useSettingsTrustedLanState(tauri);
  const { setShowLibraryClientAdvanced, showLibraryClientAdvanced } =
    useSettingsLibraryClientAdvanced();
  const {
    pairingQrBusy: trustedLanPairingQrBusy,
    pairingQrDataUrl: trustedLanPairingQrDataUrl,
    pairingQrUnavailable: trustedLanPairingQrUnavailable,
  } = useTrustedLanPairingQr(trustedLanPairingLink);

  const {
    bambuLiveIntegrations,
    catalogMasters,
    lastCatalogReset,
    loading,
    printerOverview,
    printers,
    setBambuLiveIntegrations,
    setCatalogMasters,
    setLastCatalogReset,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    spoolRows,
  } = useSettingsPageDataState(tauri);
  const {
    activeCatalogMasterCount,
    activeCatalogMaterialOptions,
    activeCatalogRefreshMaterials,
    beginCatalogRefreshResult,
    catalogRefreshBusy,
    catalogRefreshElapsedSeconds,
    catalogRefreshLog,
    catalogRefreshPhase,
    catalogRefreshProgressMessage,
    catalogRefreshSummary,
    catalogRefreshVendor,
    catalogVendor,
    clearCatalogRefreshMaterials,
    completeCatalogRefreshResult,
    confirmBulkSwatch,
    failCatalogRefreshResult,
    getCatalogRefreshMaterials,
    missingSwatchMasters,
    setCatalogRefreshBusy,
    setCatalogRefreshPhase,
    setCatalogRefreshProgressMessage,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
    setCatalogVendor,
    setConfirmBulkSwatch,
    setSwatchBusy,
    setSwatchDraftById,
    setSwatchVendorFilter,
    showCatalogRefreshLog,
    swatchBusy,
    swatchDraftById,
    swatchVendorFilter,
    swatchVendorOptions,
    toggleCatalogRefreshLog,
    toggleCatalogRefreshMaterial,
    updateSwatchDraft,
    visibleMissingSwatchMasters,
    visibleMissingSwatchVendorCount,
  } = useSettingsCatalogSectionState({
    catalogMasters,
    tauri,
    t,
  });
  const {
    cancelPrinterEdit,
    confirmDeletePrinterId,
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    diagnosticChartFieldByPrinterId,
    diagnosticFilterByPrinterId,
    diagnosticSortByPrinterId,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editModelProfile,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    ensureDiagnosticSession,
    expandedBambuDetailsPrinterId,
    printerSlotsByPrinterId,
    setConfirmDeletePrinterId,
    setDiagnosticChartFieldByPrinterId,
    setDiagnosticFilterByPrinterId,
    setDiagnosticSortByPrinterId,
    setEditAmsUnits,
    setEditBambuLiveAccessCode,
    setEditBambuLiveEnabled,
    setEditBambuLiveHost,
    setEditBambuLivePrinterSerial,
    setEditPrinterModel,
    setEditPrinterName,
    setEditSlotsPerUnit,
    setExpandedBambuDetailsPrinterId,
    sortedPrinters,
    startPrinterEdit,
    toggleBambuLiveCapture,
  } = useSettingsPrinterSectionState({
    bambuLiveIntegrations,
    locale,
    printerOverview,
    printers,
  });
  const {
    librarySyncRoleOptions,
    librarySyncSavedMode,
    librarySyncTabLabels,
    libraryVisibility,
    settingsClientHostBaseUrl,
    settingsClientHostNeedsRepair,
    settingsClientHostPairingValid,
    settingsClientHostWritePaired,
    settingsClientLibraryId,
    settingsClientReadOnly,
  } = useSettingsLibraryDerivedState({
    librarySyncModeDraft,
    librarySyncSettings,
    librarySyncSnapshot,
    librarySyncValidation,
    pairedBrowserCount: trustedLanPairedBrowsers.length,
    showTrustedLanNetworkEditor,
    t,
    trustedLanEnabledDraft,
    trustedLanPairingLink,
    trustedLanStatusEnabled: Boolean(trustedLanStatus?.enabled),
  });
  const {
    activeTrustedLanPairedBrowsers,
    revokedTrustedLanPairedBrowsers,
    trustedLanHasPrivateInterfaces,
    trustedLanNetworkDirty,
    trustedLanSelectedInterfaceOption,
  } = useSettingsTrustedLanDerivedState({
    locale,
    setShowTrustedLanRevokedBrowsers,
    t,
    trustedLanInterfaceAddressDraft,
    trustedLanInterfaces,
    trustedLanPairedBrowsers,
    trustedLanPairedBrowsersRef,
    trustedLanPortDraft,
    trustedLanStatus,
  });

  const syncTrustedLanDraftFromStatus = useTrustedLanDraftSync({
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    setTrustedLanPortDraft,
  });

  const reloadSettings = useSettingsPageReload({
    setBambuLiveIntegrations,
    setCatalogMasters,
    setError,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    setSwatchDraftById,
    settingsPageMessageLabels,
    tauri,
  });

  useSettingsSilentReload({ reloadSettings, tauri });

  const { handleToggleBambuLiveCapture, handleToggleBambuLiveDetails } =
    useSettingsBambuLiveToggleActions({
      ensureDiagnosticSession,
      setExpandedBambuDetailsPrinterId,
      toggleBambuLiveCapture,
    });

  const {
    loadTrustedLanCompanionStatus,
    persistTrustedLanConfig,
    refreshTrustedLanPairedBrowsers,
  } = useTrustedLanStatusActions({
    refreshInFlightRef: trustedLanPairedBrowsersRefreshInFlightRef,
    setError,
    setInfo,
    setShowTrustedLanNetworkEditor,
    setTrustedLanActionBusy,
    setTrustedLanInterfaces,
    setTrustedLanLoading,
    setTrustedLanPairedBrowsers,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    setTrustedLanStatus,
    syncTrustedLanDraftFromStatus,
    tauri,
    trustedLanConfigMessageLabels,
    trustedLanInterfaces,
    trustedLanLoadMessageLabels,
    trustedLanPairedBrowsersRef,
    trustedLanPortDraft,
    trustedLanSelectedInterfaceOption,
    trustedLanValidationMessageLabels,
  });

  useSettingsInitialLoad({
    loadTrustedLanCompanionStatus,
    reloadSettings,
    tauri,
  });

  const {
    handleClearLibrarySyncClientAuth,
    handleFetchLibrarySyncSnapshot,
    handlePairLibrarySyncHost,
    handleRenewLibrarySyncClientAuth,
    handleSaveLibrarySyncSettings,
    handleValidateLibrarySyncHost,
  } = useSettingsLibrarySyncActions({
    librarySyncActionMessageLabels,
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncErrorMessageLabels,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncPairingMessageLabels,
    librarySyncSettings,
    persistTrustedLanConfig,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    settingsClientHostBaseUrl,
    showTransientInfo,
    tauri,
    trustedLanConfigMessageLabels,
    trustedLanInterfaces,
    trustedLanSelectedInterfaceOption,
    trustedLanStatus,
    trustedLanValidationMessageLabels,
  });

  const {
    closeLibraryRoleChangeModal,
    handleConfirmLibraryRoleChange,
    handleRequestLibraryRoleChange,
    libraryRoleConfirmArmed,
    roleChangeState,
  } = useSettingsLibraryRoleFlow({
    clearFullBackupProgress,
    handleSaveLibrarySyncSettings,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    librarySyncBusy,
    librarySyncSavedMode,
    setLibrarySyncModeDraft,
  });

  useSettingsLibraryAutoValidation({
    activeTab,
    handleValidateLibrarySyncHost,
    librarySyncBusy,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncSettings,
    librarySyncValidationBusy,
    loading,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    tauri,
  });

  useTrustedLanBrowserPolling({
    activeTab,
    refreshTrustedLanPairedBrowsers,
    tauri,
    trustedLanActionBusy,
    trustedLanPairingLink,
    trustedLanStatusEnabled: Boolean(trustedLanStatus?.enabled),
  });

  const {
    backupImportInputRef,
    backupValidateInputRef,
    clearConfirmResetAction,
    confirmResetAction,
    handleOpenBackupValidate,
    handleOpenDataImport,
    setConfirmResetAction,
  } = useSettingsBackupFileControls({
    busy,
    tauri,
  });

  const { clearConfirmBulkSwatch } = useSettingsSwatchConfirm({
    confirmBulkSwatch,
    setConfirmBulkSwatch,
    swatchVendorFilter,
    visibleMissingSwatchCount: visibleMissingSwatchMasters.length,
  });

  const {
    handleCancelEditPrinter,
    handleDeletePrinter,
    handleSavePrinterReconfigure,
    handleStartEditPrinter,
  } = useSettingsPrinterActions({
    bambuLiveIntegrations,
    busy,
    cancelPrinterEdit,
    confirmDeletePrinterId,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    printerOverview,
    printers,
    reloadSettings,
    setBusy,
    setConfirmDeletePrinterId,
    setError,
    setInfo,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsPrinterMessageLabels,
    startPrinterEdit,
    tauri,
  });

  const { handleResetAppData, handleResetCatalogs } = useSettingsMaintenanceActions({
    busy,
    clearConfirmResetAction,
    confirmResetAction,
    reloadSettings,
    setBusy,
    setConfirmResetAction,
    setError,
    setInfo,
    setLastCatalogReset,
    settingsCatalogResetMessageLabels,
    settingsMaintenanceResetMessageLabels,
    tauri,
  });

  const loadSettingsInventoryRows = useSettingsInventoryRowsLoader({
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
  });

  const {
    handleExportFullBackup,
    handleExportInventoryCsv,
    handleExportInventoryJson,
  } = useSettingsBackupExportActions({
    busy,
    loadSettingsInventoryRows,
    recordExportedBackupValidation,
    setBusy,
    setError,
    setInfo,
    settingsBackupErrorMessageLabels,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsInventoryExportMessageLabels,
    tauri,
    t,
  });

  const { handlePrintInventoryOverviewA4 } = useSettingsInventoryPrintAction({
    busy,
    loadSettingsInventoryRows,
    locale,
    setBusy,
    setError,
    setInfo,
    settingsClientHostBaseUrl,
    settingsClientReadOnly,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
    tauri,
    trustedLanStatus,
  });

  const { handleImportDataFile, handleValidateBackupFile } = useSettingsBackupFileActions({
    busy,
    clearBackupValidation,
    clearConfirmResetAction,
    librarySyncModeDraft,
    recordBackupValidation,
    recordImportedFullBackup,
    reloadSettings,
    setActiveTab,
    setBusy,
    setError,
    setInfo,
    setLastCatalogReset,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsImportMessageLabels,
    tauri,
  });

  const { handleRefreshVendorCatalog } = useSettingsCatalogRefreshActions({
    beginCatalogRefreshResult,
    busy,
    catalogRefreshBusy,
    completeCatalogRefreshResult,
    failCatalogRefreshResult,
    getCatalogRefreshMaterials,
    reloadSettings,
    setCatalogRefreshBusy,
    setCatalogRefreshPhase,
    setCatalogRefreshProgressMessage,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
    setError,
    setInfo,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    swatchBusy,
    tauri,
  });

  const { handleBulkAutoFillMissingSwatches, handleSaveMissingSwatch } =
    useSettingsSwatchActions({
      busy,
      clearConfirmBulkSwatch,
      confirmBulkSwatch,
      reloadSettings,
      setConfirmBulkSwatch,
      setError,
      setInfo,
      setSwatchBusy,
      settingsSwatchBulkMessageLabels,
      settingsSwatchErrorMessageLabels,
      settingsSwatchSavedMessageLabels,
      swatchBusy,
      swatchDraftById,
      tauri,
      visibleMissingSwatchMasters,
    });

  const trustedLanCompanionModel = buildTrustedLanCompanionModel({
    trustedLanStatus,
    statusLoading: trustedLanLoading,
    actionBusy: trustedLanActionBusy,
    t,
  });
  const {
    handleCopyTrustedLanPairingLink,
    handleCreateTrustedLanPairingLink,
    handleRevokeAllTrustedLanBrowsers,
    handleRevokeTrustedLanBrowser,
    handleSaveTrustedLanConfig,
    handleToggleTrustedLanEnabled,
  } = useTrustedLanPairingActions({
    configActionDisabled: trustedLanCompanionModel.configActionDisabled,
    loadTrustedLanCompanionStatus,
    pairActionDisabled: trustedLanCompanionModel.pairActionDisabled,
    persistTrustedLanConfig,
    setError,
    setInfo,
    setShowTrustedLanRevokedBrowsers,
    setTrustedLanActionBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    tauri,
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanEnabledDraft,
    trustedLanPairingBrowserLabelDraft,
    trustedLanPairingLink,
  });
  const settingsGeneralRouteProps = buildSettingsGeneralRouteProps({
    appVersion,
    busy,
    locale,
    tauri,
    themeMode,
    t,
    onLocaleSelection: handleLocaleSelection,
    onPrintInventoryOverviewA4: handlePrintInventoryOverviewA4,
    onThemeSelection: handleThemeSelection,
  });
  const settingsMaintenanceRouteProps = buildSettingsMaintenanceRouteProps({
    backupImportInputRef,
    backupValidateInputRef,
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    busy,
    catalogCount: catalogMasters.length,
    confirmResetAction,
    lastBackupValidation,
    lastCatalogReset,
    missingSwatchCount: missingSwatchMasters.length,
    printerCount: printers.length,
    tauri,
    t,
    onExportFullBackup: handleExportFullBackup,
    onExportInventoryCsv: handleExportInventoryCsv,
    onExportInventoryJson: handleExportInventoryJson,
    onImportDataFile: handleImportDataFile,
    onOpenBackupValidate: handleOpenBackupValidate,
    onOpenDataImport: handleOpenDataImport,
    onResetAppData: handleResetAppData,
    onResetCatalogs: handleResetCatalogs,
    onValidateBackupFile: handleValidateBackupFile,
  });
  const settingsCatalogRouteProps = buildSettingsCatalogRouteProps({
    helpText: t(
      "settings.catalogTabHelp",
      "Catalog updates are performed here. Inventory add-flow uses the local catalogue managed on this page.",
    ),
    missingSwatchesPanel: {
      busy,
      catalogRefreshBusy,
      confirmBulkSwatch,
      missingSwatchCount: missingSwatchMasters.length,
      swatchBusy,
      swatchDraftById,
      swatchVendorFilter,
      swatchVendorOptions,
      tauri,
      t,
      visibleMissingSwatchMasters,
      visibleMissingSwatchVendorCount,
      onBulkAutoFill: handleBulkAutoFillMissingSwatches,
      onRefresh: reloadSettings,
      onSaveMissingSwatch: handleSaveMissingSwatch,
      onSwatchDraftChange: updateSwatchDraft,
      onVendorFilterChange: setSwatchVendorFilter,
    },
    refreshPanel: {
      activeCatalogMasterCount,
      activeCatalogMaterialOptions,
      activeCatalogRefreshMaterials,
      busy,
      catalogCount: catalogMasters.length,
      catalogRefreshBusy,
      catalogRefreshElapsedSeconds,
      catalogRefreshLog,
      catalogRefreshPhase,
      catalogRefreshProgressMessage,
      catalogRefreshSummary,
      catalogRefreshVendor,
      catalogVendor,
      showCatalogRefreshLog,
      swatchBusy,
      tauri,
      t,
      onClearCatalogRefreshMaterials: clearCatalogRefreshMaterials,
      onRefreshVendorCatalog: handleRefreshVendorCatalog,
      onSetCatalogVendor: setCatalogVendor,
      onToggleCatalogRefreshLog: toggleCatalogRefreshLog,
      onToggleCatalogRefreshMaterial: toggleCatalogRefreshMaterial,
    },
  });
  const settingsPrintersRouteProps = buildSettingsPrintersRouteProps({
    bambuLiveIntegrations,
    busy,
    confirmDeletePrinterId,
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    diagnosticChartFieldByPrinterId,
    diagnosticFilterByPrinterId,
    diagnosticSortByPrinterId,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editModelProfile,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    expandedBambuDetailsPrinterId,
    loading,
    printerSlotsByPrinterId,
    printers,
    settingsClientReadOnly,
    sortedPrinters,
    spoolRows,
    tauri,
    onBambuLiveAccessCodeChange: setEditBambuLiveAccessCode,
    onBambuLiveEnabledChange: setEditBambuLiveEnabled,
    onBambuLiveHostChange: setEditBambuLiveHost,
    onBambuLivePrinterSerialChange: setEditBambuLivePrinterSerial,
    onCancelEditPrinter: handleCancelEditPrinter,
    onCopyError: setError,
    onCopySuccess: setInfo,
    onDeletePrinter: handleDeletePrinter,
    onDiagnosticChartFieldChange: setDiagnosticChartFieldByPrinterId,
    onDiagnosticFilterChange: setDiagnosticFilterByPrinterId,
    onDiagnosticSortChange: setDiagnosticSortByPrinterId,
    onEditAmsUnitsChange: setEditAmsUnits,
    onEditPrinterModelChange: setEditPrinterModel,
    onEditPrinterNameChange: setEditPrinterName,
    onEditSlotsPerUnitChange: setEditSlotsPerUnit,
    onSavePrinterReconfigure: handleSavePrinterReconfigure,
    onStartEditPrinter: handleStartEditPrinter,
    onToggleBambuLiveCapture: handleToggleBambuLiveCapture,
    onToggleBambuLiveDetails: handleToggleBambuLiveDetails,
  });
  const settingsLibraryRolePanelProps = buildSettingsLibraryRolePanelProps({
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncModeDraft,
    librarySyncRoleOptions,
    librarySyncSettings,
    libraryVisibility,
    tauri,
    t,
    onDeviceNameChange: setLibrarySyncDeviceNameDraft,
    onRequestLibraryRoleChange: handleRequestLibraryRoleChange,
  });
  const settingsLibraryWebappControlProps = buildSettingsLibraryWebappControlProps({
    librarySyncModeDraft,
    tauri,
    trustedLanActionBusy,
    trustedLanEnabledDraft,
    trustedLanHasPrivateInterfaces,
    trustedLanStatus,
    t,
    onToggleTrustedLanEnabled: handleToggleTrustedLanEnabled,
  });
  const settingsLibraryServerPanelProps = buildSettingsLibraryServerPanelProps({
    actionBusy: trustedLanActionBusy,
    companionModel: trustedLanCompanionModel,
    interfaceAddressDraft: trustedLanInterfaceAddressDraft,
    interfaces: trustedLanInterfaces,
    networkDirty: trustedLanNetworkDirty,
    portDraft: trustedLanPortDraft,
    showNetworkEditor: showTrustedLanNetworkEditor,
    showNetworkSummary: showTrustedLanNetworkSummary,
    tauri,
    t,
    onInterfaceAddressChange: setTrustedLanInterfaceAddressDraft,
    onPortChange: setTrustedLanPortDraft,
    onSaveNetwork: handleSaveTrustedLanConfig,
    onToggleNetworkEditor: () => setShowTrustedLanNetworkEditor((value) => !value),
    onToggleNetworkSummary: () => setShowTrustedLanNetworkSummary((value) => !value),
  });
  const settingsLibraryPairingPanelProps = buildSettingsLibraryPairingPanelProps({
    actionBusy: trustedLanActionBusy,
    browserLabelDraft: trustedLanPairingBrowserLabelDraft,
    locale,
    pairActionDisabled: trustedLanCompanionModel.pairActionDisabled,
    pairingExpiresAtMs: trustedLanPairingExpiresAtMs,
    pairingLabel: trustedLanPairingLabel,
    pairingLink: trustedLanPairingLink,
    pairingQrBusy: trustedLanPairingQrBusy,
    pairingQrDataUrl: trustedLanPairingQrDataUrl,
    pairingQrUnavailable: trustedLanPairingQrUnavailable,
    t,
    onBrowserLabelChange: setTrustedLanPairingBrowserLabelDraft,
    onCopyPairingLink: handleCopyTrustedLanPairingLink,
    onCreatePairingLink: handleCreateTrustedLanPairingLink,
  });
  const settingsLibraryBrowsersPanelProps = buildSettingsLibraryBrowsersPanelProps({
    activeBrowsers: activeTrustedLanPairedBrowsers,
    actionBusy: trustedLanActionBusy,
    revokedBrowsers: revokedTrustedLanPairedBrowsers,
    showRevokedBrowsers: showTrustedLanRevokedBrowsers,
    t,
    totalBrowserCount: trustedLanPairedBrowsers.length,
    onRevokeAllBrowsers: handleRevokeAllTrustedLanBrowsers,
    onRevokeBrowser: handleRevokeTrustedLanBrowser,
    onToggleRevokedBrowsers: () => setShowTrustedLanRevokedBrowsers((value) => !value),
  });
  const settingsLibraryClientPanelProps = buildSettingsLibraryClientPanelProps({
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncHostBaseUrlDraft,
    librarySyncPairingDraft,
    librarySyncSettings,
    librarySyncSnapshot,
    librarySyncSnapshotBusy,
    librarySyncValidation,
    librarySyncValidationBusy,
    libraryVisibility,
    locale,
    settingsClientHostBaseUrl,
    settingsClientHostNeedsRepair,
    settingsClientHostPairingValid,
    settingsClientHostWritePaired,
    showLibraryClientAdvanced,
    tauri,
    t,
    onClearClientAuth: handleClearLibrarySyncClientAuth,
    onDeviceNameChange: setLibrarySyncDeviceNameDraft,
    onFetchSnapshot: handleFetchLibrarySyncSnapshot,
    onPairHost: handlePairLibrarySyncHost,
    onPairingDraftChange: setLibrarySyncPairingDraft,
    onRenewClientAuth: handleRenewLibrarySyncClientAuth,
    onToggleAdvanced: () => setShowLibraryClientAdvanced((value) => !value),
  });
  const settingsLibraryRouteProps = buildSettingsLibraryRouteProps({
    browsersPanel: settingsLibraryBrowsersPanelProps,
    clientPanel: settingsLibraryClientPanelProps,
    libraryRolePanel: settingsLibraryRolePanelProps,
    pairingPanel: settingsLibraryPairingPanelProps,
    serverPanel: settingsLibraryServerPanelProps,
    showClientPanel: librarySyncModeDraft === "CLIENT",
    showHostPanels: librarySyncModeDraft !== "CLIENT",
    showServerPanel: librarySyncModeDraft !== "CLIENT" && libraryVisibility.showWebappDetails,
    title: librarySyncTabLabels.title,
    webappControl: settingsLibraryWebappControlProps,
  });
  const settingsLibraryRoleModalRouteProps = buildSettingsLibraryRoleModalRouteProps({
    busy,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    lastFullBackupValidatedAt,
    libraryRoleConfirmArmed,
    librarySyncBusy,
    librarySyncSettings,
    locale,
    roleChangeState,
    tauri,
    t,
    onClose: closeLibraryRoleChangeModal,
    onConfirm: handleConfirmLibraryRoleChange,
    onExportFullBackup: handleExportFullBackup,
    onOpenBackupValidate: handleOpenBackupValidate,
    onOpenDataImport: handleOpenDataImport,
  });
  const settingsRouteMap = buildSettingsRouteMapProps({
    catalog: settingsCatalogRouteProps,
    general: settingsGeneralRouteProps,
    library: settingsLibraryRouteProps,
    maintenance: settingsMaintenanceRouteProps,
    printers: settingsPrintersRouteProps,
  });
  return (
    <SettingsPageLayout
      activeTab={activeTab}
      desktopOnlyMessage={pageChromeLabels.desktopOnly}
      error={error}
      info={info}
      onTabChange={setActiveTab}
      roleModal={settingsLibraryRoleModalRouteProps}
      routes={settingsRouteMap}
      subtitle={pageChromeLabels.subtitle}
      tabButtons={settingsTabButtons}
      tauri={tauri}
      title={pageChromeLabels.title}
    />
  );
}
