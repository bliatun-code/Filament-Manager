import { useEffect, useRef } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import { isTauri } from "../lib/tauri_client";
import { useI18n } from "../lib/i18n";
import { buildSettingsGeneralRouteProps } from "./settings_general_route_props";
import { buildSettingsLibraryRouteBundle } from "./settings_library_route_bundle";
import { SettingsPageLayout } from "./settings_page_layout";
import { buildSettingsRouteMapProps } from "./settings_route_map_props";
import { useSettingsFeedbackState } from "./use_settings_feedback_state";
import { useSettingsCatalogSection } from "./use_settings_catalog_section";
import { useSettingsBackupValidationSummary } from "./use_settings_backup_validation_summary";
import { useSettingsPageDataState } from "./use_settings_page_data_state";
import { useSettingsPageReload } from "./use_settings_page_reload";
import { useSettingsPageShellState } from "./use_settings_page_shell_state";
import { useSettingsPreferenceSection } from "./use_settings_preference_section";
import { useSettingsLibraryActionsRuntime } from "./use_settings_library_actions_runtime";
import { useSettingsLibraryRuntime } from "./use_settings_library_runtime";
import { useSettingsMaintenanceSection } from "./use_settings_maintenance_section";
import { useSettingsPrintersSection } from "./use_settings_printers_section";
import { useSettingsSilentReload } from "./use_settings_silent_reload";
import { useSettingsMessageGroups } from "./use_settings_message_groups";
import { isLibrarySyncDeviceNameDirty } from "./settings_library_device_name";

type SettingsPageProps = {
  initialTab?: SettingsTabKey | null;
};

