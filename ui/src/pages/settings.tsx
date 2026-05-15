import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SettingsTabKey } from "../App";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import {
  createTrustedLanPairing,
  clearLibrarySyncClientAuth,
  deleteBambuLiveIntegration,
  exportFullBackupJson,
  exportInventoryCsv,
  exportInventoryJson,
  getLibrarySyncSettings,
  pairLibrarySyncHost,
  importDataFile,
  isTauri,
  listTrustedLanPairedBrowsers,
  printLabelPdf,
  refreshBambuCatalog,
  refreshEsunCatalog,
  revokeAllTrustedLanPairedBrowsers,
  revokeTrustedLanPairedBrowser,
  resetAppData,
  resetCatalogData,
  saveBambuLiveIntegration,
  saveLibrarySyncSettings,
  updateTrustedLanCompanionConfig,
  updateMasterCatalogEntry,
  validateLibrarySyncHost,
  validateFullBackupJson,
  type BambuLiveIntegrationEntry,
  type CatalogResetStats,
  type LibrarySyncHostValidationResult,
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
import { downloadTextFile } from "../lib/download_file";
import { buildInventoryExportCsv, buildInventoryExportJson } from "../lib/inventory_export";
import {
  extractBaseUrlFromPairingInput,
  parsePositiveInt,
  waitForMs,
} from "../lib/settings_utils";
import { copyTextToClipboard } from "../lib/clipboard";
import { SettingsGeneralTab } from "../components/settings_general_tab";
import { SettingsLibraryRoleModal } from "../components/settings_library_role_modal";
import { SettingsMaintenanceTab } from "../components/settings_maintenance_tab";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
import { SettingsPrintersTab } from "../components/settings_printers_tab";
import { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";
import { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";
import { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";
import { tabButtonClass } from "../lib/settings_ui_classes";
import { loadAllSpoolRows } from "../lib/spool_data_source";
import { loadSettingsPageData, refreshLibrarySyncSnapshot } from "../lib/settings_data_source";
import { loadTrustedLanSettingsData } from "../lib/trusted_lan_data_source";
import { createManagedPrinter, deleteManagedPrinter } from "../lib/printer_writes";
import {
  resolvePrinterModelProfile,
} from "../lib/printer_profiles";
import {
  buildTrustedLanActionErrorMessage,
  buildTrustedLanActionMessage,
  buildTrustedLanConfigMessage,
  buildTrustedLanCompanionModel,
  buildTrustedLanLoadMessage,
  buildTrustedLanNoPrivateInterfaceMessage,
  findNewTrustedLanActiveBrowserIds,
  buildTrustedLanPairedBrowserListModel,
  isTrustedLanNetworkDraftDirty,
  resolveTrustedLanInterfaceAddressDraft,
} from "./settings_companion_model";
import {
  buildLibrarySyncActionMessage,
  buildLibrarySyncClientState,
  buildLibrarySyncErrorMessage,
  buildLibrarySyncPairingMessage,
  buildLibrarySyncPairingSettingsInput,
  buildLibrarySyncRoleOptions,
  buildLibrarySyncSaveSettingsInput,
  buildLibrarySyncTabLabels,
  buildLibraryRoleChangeState,
  buildLibrarySyncVisibilityState,
  type LibrarySyncMode,
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
import { useSettingsPrinterDeleteConfirm } from "./use_settings_printer_delete_confirm";
import {
  useSettingsResetConfirm,
  type SettingsResetConfirmAction,
} from "./use_settings_reset_confirm";
import { useSettingsSwatchConfirm } from "./use_settings_swatch_confirm";
import { useSettingsSwatchDrafts } from "./use_settings_swatch_drafts";
import { useSettingsPageChrome } from "./use_settings_page_chrome";
import { useSettingsPageTabs } from "./use_settings_page_tabs";
import { useSettingsPreferenceActions } from "./use_settings_preference_actions";
import { useSettingsLibrarySyncState } from "./use_settings_library_sync_state";
import { useSettingsLibrarySyncMessages } from "./use_settings_library_sync_messages";
import { useSettingsLibraryRoleChange } from "./use_settings_library_role_change";
import { useSettingsThemeMode } from "./use_settings_theme_mode";
import { useSettingsTransientInfo } from "./use_settings_transient_info";
import { useTrustedLanPairingQr } from "./use_trusted_lan_pairing_qr";
import {
  buildSettingsInventoryOverviewPrintErrorMessage,
  buildSettingsInventoryOverviewPrintPdfLabels,
  buildSettingsInventoryOverviewPrintRows,
  buildSettingsInventoryOverviewPrintSuccessMessage,
  buildSettingsInventoryPrintLabels,
} from "./settings_inventory_print_model";
import {
  buildSettingsBackupErrorMessage,
  buildSettingsBackupExportSuccessMessage,
  buildSettingsBackupValidationSuccessMessage,
  buildSettingsImportSuccessMessage,
  buildSettingsInventoryExportSuccessMessage,
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
  buildSettingsAppResetSuccessMessage,
  buildSettingsCatalogResetMessage,
  buildSettingsMaintenanceErrorMessage,
  buildSettingsResetConfirmMessage,
  shouldArmSettingsResetAction,
} from "./settings_maintenance_model";
import {
  buildPrinterSlotsByPrinterId,
  buildSettingsPrinterConfirmDeleteMessage,
  buildSettingsPrinterErrorMessage,
  buildSettingsPrinterRemovedMessage,
  buildSettingsPrinterRequiredMessage,
  buildSettingsPrinterUpdatedMessage,
  preparePrinterReconfigure,
  sortSettingsPrinters,
} from "./settings_printer_model";
import {
  buildSettingsPageDataModel,
  buildSettingsPageLoadErrorMessage,
} from "./settings_page_model";

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
  const librarySyncAutoValidationRef = useRef<string | null>(null);
  const silentReloadInFlightRef = useRef(false);

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
  const trustedLanPairedBrowserListModel = useMemo(
    () =>
      buildTrustedLanPairedBrowserListModel({
        browsers: trustedLanPairedBrowsers,
        locale,
        t,
      }),
    [locale, t, trustedLanPairedBrowsers],
  );
  const activeTrustedLanPairedBrowsers = trustedLanPairedBrowserListModel.activeRows;
  const revokedTrustedLanPairedBrowsers = trustedLanPairedBrowserListModel.revokedRows;
  const trustedLanSelectedInterfaceOption = useMemo(
    () =>
      trustedLanInterfaces.find((value) => value.address === trustedLanInterfaceAddressDraft) ??
      null,
    [trustedLanInterfaceAddressDraft, trustedLanInterfaces],
  );
  const trustedLanHasPrivateInterfaces = trustedLanInterfaces.length > 0;
  const trustedLanNetworkDirty = useMemo(
    () =>
      isTrustedLanNetworkDraftDirty({
        interfaceAddressDraft: trustedLanInterfaceAddressDraft,
        portDraft: trustedLanPortDraft,
        trustedLanStatus,
      }),
    [trustedLanInterfaceAddressDraft, trustedLanPortDraft, trustedLanStatus],
  );

  useEffect(() => {
    if (revokedTrustedLanPairedBrowsers.length === 0) {
      setShowTrustedLanRevokedBrowsers(false);
    }
  }, [revokedTrustedLanPairedBrowsers.length]);

  useEffect(() => {
    trustedLanPairedBrowsersRef.current = trustedLanPairedBrowsers;
  }, [trustedLanPairedBrowsers]);

  const syncTrustedLanDraftFromStatus = useCallback(
    (
      status: TrustedLanCompanionStatus | null,
      interfaces: TrustedLanInterfaceOption[] = [],
    ) => {
      setTrustedLanEnabledDraft(Boolean(status?.enabled));
      setTrustedLanPortDraft(String(status?.listen_port ?? 4278));
      setTrustedLanInterfaceAddressDraft(
        resolveTrustedLanInterfaceAddressDraft(status, interfaces),
      );
    },
    [],
  );

  const reloadSettings = useCallback(async (options?: { silent?: boolean }) => {
    if (!tauri) {
      return;
    }
    if (options?.silent && silentReloadInFlightRef.current) {
      return;
    }
    if (options?.silent) {
      silentReloadInFlightRef.current = true;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const pageData = buildSettingsPageDataModel(
        await loadSettingsPageData({
          onHostLoadError: (loadError) => {
            console.warn(
              "Settings host printer overview unavailable, using cached snapshot.",
              loadError,
            );
          },
        }),
      );
      setPrinters(pageData.printers);
      setPrinterOverview(pageData.printerOverview);
      setSpoolRows(pageData.spoolRows);
      setBambuLiveIntegrations(pageData.bambuLiveIntegrations);
      setCatalogMasters(pageData.catalogRows);
      setLibrarySyncSettings(pageData.librarySyncSettings);
      setLibrarySyncModeDraft(pageData.librarySyncModeDraft);
      setLibrarySyncDeviceNameDraft(pageData.librarySyncDeviceNameDraft);
      setLibrarySyncHostBaseUrlDraft(pageData.librarySyncHostBaseUrlDraft);
      setLibrarySyncValidation(null);
      setLibrarySyncSnapshot(pageData.librarySyncSettings.cached_snapshot ?? null);
      setSwatchDraftById(pageData.swatchDraftById);
    } catch (loadError) {
      console.error(loadError);
      setError(buildSettingsPageLoadErrorMessage(settingsPageMessageLabels()));
    } finally {
      if (options?.silent) {
        silentReloadInFlightRef.current = false;
      }
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setSwatchDraftById,
    settingsPageMessageLabels,
    tauri,
  ]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    const timer = window.setInterval(() => {
      void reloadSettings({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [reloadSettings, tauri]);

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

  const trustedLanLoadMessageLabels = useCallback(() => ({
    loadCompanionFailed: t(
      "settings.error.loadTrustedLanCompanion",
      "Failed to load trusted-LAN companion status.",
    ),
    newBrowserPaired: t(
      "settings.trustedLanBrowserPairedDetected",
      "New paired browser connected.",
    ),
    refreshBrowsersFailed: t(
      "settings.error.loadTrustedLanPairedBrowsers",
      "Failed to refresh paired browsers.",
    ),
  }), [t]);

  const loadTrustedLanCompanionStatus = useCallback(async (): Promise<TrustedLanCompanionStatus | null> => {
    if (!tauri) {
      return null;
    }
    setTrustedLanLoading(true);
    try {
      const trustedLanData = await loadTrustedLanSettingsData();

      setTrustedLanStatus(trustedLanData.status);
      setTrustedLanInterfaces(trustedLanData.interfaces);
      setTrustedLanPairedBrowsers(trustedLanData.pairedBrowsers);
      syncTrustedLanDraftFromStatus(trustedLanData.status, trustedLanData.interfaces);

      if (trustedLanData.statusError) {
        console.error(trustedLanData.statusError);
        setError(
          toErrorMessage(
            trustedLanData.statusError,
            buildTrustedLanLoadMessage("loadCompanionFailed", trustedLanLoadMessageLabels()),
          ),
        );
      }

      if (trustedLanData.interfacesError) {
        console.error(trustedLanData.interfacesError);
      }

      if (trustedLanData.pairedBrowsersError) {
        console.error(trustedLanData.pairedBrowsersError);
      }

      return trustedLanData.status;
    } catch (loadError) {
      console.error(loadError);
      setTrustedLanStatus(null);
      setTrustedLanInterfaces([]);
      setTrustedLanPairedBrowsers([]);
      setError(
        toErrorMessage(
          loadError,
          buildTrustedLanLoadMessage("loadCompanionFailed", trustedLanLoadMessageLabels()),
        ),
      );
      return null;
    } finally {
      setTrustedLanLoading(false);
    }
  }, [syncTrustedLanDraftFromStatus, tauri, trustedLanLoadMessageLabels]);

  const refreshTrustedLanPairedBrowsers = useCallback(
    async (options?: { announceNewPairing?: boolean; suppressErrors?: boolean }) => {
      if (!tauri || trustedLanPairedBrowsersRefreshInFlightRef.current) {
        return;
      }
      trustedLanPairedBrowsersRefreshInFlightRef.current = true;
      try {
        const nextBrowsers = await listTrustedLanPairedBrowsers();
        const newActiveIds = findNewTrustedLanActiveBrowserIds(
          trustedLanPairedBrowsersRef.current,
          nextBrowsers,
        );
        setTrustedLanPairedBrowsers(nextBrowsers);
        if (options?.announceNewPairing && newActiveIds.length > 0) {
          setInfo(buildTrustedLanLoadMessage("newBrowserPaired", trustedLanLoadMessageLabels()));
        }
      } catch (refreshError) {
        console.error(refreshError);
        if (!options?.suppressErrors) {
          setError(
            toErrorMessage(
              refreshError,
              buildTrustedLanLoadMessage("refreshBrowsersFailed", trustedLanLoadMessageLabels()),
            ),
          );
        }
      } finally {
        trustedLanPairedBrowsersRefreshInFlightRef.current = false;
      }
    },
    [tauri, trustedLanLoadMessageLabels],
  );

  const refreshTrustedLanStatusUntilSettled = useCallback(
    async (expectedEnabled: boolean): Promise<TrustedLanCompanionStatus | null> => {
      let latest = await loadTrustedLanCompanionStatus();
      if (!expectedEnabled) {
        return latest;
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (latest?.enabled && latest.running && latest.shell_reachable) {
          return latest;
        }
        await waitForMs(300);
        latest = await loadTrustedLanCompanionStatus();
      }

      return latest;
    },
    [loadTrustedLanCompanionStatus],
  );

  const trustedLanConfigMessageLabels = useCallback(() => ({
    disabled: t("settings.trustedLanDisabledInfo", "Web app server turned off."),
    enabled: t("settings.trustedLanEnabledInfo", "Web app server turned on."),
    enabledPending: t(
      "settings.trustedLanEnabledPendingInfo",
      "Web app server is starting. Refresh status if it takes a moment.",
    ),
    networkSaved: t("settings.trustedLanNetworkSaved", "Web app network settings saved."),
    saveFailed: t(
      "settings.error.saveTrustedLanConfig",
      "Failed to save trusted-LAN companion settings.",
    ),
    starting: t("settings.trustedLanStartingInfo", "Starting web app server..."),
  }), [t]);

  const trustedLanValidationMessageLabels = useCallback(() => ({
    noPrivateInterface: t(
      "settings.error.trustedLanNoInterface",
      "Pick a private interface before turning on the web app server.",
    ),
  }), [t]);

  const persistTrustedLanConfig = useCallback(
    async (nextEnabled: boolean, successMessage: string): Promise<boolean> => {
      if (!tauri) {
        return false;
      }

      if (nextEnabled && !trustedLanSelectedInterfaceOption) {
        setError(buildTrustedLanNoPrivateInterfaceMessage(trustedLanValidationMessageLabels()));
        return false;
      }

      setTrustedLanActionBusy(true);
      setError(null);
      try {
        const nextStatus = await updateTrustedLanCompanionConfig({
          enabled: nextEnabled,
          selected_interface_name: trustedLanSelectedInterfaceOption?.name ?? null,
          selected_interface_address: trustedLanSelectedInterfaceOption?.address ?? null,
          listen_port: parsePositiveInt(trustedLanPortDraft, 4278),
        });
        setTrustedLanStatus(nextStatus);
        syncTrustedLanDraftFromStatus(nextStatus, trustedLanInterfaces);
        setShowTrustedLanNetworkEditor(false);
        setTrustedLanPairingLabel(null);
        setTrustedLanPairingExpiresAtMs(null);
        setTrustedLanPairingLink(null);
        setInfo(
          nextEnabled && !nextStatus.shell_reachable
            ? buildTrustedLanConfigMessage("starting", trustedLanConfigMessageLabels())
            : successMessage,
        );
        setTrustedLanActionBusy(false);

        void refreshTrustedLanStatusUntilSettled(nextEnabled).then((refreshedStatus) => {
          if (!nextEnabled) {
            return;
          }
          if (
            refreshedStatus?.enabled &&
            refreshedStatus.running &&
            refreshedStatus.shell_reachable
          ) {
            setInfo(successMessage);
            return;
          }
          setInfo(
            buildTrustedLanConfigMessage("enabledPending", trustedLanConfigMessageLabels()),
          );
        });
        return true;
      } catch (saveError) {
        console.error(saveError);
        setTrustedLanActionBusy(false);
        setError(
          toErrorMessage(
            saveError,
            buildTrustedLanConfigMessage("saveFailed", trustedLanConfigMessageLabels()),
          ),
        );
        return false;
      }
    },
    [
      refreshTrustedLanStatusUntilSettled,
      syncTrustedLanDraftFromStatus,
      tauri,
      trustedLanConfigMessageLabels,
      trustedLanInterfaces,
      trustedLanPortDraft,
      trustedLanSelectedInterfaceOption,
      trustedLanValidationMessageLabels,
    ],
  );

  useEffect(() => {
    if (!tauri) {
      return;
    }
    void reloadSettings();
    void loadTrustedLanCompanionStatus();
  }, [loadTrustedLanCompanionStatus, reloadSettings, tauri]);

  const handleSaveLibrarySyncSettings = useCallback(async (nextMode = librarySyncModeDraft) => {
    if (!tauri || !librarySyncSettings) {
      return false;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (nextMode === "HOST") {
        const fallbackInterface = trustedLanSelectedInterfaceOption ?? trustedLanInterfaces[0] ?? null;
        if (!fallbackInterface) {
          setError(buildTrustedLanNoPrivateInterfaceMessage(trustedLanValidationMessageLabels()));
          return false;
        }
        if (!trustedLanSelectedInterfaceOption) {
          setTrustedLanInterfaceAddressDraft(fallbackInterface.address);
        }
        setTrustedLanEnabledDraft(true);
        const hostEnabled = await persistTrustedLanConfig(
          true,
          buildTrustedLanConfigMessage("enabled", trustedLanConfigMessageLabels()),
        );
        if (!hostEnabled) {
          setTrustedLanEnabledDraft(Boolean(trustedLanStatus?.enabled));
          return false;
        }
      } else if (nextMode === "CLIENT") {
        setTrustedLanEnabledDraft(false);
        const disabled = await persistTrustedLanConfig(
          false,
          buildTrustedLanConfigMessage("disabled", trustedLanConfigMessageLabels()),
        );
        if (!disabled) {
          setTrustedLanEnabledDraft(Boolean(trustedLanStatus?.enabled));
          return false;
        }
      }

      const saved = await saveLibrarySyncSettings(
        buildLibrarySyncSaveSettingsInput({
          current: librarySyncSettings,
          targetMode: nextMode,
          deviceName: librarySyncDeviceNameDraft,
          hostBaseUrlDraft: librarySyncHostBaseUrlDraft,
        }),
      );

      setLibrarySyncSettings(saved);
      setLibrarySyncModeDraft((saved.mode as LibrarySyncMode) ?? "STANDALONE");
      setLibrarySyncDeviceNameDraft(saved.device_name ?? "");
      setLibrarySyncHostBaseUrlDraft(saved.host_base_url ?? "");
      if (saved.mode !== "CLIENT") {
        setLibrarySyncValidation(null);
        setLibrarySyncSnapshot(null);
      }
      setInfo(buildLibrarySyncActionMessage("settingsSaved", librarySyncActionMessageLabels()));
      return true;
    } catch (saveError) {
      console.error(saveError);
      setError(
        toErrorMessage(
          saveError,
          buildLibrarySyncErrorMessage("settingsSaveFailed", librarySyncErrorMessageLabels()),
        ),
      );
      return false;
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncDeviceNameDraft,
    librarySyncHostBaseUrlDraft,
    librarySyncActionMessageLabels,
    librarySyncModeDraft,
    librarySyncSettings,
    librarySyncErrorMessageLabels,
    persistTrustedLanConfig,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    tauri,
    trustedLanConfigMessageLabels,
    trustedLanInterfaces,
    trustedLanSelectedInterfaceOption,
    trustedLanStatus?.enabled,
    trustedLanValidationMessageLabels,
  ]);

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

  const handleValidateLibrarySyncHost = useCallback(async () => {
    const baseUrl = librarySyncHostBaseUrlDraft.trim() || settingsClientHostBaseUrl || "";
    const expectedLibraryId = librarySyncSettings?.library_id ?? null;
    if (!tauri || !baseUrl) {
      return;
    }
    setLibrarySyncValidationBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await validateLibrarySyncHost(
        baseUrl,
        expectedLibraryId,
      );
      setLibrarySyncValidation(result);
      const refreshed = await getLibrarySyncSettings();
      setLibrarySyncSettings(refreshed);
      setLibrarySyncSnapshot(refreshed.cached_snapshot ?? null);
      if (result.ok && result.matches_library_id) {
        if (result.pairing_checked && !result.pairing_valid) {
          return;
        }
        showTransientInfo(
          buildLibrarySyncActionMessage("hostCheckPassed", librarySyncActionMessageLabels()),
        );
      }
    } catch (validationError) {
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          buildLibrarySyncErrorMessage("hostCheckFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncValidationBusy(false);
    }
  }, [
    librarySyncHostBaseUrlDraft,
    librarySyncSettings,
    settingsClientHostBaseUrl,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
    showTransientInfo,
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    tauri,
  ]);

  const handlePairLibrarySyncHost = useCallback(async () => {
    const pairingInput = librarySyncPairingDraft.trim();
    const derivedBaseUrl = extractBaseUrlFromPairingInput(pairingInput);
    if (!tauri || !pairingInput || !derivedBaseUrl) {
      if (tauri && pairingInput && !derivedBaseUrl) {
        setError(
          buildLibrarySyncPairingMessage(
            "pairingLinkRequired",
            librarySyncPairingMessageLabels(),
          ),
        );
      }
      return;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    let validation: LibrarySyncHostValidationResult | null = null;
    try {
      validation = await validateLibrarySyncHost(derivedBaseUrl, null);
      setLibrarySyncValidation(validation);
      if (!validation.ok || !validation.library_id) {
        throw new Error(validation.message);
      }
      await saveLibrarySyncSettings(
        buildLibrarySyncPairingSettingsInput({
          deviceName: librarySyncDeviceNameDraft,
          libraryId: validation.library_id,
          hostBaseUrl: validation.base_url,
          hostDeviceName: validation.device_name,
        }),
      );
      const saved = await pairLibrarySyncHost(
        validation.base_url,
        pairingInput,
      );
      setLibrarySyncSettings(saved);
      setLibrarySyncModeDraft("CLIENT");
      setLibrarySyncDeviceNameDraft(saved.device_name ?? librarySyncDeviceNameDraft);
      setLibrarySyncHostBaseUrlDraft(saved.host_base_url ?? validation.base_url);
      setLibrarySyncPairingDraft("");
      setInfo(buildLibrarySyncActionMessage("clientPaired", librarySyncActionMessageLabels()));
    } catch (pairError) {
      console.error(pairError);
      if (validation) {
        setLibrarySyncValidation({
          ...validation,
          ok: false,
          matches_library_id: false,
          message: buildLibrarySyncPairingMessage(
            "pairingInvalid",
            librarySyncPairingMessageLabels(),
          ),
        });
        setError(null);
      } else {
        setError(
          toErrorMessage(
            pairError,
            buildLibrarySyncPairingMessage(
              "pairHostFailed",
              librarySyncPairingMessageLabels(),
            ),
          ),
        );
      }
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncDeviceNameDraft,
    librarySyncPairingDraft,
    librarySyncPairingMessageLabels,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncValidation,
    tauri,
  ]);

  const handleClearLibrarySyncClientAuth = useCallback(async () => {
    if (!tauri || librarySyncBusy) {
      return;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    try {
      const cleared = await clearLibrarySyncClientAuth();
      setLibrarySyncSettings(cleared);
      setLibrarySyncPairingDraft("");
      setInfo(buildLibrarySyncActionMessage("clientAuthCleared", librarySyncActionMessageLabels()));
    } catch (clearError) {
      console.error(clearError);
      setError(
        toErrorMessage(
          clearError,
          buildLibrarySyncErrorMessage("clearClientAuthFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncBusy,
    librarySyncErrorMessageLabels,
    setLibrarySyncBusy,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    tauri,
  ]);

  const handleRenewLibrarySyncClientAuth = useCallback(async () => {
    if (!tauri || librarySyncBusy) {
      return;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    try {
      const cleared = await clearLibrarySyncClientAuth();
      setLibrarySyncSettings(cleared);
      setLibrarySyncValidation(null);
      setLibrarySyncPairingDraft("");
      setInfo(buildLibrarySyncActionMessage("renewPairing", librarySyncActionMessageLabels()));
    } catch (clearError) {
      console.error(clearError);
      setError(
        toErrorMessage(
          clearError,
          buildLibrarySyncErrorMessage("clearClientAuthFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncBusy,
    librarySyncErrorMessageLabels,
    setLibrarySyncBusy,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncValidation,
    tauri,
  ]);

  useEffect(() => {
    if (activeTab !== "LIBRARY") {
      librarySyncAutoValidationRef.current = null;
      return;
    }
    if (
      !tauri ||
      loading ||
      librarySyncBusy ||
      librarySyncValidationBusy ||
      librarySyncModeDraft !== "CLIENT" ||
      !settingsClientHostWritePaired ||
      !(settingsClientHostBaseUrl || librarySyncHostBaseUrlDraft.trim())
    ) {
      return;
    }
    const autoValidationKey = [
      activeTab,
      librarySyncModeDraft,
      settingsClientHostBaseUrl ?? librarySyncHostBaseUrlDraft.trim(),
      librarySyncSettings?.client_auth_paired_at ?? "",
      librarySyncSettings?.client_auth_expires_at ?? "",
    ].join("|");
    if (librarySyncAutoValidationRef.current === autoValidationKey) {
      return;
    }
    librarySyncAutoValidationRef.current = autoValidationKey;
    void handleValidateLibrarySyncHost();
  }, [
    activeTab,
    handleValidateLibrarySyncHost,
    librarySyncBusy,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncSettings?.client_auth_expires_at,
    librarySyncSettings?.client_auth_paired_at,
    librarySyncValidationBusy,
    loading,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    tauri,
  ]);

  const handleFetchLibrarySyncSnapshot = useCallback(async () => {
    if (!tauri || !librarySyncSettings) {
      return;
    }
    setLibrarySyncSnapshotBusy(true);
    setError(null);
    setInfo(null);
    try {
      const refreshed = await refreshLibrarySyncSnapshot(
        librarySyncHostBaseUrlDraft,
        librarySyncSettings.library_id,
      );
      setLibrarySyncSettings(refreshed.syncSettings);
      setLibrarySyncSnapshot(refreshed.snapshot);
      setInfo(buildLibrarySyncActionMessage("snapshotRefreshed", librarySyncActionMessageLabels()));
    } catch (snapshotError) {
      console.error(snapshotError);
      setError(
        toErrorMessage(
          snapshotError,
          buildLibrarySyncErrorMessage("snapshotFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncSnapshotBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncHostBaseUrlDraft,
    librarySyncSettings,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    tauri,
  ]);

  useEffect(() => {
    if (
      !tauri ||
      activeTab !== "LIBRARY" ||
      !trustedLanStatus?.enabled ||
      trustedLanActionBusy
    ) {
      return;
    }

    const pollMs = trustedLanPairingLink ? 1500 : 5000;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      await refreshTrustedLanPairedBrowsers({
        announceNewPairing: Boolean(trustedLanPairingLink),
        suppressErrors: true,
      });
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeTab,
    refreshTrustedLanPairedBrowsers,
    tauri,
    trustedLanActionBusy,
    trustedLanPairingLink,
    trustedLanStatus?.enabled,
  ]);

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

  function handleStartEditPrinter(printer: PrinterRow) {
    startPrinterEdit({
      bambuLiveIntegrations,
      printer,
      printerOverview,
    });
    setConfirmDeletePrinterId(null);
  }

  function handleCancelEditPrinter() {
    cancelPrinterEdit();
  }

  async function handleSavePrinterReconfigure() {
    if (!tauri || busy || !editPrinterId) {
      return;
    }
    const current = printers.find((printer) => printer.id === editPrinterId) ?? null;
    const prepared = preparePrinterReconfigure({
      currentExists: Boolean(current),
      draft: {
        id: editPrinterId,
        model: editPrinterModel,
        name: editPrinterName,
        amsUnits: editAmsUnits,
        slotsPerUnit: editSlotsPerUnit,
        bambuLiveEnabled: editBambuLiveEnabled,
        bambuLiveHost: editBambuLiveHost,
        bambuLiveAccessCode: editBambuLiveAccessCode,
        bambuLivePrinterSerial: editBambuLivePrinterSerial,
      },
    });
    if (!prepared.ok) {
      if (prepared.reason === "missing_bambu_live_fields") {
        setError(
          buildSettingsPrinterErrorMessage(
            "bambuLiveFieldsRequired",
            settingsPrinterMessageLabels(),
          ),
        );
        return;
      }
      setError(buildSettingsPrinterRequiredMessage(settingsPrinterMessageLabels()));
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (settingsClientReadOnly) {
        if (!settingsClientHostBaseUrl || !settingsClientLibraryId || !settingsClientHostWritePaired) {
          setError(
            buildSettingsPrinterErrorMessage(
              "writeRequiresPairing",
              settingsPrinterMessageLabels(),
            ),
          );
          setBusy(false);
          return;
        }
        await createManagedPrinter(
          prepared.printer,
          {
            clientReadOnly: true,
            clientHostBaseUrl: settingsClientHostBaseUrl,
            clientLibraryId: settingsClientLibraryId,
          },
        );
      } else {
        await createManagedPrinter(prepared.printer);
        if (prepared.bambuLive.enabled) {
          await saveBambuLiveIntegration({
            printer_id: prepared.printer.id,
            enabled: true,
            host: prepared.bambuLive.host,
            access_code: prepared.bambuLive.accessCode,
            printer_serial: prepared.bambuLive.printerSerial,
          });
        } else {
          await deleteBambuLiveIntegration(prepared.printer.id);
        }
      }
      await reloadSettings();
      setInfo(
        buildSettingsPrinterUpdatedMessage(prepared.printer.name, settingsPrinterMessageLabels()),
      );
      handleCancelEditPrinter();
    } catch (updateError) {
      console.error(updateError);
      setError(
        toErrorMessage(
          updateError,
          buildSettingsPrinterErrorMessage("updatePrinterFailed", settingsPrinterMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePrinter(printer: PrinterRow) {
    if (!tauri || busy) {
      return;
    }
    if (confirmDeletePrinterId !== printer.id) {
      setConfirmDeletePrinterId(printer.id);
      setError(null);
      setInfo(
        buildSettingsPrinterConfirmDeleteMessage(printer.name, settingsPrinterMessageLabels()),
      );
      return;
    }
    setConfirmDeletePrinterId(null);

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (settingsClientReadOnly) {
        if (!settingsClientHostBaseUrl || !settingsClientLibraryId || !settingsClientHostWritePaired) {
          setError(
            buildSettingsPrinterErrorMessage(
              "writeRequiresPairing",
              settingsPrinterMessageLabels(),
            ),
          );
          setBusy(false);
          return;
        }
        await deleteManagedPrinter(printer.id, {
          clientReadOnly: true,
          clientHostBaseUrl: settingsClientHostBaseUrl,
          clientLibraryId: settingsClientLibraryId,
        });
      } else {
        await deleteManagedPrinter(printer.id);
      }
      await reloadSettings();
      setInfo(
        buildSettingsPrinterRemovedMessage(printer.name, settingsPrinterMessageLabels()),
      );
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        toErrorMessage(
          deleteError,
          buildSettingsPrinterErrorMessage("deletePrinterFailed", settingsPrinterMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

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

  async function handleResetAppData() {
    if (!tauri || busy) {
      return;
    }
    if (shouldArmSettingsResetAction(confirmResetAction, "APP")) {
      setConfirmResetAction("APP");
      setError(null);
      setInfo(buildSettingsResetConfirmMessage("app", settingsMaintenanceResetMessageLabels()));
      return;
    }
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await resetAppData();
      setLastCatalogReset(null);
      await reloadSettings();
      setInfo(buildSettingsAppResetSuccessMessage(settingsMaintenanceResetMessageLabels()));
    } catch (resetError) {
      console.error(resetError);
      setError(
        toErrorMessage(
          resetError,
          buildSettingsMaintenanceErrorMessage("app", settingsMaintenanceResetMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetCatalogs() {
    if (!tauri || busy) {
      return;
    }
    if (shouldArmSettingsResetAction(confirmResetAction, "CATALOG")) {
      setConfirmResetAction("CATALOG");
      setError(null);
      setInfo(buildSettingsResetConfirmMessage("catalog", settingsMaintenanceResetMessageLabels()));
      return;
    }
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await resetCatalogData();
      setLastCatalogReset(result);
      setInfo(buildSettingsCatalogResetMessage(result, settingsCatalogResetMessageLabels()));
    } catch (resetError) {
      console.error(resetError);
      setError(
        toErrorMessage(
          resetError,
          buildSettingsMaintenanceErrorMessage(
            "catalog",
            settingsMaintenanceResetMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

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

  async function loadSettingsInventoryRows(): Promise<SpoolWithMasterRow[]> {
    return loadAllSpoolRows(
      {
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        clientLibraryId: settingsClientLibraryId,
      },
      200,
    );
  }

  async function handleExportFullBackup() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload = await exportFullBackupJson();
      const validationSummary = await validateFullBackupJson(payload.content);
      downloadTextFile(
        payload.content,
        `filament-manager-backup-${Date.now()}.json`,
        "application/json;charset=utf-8",
      );
      const exportedAt = new Date().toISOString();
      recordExportedBackupValidation(validationSummary, exportedAt);
      setInfo(buildSettingsBackupExportSuccessMessage({
        backupExported: t(
          "settings.backupExported",
          "Full backup exported (inventory, history and printers).",
        ),
        librarySyncBackupAutoValidated: t(
          "settings.librarySyncBackupAutoValidated",
          "The exported backup was validated automatically and is ready to use in the guided role-change flow.",
        ),
      }));
    } catch (backupError) {
      console.error(backupError);
      setError(
        toErrorMessage(
          backupError,
          buildSettingsBackupErrorMessage("exportBackupFailed", settingsBackupErrorMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleExportInventoryCsv() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload =
        settingsClientReadOnly && settingsClientHostBaseUrl && settingsClientLibraryId
          ? { content: buildInventoryExportCsv(await loadSettingsInventoryRows()) }
          : await exportInventoryCsv();
      downloadTextFile(
        payload.content,
        `filament-manager-inventory-${Date.now()}.csv`,
        "text/csv;charset=utf-8",
      );
      setInfo(
        buildSettingsInventoryExportSuccessMessage("csv", settingsInventoryExportMessageLabels()),
      );
    } catch (exportError) {
      console.error(exportError);
      setError(
        toErrorMessage(
          exportError,
          buildSettingsBackupErrorMessage(
            "exportInventoryCsvFailed",
            settingsBackupErrorMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleExportInventoryJson() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload =
        settingsClientReadOnly && settingsClientHostBaseUrl && settingsClientLibraryId
          ? { content: buildInventoryExportJson(await loadSettingsInventoryRows()) }
          : await exportInventoryJson();
      downloadTextFile(
        payload.content,
        `filament-manager-inventory-${Date.now()}.json`,
        "application/json;charset=utf-8",
      );
      setInfo(
        buildSettingsInventoryExportSuccessMessage("json", settingsInventoryExportMessageLabels()),
      );
    } catch (exportError) {
      console.error(exportError);
      setError(
        toErrorMessage(
          exportError,
          buildSettingsBackupErrorMessage(
            "exportInventoryJsonFailed",
            settingsBackupErrorMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function settingsInventoryExportMessageLabels() {
    return {
      inventoryCsvExported: t("settings.inventoryCsvExported", "Inventory CSV exported."),
      inventoryJsonExported: t("settings.inventoryJsonExported", "Inventory JSON exported."),
    };
  }

  async function handlePrintInventoryOverviewA4() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const allRows = await loadSettingsInventoryRows();

      const [
        { buildFilamentQrPayload, resolvePreferredCompanionShellUrl },
        { buildFilamentLabelQrDataUrl },
        { buildInventoryOverviewPrintPdfBase64 },
      ] = await Promise.all([
        import("../lib/filament_qr_payload"),
        import("../lib/filament_label_print"),
        import("../lib/inventory_overview_print"),
      ]);

      const companionShellUrl = resolvePreferredCompanionShellUrl({
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        trustedLanShellUrl: trustedLanStatus?.shell_url ?? null,
      });

      const printRows = await buildSettingsInventoryOverviewPrintRows({
        rows: allRows,
        locale,
        companionShellUrl,
        labels: buildSettingsInventoryPrintLabels(settingsInventoryPrintLabels()),
        buildFilamentQrPayload,
        buildFilamentLabelQrDataUrl,
      });

      const pdfBase64 = await buildInventoryOverviewPrintPdfBase64(
        printRows,
        buildSettingsInventoryOverviewPrintPdfLabels(settingsInventoryOverviewPrintPdfLabels()),
      );
      await printLabelPdf(pdfBase64, null, 1);
      setInfo(
        buildSettingsInventoryOverviewPrintSuccessMessage(
          settingsInventoryOverviewPrintMessageLabels(),
        ),
      );
    } catch (printError) {
      console.error(printError);
      setError(
        toErrorMessage(
          printError,
          buildSettingsInventoryOverviewPrintErrorMessage(
            settingsInventoryOverviewPrintMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

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

  async function handleSaveTrustedLanConfig() {
    await persistTrustedLanConfig(
      trustedLanEnabledDraft,
      buildTrustedLanConfigMessage("networkSaved", trustedLanConfigMessageLabels()),
    );
  }

  async function handleToggleTrustedLanEnabled(nextEnabled: boolean) {
    if (!tauri || trustedLanCompanionModel.configActionDisabled) {
      return;
    }

    const previousEnabled = trustedLanEnabledDraft;
    setTrustedLanEnabledDraft(nextEnabled);
    const saved = await persistTrustedLanConfig(
      nextEnabled,
      nextEnabled
        ? buildTrustedLanConfigMessage("enabled", trustedLanConfigMessageLabels())
        : buildTrustedLanConfigMessage("disabled", trustedLanConfigMessageLabels()),
    );
    if (!saved) {
      setTrustedLanEnabledDraft(previousEnabled);
    }
  }

  async function handleCreateTrustedLanPairingLink() {
    if (trustedLanCompanionModel.pairActionDisabled) {
      return;
    }
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      const browserLabel = trustedLanPairingBrowserLabelDraft.trim() || null;
      const link = await createTrustedLanPairing(browserLabel);
      setTrustedLanPairingLabel(browserLabel);
      setTrustedLanPairingExpiresAtMs(Date.now() + link.expires_in_seconds * 1000);
      setTrustedLanPairingLink(link.pairing_url);
      await copyTextToClipboard(link.pairing_url);
      setInfo(buildTrustedLanActionMessage("pairingCreated", trustedLanActionMessageLabels()));
      await loadTrustedLanCompanionStatus();
    } catch (pairError) {
      console.error(pairError);
      setError(
        toErrorMessage(
          pairError,
          buildTrustedLanActionErrorMessage(
            "createPairingFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  async function handleCopyTrustedLanPairingLink() {
    if (!trustedLanPairingLink) {
      return;
    }
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      await copyTextToClipboard(trustedLanPairingLink);
      setInfo(buildTrustedLanActionMessage("pairingCopied", trustedLanActionMessageLabels()));
    } catch (copyError) {
      console.error(copyError);
      setError(
        toErrorMessage(
          copyError,
          buildTrustedLanActionErrorMessage(
            "copyPairingFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  async function handleRevokeTrustedLanBrowser(browserId: string) {
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      await revokeTrustedLanPairedBrowser(browserId);
      await loadTrustedLanCompanionStatus();
      setShowTrustedLanRevokedBrowsers(true);
      setInfo(buildTrustedLanActionMessage("browserRevoked", trustedLanActionMessageLabels()));
    } catch (revokeError) {
      console.error(revokeError);
      setError(
        toErrorMessage(
          revokeError,
          buildTrustedLanActionErrorMessage(
            "revokeBrowserFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  async function handleRevokeAllTrustedLanBrowsers() {
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      await revokeAllTrustedLanPairedBrowsers();
      await loadTrustedLanCompanionStatus();
      setShowTrustedLanRevokedBrowsers(true);
      setInfo(buildTrustedLanActionMessage("allBrowsersRevoked", trustedLanActionMessageLabels()));
    } catch (revokeError) {
      console.error(revokeError);
      setError(
        toErrorMessage(
          revokeError,
          buildTrustedLanActionErrorMessage(
            "revokeAllBrowsersFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  function trustedLanActionMessageLabels() {
    return {
      allBrowsersRevoked: t(
        "settings.trustedLanAllBrowsersRevoked",
        "All trusted-LAN browsers revoked.",
      ),
      browserRevoked: t("settings.trustedLanBrowserRevoked", "Trusted-LAN browser revoked."),
      copyPairingFailed: t(
        "settings.error.copyTrustedLanPairing",
        "Failed to copy the trusted-LAN pairing link.",
      ),
      createPairingFailed: t(
        "settings.error.createTrustedLanPairing",
        "Failed to create a trusted-LAN pairing link.",
      ),
      pairingCopied: t("settings.trustedLanPairingCopied", "Trusted-LAN pairing link copied."),
      pairingCreated: t(
        "settings.trustedLanPairingCreated",
        "Trusted-LAN pairing link created and copied.",
      ),
      revokeAllBrowsersFailed: t(
        "settings.error.revokeAllTrustedLanBrowsers",
        "Failed to revoke trusted-LAN browsers.",
      ),
      revokeBrowserFailed: t(
        "settings.error.revokeTrustedLanBrowser",
        "Failed to revoke the trusted-LAN browser.",
      ),
    };
  }

  const trustedLanCompanionModel = buildTrustedLanCompanionModel({
    trustedLanStatus,
    statusLoading: trustedLanLoading,
    actionBusy: trustedLanActionBusy,
    t,
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
