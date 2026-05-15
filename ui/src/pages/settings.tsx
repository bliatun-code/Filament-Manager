import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SettingsTabKey } from "../App";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import {
  importDataFile,
  isTauri,
  refreshBambuCatalog,
  refreshEsunCatalog,
  updateMasterCatalogEntry,
  validateFullBackupJson,
  type BambuLiveIntegrationEntry,
  type CatalogResetStats,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type PrinterRow,
  type SpoolWithMasterRow,
  type TrustedLanInterfaceOption,
  type TrustedLanPairedBrowser,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { useI18n } from "../lib/i18n";
import { toErrorMessage } from "../lib/error_text";
import { SettingsGeneralTab } from "../components/settings_general_tab";
import { SettingsLibraryRoleModal } from "../components/settings_library_role_modal";
import { SettingsMaintenanceTab } from "../components/settings_maintenance_tab";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
import { SettingsPrintersTab } from "../components/settings_printers_tab";
import { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";
import { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";
import { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";
import { tabButtonClass } from "../lib/settings_ui_classes";
import {
  resolvePrinterModelProfile,
} from "../lib/printer_profiles";
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
import { useSettingsCatalogRefreshResult } from "./use_settings_catalog_refresh_result";
import { useSettingsCatalogRefreshProgress } from "./use_settings_catalog_refresh_progress";
import { useSettingsBambuLiveDiagnostics } from "./use_settings_bambu_live_diagnostics";
import { useSettingsBackupFileInputs } from "./use_settings_backup_file_inputs";
import { useSettingsBackupValidationState } from "./use_settings_backup_validation_state";
import { useSettingsCatalogRefreshMaterials } from "./use_settings_catalog_refresh_materials";
import { useSettingsPrinterEditDraft } from "./use_settings_printer_edit_draft";
import { useSettingsPrinterActions } from "./use_settings_printer_actions";
import { useSettingsPrinterDeleteConfirm } from "./use_settings_printer_delete_confirm";
import {
  useSettingsResetConfirm,
  type SettingsResetConfirmAction,
} from "./use_settings_reset_confirm";
import { useSettingsSwatchConfirm } from "./use_settings_swatch_confirm";
import { useSettingsSwatchDrafts } from "./use_settings_swatch_drafts";
import { useSettingsPageChrome } from "./use_settings_page_chrome";
import { useSettingsPageReload } from "./use_settings_page_reload";
import { useSettingsPageTabs } from "./use_settings_page_tabs";
import { useSettingsPreferenceActions } from "./use_settings_preference_actions";
import { useSettingsMaintenanceActions } from "./use_settings_maintenance_actions";
import { useSettingsBackupExportActions } from "./use_settings_backup_export_actions";
import { useSettingsInventoryPrintAction } from "./use_settings_inventory_print_action";
import { useSettingsInventoryRowsLoader } from "./use_settings_inventory_rows_loader";
import { useSettingsLibrarySyncState } from "./use_settings_library_sync_state";
import { useSettingsLibrarySyncMessages } from "./use_settings_library_sync_messages";
import { useSettingsLibrarySyncActions } from "./use_settings_library_sync_actions";
import { useSettingsLibraryRoleChange } from "./use_settings_library_role_change";
import { useSettingsLibraryAutoValidation } from "./use_settings_library_auto_validation";
import { useSettingsTrustedLanMessages } from "./use_settings_trusted_lan_messages";
import { useSettingsSilentReload } from "./use_settings_silent_reload";
import { useSettingsThemeMode } from "./use_settings_theme_mode";
import { useSettingsTransientInfo } from "./use_settings_transient_info";
import { useTrustedLanBrowserPolling } from "./use_trusted_lan_browser_polling";
import { useTrustedLanBrowserListModel } from "./use_trusted_lan_browser_list_model";
import { useTrustedLanDraftSync } from "./use_trusted_lan_draft_sync";
import { useTrustedLanPairingActions } from "./use_trusted_lan_pairing_actions";
import { useTrustedLanStatusActions } from "./use_trusted_lan_status_actions";
import { useTrustedLanRevokedVisibility } from "./use_trusted_lan_revoked_visibility";
import {
  useTrustedLanNetworkState,
} from "./use_trusted_lan_network_state";
import { useTrustedLanPairingQr } from "./use_trusted_lan_pairing_qr";
import {
  buildSettingsBackupErrorMessage,
  buildSettingsBackupValidationSuccessMessage,
  buildSettingsImportSuccessMessage,
  resolveSettingsFullBackupImportedAt,
  shouldPrepareImportedFullBackupAsHost,
} from "./settings_backup_model";
import {
  buildSettingsCatalogRefreshSuccessMessage,
  buildSettingsCatalogRefreshFallbackErrorMessage,
  buildSettingsCatalogRefreshPreparingMessage,
  buildSettingsCatalogRefreshZeroImportMessage,
  buildSettingsCatalogState,
  buildSettingsNoMissingSwatchesMessage,
  buildSettingsSwatchBulkConfirmMessage,
  buildSettingsSwatchBulkResultMessage,
  buildSettingsSwatchErrorMessage,
  buildSettingsSwatchSavedMessage,
  resolveSettingsSwatchHex,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";
import {
  buildPrinterSlotsByPrinterId,
  sortSettingsPrinters,
} from "./settings_printer_model";

type ResetConfirmAction = SettingsResetConfirmAction;
type CatalogVendor = SettingsCatalogVendor;
type SettingsPageProps = {
  initialTab?: SettingsTabKey;
};

export default function SettingsPage({ initialTab = "GENERAL" }: SettingsPageProps) {
  const tauri = isTauri();
  const { locale, setLocale, t } = useI18n();
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
  const [trustedLanStatus, setTrustedLanStatus] = useState<TrustedLanCompanionStatus | null>(
    null,
  );
  const [trustedLanInterfaces, setTrustedLanInterfaces] = useState<TrustedLanInterfaceOption[]>(
    [],
  );
  const [trustedLanPairedBrowsers, setTrustedLanPairedBrowsers] = useState<
    TrustedLanPairedBrowser[]
  >([]);
  const [trustedLanLoading, setTrustedLanLoading] = useState(tauri);
  const [trustedLanActionBusy, setTrustedLanActionBusy] = useState(false);
  const [trustedLanEnabledDraft, setTrustedLanEnabledDraft] = useState(false);
  const [trustedLanInterfaceAddressDraft, setTrustedLanInterfaceAddressDraft] = useState("");
  const [trustedLanPortDraft, setTrustedLanPortDraft] = useState("4278");
  const [showTrustedLanNetworkSummary, setShowTrustedLanNetworkSummary] = useState(false);
  const [showTrustedLanNetworkEditor, setShowTrustedLanNetworkEditor] = useState(false);
  const [showLibraryClientAdvanced, setShowLibraryClientAdvanced] = useState(false);
  const [trustedLanPairingBrowserLabelDraft, setTrustedLanPairingBrowserLabelDraft] = useState("");
  const [trustedLanPairingLink, setTrustedLanPairingLink] = useState<string | null>(null);
  const [trustedLanPairingLabel, setTrustedLanPairingLabel] = useState<string | null>(null);
  const [trustedLanPairingExpiresAtMs, setTrustedLanPairingExpiresAtMs] = useState<number | null>(
    null,
  );
  const {
    pairingQrBusy: trustedLanPairingQrBusy,
    pairingQrDataUrl: trustedLanPairingQrDataUrl,
    pairingQrUnavailable: trustedLanPairingQrUnavailable,
  } = useTrustedLanPairingQr(trustedLanPairingLink);
  const [showTrustedLanRevokedBrowsers, setShowTrustedLanRevokedBrowsers] = useState(false);
  const trustedLanPairedBrowsersRef = useRef<TrustedLanPairedBrowser[]>([]);
  const trustedLanPairedBrowsersRefreshInFlightRef = useRef(false);

  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<SpoolWithMasterRow[]>([]);
  const [catalogMasters, setCatalogMasters] = useState<MasterCatalogRow[]>([]);
  const { setSwatchDraftById, swatchDraftById, updateSwatchDraft } =
    useSettingsSwatchDrafts();
  const [swatchVendorFilter, setSwatchVendorFilter] = useState("ALL");
  const [swatchBusy, setSwatchBusy] = useState(false);
  const [confirmBulkSwatch, setConfirmBulkSwatch] = useState(false);
  const {
    bambuRefreshMaterials,
    catalogVendor,
    clearCatalogRefreshMaterials,
    esunRefreshMaterials,
    getCatalogRefreshMaterials,
    setCatalogVendor,
    toggleCatalogRefreshMaterial,
  } = useSettingsCatalogRefreshMaterials();
  const [catalogRefreshBusy, setCatalogRefreshBusy] = useState(false);
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
  const [lastCatalogReset, setLastCatalogReset] = useState<CatalogResetStats | null>(
    null,
  );

  const [confirmDeletePrinterId, setConfirmDeletePrinterId] = useState<string | null>(
    null,
  );
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationEntry["config"]>
  >({});
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
  const [confirmResetAction, setConfirmResetAction] = useState<ResetConfirmAction | null>(null);

  const sortedPrinters = useMemo(
    () => sortSettingsPrinters(printers, locale),
    [locale, printers],
  );
  const printerSlotsByPrinterId = useMemo(
    () => buildPrinterSlotsByPrinterId(printerOverview),
    [printerOverview],
  );

  const editModelProfile = useMemo(
    () => resolvePrinterModelProfile(editPrinterModel || ""),
    [editPrinterModel],
  );
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
  const catalogState = useMemo(
    () =>
      buildSettingsCatalogState({
        bambuRefreshMaterials,
        catalogMasters,
        catalogVendor,
        esunRefreshMaterials,
        swatchVendorFilter,
      }),
    [
      bambuRefreshMaterials,
      catalogMasters,
      catalogVendor,
      esunRefreshMaterials,
      swatchVendorFilter,
    ],
  );
  const missingSwatchMasters = catalogState.missingSwatchMasters;
  const visibleMissingSwatchMasters = catalogState.visibleMissingSwatchMasters;

  const { settingsPageChromeLabels, settingsPageMessageLabels } = useSettingsPageChrome(t);

  const { settingsTabButtons } = useSettingsPageTabs(activeTab, t);

  const { showTransientInfo } = useSettingsTransientInfo(setInfo);

  const swatchVendorOptions = catalogState.swatchVendorOptions;
  const activeCatalogMaterialOptions = catalogState.activeCatalogMaterialOptions;
  const activeCatalogRefreshMaterials = catalogState.activeCatalogRefreshMaterials;
  const activeCatalogMasterCount = catalogState.activeCatalogMasterCount;
  const visibleMissingSwatchVendorCount = catalogState.visibleMissingSwatchVendorCount;
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

  useEffect(() => {
    trustedLanPairedBrowsersRef.current = trustedLanPairedBrowsers;
  }, [trustedLanPairedBrowsers]);

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

  function handleToggleBambuLiveDetails(printerId: string) {
    setExpandedBambuDetailsPrinterId((currentExpanded) => {
      const nextExpanded = currentExpanded === printerId ? null : printerId;
      if (nextExpanded !== printerId) {
        return nextExpanded;
      }
      ensureDiagnosticSession(printerId);

      return nextExpanded;
    });
  }

  function handleToggleBambuLiveCapture(printerId: string, captureActive: boolean) {
    toggleBambuLiveCapture(printerId, captureActive);
  }

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

  useEffect(() => {
    if (!tauri) {
      return;
    }
    void reloadSettings();
    void loadTrustedLanCompanionStatus();
  }, [loadTrustedLanCompanionStatus, reloadSettings, tauri]);

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

  useSettingsPrinterDeleteConfirm({
    confirmDeletePrinterId,
    printers,
    setConfirmDeletePrinterId,
  });

  const { clearConfirmResetAction } = useSettingsResetConfirm({
    confirmResetAction,
    setConfirmResetAction,
  });
  const {
    backupImportInputRef,
    backupValidateInputRef,
    openBackupValidate,
    openDataImport,
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

  function settingsPrinterMessageLabels() {
    return {
      bambuLiveFieldsRequired: t(
        "settings.error.bambuLiveFieldsRequired",
        "Host, access code and printer serial are required when live Bambu status is enabled.",
      ),
      confirmDeleteTapAgain: t(
        "settings.confirmDeleteTapAgain",
        "Click Remove again to confirm deleting printer",
      ),
      deletePrinterFailed: t("settings.error.deletePrinter", "Failed to delete printer."),
      printerRequired: t("settings.error.printerRequired", "Printer name and model are required."),
      removedPrinter: t("settings.removedPrinter", "Removed printer"),
      updatePrinterFailed: t("settings.error.updatePrinter", "Failed to update printer."),
      updatedPrinter: t("settings.updatedPrinter", "Updated printer"),
      writeRequiresPairing: t(
        "settings.error.librarySyncPrinterWriteRequiresPairing",
        "Pair this desktop client with the host before changing printers.",
      ),
    };
  }

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

  function settingsCatalogResetMessageLabels() {
    return {
      catalogResetDone: t("settings.catalogResetDone", "Catalog reset done"),
      reactivated: t("settings.reactivated", "reactivated"),
      remaining: t("settings.remaining", "remaining"),
      removed: t("settings.removed", "Removed"),
    };
  }

  function settingsMaintenanceResetMessageLabels() {
    return {
      appResetDone: t("settings.resetDone", "App data reset completed."),
      confirmResetAppTapAgain: t(
        "settings.confirmResetAppTapAgain",
        "Click Reset app data again to confirm.",
      ),
      confirmResetCatalogsTapAgain: t(
        "settings.confirmResetCatalogsTapAgain",
        "Click Reset catalogs again to confirm.",
      ),
      resetAppFailed: t("settings.error.resetApp", "Failed to reset app data."),
      resetCatalogsFailed: t("settings.error.resetCatalogs", "Failed to reset catalogs."),
    };
  }

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

  function settingsInventoryExportMessageLabels() {
    return {
      inventoryCsvExported: t("settings.inventoryCsvExported", "Inventory CSV exported."),
      inventoryJsonExported: t("settings.inventoryJsonExported", "Inventory JSON exported."),
    };
  }

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

  function settingsInventoryOverviewPrintMessageLabels() {
    return {
      inventoryOverviewPrintFailed: t(
        "settings.error.inventoryOverviewPrint",
        "Failed to print inventory overview.",
      ),
      inventoryOverviewPrintDone: t(
        "settings.inventoryOverviewPrintDone",
        "A4 inventory overview PDF opened for printing.",
      ),
    };
  }

  function settingsInventoryPrintLabels() {
    return {
      borrowedIn: t("inventory.borrowedIn", "Borrowed in"),
      unknown: t("common.unknown", "Unknown"),
    };
  }

  function settingsInventoryOverviewPrintPdfLabels() {
    return {
      title: t("settings.inventoryOverviewPrintTitle", "In-stock filament overview"),
      generatedAt: t("settings.inventoryOverviewPrintGeneratedAt", "Generated"),
      groupMaterial: t("settings.inventoryOverviewPrintGroupMaterial", "Material group"),
      empty: t("settings.inventoryOverviewPrintEmpty", "No filament in stock."),
      vendor: t("settings.inventoryOverviewPrintVendor", "Vendor"),
      material: t("settings.inventoryOverviewPrintMaterial", "Material"),
      filament: t("settings.inventoryOverviewPrintFilament", "Filament"),
      homeLocation: t("inventory.homeLocationLabel", "Home location"),
      reference: t("settings.inventoryOverviewPrintReference", "Reference"),
    };
  }

  function handleOpenDataImport() {
    openDataImport();
  }

  function handleOpenBackupValidate() {
    openBackupValidate();
  }

  async function handleImportDataFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tauri || busy) {
      return;
    }
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      const result = await importDataFile(content);
      setLastCatalogReset(null);
      clearBackupValidation();
      await reloadSettings();
      const fullBackupImportedAt = resolveSettingsFullBackupImportedAt({
        detectedFormat: result.detected_format,
        importedAt: new Date().toISOString(),
      });
      if (fullBackupImportedAt) {
        recordImportedFullBackup(fullBackupImportedAt);
        if (shouldPrepareImportedFullBackupAsHost({
          detectedFormat: result.detected_format,
          librarySyncMode: librarySyncModeDraft,
        })) {
          setLibrarySyncModeDraft("HOST");
          setLibrarySyncHostBaseUrlDraft("");
          setLibrarySyncValidation(null);
          setLibrarySyncSnapshot(null);
          setActiveTab("GENERAL");
          setInfo(buildSettingsImportSuccessMessage({
            importedOnClient: true,
            labels: settingsImportMessageLabels(),
            result,
          }));
          return;
        }
        setInfo(buildSettingsImportSuccessMessage({
          importedOnClient: false,
          labels: settingsImportMessageLabels(),
          result,
        }));
      } else {
        setInfo(buildSettingsImportSuccessMessage({
          importedOnClient: false,
          labels: settingsImportMessageLabels(),
          result,
        }));
      }
    } catch (importError) {
      console.error(importError);
      setError(
        toErrorMessage(
          importError,
          buildSettingsBackupErrorMessage("importDataFailed", settingsBackupErrorMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function settingsImportMessageLabels() {
    return {
      backupImported: t("settings.backupImported", "Full backup imported successfully."),
      created: t("settings.created", "created"),
      importDetectedInventoryCsv: t("settings.importDetectedInventoryCsv", "Inventory CSV"),
      importDetectedInventoryJson: t("settings.importDetectedInventoryJson", "Inventory JSON"),
      importSource: t("settings.importSource", "Source"),
      inventoryImportDone: t("settings.inventoryImportDone", "Inventory import completed."),
      librarySyncImportedOnClientHint: t(
        "settings.librarySyncImportedOnClientHint",
        "This device is now prepared as the next host. Review Library roles and save when ready to take over.",
      ),
      rows: t("settings.validationRows", "Rows"),
      updated: t("settings.updated", "updated"),
    };
  }

  async function handleValidateBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      const summary = await validateFullBackupJson(content);
      recordBackupValidation(summary, new Date().toISOString());
      setInfo(buildSettingsBackupValidationSuccessMessage(settingsBackupValidationMessageLabels()));
    } catch (validationError) {
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          buildSettingsBackupErrorMessage(
            "validateBackupFailed",
            settingsBackupErrorMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function settingsBackupValidationMessageLabels() {
    return {
      backupValidationDone: t("settings.backupValidationDone", "Backup validation completed."),
    };
  }

  function settingsBackupErrorMessageLabels() {
    return {
      exportBackupFailed: t("settings.error.exportBackup", "Failed to export full backup."),
      exportInventoryCsvFailed: t(
        "settings.error.exportInventoryCsv",
        "Failed to export inventory CSV.",
      ),
      exportInventoryJsonFailed: t(
        "settings.error.exportInventoryJson",
        "Failed to export inventory JSON.",
      ),
      importDataFailed: t("settings.error.importData", "Failed to import selected file."),
      validateBackupFailed: t(
        "settings.error.validateBackup",
        "Failed to validate backup file.",
      ),
    };
  }

  async function handleRefreshVendorCatalog(vendor: CatalogVendor) {
    if (!tauri || busy || swatchBusy || catalogRefreshBusy) {
      return;
    }
    const materialTypes = getCatalogRefreshMaterials(vendor);
    setCatalogRefreshVendor(vendor);
    setCatalogRefreshPhase("PREPARE");
    setCatalogRefreshProgressMessage(
      buildSettingsCatalogRefreshPreparingMessage(vendor, settingsCatalogRefreshMessageLabels()),
    );
    setCatalogRefreshStartedAt(Date.now());
    setCatalogRefreshBusy(true);
    beginCatalogRefreshResult();
    setError(null);
    setInfo(null);
    try {
      const summary =
        vendor === "Bambu"
          ? await refreshBambuCatalog(materialTypes)
          : await refreshEsunCatalog(materialTypes);
      completeCatalogRefreshResult(summary);
      await reloadSettings();
      if (summary.imported === 0) {
        setError(
          buildSettingsCatalogRefreshZeroImportMessage(
            vendor,
            settingsCatalogRefreshMessageLabels(),
          ),
        );
      } else {
        setInfo(
          buildSettingsCatalogRefreshSuccessMessage(summary, settingsCatalogRefreshSummaryLabels()),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const fallbackMessage = buildSettingsCatalogRefreshFallbackErrorMessage(
        vendor,
        settingsCatalogRefreshMessageLabels(),
      );
      const message = toErrorMessage(refreshError, fallbackMessage);
      failCatalogRefreshResult(message);
      setError(
        message,
      );
    } finally {
      setCatalogRefreshBusy(false);
      setCatalogRefreshStartedAt(null);
    }
  }

  function settingsCatalogRefreshMessageLabels() {
    return {
      refreshBambuFailed: t("wishlist.error.refreshBambu", "Catalog refresh failed."),
      refreshEsunFailed: t("wishlist.error.refreshEsun", "eSUN catalog refresh failed."),
      refreshPreparingBambu: t(
        "wishlist.refreshPreparingBambu",
        "Preparing Bambu catalog refresh...",
      ),
      refreshPreparingEsun: t(
        "wishlist.refreshPreparingEsun",
        "Preparing eSUN catalog refresh...",
      ),
      zeroBambu: t(
        "wishlist.error.zeroBambu",
        "Refresh completed with 0 imported rows. The store may be rate-limited or changed.",
      ),
      zeroEsun: t(
        "wishlist.error.zeroEsun",
        "eSUN refresh completed with 0 imported rows. Store format may have changed.",
      ),
    };
  }

  function settingsCatalogRefreshSummaryLabels() {
    return {
      discontinued: t("inventory.discontinued", "Discontinued"),
      imported: t("inventory.imported", "Imported"),
      reactivated: t("inventory.reactivated", "Reactivated"),
    };
  }

  function settingsSwatchErrorMessageLabels() {
    return {
      invalidSwatchHex: t(
        "settings.error.invalidSwatchHex",
        "Invalid swatch hex value. Use #RGB or #RRGGBB.",
      ),
      saveSwatchFailed: t(
        "settings.error.saveSwatch",
        "Failed to save swatch for selected filament.",
      ),
    };
  }

  async function handleSaveMissingSwatch(master: MasterCatalogRow) {
    if (!tauri || busy || swatchBusy) {
      return;
    }
    const normalizedHex = resolveSettingsSwatchHex({ master, swatchDraftById });
    if (!normalizedHex) {
      setError(
        buildSettingsSwatchErrorMessage("invalidSwatchHex", settingsSwatchErrorMessageLabels()),
      );
      return;
    }
    setSwatchBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateMasterCatalogEntry({
        master_id: master.id,
        vendor: master.vendor,
        material: master.material,
        filament_name: master.filament_name,
        color_name: master.color_name,
        hex_color: normalizedHex,
        product_url: master.product_url ?? null,
        default_weight: master.default_weight,
      });
      setInfo(
        buildSettingsSwatchSavedMessage(
          formatFilamentDisplayTitle(master.material, master.filament_name, master.color_name),
          settingsSwatchSavedMessageLabels(),
        ),
      );
      await reloadSettings();
    } catch (saveError) {
      console.error(saveError);
      setError(
        buildSettingsSwatchErrorMessage("saveSwatchFailed", settingsSwatchErrorMessageLabels()),
      );
    } finally {
      setSwatchBusy(false);
    }
  }

  async function handleBulkAutoFillMissingSwatches() {
    if (!tauri || busy || swatchBusy) {
      return;
    }
    const targets = visibleMissingSwatchMasters;
    if (targets.length === 0) {
      clearConfirmBulkSwatch();
      setInfo(buildSettingsNoMissingSwatchesMessage(settingsSwatchBulkMessageLabels()));
      return;
    }
    if (!confirmBulkSwatch) {
      setError(null);
      setConfirmBulkSwatch(true);
      setInfo(buildSettingsSwatchBulkConfirmMessage(settingsSwatchBulkMessageLabels()));
      return;
    }
    clearConfirmBulkSwatch();
    setSwatchBusy(true);
    setError(null);
    setInfo(null);
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    try {
      for (const master of targets) {
        const normalizedHex = resolveSettingsSwatchHex({ master, swatchDraftById });
        if (!normalizedHex) {
          skipped += 1;
          continue;
        }
        try {
          await updateMasterCatalogEntry({
            master_id: master.id,
            vendor: master.vendor,
            material: master.material,
            filament_name: master.filament_name,
            color_name: master.color_name,
            hex_color: normalizedHex,
            product_url: master.product_url ?? null,
            default_weight: master.default_weight,
          });
          updated += 1;
        } catch (bulkError) {
          console.error(bulkError);
          failed += 1;
        }
      }

      await reloadSettings();
      const resultMessage = buildSettingsSwatchBulkResultMessage(
        { failed, skipped, updated },
        settingsSwatchBulkMessageLabels(),
      );
      if (resultMessage.kind === "error") {
        setError(resultMessage.message);
        return;
      }
      setInfo(resultMessage.message);
    } finally {
      setSwatchBusy(false);
    }
  }

  function settingsSwatchBulkMessageLabels() {
    return {
      confirmBulkSwatchTapAgain: t(
        "settings.confirmBulkSwatchTapAgain",
        "Click Auto-fill visible missing swatches again to confirm.",
      ),
      failed: t("settings.failed", "failed"),
      noMissingSwatches: t("settings.noMissingSwatches", "No missing swatches to fill."),
      noVisibleMissingSwatchesCouldBeAutoFilled: t(
        "settings.swatchBulkNoneUpdated",
        "No visible missing swatches could be auto-filled.",
      ),
      skipped: t("settings.skipped", "skipped"),
      swatchBulkUpdateCompleted: t(
        "settings.swatchBulkDone",
        "Swatch bulk update completed",
      ),
      updated: t("settings.updated", "updated"),
    };
  }

  function settingsSwatchSavedMessageLabels() {
    return {
      swatchSaved: t("settings.swatchSaved", "Saved swatch"),
    };
  }

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
