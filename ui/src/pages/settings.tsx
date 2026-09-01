import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import {
  isTauri,
  saveLibrarySyncSettings,
  type LowStockPolicy,
} from "../lib/tauri_client";
import { useI18n } from "../lib/i18n";
import { buildSettingsGeneralRouteProps } from "./settings_general_route_props";
import { buildSettingsLibraryRouteBundle } from "./settings_library_route_bundle";
import { SettingsPageLayout } from "./settings_page_layout";
import { buildSettingsRouteMapProps } from "./settings_route_map_props";
import { useSettingsFeedbackState } from "./use_settings_feedback_state";
import { useSettingsCatalogSection } from "./use_settings_catalog_section";
import { useSettingsBackupValidationSummary } from "./use_settings_backup_validation_summary";
import { useSettingsPageDataState } from "./use_settings_page_data_state";
import { buildSettingsCatalogDataSourceIdentity } from "./settings_catalog_data_state";
import { useSettingsPageReload } from "./use_settings_page_reload";
import { useSettingsPageShellState } from "./use_settings_page_shell_state";
import { useSettingsPreferenceSection } from "./use_settings_preference_section";
import { useSettingsLibraryActionsRuntime } from "./use_settings_library_actions_runtime";
import { useSettingsLibraryRuntime } from "./use_settings_library_runtime";
import { useSettingsMaintenanceSection } from "./use_settings_maintenance_section";
import { useSettingsPrintersSection } from "./use_settings_printers_section";
import { useSettingsSilentReload } from "./use_settings_silent_reload";
import { useSettingsMessageGroups } from "./use_settings_message_groups";
import { useSettingsFilamentDefaults } from "./use_settings_filament_defaults";
import { useDesktopLifecycleSettings } from "./use_desktop_lifecycle_settings";
import { isLibrarySyncDeviceNameDirty } from "./settings_library_device_name";
import type { SettingsFilamentDefaultsFocusTarget } from "../components/settings_filament_defaults_tab";
import type { FilamentPriceBatchReceipt } from "../lib/settings_filament_defaults_model";

type SettingsPageProps = {
  catalogRefreshBusy: boolean;
  filamentPriceBatchReceipt?: FilamentPriceBatchReceipt | null;
  initialFilamentDefaultsFocusTarget?: SettingsFilamentDefaultsFocusTarget;
  initialPrinterId?: string | null;
  initialTab?: SettingsTabKey | null;
  onFilamentPriceBatchReceiptChange?: (
    receipt: FilamentPriceBatchReceipt | null,
  ) => void;
  onCatalogRefreshBusyChange: Dispatch<SetStateAction<boolean>>;
  onOpenInventorySpoolDetails?: (spoolId: string) => void;
};

