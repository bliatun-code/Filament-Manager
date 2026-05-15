import type { SettingsTabKey } from "../App";
import {
  isTauri,
} from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { useI18n } from "../lib/i18n";
import { SettingsGeneralTab } from "../components/settings_general_tab";
import { SettingsLibraryRoleModal } from "../components/settings_library_role_modal";
import { SettingsMaintenanceTab } from "../components/settings_maintenance_tab";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
import { SettingsPrintersTab } from "../components/settings_printers_tab";
import { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";
import { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";
import { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";
import { tabButtonClass } from "../lib/settings_ui_classes";
import { buildTrustedLanCompanionModel } from "./settings_companion_model";
import {
  buildLibrarySyncClientState,
  buildLibrarySyncRoleOptions,
  buildLibrarySyncTabLabels,
  buildLibraryRoleChangeState,
  buildLibrarySyncVisibilityState,
} from "./settings_library_sync_model";
import { SettingsLibraryClientPanel } from "./settings_library_client_panel";
import { SettingsLibraryRolePanel } from "./settings_library_role_panel";
import { SettingsLibraryWebappControl } from "./settings_library_webapp_control";
import { useSettingsActiveTab } from "./use_settings_active_tab";
import { useSettingsAppVersion } from "./use_settings_app_version";
import { useSettingsFeedbackState } from "./use_settings_feedback_state";
import { useSettingsCatalogRefreshResult } from "./use_settings_catalog_refresh_result";
import { useSettingsCatalogRefreshProgress } from "./use_settings_catalog_refresh_progress";
import { useSettingsCatalogRefreshState } from "./use_settings_catalog_refresh_state";
import { useSettingsCatalogDerivedState } from "./use_settings_catalog_derived_state";
import { useSettingsCatalogMessages } from "./use_settings_catalog_messages";
import { useSettingsBambuLiveDiagnostics } from "./use_settings_bambu_live_diagnostics";
import { useSettingsBambuLiveToggleActions } from "./use_settings_bambu_live_toggle_actions";
import { useSettingsBackupFileInputs } from "./use_settings_backup_file_inputs";
import { useSettingsBackupMessages } from "./use_settings_backup_messages";
import { useSettingsBackupValidationState } from "./use_settings_backup_validation_state";
import { useSettingsCatalogRefreshMaterials } from "./use_settings_catalog_refresh_materials";
import { useSettingsCatalogRefreshActions } from "./use_settings_catalog_refresh_actions";
import { useSettingsPrinterEditDraft } from "./use_settings_printer_edit_draft";
import { useSettingsPrinterActions } from "./use_settings_printer_actions";
import { useSettingsPrinterDeleteConfirm } from "./use_settings_printer_delete_confirm";
import { useSettingsPrinterDerivedState } from "./use_settings_printer_derived_state";
import { useSettingsPrinterMessages } from "./use_settings_printer_messages";
import { useSettingsResetConfirm } from "./use_settings_reset_confirm";
import { useSettingsSwatchConfirm } from "./use_settings_swatch_confirm";
import { useSettingsSwatchDrafts } from "./use_settings_swatch_drafts";
import { useSettingsSwatchState } from "./use_settings_swatch_state";
import { useSettingsPageChrome } from "./use_settings_page_chrome";
import { useSettingsPageDataState } from "./use_settings_page_data_state";
import { useSettingsPageReload } from "./use_settings_page_reload";
import { useSettingsPageTabs } from "./use_settings_page_tabs";
import { useSettingsPreferenceActions } from "./use_settings_preference_actions";
import { useSettingsMaintenanceActions } from "./use_settings_maintenance_actions";
import { useSettingsMaintenanceMessages } from "./use_settings_maintenance_messages";
import { useSettingsBackupExportActions } from "./use_settings_backup_export_actions";
import { useSettingsBackupFileActions } from "./use_settings_backup_file_actions";
import { useSettingsInventoryPrintAction } from "./use_settings_inventory_print_action";
import { useSettingsInventoryPrintMessages } from "./use_settings_inventory_print_messages";
import { useSettingsInitialLoad } from "./use_settings_initial_load";
import { useSettingsSwatchActions } from "./use_settings_swatch_actions";
import { useSettingsSwatchMessages } from "./use_settings_swatch_messages";
import { useSettingsInventoryRowsLoader } from "./use_settings_inventory_rows_loader";
import { useSettingsLibrarySyncState } from "./use_settings_library_sync_state";
import { useSettingsLibrarySyncMessages } from "./use_settings_library_sync_messages";
import { useSettingsLibrarySyncActions } from "./use_settings_library_sync_actions";
import { useSettingsLibraryClientAdvanced } from "./use_settings_library_client_advanced";
import { useSettingsLibraryRoleChange } from "./use_settings_library_role_change";
import { useSettingsLibraryAutoValidation } from "./use_settings_library_auto_validation";
import { useSettingsTrustedLanMessages } from "./use_settings_trusted_lan_messages";
import { useSettingsSilentReload } from "./use_settings_silent_reload";
import { useSettingsThemeMode } from "./use_settings_theme_mode";
import { useSettingsTransientInfo } from "./use_settings_transient_info";
import { useSettingsTrustedLanState } from "./use_settings_trusted_lan_state";
import { useTrustedLanBrowserPolling } from "./use_trusted_lan_browser_polling";
import { useTrustedLanBrowserListModel } from "./use_trusted_lan_browser_list_model";
import { useTrustedLanDraftSync } from "./use_trusted_lan_draft_sync";
import { useTrustedLanPairedBrowserRefSync } from "./use_trusted_lan_paired_browser_ref_sync";
import { useTrustedLanPairingActions } from "./use_trusted_lan_pairing_actions";
import { useTrustedLanStatusActions } from "./use_trusted_lan_status_actions";
import { useTrustedLanRevokedVisibility } from "./use_trusted_lan_revoked_visibility";
import {
  useTrustedLanNetworkState,
} from "./use_trusted_lan_network_state";
import { useTrustedLanPairingQr } from "./use_trusted_lan_pairing_qr";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";

type SettingsPageProps = {
  initialTab?: SettingsTabKey;
};

export default function SettingsPage({ initialTab = "GENERAL" }: SettingsPageProps) {
  const tauri = isTauri();
  const { locale, setLocale, t } = useI18n();
  const { busy, error, info, setBusy, setError, setInfo } = useSettingsFeedbackState();
  const { themeMode, updateThemeMode } = useSettingsThemeMode();
  const { handleLocaleSelection, handleThemeSelection } = useSettingsPreferenceActions({
    setInfo,
    setLocale,
    t,
    updateThemeMode,
  });
  const appVersion = useSettingsAppVersion(tauri);
  const { activeTab, setActiveTab } = useSettingsActiveTab(initialTab);
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
  const {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
  } = useSettingsLibrarySyncMessages(t);
  const {
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  } = useSettingsTrustedLanMessages(t);
  const { settingsPrinterMessageLabels } = useSettingsPrinterMessages(t);
  const {
    settingsCatalogResetMessageLabels,
    settingsMaintenanceResetMessageLabels,
  } = useSettingsMaintenanceMessages(t);
  const {
    backupValidationState,
    clearBackupValidation,
    clearFullBackupProgress,
    lastBackupValidation,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    lastFullBackupValidatedAt,
    recordBackupValidation,
    recordExportedBackupValidation,
    recordImportedFullBackup,
  } = useSettingsBackupValidationState();
  const {
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
  } = useSettingsBackupMessages(t);
  const {
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
  } = useSettingsInventoryPrintMessages(t);
  const {
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
  } = useSettingsCatalogMessages(t);
  const {
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
  } = useSettingsSwatchMessages(t);
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
  const { setSwatchDraftById, swatchDraftById, updateSwatchDraft } =
    useSettingsSwatchDrafts();
  const {
    confirmBulkSwatch,
    setConfirmBulkSwatch,
    setSwatchBusy,
    setSwatchVendorFilter,
    swatchBusy,
    swatchVendorFilter,
  } = useSettingsSwatchState();
  const {
    bambuRefreshMaterials,
    catalogVendor,
    clearCatalogRefreshMaterials,
    esunRefreshMaterials,
    getCatalogRefreshMaterials,
    setCatalogVendor,
    toggleCatalogRefreshMaterial,
  } = useSettingsCatalogRefreshMaterials();
  const { catalogRefreshBusy, setCatalogRefreshBusy } = useSettingsCatalogRefreshState();
  const {
    beginCatalogRefreshResult,
    catalogRefreshLog,
    catalogRefreshSummary,
    completeCatalogRefreshResult,
    failCatalogRefreshResult,
    showCatalogRefreshLog,
    toggleCatalogRefreshLog,
  } = useSettingsCatalogRefreshResult();
  const {
    catalogRefreshElapsedSeconds,
    catalogRefreshPhase,
    catalogRefreshProgressMessage,
    catalogRefreshVendor,
    setCatalogRefreshPhase,
    setCatalogRefreshProgressMessage,
    setCatalogRefreshStartedAt,
    setCatalogRefreshVendor,
  } = useSettingsCatalogRefreshProgress({
    initialMessage: t("wishlist.refreshPreparing", "Preparing catalog refresh..."),
    tauri,
  });
  const {
    cancelPrinterEdit,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    expandedBambuDetailsPrinterId,
    setEditAmsUnits,
    setEditBambuLiveAccessCode,
    setEditBambuLiveEnabled,
    setEditBambuLiveHost,
    setEditBambuLivePrinterSerial,
    setEditPrinterModel,
    setEditPrinterName,
    setEditSlotsPerUnit,
    setExpandedBambuDetailsPrinterId,
    startPrinterEdit,
  } = useSettingsPrinterEditDraft();
  const {
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    diagnosticChartFieldByPrinterId,
    diagnosticFilterByPrinterId,
    diagnosticSortByPrinterId,
    ensureDiagnosticSession,
    setDiagnosticChartFieldByPrinterId,
    setDiagnosticFilterByPrinterId,
    setDiagnosticSortByPrinterId,
    toggleBambuLiveCapture,
  } = useSettingsBambuLiveDiagnostics({
    bambuLiveIntegrations,
    expandedBambuDetailsPrinterId,
  });
  const {
    editModelProfile,
    printerSlotsByPrinterId,
    sortedPrinters,
  } = useSettingsPrinterDerivedState({
    editPrinterModel,
    locale,
    printerOverview,
    printers,
  });
  const backupValidationHasWarnings = backupValidationState.hasWarnings;
  const backupValidationHasMissingTables = backupValidationState.hasMissingTables;
  const backupValidationHasExtraTables = backupValidationState.hasExtraTables;
  const hasValidatedFullBackup = backupValidationState.hasValidatedFullBackup;
  const hasValidatedLatestFullBackup = backupValidationState.hasValidatedLatestFullBackup;
  const librarySyncClientState = buildLibrarySyncClientState({
    mode: librarySyncSettings?.mode,
    hostBaseUrl: librarySyncSettings?.host_base_url,
    libraryId: librarySyncSettings?.library_id,
    clientAuthPaired: librarySyncSettings?.client_auth_paired,
    pairingChecked: librarySyncValidation?.pairing_checked,
    pairingValid: librarySyncValidation?.pairing_valid,
  });
  const librarySyncSavedMode = librarySyncClientState.savedMode;
  const settingsClientReadOnly = librarySyncClientState.readOnly;
  const settingsClientHostBaseUrl = librarySyncClientState.hostBaseUrl;
  const settingsClientLibraryId = librarySyncClientState.libraryId;
  const settingsClientHostWritePaired = librarySyncClientState.hostWritePaired;
  const settingsClientHostNeedsRepair = librarySyncClientState.hostNeedsRepair;
  const settingsClientHostPairingValid = librarySyncClientState.hostPairingValid;
  const {
    activeCatalogMasterCount,
    activeCatalogMaterialOptions,
    activeCatalogRefreshMaterials,
    missingSwatchMasters,
    swatchVendorOptions,
    visibleMissingSwatchMasters,
    visibleMissingSwatchVendorCount,
  } = useSettingsCatalogDerivedState({
    bambuRefreshMaterials,
    catalogMasters,
    catalogVendor,
    esunRefreshMaterials,
    swatchVendorFilter,
  });

  const { settingsPageChromeLabels, settingsPageMessageLabels } = useSettingsPageChrome(t);

  const { settingsTabButtons } = useSettingsPageTabs(activeTab, t);

  const { showTransientInfo } = useSettingsTransientInfo(setInfo);

  const {
    activeTrustedLanPairedBrowsers,
    revokedTrustedLanPairedBrowsers,
  } = useTrustedLanBrowserListModel({
    locale,
    t,
    trustedLanPairedBrowsers,
  });
  const {
    trustedLanHasPrivateInterfaces,
    trustedLanNetworkDirty,
    trustedLanSelectedInterfaceOption,
  } = useTrustedLanNetworkState({
    trustedLanInterfaceAddressDraft,
    trustedLanInterfaces,
    trustedLanPortDraft,
    trustedLanStatus,
  });

  useTrustedLanRevokedVisibility({
    revokedBrowserCount: revokedTrustedLanPairedBrowsers.length,
    setShowTrustedLanRevokedBrowsers,
  });

  useTrustedLanPairedBrowserRefSync({
    trustedLanPairedBrowsers,
    trustedLanPairedBrowsersRef,
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
    pendingLibraryRoleTarget,
  } = useSettingsLibraryRoleChange({
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

  const { confirmDeletePrinterId, setConfirmDeletePrinterId } =
    useSettingsPrinterDeleteConfirm({ printers });

  const { clearConfirmResetAction, confirmResetAction, setConfirmResetAction } =
    useSettingsResetConfirm();
  const {
    backupImportInputRef,
    backupValidateInputRef,
    handleOpenBackupValidate,
    handleOpenDataImport,
  } = useSettingsBackupFileInputs({
    busy,
    clearConfirmResetAction,
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
  const librarySyncRoleOptions = buildLibrarySyncRoleOptions({
    STANDALONE: t("settings.librarySyncStandalone", "Standalone"),
    HOST: t("settings.librarySyncHost", "Host"),
    CLIENT: t("settings.librarySyncClient", "Client"),
  });
  const librarySyncTabLabels = buildLibrarySyncTabLabels({
    title: t("settings.libraryTabTitle", "Library and web app"),
  });
  const libraryVisibility = buildLibrarySyncVisibilityState({
    draftMode: librarySyncModeDraft,
    trustedLanEnabledDraft,
    trustedLanStatusEnabled: Boolean(trustedLanStatus?.enabled),
    showTrustedLanNetworkEditor,
    hasTrustedLanPairingLink: Boolean(trustedLanPairingLink),
    pairedBrowserCount: trustedLanPairedBrowsers.length,
    lastCheckedAt: librarySyncSettings?.last_checked_at,
    lastReachableAt: librarySyncSettings?.last_reachable_at,
    lastValidationMessage: librarySyncSettings?.last_validation_message,
    hasSnapshot: Boolean(librarySyncSnapshot),
  });
  const roleChangeState = buildLibraryRoleChangeState({
    target: pendingLibraryRoleTarget,
    savedMode: librarySyncSavedMode,
    hasExportedFullBackup: Boolean(lastFullBackupExportedAt),
    hasImportedFullBackup: Boolean(lastFullBackupImportedAt),
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
  });
  const pageChromeLabels = settingsPageChromeLabels();

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{pageChromeLabels.title}</h1>
          <div className="page-subtitle">{pageChromeLabels.subtitle}</div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {pageChromeLabels.desktopOnly}
        </FeedbackBanner>
      ) : null}

      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}

      <div className="mt-6 rounded-lg border border-slate-300/50 bg-white/44 p-1.5 dark:border-slate-700/70 dark:bg-slate-950/24">
        <div className="flex flex-wrap gap-1.5">
          {settingsTabButtons.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={tabButtonClass(tab.active)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        {activeTab === "PRINTERS" ? (
          <SettingsPrintersTab
            bambuLiveIntegrations={bambuLiveIntegrations}
            busy={busy}
            confirmDeletePrinterId={confirmDeletePrinterId}
            diagnosticCaptureActiveByPrinterId={diagnosticCaptureActiveByPrinterId}
            diagnosticCaptureByPrinterId={diagnosticCaptureByPrinterId}
            diagnosticChartFieldByPrinterId={diagnosticChartFieldByPrinterId}
            diagnosticFilterByPrinterId={diagnosticFilterByPrinterId}
            diagnosticSortByPrinterId={diagnosticSortByPrinterId}
            editAmsUnits={editAmsUnits}
            editBambuLiveAccessCode={editBambuLiveAccessCode}
            editBambuLiveEnabled={editBambuLiveEnabled}
            editBambuLiveHost={editBambuLiveHost}
            editBambuLivePrinterSerial={editBambuLivePrinterSerial}
            editModelProfile={editModelProfile}
            editPrinterId={editPrinterId}
            editPrinterModel={editPrinterModel}
            editPrinterName={editPrinterName}
            editSlotsPerUnit={editSlotsPerUnit}
            expandedBambuDetailsPrinterId={expandedBambuDetailsPrinterId}
            loading={loading}
            printerSlotsByPrinterId={printerSlotsByPrinterId}
            printers={printers}
            settingsClientReadOnly={settingsClientReadOnly}
            sortedPrinters={sortedPrinters}
            spoolRows={spoolRows}
            tauri={tauri}
            onBambuLiveAccessCodeChange={setEditBambuLiveAccessCode}
            onBambuLiveEnabledChange={setEditBambuLiveEnabled}
            onBambuLiveHostChange={setEditBambuLiveHost}
            onBambuLivePrinterSerialChange={setEditBambuLivePrinterSerial}
            onCancelEditPrinter={handleCancelEditPrinter}
            onCopyError={setError}
            onCopySuccess={setInfo}
            onDeletePrinter={(printer) => void handleDeletePrinter(printer)}
            onDiagnosticChartFieldChange={setDiagnosticChartFieldByPrinterId}
            onDiagnosticFilterChange={setDiagnosticFilterByPrinterId}
            onDiagnosticSortChange={setDiagnosticSortByPrinterId}
            onEditAmsUnitsChange={setEditAmsUnits}
            onEditPrinterModelChange={setEditPrinterModel}
            onEditPrinterNameChange={setEditPrinterName}
            onEditSlotsPerUnitChange={setEditSlotsPerUnit}
            onSavePrinterReconfigure={() => void handleSavePrinterReconfigure()}
            onStartEditPrinter={handleStartEditPrinter}
            onToggleBambuLiveCapture={handleToggleBambuLiveCapture}
            onToggleBambuLiveDetails={handleToggleBambuLiveDetails}
          />
        ) : null}

        {activeTab === "GENERAL" ? (
          <SettingsGeneralTab
            appVersion={appVersion}
            busy={busy}
            locale={locale}
            tauri={tauri}
            themeMode={themeMode}
            t={t}
            onLocaleSelection={handleLocaleSelection}
            onPrintInventoryOverviewA4={() => void handlePrintInventoryOverviewA4()}
            onThemeSelection={handleThemeSelection}
          />
        ) : null}

        {activeTab === "LIBRARY" ? (
          <>
            <section className="surface-card xl:col-span-2 space-y-4">
              <div className="section-eyebrow">{librarySyncTabLabels.title}</div>

              <div className="surface-subtle space-y-5 p-4">
                <SettingsLibraryRolePanel
                  librarySyncBusy={librarySyncBusy}
                  librarySyncDeviceNameDraft={librarySyncDeviceNameDraft}
                  librarySyncModeDraft={librarySyncModeDraft}
                  librarySyncRoleOptions={librarySyncRoleOptions}
                  librarySyncSettings={librarySyncSettings}
                  libraryVisibility={libraryVisibility}
                  tauri={tauri}
                  t={t}
                  onDeviceNameChange={setLibrarySyncDeviceNameDraft}
                  onRequestLibraryRoleChange={handleRequestLibraryRoleChange}
                />

                <SettingsLibraryWebappControl
                  librarySyncModeDraft={librarySyncModeDraft}
                  tauri={tauri}
                  trustedLanActionBusy={trustedLanActionBusy}
                  trustedLanEnabledDraft={trustedLanEnabledDraft}
                  trustedLanHasPrivateInterfaces={trustedLanHasPrivateInterfaces}
                  trustedLanStatus={trustedLanStatus}
                  t={t}
                  onToggleTrustedLanEnabled={(nextEnabled) =>
                    void handleToggleTrustedLanEnabled(nextEnabled)
                  }
                />

                {librarySyncModeDraft !== "CLIENT" && libraryVisibility.showWebappDetails ? (
                  <SettingsTrustedLanServerPanel
                    actionBusy={trustedLanActionBusy}
                    companionModel={trustedLanCompanionModel}
                    interfaceAddressDraft={trustedLanInterfaceAddressDraft}
                    interfaces={trustedLanInterfaces}
                    networkDirty={trustedLanNetworkDirty}
                    portDraft={trustedLanPortDraft}
                    showNetworkEditor={showTrustedLanNetworkEditor}
                    showNetworkSummary={showTrustedLanNetworkSummary}
                    tauri={tauri}
                    t={t}
                    onInterfaceAddressChange={setTrustedLanInterfaceAddressDraft}
                    onPortChange={setTrustedLanPortDraft}
                    onSaveNetwork={() => void handleSaveTrustedLanConfig()}
                    onToggleNetworkEditor={() =>
                      setShowTrustedLanNetworkEditor((value) => !value)
                    }
                    onToggleNetworkSummary={() =>
                      setShowTrustedLanNetworkSummary((value) => !value)
                    }
                  />
                ) : null}

                {librarySyncModeDraft === "CLIENT" ? (
                  <SettingsLibraryClientPanel
                    librarySyncBusy={librarySyncBusy}
                    librarySyncDeviceNameDraft={librarySyncDeviceNameDraft}
                    librarySyncHostBaseUrlDraft={librarySyncHostBaseUrlDraft}
                    librarySyncPairingDraft={librarySyncPairingDraft}
                    librarySyncSettings={librarySyncSettings}
                    librarySyncSnapshot={librarySyncSnapshot}
                    librarySyncSnapshotBusy={librarySyncSnapshotBusy}
                    librarySyncValidation={librarySyncValidation}
                    librarySyncValidationBusy={librarySyncValidationBusy}
                    libraryVisibility={libraryVisibility}
                    locale={locale}
                    settingsClientHostBaseUrl={settingsClientHostBaseUrl}
                    settingsClientHostNeedsRepair={settingsClientHostNeedsRepair}
                    settingsClientHostPairingValid={settingsClientHostPairingValid}
                    settingsClientHostWritePaired={settingsClientHostWritePaired}
                    showLibraryClientAdvanced={showLibraryClientAdvanced}
                    tauri={tauri}
                    t={t}
                    onClearClientAuth={() => void handleClearLibrarySyncClientAuth()}
                    onDeviceNameChange={setLibrarySyncDeviceNameDraft}
                    onFetchSnapshot={() => void handleFetchLibrarySyncSnapshot()}
                    onPairHost={() => void handlePairLibrarySyncHost()}
                    onPairingDraftChange={setLibrarySyncPairingDraft}
                    onRenewClientAuth={() => void handleRenewLibrarySyncClientAuth()}
                    onToggleAdvanced={() => setShowLibraryClientAdvanced((value) => !value)}
                  />
                ) : null}

              </div>

              {librarySyncModeDraft !== "CLIENT" ? (
                <SettingsTrustedLanPairingPanel
                  actionBusy={trustedLanActionBusy}
                  browserLabelDraft={trustedLanPairingBrowserLabelDraft}
                  locale={locale}
                  pairActionDisabled={trustedLanCompanionModel.pairActionDisabled}
                  pairingExpiresAtMs={trustedLanPairingExpiresAtMs}
                  pairingLabel={trustedLanPairingLabel}
                  pairingLink={trustedLanPairingLink}
                  pairingQrBusy={trustedLanPairingQrBusy}
                  pairingQrDataUrl={trustedLanPairingQrDataUrl}
                  pairingQrUnavailable={trustedLanPairingQrUnavailable}
                  t={t}
                  onBrowserLabelChange={setTrustedLanPairingBrowserLabelDraft}
                  onCopyPairingLink={() => void handleCopyTrustedLanPairingLink()}
                  onCreatePairingLink={() => void handleCreateTrustedLanPairingLink()}
                />
              ) : null}

              {librarySyncModeDraft !== "CLIENT" ? (
                <SettingsTrustedLanBrowsersPanel
                  activeBrowsers={activeTrustedLanPairedBrowsers}
                  actionBusy={trustedLanActionBusy}
                  revokedBrowsers={revokedTrustedLanPairedBrowsers}
                  showRevokedBrowsers={showTrustedLanRevokedBrowsers}
                  t={t}
                  totalBrowserCount={trustedLanPairedBrowsers.length}
                  onRevokeAllBrowsers={() => void handleRevokeAllTrustedLanBrowsers()}
                  onRevokeBrowser={(browserId) => void handleRevokeTrustedLanBrowser(browserId)}
                  onToggleRevokedBrowsers={() =>
                    setShowTrustedLanRevokedBrowsers((value) => !value)
                  }
                />
              ) : null}
            </section>
          </>
        ) : null}

        {activeTab === "CATALOG" ? (
          <section className="surface-card xl:col-span-2">
            <div className="text-sm text-slate-700 dark:text-slate-300">
              {t(
                "settings.catalogTabHelp",
                "Catalog updates are performed here. Inventory add-flow uses the local catalogue managed on this page.",
              )}
            </div>

            <SettingsCatalogRefreshPanel
              activeCatalogMasterCount={activeCatalogMasterCount}
              activeCatalogMaterialOptions={activeCatalogMaterialOptions}
              activeCatalogRefreshMaterials={activeCatalogRefreshMaterials}
              busy={busy}
              catalogCount={catalogMasters.length}
              catalogRefreshBusy={catalogRefreshBusy}
              catalogRefreshElapsedSeconds={catalogRefreshElapsedSeconds}
              catalogRefreshLog={catalogRefreshLog}
              catalogRefreshPhase={catalogRefreshPhase}
              catalogRefreshProgressMessage={catalogRefreshProgressMessage}
              catalogRefreshSummary={catalogRefreshSummary}
              catalogRefreshVendor={catalogRefreshVendor}
              catalogVendor={catalogVendor}
              showCatalogRefreshLog={showCatalogRefreshLog}
              swatchBusy={swatchBusy}
              tauri={tauri}
              t={t}
              onClearCatalogRefreshMaterials={clearCatalogRefreshMaterials}
              onRefreshVendorCatalog={(vendor) => void handleRefreshVendorCatalog(vendor)}
              onSetCatalogVendor={setCatalogVendor}
              onToggleCatalogRefreshLog={toggleCatalogRefreshLog}
              onToggleCatalogRefreshMaterial={toggleCatalogRefreshMaterial}
            />

            <SettingsMissingSwatchesPanel
              busy={busy}
              catalogRefreshBusy={catalogRefreshBusy}
              confirmBulkSwatch={confirmBulkSwatch}
              missingSwatchCount={missingSwatchMasters.length}
              swatchBusy={swatchBusy}
              swatchDraftById={swatchDraftById}
              swatchVendorFilter={swatchVendorFilter}
              swatchVendorOptions={swatchVendorOptions}
              tauri={tauri}
              t={t}
              visibleMissingSwatchMasters={visibleMissingSwatchMasters}
              visibleMissingSwatchVendorCount={visibleMissingSwatchVendorCount}
              onBulkAutoFill={() => void handleBulkAutoFillMissingSwatches()}
              onRefresh={() => void reloadSettings()}
              onSaveMissingSwatch={(master) => void handleSaveMissingSwatch(master)}
              onSwatchDraftChange={updateSwatchDraft}
              onVendorFilterChange={setSwatchVendorFilter}
            />
          </section>
        ) : null}

        {activeTab === "MAINTENANCE" ? (
          <SettingsMaintenanceTab
            backupImportInputRef={backupImportInputRef}
            backupValidateInputRef={backupValidateInputRef}
            backupValidationHasExtraTables={backupValidationHasExtraTables}
            backupValidationHasMissingTables={backupValidationHasMissingTables}
            backupValidationHasWarnings={backupValidationHasWarnings}
            busy={busy}
            catalogCount={catalogMasters.length}
            confirmResetAction={confirmResetAction}
            lastBackupValidation={lastBackupValidation}
            lastCatalogReset={lastCatalogReset}
            missingSwatchCount={missingSwatchMasters.length}
            printerCount={printers.length}
            tauri={tauri}
            t={t}
            onExportFullBackup={() => void handleExportFullBackup()}
            onExportInventoryCsv={() => void handleExportInventoryCsv()}
            onExportInventoryJson={() => void handleExportInventoryJson()}
            onImportDataFile={(event) => void handleImportDataFile(event)}
            onOpenBackupValidate={handleOpenBackupValidate}
            onOpenDataImport={handleOpenDataImport}
            onResetAppData={() => void handleResetAppData()}
            onResetCatalogs={() => void handleResetCatalogs()}
            onValidateBackupFile={(event) => void handleValidateBackupFile(event)}
          />
        ) : null}
      </div>
      <SettingsLibraryRoleModal
        busy={busy}
        lastFullBackupExportedAt={lastFullBackupExportedAt}
        lastFullBackupImportedAt={lastFullBackupImportedAt}
        lastFullBackupValidatedAt={lastFullBackupValidatedAt}
        libraryRoleConfirmArmed={libraryRoleConfirmArmed}
        librarySyncBusy={librarySyncBusy}
        librarySyncSettings={librarySyncSettings}
        locale={locale}
        roleChangeState={roleChangeState}
        tauri={tauri}
        t={t}
        onClose={closeLibraryRoleChangeModal}
        onConfirm={() => void handleConfirmLibraryRoleChange()}
        onExportFullBackup={() => void handleExportFullBackup()}
        onOpenBackupValidate={handleOpenBackupValidate}
        onOpenDataImport={handleOpenDataImport}
      />
    </div>
  );
}
