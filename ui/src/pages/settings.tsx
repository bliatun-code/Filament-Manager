import { useEffect, useRef } from "react";
import type { SettingsTabKey } from "../App";
import { isTauri } from "../lib/tauri_client";
import { useI18n } from "../lib/i18n";
import { buildTrustedLanCompanionModel } from "./settings_companion_model";
import { buildSettingsGeneralRouteProps } from "./settings_general_route_props";
import { buildSettingsLibraryBrowsersPanelProps } from "./settings_library_browsers_panel_props";
import { buildSettingsLibraryClientPanelProps } from "./settings_library_client_panel_props";
import { buildSettingsLibraryRolePanelProps } from "./settings_library_role_panel_props";
import { buildSettingsLibraryServerPanelProps } from "./settings_library_server_panel_props";
import { buildSettingsLibraryPairingPanelProps } from "./settings_library_pairing_panel_props";
import { buildSettingsLibraryRouteProps } from "./settings_library_route_props";
import { buildSettingsLibraryRoleModalRouteProps } from "./settings_library_role_modal_route_props";
import { buildSettingsLibraryWebappControlProps } from "./settings_library_webapp_control_props";
import { SettingsPageLayout } from "./settings_page_layout";
import { buildSettingsRouteMapProps } from "./settings_route_map_props";
import { useSettingsFeedbackState } from "./use_settings_feedback_state";
import { useSettingsCatalogSection } from "./use_settings_catalog_section";
import { useSettingsBackupValidationSummary } from "./use_settings_backup_validation_summary";
import { useSettingsPageDataState } from "./use_settings_page_data_state";
import { useSettingsPageReload } from "./use_settings_page_reload";
import { useSettingsPageShellState } from "./use_settings_page_shell_state";
import { useSettingsPreferenceSection } from "./use_settings_preference_section";
import { useSettingsInitialLoad } from "./use_settings_initial_load";
import { useSettingsMaintenanceSection } from "./use_settings_maintenance_section";
import { useSettingsPrintersSection } from "./use_settings_printers_section";
import { useSettingsLibrarySyncState } from "./use_settings_library_sync_state";
import { useSettingsLibrarySyncActions } from "./use_settings_library_sync_actions";
import { useSettingsLibraryDerivedState } from "./use_settings_library_derived_state";
import { useSettingsLibraryClientAdvanced } from "./use_settings_library_client_advanced";
import { useSettingsLibraryRoleFlow } from "./use_settings_library_role_flow";
import { useSettingsLibraryAutoValidation } from "./use_settings_library_auto_validation";
import { useSettingsSilentReload } from "./use_settings_silent_reload";
import { useSettingsTrustedLanState } from "./use_settings_trusted_lan_state";
import { useSettingsMessageGroups } from "./use_settings_message_groups";
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
  const reloadSettingsRef = useRef<() => Promise<void>>(async () => undefined);
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
  const {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    settingsCatalogResetMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
    settingsMaintenanceResetMessageLabels,
    settingsPrinterMessageLabels,
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  } = useSettingsMessageGroups(t);
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
    missingSwatchCount,
    settingsCatalogRouteProps,
    setSwatchDraftById,
  } = useSettingsCatalogSection({
    busy,
    catalogMasters,
    reloadSettings: () => reloadSettingsRef.current(),
    setError,
    setInfo,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
    tauri,
    t,
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
  useEffect(() => {
    reloadSettingsRef.current = reloadSettings;
  }, [reloadSettings]);

  useSettingsSilentReload({ reloadSettings, tauri });

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
    handleExportFullBackup,
    handleOpenBackupValidate,
    handleOpenDataImport,
    handlePrintInventoryOverviewA4,
    settingsMaintenanceRouteProps,
  } = useSettingsMaintenanceSection({
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    busy,
    catalogCount: catalogMasters.length,
    clearBackupValidation,
    lastBackupValidation,
    lastCatalogReset,
    librarySyncModeDraft,
    locale,
    missingSwatchCount,
    printerCount: printers.length,
    recordBackupValidation,
    recordExportedBackupValidation,
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
    settingsCatalogResetMessageLabels,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
    settingsMaintenanceResetMessageLabels,
    tauri,
    t,
    trustedLanStatus,
  });

  const { settingsPrintersRouteProps } = useSettingsPrintersSection({
    bambuLiveIntegrations,
    busy,
    loading,
    locale,
    printerOverview,
    printers,
    reloadSettings,
    setBusy,
    setError,
    setInfo,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsPrinterMessageLabels,
    spoolRows,
    tauri,
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