export default function SettingsPage({
  catalogRefreshBusy: appCatalogRefreshBusy,
  filamentPriceBatchReceipt,
  initialFilamentDefaultsFocusTarget = null,
  initialPrinterId = null,
  initialTab = null,
  onCatalogRefreshBusyChange,
  onFilamentPriceBatchReceiptChange,
  onOpenInventorySpoolDetails = () => undefined,
}: SettingsPageProps) {
  const tauri = isTauri();
  const desktopVisualQaScenario = resolveDesktopVisualQaScenario();
  const desktopVisualQaScenarioRef = useRef(desktopVisualQaScenario);
  const desktopVisualQaRoleChangeAppliedRef = useRef(false);
  const reloadFilamentDefaultsRef = useRef<() => Promise<unknown>>(
    async () => undefined,
  );
  const reloadSettingsRef = useRef<() => Promise<void>>(async () => undefined);
  const inheritedCatalogRefreshRef = useRef(appCatalogRefreshBusy);
  const reloadFilamentDefaultsAfterPageData = useCallback(
    () => reloadFilamentDefaultsRef.current(),
    [],
  );
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
  const desktopLifecycle = useDesktopLifecycleSettings({ tauri });

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

  useEffect(() => {
    if (
      desktopVisualQaScenarioRef.current !== "settings-general" ||
      activeTab !== "GENERAL" ||
      desktopLifecycle.loading ||
      !desktopLifecycle.settings
    ) {
      return;
    }

    const target = document.getElementById("settings-background-operation");
    if (!target) {
      return;
    }
    let scheduledFrameId: number | null = null;
    const revealBackgroundOperation = () => {
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = null;
        target.scrollIntoView({ behavior: "auto", block: "center" });
      });
    };

    revealBackgroundOperation();
    const timerIds = [150, 450, 900].map((delay) =>
      window.setTimeout(revealBackgroundOperation, delay),
    );
    window.addEventListener("resize", revealBackgroundOperation);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(revealBackgroundOperation);
    resizeObserver?.observe(target);

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener("resize", revealBackgroundOperation);
      resizeObserver?.disconnect();
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
    };
  }, [activeTab, desktopLifecycle.loading, desktopLifecycle.settings]);
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
    settingsClientTargetGeneration,
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
    catalogDataSourceIdentity,
    catalogLoadStatus,
    catalogMasters,
    catalogRowsAvailable,
    catalogRowsUnavailable,
    lastCatalogReset,
    loading,
    printerOverview,
    printers,
    setBambuLiveIntegrations,
    setCatalogData,
    setLastCatalogReset,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    spoolRows,
  } = useSettingsPageDataState(tauri);
  const settingsCatalogTargetIdentity =
    buildSettingsCatalogDataSourceIdentity({
      clientReadOnly: settingsClientReadOnly,
      hostBaseUrl: settingsClientHostBaseUrl,
      hostWritePaired: settingsClientHostWritePaired,
      libraryId: settingsClientLibraryId,
      targetGeneration: settingsClientTargetGeneration,
    });
  const settingsDataSourceReady =
    catalogDataSourceIdentity === settingsCatalogTargetIdentity &&
    catalogLoadStatus !== "pending";

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
    catalogRefreshBusy,
    missingSwatchCount,
    settingsCatalogRouteProps,
    setSwatchDraftById,
  } = useSettingsCatalogSection({
    busy,
    catalogMasters,
    catalogRefreshBusy: appCatalogRefreshBusy,
    catalogRowsAvailable,
    catalogRowsUnavailable,
    locale,
    reloadSettings: () => reloadSettingsRef.current(),
    setError,
    setInfo,
    setCatalogRefreshBusy: onCatalogRefreshBusyChange,
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
    onDataReloaded: reloadFilamentDefaultsAfterPageData,
    setBambuLiveIntegrations,
    setCatalogData,
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
    settingsClientTargetGeneration,
    settingsClientHostWritePaired,
    tauri,
  });
  useEffect(() => {
    reloadSettingsRef.current = reloadSettings;
  }, [reloadSettings]);

  useEffect(() => {
    if (!appCatalogRefreshBusy && inheritedCatalogRefreshRef.current) {
      inheritedCatalogRefreshRef.current = false;
      void reloadSettingsRef.current();
    }
  }, [appCatalogRefreshBusy]);

  useSettingsSilentReload({
    enabled: !catalogRefreshBusy,
    reloadSettings,
    tauri,
  });

  const {
    applicationDiagnosticsStatus,
    handleExportFullBackup,
    handleOpenBackupValidate,
    handleOpenDataImport,
    settingsMaintenanceRouteProps,
  } = useSettingsMaintenanceSection({
    applicationDiagnosticsEnabled: activeTab === "MAINTENANCE",
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    busy,
    catalogCount: catalogRowsAvailable ? catalogMasters.length : "—",
    clearBackupValidation,
    lastBackupValidation,
    lastCatalogReset,
    librarySyncModeDraft,
    locale,
    missingSwatchCount: catalogRowsAvailable ? missingSwatchCount : "—",
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
    settingsClientTargetGeneration,
    settingsInventoryRows: spoolRows,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
    settingsMaintenanceResetMessageLabels,
    tauri,
    t,
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

  const lowStockMaterialOptions = useMemo(() => {
    const materials = new Map<string, string>();
    for (const material of [
      ...catalogMasters.map((row) => row.material),
      ...spoolRows.map((row) => row.master.material),
    ]) {
      const display = material.trim().replace(/\s+/gu, " ");
      const key = display.toUpperCase();
      if (key && !materials.has(key)) {
        materials.set(key, display);
      }
    }
    return Array.from(materials.values()).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [catalogMasters, spoolRows]);

  const handleSaveLowStockPolicy = useCallback(
    async (policy: LowStockPolicy) => {
      if (!tauri || !librarySyncSettings || librarySyncSettings.mode === "CLIENT") {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const saved = await saveLibrarySyncSettings({
          ...librarySyncSettings,
          low_stock_policy: policy,
        });
        setLibrarySyncSettings(saved);
        setInfo(t("settings.lowStockSaved", "Low-stock thresholds saved."));
      } catch (saveError) {
        console.error(saveError);
        setError(
          t(
            "settings.lowStockSaveError",
            "Failed to save low-stock thresholds.",
          ),
        );
      } finally {
        setBusy(false);
      }
    }, [
      librarySyncSettings,
      setBusy,
      setError,
      setInfo,
      setLibrarySyncSettings,
      t,
      tauri,
    ],
  );

  const { settingsPrintersRouteProps } = useSettingsPrintersSection({
    bambuLiveIntegrations,
    busy,
    catalogRows: catalogMasters,
    loading,
    initialPrinterId,
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
    trustedLanInterfaces,
  });

  const handleFilamentDefaultsLoadError = useCallback(
    (loadError: unknown) => {
      console.error(loadError);
      setError(
        t(
          "settings.filamentDefaultsLoadError",
          "Failed to load filament defaults.",
        ),
      );
    },
    [setError, t],
  );
  const filamentDefaults = useSettingsFilamentDefaults({
    clientHostBaseUrl: settingsClientHostBaseUrl,
    clientLibraryId: settingsClientLibraryId,
    clientReadOnly: settingsClientReadOnly,
    clientTargetGeneration: settingsClientTargetGeneration,
    clientHostWritePaired: settingsClientHostWritePaired,
    fallbackSpoolRows: spoolRows,
    onInventoryChanged: reloadSettings,
    onLoadError: handleFilamentDefaultsLoadError,
    roleResolved: librarySyncSettings != null,
    tauri,
  });
  useEffect(() => {
    reloadFilamentDefaultsRef.current = filamentDefaults.reload;
  }, [filamentDefaults.reload]);

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
    catalogRefreshBusy,
    libraryRuntime,
    loading,
    messageGroups,
    reloadSettings,
    settingsDataSourceReady,
    setError,
    setInfo,
    showTransientInfo,
    tauri,
    t,
  });
  const librarySyncInteractionBusy =
    librarySyncBusy || catalogRefreshBusy;

  useEffect(() => {
    if (
      desktopVisualQaRoleChangeAppliedRef.current ||
      desktopVisualQaScenarioRef.current !== "settings-library-role-change" ||
      activeTab !== "LIBRARY" ||
      loading ||
      librarySyncInteractionBusy ||
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
    librarySyncInteractionBusy,
    librarySyncSavedMode,
    librarySyncSettings,
    loading,
    tauri,
  ]);

  const settingsGeneralRouteProps = buildSettingsGeneralRouteProps({
    appVersion,
    busy,
    desktopLifecycleLoadError: desktopLifecycle.loadError,
    desktopLifecycleLoading: desktopLifecycle.loading,
    desktopLifecycleSettings: desktopLifecycle.settings,
    desktopLifecycleUpdateError: desktopLifecycle.updateError,
    desktopLifecycleUpdating: desktopLifecycle.updating,
    locale,
    tauri,
    themeMode,
    t,
    onLocaleSelection: handleLocaleSelection,
    onContinueInBackground: desktopLifecycle.handleContinueInBackground,
    onLaunchAtLogin: desktopLifecycle.handleLaunchAtLogin,
    onRetryDesktopLifecycleLoad: desktopLifecycle.handleRetryLoad,
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
    librarySyncBusy: librarySyncInteractionBusy,
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
    filamentDefaults: {
      tab: {
        busy:
          busy ||
          filamentDefaults.busy ||
          librarySyncInteractionBusy ||
          loading,
        locale,
        hostUnsupported: filamentDefaults.hostUnsupported,
        hostTargetMissing: filamentDefaults.hostTargetMissing,
        loadFailed: filamentDefaults.loadFailed,
        readOnly: !tauri || settingsClientReadOnly,
        t,
        lowStock: {
          busy: busy || librarySyncInteractionBusy || loading,
          materialOptions: lowStockMaterialOptions,
          policy:
            librarySyncSettings?.mode === "CLIENT"
              ? librarySyncSnapshot?.inventory.low_stock_policy
              : librarySyncSettings?.low_stock_policy,
          policyValid:
            librarySyncSettings?.mode === "CLIENT" ||
            librarySyncSettings?.low_stock_policy_valid !== false,
          readOnly: !tauri || settingsClientReadOnly,
          onSave: handleSaveLowStockPolicy,
        },
        defaultCurrency: filamentDefaults.defaultCurrency,
        batchReceipt: filamentPriceBatchReceipt,
        focusTarget: initialFilamentDefaultsFocusTarget,
        persistedGroupPrices: filamentDefaults.persistedGroupPrices,
        settingsValid: filamentDefaults.settingsValid,
        spoolRows: filamentDefaults.spoolRows,
        onApplyBatch: filamentDefaults.onApplyBatch,
        onBatchReceiptChange: onFilamentPriceBatchReceiptChange,
        onOpenSpoolDetail: onOpenInventorySpoolDetails,
        onReload: filamentDefaults.retryLoad,
        onSaveDefaultCurrency: filamentDefaults.onSaveDefaultCurrency,
        onSaveGroupPrice: filamentDefaults.onSaveGroupPrice,
      },
    },
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