export default function SettingsPage({ initialTab = null }: SettingsPageProps) {
  const tauri = isTauri();
  const desktopVisualQaScenario = resolveDesktopVisualQaScenario();
  const desktopVisualQaScenarioRef = useRef(desktopVisualQaScenario);
  const desktopVisualQaRoleChangeAppliedRef = useRef(false);
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
    activeTabPersistenceEnabled: !desktopVisualQaScenario,
    initialTab,
    setInfo,
    tauri,
    t,
  });

  useEffect(() => {
    if (
      desktopVisualQaScenarioRef.current !== "settings-updates" ||
      activeTab !== "GENERAL"
    ) {
      return;
    }

    let scheduledFrameId: number | null = null;
    const revealUpdateCheck = () => {
      const target = document.getElementById("settings-update-check");
      if (!target) {
        return;
      }
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = null;
        target.scrollIntoView({ behavior: "auto", block: "center" });
      });
    };

    revealUpdateCheck();
    const timerIds = [150, 450, 900].map((delay) =>
      window.setTimeout(revealUpdateCheck, delay),
    );
    window.addEventListener("resize", revealUpdateCheck);
    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener("resize", revealUpdateCheck);
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
    };
  }, [activeTab]);
  const libraryRuntime = useSettingsLibraryRuntime({
    locale,
    tauri,
    t,
  });
  const {
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncDeviceNameSaveBusy,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncSavedMode,
    librarySyncSettings,
    librarySyncSnapshot,
    librarySyncSnapshotBusy,
    librarySyncValidation,
    librarySyncValidationBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    showTrustedLanNetworkEditor,
    showTrustedLanNetworkSummary,
    showTrustedLanRevokedBrowsers,
    setShowLibraryClientAdvanced,
    setShowTrustedLanNetworkEditor,
    setShowTrustedLanNetworkSummary,
    setShowTrustedLanRevokedBrowsers,
    setTrustedLanInterfaceAddressDraft,
    setTrustedLanPairingBrowserLabelDraft,
    setTrustedLanPortDraft,
    activeTrustedLanPairedBrowsers,
    librarySyncRoleOptions,
    librarySyncTabLabels,
    libraryVisibility,
    pairingQrBusy: trustedLanPairingQrBusy,
    pairingQrDataUrl: trustedLanPairingQrDataUrl,
    pairingQrUnavailable: trustedLanPairingQrUnavailable,
    revokedTrustedLanPairedBrowsers,
    settingsClientHostBaseUrl,
    settingsClientHostNeedsRepair,
    settingsClientHostPairingValid,
    settingsClientHostWritePaired,
    settingsClientLibraryId,
    settingsClientReadOnly,
    showLibraryClientAdvanced,
    trustedLanActionBusy,
    trustedLanEnabledDraft,
    trustedLanHasPrivateInterfaces,
    trustedLanInterfaceAddressDraft,
    trustedLanInterfaces,
    trustedLanNetworkDirty,
    trustedLanPairedBrowsers,
    trustedLanPairingBrowserLabelDraft,
    trustedLanPairingExpiresAtMs,
    trustedLanPairingLabel,
    trustedLanPairingLink,
    trustedLanPortDraft,
    trustedLanLoading,
    trustedLanStatus,
  } = libraryRuntime;
  const messageGroups = useSettingsMessageGroups(t);

  useEffect(() => {
    const scenario = desktopVisualQaScenarioRef.current;
    const isNetworkScenario =
      scenario === "settings-library-network-details" ||
      scenario === "settings-library-network-editor";
    const isPairingScenario = scenario === "settings-library-pairing";
    const isBrowsersScenario =
      scenario === "settings-library-browsers" ||
      scenario === "settings-library-browsers-history";
    const isRoleChangeScenario = scenario === "settings-library-role-change";
    if (
      !isNetworkScenario &&
      !isPairingScenario &&
      !isBrowsersScenario &&
      !isRoleChangeScenario
    ) {
      return;
    }
    setActiveTab("LIBRARY");
    setShowLibraryClientAdvanced(false);
    setShowTrustedLanNetworkEditor(scenario === "settings-library-network-editor");
    setShowTrustedLanNetworkSummary(isNetworkScenario);
    setShowTrustedLanRevokedBrowsers(
      scenario === "settings-library-browsers-history",
    );
  }, [
    setActiveTab,
    setShowLibraryClientAdvanced,
    setShowTrustedLanNetworkEditor,
    setShowTrustedLanNetworkSummary,
    setShowTrustedLanRevokedBrowsers,
  ]);

  const {
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    settingsCatalogResetMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryPrintLabels,
    settingsMaintenanceResetMessageLabels,
    settingsPrinterMessageLabels,
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
  } = messageGroups;
  const backupValidation = useSettingsBackupValidationSummary();
  const {
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    clearBackupValidation,
    lastBackupValidation,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    lastFullBackupValidatedAt,
    recordBackupValidation,
    recordExportedBackupValidation,
    recordImportedFullBackup,
  } = backupValidation;
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

  useEffect(() => {
    if (loading || trustedLanLoading) {
      return;
    }
    const scenario = desktopVisualQaScenarioRef.current;
    const expectsEditor = scenario === "settings-library-network-editor";
    const isNetworkScenario =
      scenario === "settings-library-network-details" || expectsEditor;
    const isPairingScenario = scenario === "settings-library-pairing";
    const isBrowsersScenario =
      scenario === "settings-library-browsers" ||
      scenario === "settings-library-browsers-history";
    if (!isNetworkScenario && !isPairingScenario && !isBrowsersScenario) {
      return;
    }
    if (isNetworkScenario) {
      if (!showTrustedLanNetworkSummary || showTrustedLanNetworkEditor !== expectsEditor) {
        return;
      }
    } else if (showTrustedLanNetworkSummary || showTrustedLanNetworkEditor) {
      return;
    }
    if (
      scenario === "settings-library-browsers" &&
      showTrustedLanRevokedBrowsers
    ) {
      return;
    }
    if (
      scenario === "settings-library-browsers-history" &&
      revokedTrustedLanPairedBrowsers.length > 0 &&
      !showTrustedLanRevokedBrowsers
    ) {
      return;
    }
    const targetId = isNetworkScenario
      ? expectsEditor
        ? "trusted-lan-network-editor"
        : "trusted-lan-network-details"
      : isPairingScenario
        ? "trusted-lan-pairing-panel"
        : "trusted-lan-browsers-panel";
    const scrollBlock = isBrowsersScenario ? "start" : "center";
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }
    let scheduledFrameId: number | null = null;
    const revealTarget = () => {
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = null;
        target.scrollIntoView({ behavior: "auto", block: scrollBlock });
      });
    };

    revealTarget();
    const timerIds = [150, 450, 900].map((delay) =>
      window.setTimeout(revealTarget, delay),
    );
    window.addEventListener("resize", revealTarget);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealTarget);
    resizeObserver?.observe(target);

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener("resize", revealTarget);
      resizeObserver?.disconnect();
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
    };
  }, [
    loading,
    revokedTrustedLanPairedBrowsers.length,
    showTrustedLanNetworkEditor,
    showTrustedLanNetworkSummary,
    showTrustedLanRevokedBrowsers,
    trustedLanLoading,
  ]);

  const {
    missingSwatchCount,
    settingsCatalogRouteProps,
    setSwatchDraftById,
  } = useSettingsCatalogSection({
    busy,
    catalogMasters,
    locale,
    reloadSettings: () => reloadSettingsRef.current(),
    setError,
    setInfo,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    tauri,
    t,
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
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    tauri,
  });
  useEffect(() => {
    reloadSettingsRef.current = reloadSettings;
  }, [reloadSettings]);

  useSettingsSilentReload({ reloadSettings, tauri });

  const {
    applicationDiagnosticsStatus,
    handleExportFullBackup,
    handleOpenBackupValidate,
    handleOpenDataImport,
    handleOpenInventoryLabelSheet,
    inventoryLabelSheetModalProps,
    settingsMaintenanceRouteProps,
  } = useSettingsMaintenanceSection({
    applicationDiagnosticsEnabled: activeTab === "MAINTENANCE",
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    busy,
    catalogCount: catalogMasters.length,
    clearBackupValidation,
    lastBackupValidation,
    lastCatalogReset,
    initialInventoryLabelSheetOpen:
      desktopVisualQaScenario === "settings-inventory-label-sheet",
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
    settingsClientHostWritePaired,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsInventoryRows: spoolRows,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryPrintLabels,
    settingsMaintenanceResetMessageLabels,
    tauri,
    t,
    trustedLanStatus,
  });

  useEffect(() => {
    if (
      desktopVisualQaScenarioRef.current !== "settings-application-diagnostics" ||
      applicationDiagnosticsStatus !== "success"
    ) {
      return;
    }
    const target = document.getElementById("settings-application-diagnostics-panel");
    if (!target) {
      return;
    }

    let scheduledFrameId: number | null = null;
    const revealDiagnostics = () => {
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = null;
        target.scrollIntoView({ behavior: "auto", block: "center" });
      });
    };

    revealDiagnostics();
    const timerIds = [150, 450, 900].map((delay) =>
      window.setTimeout(revealDiagnostics, delay),
    );
    window.addEventListener("resize", revealDiagnostics);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealDiagnostics);
    resizeObserver?.observe(target);

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener("resize", revealDiagnostics);
      resizeObserver?.disconnect();
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
    };
  }, [applicationDiagnosticsStatus]);

  const { settingsPrintersRouteProps } = useSettingsPrintersSection({
    bambuLiveIntegrations,
    busy,
    catalogRows: catalogMasters,
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

  const {
    closeLibraryRoleChangeModal,
    handleClearLibrarySyncClientAuth,
    handleConfirmLibraryRoleChange,
    handleCopyTrustedLanPairingLink,
    handleCreateTrustedLanPairingLink,
    handleFetchLibrarySyncSnapshot,
    handlePairLibrarySyncHost,
    handleRenewLibrarySyncClientAuth,
    handleRequestLibraryRoleChange,
    handleRevokeAllTrustedLanBrowsers,
    handleRevokeTrustedLanBrowser,
    handleSaveTrustedLanConfig,
    handleSaveLibrarySyncDeviceName,
    handleToggleTrustedLanEnabled,
    libraryRoleConfirmArmed,
    roleChangeState,
    trustedLanCompanionModel,
  } = useSettingsLibraryActionsRuntime({
    activeTab,
    backupValidation,
    libraryRuntime,
    loading,
    messageGroups,
    reloadSettings,
    setError,
    setInfo,
    showTransientInfo,
    tauri,
    t,
  });

  useEffect(() => {
    if (
      desktopVisualQaRoleChangeAppliedRef.current ||
      desktopVisualQaScenarioRef.current !== "settings-library-role-change" ||
      activeTab !== "LIBRARY" ||
      loading ||
      librarySyncBusy ||
      !librarySyncSettings ||
      !tauri
    ) {
      return;
    }

    const targetMode = librarySyncSavedMode === "CLIENT" ? "STANDALONE" : "CLIENT";
    handleRequestLibraryRoleChange(targetMode);
    desktopVisualQaRoleChangeAppliedRef.current = true;
  }, [
    activeTab,
    handleRequestLibraryRoleChange,
    librarySyncBusy,
    librarySyncSavedMode,
    librarySyncSettings,
    loading,
    tauri,
  ]);

  const settingsGeneralRouteProps = buildSettingsGeneralRouteProps({
    appVersion,
    busy,
    locale,
    inventoryLabelSheetModalProps,
    tauri,
    themeMode,
    t,
    onLocaleSelection: handleLocaleSelection,
    onOpenInventoryLabelSheet: handleOpenInventoryLabelSheet,
    onThemeSelection: handleThemeSelection,
  });
  const {
    settingsLibraryRoleModalRouteProps,
    settingsLibraryRouteProps,
  } = buildSettingsLibraryRouteBundle({
    actionBusy: trustedLanActionBusy,
    activeBrowsers: activeTrustedLanPairedBrowsers,
    browserLabelDraft: trustedLanPairingBrowserLabelDraft,
    busy,
    companionModel: trustedLanCompanionModel,
    interfaceAddressDraft: trustedLanInterfaceAddressDraft,
    interfaces: trustedLanInterfaces,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    lastFullBackupValidatedAt,
    libraryRoleConfirmArmed,
    librarySyncBusy,
    librarySyncDeviceNameDirty: isLibrarySyncDeviceNameDirty(
      librarySyncSettings,
      librarySyncDeviceNameDraft,
    ),
    librarySyncDeviceNameDraft,
    librarySyncDeviceNameSaveBusy,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncRoleOptions,
    librarySyncSettings,
    librarySyncSnapshot,
    librarySyncSnapshotBusy,
    librarySyncValidation,
    librarySyncValidationBusy,
    libraryVisibility,
    locale,
    networkDirty: trustedLanNetworkDirty,
    pairActionDisabled: trustedLanCompanionModel.pairActionDisabled,
    pairingExpiresAtMs: trustedLanPairingExpiresAtMs,
    pairingLabel: trustedLanPairingLabel,
    pairingLink: trustedLanPairingLink,
    pairingQrBusy: trustedLanPairingQrBusy,
    pairingQrDataUrl: trustedLanPairingQrDataUrl,
    pairingQrUnavailable: trustedLanPairingQrUnavailable,
    portDraft: trustedLanPortDraft,
    revokedBrowsers: revokedTrustedLanPairedBrowsers,
    roleChangeState,
    showClientPanel: librarySyncModeDraft === "CLIENT",
    showHostPanels: librarySyncModeDraft !== "CLIENT",
    showLibraryClientAdvanced,
    showNetworkEditor: showTrustedLanNetworkEditor,
    showNetworkSummary: showTrustedLanNetworkSummary,
    showRevokedBrowsers: showTrustedLanRevokedBrowsers,
    showServerPanel: librarySyncModeDraft !== "CLIENT" && libraryVisibility.showWebappDetails,
    settingsClientHostBaseUrl,
    settingsClientHostNeedsRepair,
    settingsClientHostPairingValid,
    settingsClientHostWritePaired,
    tauri,
    t,
    title: librarySyncTabLabels.title,
    totalBrowserCount: trustedLanPairedBrowsers.length,
    trustedLanActionBusy,
    trustedLanEnabledDraft,
    trustedLanHasPrivateInterfaces,
    trustedLanStatus,
    onBrowserLabelChange: setTrustedLanPairingBrowserLabelDraft,
    onClearClientAuth: handleClearLibrarySyncClientAuth,
    onClose: closeLibraryRoleChangeModal,
    onConfirm: handleConfirmLibraryRoleChange,
    onCopyPairingLink: handleCopyTrustedLanPairingLink,
    onCreatePairingLink: handleCreateTrustedLanPairingLink,
    onDeviceNameChange: setLibrarySyncDeviceNameDraft,
    onExportFullBackup: handleExportFullBackup,
    onFetchSnapshot: handleFetchLibrarySyncSnapshot,
    onInterfaceAddressChange: setTrustedLanInterfaceAddressDraft,
    onOpenBackupValidate: handleOpenBackupValidate,
    onOpenDataImport: handleOpenDataImport,
    onPairHost: handlePairLibrarySyncHost,
    onPairingDraftChange: setLibrarySyncPairingDraft,
    onPortChange: setTrustedLanPortDraft,
    onRenewClientAuth: handleRenewLibrarySyncClientAuth,
    onRequestLibraryRoleChange: handleRequestLibraryRoleChange,
    onRevokeAllBrowsers: handleRevokeAllTrustedLanBrowsers,
    onRevokeBrowser: handleRevokeTrustedLanBrowser,
    onSaveNetwork: handleSaveTrustedLanConfig,
    onSaveDeviceName: () => void handleSaveLibrarySyncDeviceName(),
    onToggleAdvanced: () => setShowLibraryClientAdvanced((value) => !value),
    onToggleNetworkEditor: () => setShowTrustedLanNetworkEditor((value) => !value),
    onToggleNetworkSummary: () => setShowTrustedLanNetworkSummary((value) => !value),
    onToggleRevokedBrowsers: () => setShowTrustedLanRevokedBrowsers((value) => !value),
    onToggleTrustedLanEnabled: handleToggleTrustedLanEnabled,
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
