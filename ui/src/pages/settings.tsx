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
  getAppVersion,
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
  subscribeCatalogRefreshProgress,
  updateTrustedLanCompanionConfig,
  updateMasterCatalogEntry,
  validateLibrarySyncHost,
  validateFullBackupJson,
  type BackupValidationStats,
  type BambuLiveIntegrationEntry,
  type CatalogRefreshProgressPayload,
  type CatalogRefreshResult,
  type CatalogResetStats,
  type LibrarySyncHostValidationResult,
  type LibrarySyncRemoteSnapshot,
  type LibrarySyncSettings,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type PrinterRow,
  type SpoolWithMasterRow,
  type TrustedLanInterfaceOption,
  type TrustedLanPairedBrowser,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import {
  getThemeMode,
  onThemeModeChange,
  setThemeMode,
  type ThemeMode,
} from "../lib/theme_mode";
import { FeedbackBanner } from "../components/feedback_banner";
import { useI18n, type Locale } from "../lib/i18n";
import { toErrorMessage } from "../lib/error_text";
import { downloadTextFile } from "../lib/download_file";
import { buildInventoryExportCsv, buildInventoryExportJson } from "../lib/inventory_export";
import {
  extractBaseUrlFromPairingInput,
  isFullBackupValidationFormat,
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
  updateDiagnosticCaptureSessionFromPayload,
  type DiagnosticCaptureSession,
  type DiagnosticFilterKey,
  type DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import {
  resolvePrinterModelProfile,
} from "../lib/printer_profiles";
import {
  buildTrustedLanCompanionModel,
  findNewTrustedLanActiveBrowserIds,
  buildTrustedLanPairedBrowserListModel,
  isTrustedLanNetworkDraftDirty,
  resolveTrustedLanInterfaceAddressDraft,
} from "./settings_companion_model";
import {
  buildLibrarySyncClientState,
  buildLibrarySyncPairingSettingsInput,
  buildLibrarySyncSaveSettingsInput,
  buildLibraryRoleChangeState,
  buildLibrarySyncVisibilityState,
  type LibrarySyncMode,
} from "./settings_library_sync_model";
import { SettingsLibraryClientPanel } from "./settings_library_client_panel";
import { SettingsLibraryRolePanel } from "./settings_library_role_panel";
import { SettingsLibraryWebappControl } from "./settings_library_webapp_control";
import { buildSettingsInventoryOverviewPrintRows } from "./settings_inventory_print_model";
import {
  buildSettingsBackupValidationState,
  buildSettingsImportSuccessMessage,
} from "./settings_backup_model";
import {
  buildSettingsCatalogRefreshSuccessMessage,
  buildSettingsCatalogState,
  buildSettingsSwatchBulkResultMessage,
  buildSettingsSwatchDrafts,
  resolveSettingsSwatchHex,
  toggleSettingsCatalogRefreshMaterial,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";
import { createSettingsBambuLiveCaptureSession } from "./settings_bambu_live_diagnostics_model";
import { buildSettingsCatalogResetMessage } from "./settings_maintenance_model";
import {
  buildPrinterSlotsByPrinterId,
  derivePrinterMultiConfig,
  preparePrinterReconfigure,
  sortSettingsPrinters,
} from "./settings_printer_model";

type SettingsTab = "GENERAL" | "LIBRARY" | "PRINTERS" | "CATALOG" | "MAINTENANCE";
type ResetConfirmAction = "APP" | "CATALOG";
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
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    initialTab === "LIBRARY" ? "LIBRARY" : initialTab,
  );
  const [librarySyncSettings, setLibrarySyncSettings] = useState<LibrarySyncSettings | null>(null);
  const [librarySyncModeDraft, setLibrarySyncModeDraft] = useState<LibrarySyncMode>("STANDALONE");
  const [librarySyncDeviceNameDraft, setLibrarySyncDeviceNameDraft] = useState("");
  const [librarySyncHostBaseUrlDraft, setLibrarySyncHostBaseUrlDraft] = useState("");
  const [librarySyncPairingDraft, setLibrarySyncPairingDraft] = useState("");
  const [librarySyncBusy, setLibrarySyncBusy] = useState(false);
  const [librarySyncValidationBusy, setLibrarySyncValidationBusy] = useState(false);
  const [librarySyncValidation, setLibrarySyncValidation] =
    useState<LibrarySyncHostValidationResult | null>(null);
  const [librarySyncSnapshotBusy, setLibrarySyncSnapshotBusy] = useState(false);
  const [librarySyncSnapshot, setLibrarySyncSnapshot] = useState<LibrarySyncRemoteSnapshot | null>(
    null,
  );
  const [lastFullBackupExportedAt, setLastFullBackupExportedAt] = useState<string | null>(null);
  const [lastFullBackupValidatedAt, setLastFullBackupValidatedAt] = useState<string | null>(null);
  const [lastFullBackupImportedAt, setLastFullBackupImportedAt] = useState<string | null>(null);
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
  const [pendingLibraryRoleTarget, setPendingLibraryRoleTarget] = useState<LibrarySyncMode | null>(null);
  const [libraryRoleConfirmArmed, setLibraryRoleConfirmArmed] = useState(false);
  const [trustedLanPairingBrowserLabelDraft, setTrustedLanPairingBrowserLabelDraft] = useState("");
  const [trustedLanPairingLink, setTrustedLanPairingLink] = useState<string | null>(null);
  const [trustedLanPairingLabel, setTrustedLanPairingLabel] = useState<string | null>(null);
  const [trustedLanPairingExpiresAtMs, setTrustedLanPairingExpiresAtMs] = useState<number | null>(
    null,
  );
  const [trustedLanPairingQrDataUrl, setTrustedLanPairingQrDataUrl] = useState<string | null>(
    null,
  );
  const [trustedLanPairingQrBusy, setTrustedLanPairingQrBusy] = useState(false);
  const [trustedLanPairingQrUnavailable, setTrustedLanPairingQrUnavailable] = useState(false);
  const [showTrustedLanRevokedBrowsers, setShowTrustedLanRevokedBrowsers] = useState(false);
  const trustedLanPairedBrowsersRef = useRef<TrustedLanPairedBrowser[]>([]);
  const trustedLanPairedBrowsersRefreshInFlightRef = useRef(false);
  const librarySyncAutoValidationRef = useRef<string | null>(null);
  const transientInfoTimeoutRef = useRef<number | null>(null);
  const silentReloadInFlightRef = useRef(false);

  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<SpoolWithMasterRow[]>([]);
  const [catalogMasters, setCatalogMasters] = useState<MasterCatalogRow[]>([]);
  const [swatchDraftById, setSwatchDraftById] = useState<Record<string, string>>({});
  const [swatchVendorFilter, setSwatchVendorFilter] = useState("ALL");
  const [swatchBusy, setSwatchBusy] = useState(false);
  const [confirmBulkSwatch, setConfirmBulkSwatch] = useState(false);
  const [catalogVendor, setCatalogVendor] = useState<CatalogVendor>("Bambu");
  const [bambuRefreshMaterials, setBambuRefreshMaterials] = useState<string[]>([]);
  const [esunRefreshMaterials, setEsunRefreshMaterials] = useState<string[]>([]);
  const [catalogRefreshBusy, setCatalogRefreshBusy] = useState(false);
  const [catalogRefreshVendor, setCatalogRefreshVendor] = useState<CatalogVendor>("Bambu");
  const [catalogRefreshProgressMessage, setCatalogRefreshProgressMessage] = useState(
    t("wishlist.refreshPreparing", "Preparing catalog refresh..."),
  );
  const [catalogRefreshPhase, setCatalogRefreshPhase] = useState("PREPARE");
  const [catalogRefreshStartedAt, setCatalogRefreshStartedAt] = useState<number | null>(
    null,
  );
  const [catalogRefreshElapsedSeconds, setCatalogRefreshElapsedSeconds] = useState(0);
  const [catalogRefreshSummary, setCatalogRefreshSummary] =
    useState<CatalogRefreshResult | null>(null);
  const [catalogRefreshLog, setCatalogRefreshLog] = useState("");
  const [showCatalogRefreshLog, setShowCatalogRefreshLog] = useState(false);
  const [lastCatalogReset, setLastCatalogReset] = useState<CatalogResetStats | null>(
    null,
  );

  const [confirmDeletePrinterId, setConfirmDeletePrinterId] = useState<string | null>(
    null,
  );
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationEntry["config"]>
  >({});
  const [editPrinterId, setEditPrinterId] = useState<string | null>(null);
  const [editPrinterModel, setEditPrinterModel] = useState("");
  const [editPrinterName, setEditPrinterName] = useState("");
  const [editAmsUnits, setEditAmsUnits] = useState("0");
  const [editSlotsPerUnit, setEditSlotsPerUnit] = useState("4");
  const [editBambuLiveEnabled, setEditBambuLiveEnabled] = useState(false);
  const [editBambuLiveHost, setEditBambuLiveHost] = useState("");
  const [editBambuLiveAccessCode, setEditBambuLiveAccessCode] = useState("");
  const [editBambuLivePrinterSerial, setEditBambuLivePrinterSerial] = useState("");
  const [expandedBambuDetailsPrinterId, setExpandedBambuDetailsPrinterId] = useState<string | null>(
    null,
  );
  const [diagnosticCaptureByPrinterId, setDiagnosticCaptureByPrinterId] = useState<
    Record<string, DiagnosticCaptureSession>
  >({});
  const [diagnosticCaptureActiveByPrinterId, setDiagnosticCaptureActiveByPrinterId] = useState<
    Record<string, boolean>
  >({});
  const [diagnosticChartFieldByPrinterId, setDiagnosticChartFieldByPrinterId] = useState<
    Record<string, string>
  >({});
  const [diagnosticSortByPrinterId, setDiagnosticSortByPrinterId] = useState<
    Record<string, DiagnosticSortKey>
  >({});
  const [diagnosticFilterByPrinterId, setDiagnosticFilterByPrinterId] = useState<
    Record<string, DiagnosticFilterKey>
  >({});
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const backupValidateInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmResetAction, setConfirmResetAction] = useState<ResetConfirmAction | null>(null);
  const [lastBackupValidation, setLastBackupValidation] =
    useState<BackupValidationStats | null>(null);

  useEffect(() => {
    setActiveTab(initialTab === "LIBRARY" ? "LIBRARY" : initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    if (!tauri) {
      setAppVersion("dev-web");
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const version = await getAppVersion();
        if (!cancelled) {
          setAppVersion(version);
        }
      } catch (versionError) {
        console.error(versionError);
        if (!cancelled) {
          setAppVersion(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

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
  const backupValidationState = useMemo(
    () =>
      buildSettingsBackupValidationState({
        lastBackupValidation,
        lastFullBackupExportedAt,
        lastFullBackupValidatedAt,
      }),
    [lastBackupValidation, lastFullBackupExportedAt, lastFullBackupValidatedAt],
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

  const settingsTabs = useMemo(
    () =>
      [
        {
          id: "GENERAL" as const,
          label: t("settings.tabGeneral", "General"),
        },
        {
          id: "LIBRARY" as const,
          label: t("settings.tabLibrary", "Library & web app"),
        },
        {
          id: "PRINTERS" as const,
          label: t("settings.tabPrinters", "3D printers"),
        },
        {
          id: "CATALOG" as const,
          label: t("settings.tabCatalog", "Filament catalogue"),
        },
        {
          id: "MAINTENANCE" as const,
          label: t("settings.tabMaintenance", "Program maintenance"),
        },
      ] satisfies Array<{ id: SettingsTab; label: string }>,
    [t],
  );

  const clearTransientInfoTimeout = useCallback(() => {
    if (transientInfoTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(transientInfoTimeoutRef.current);
    transientInfoTimeoutRef.current = null;
  }, []);

  const showTransientInfo = useCallback(
    (message: string, timeoutMs = 3500) => {
      clearTransientInfoTimeout();
      setInfo(message);
      transientInfoTimeoutRef.current = window.setTimeout(() => {
        setInfo((currentInfo) => (currentInfo === message ? null : currentInfo));
        transientInfoTimeoutRef.current = null;
      }, timeoutMs);
    },
    [clearTransientInfoTimeout],
  );

  useEffect(() => clearTransientInfoTimeout, [clearTransientInfoTimeout]);

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
      const {
        snapshot,
        catalogRows,
        syncSettings,
        overviewRows,
        spoolRows,
        bambuLiveIntegrations,
      } = await loadSettingsPageData({
        onHostLoadError: (loadError) => {
          console.warn("Settings host printer overview unavailable, using cached snapshot.", loadError);
        },
      });
      setPrinters(
        syncSettings.mode === "CLIENT" ? overviewRows.map((row) => row.printer) : snapshot.printers,
      );
      setPrinterOverview(overviewRows);
      setSpoolRows(spoolRows);
      setBambuLiveIntegrations(bambuLiveIntegrations);
      setCatalogMasters(catalogRows);
      setLibrarySyncSettings(syncSettings);
      setLibrarySyncModeDraft((syncSettings.mode as LibrarySyncMode) ?? "STANDALONE");
      setLibrarySyncDeviceNameDraft(syncSettings.device_name ?? "");
      setLibrarySyncHostBaseUrlDraft(syncSettings.host_base_url ?? "");
      setLibrarySyncValidation(null);
      setLibrarySyncSnapshot(syncSettings.cached_snapshot ?? null);
      setSwatchDraftById(buildSettingsSwatchDrafts(catalogRows));
    } catch (loadError) {
      console.error(loadError);
      setError(t("settings.error.load", "Failed to load settings."));
    } finally {
      if (options?.silent) {
        silentReloadInFlightRef.current = false;
      }
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [t, tauri]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    const timer = window.setInterval(() => {
      void reloadSettings({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [reloadSettings, tauri]);

  useEffect(() => {
    if (!expandedBambuDetailsPrinterId) {
      return;
    }
    if (!diagnosticCaptureActiveByPrinterId[expandedBambuDetailsPrinterId]) {
      return;
    }
    const observedState = bambuLiveIntegrations[expandedBambuDetailsPrinterId]?.observed_state;
    if (!observedState?.raw_payload_json) {
      return;
    }
    const observedAt = observedState.last_seen_at ?? new Date().toISOString();
    setDiagnosticCaptureByPrinterId((current) => {
      const updated = updateDiagnosticCaptureSessionFromPayload({
        session: current[expandedBambuDetailsPrinterId],
        rawPayload: observedState.raw_payload_json,
        observedAt,
      });
      if (!updated) {
        return current;
      }
      const next = { ...current, [expandedBambuDetailsPrinterId]: updated };
      return next;
    });
  }, [bambuLiveIntegrations, diagnosticCaptureActiveByPrinterId, expandedBambuDetailsPrinterId]);

  function handleToggleBambuLiveDetails(printerId: string) {
    setExpandedBambuDetailsPrinterId((currentExpanded) => {
      const nextExpanded = currentExpanded === printerId ? null : printerId;
      if (nextExpanded !== printerId) {
        return nextExpanded;
      }

      const liveConfig = bambuLiveIntegrations[printerId] ?? null;
      setDiagnosticCaptureByPrinterId((current) => {
        if (current[printerId]) {
          return current;
        }
        return {
          ...current,
          [printerId]: createSettingsBambuLiveCaptureSession(liveConfig),
        };
      });
      setDiagnosticCaptureActiveByPrinterId((current) => ({
        ...current,
        [printerId]: current[printerId] ?? true,
      }));
      setDiagnosticSortByPrinterId((current) => ({
        ...current,
        [printerId]: current[printerId] ?? "path",
      }));
      setDiagnosticFilterByPrinterId((current) => ({
        ...current,
        [printerId]: current[printerId] ?? "all",
      }));

      return nextExpanded;
    });
  }

  function handleToggleBambuLiveCapture(printerId: string, captureActive: boolean) {
    if (captureActive) {
      setDiagnosticCaptureActiveByPrinterId((current) => ({
        ...current,
        [printerId]: false,
      }));
      return;
    }

    const liveConfig = bambuLiveIntegrations[printerId] ?? null;
    const nextSession = createSettingsBambuLiveCaptureSession(liveConfig);
    setDiagnosticCaptureByPrinterId((current) => ({
      ...current,
      [printerId]: nextSession,
    }));
    setDiagnosticCaptureActiveByPrinterId((current) => ({
      ...current,
      [printerId]: true,
    }));
    setDiagnosticChartFieldByPrinterId((current) => {
      if (!current[printerId]) {
        return current;
      }
      return {
        ...current,
        [printerId]: "",
      };
    });
  }

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
            t(
              "settings.error.loadTrustedLanCompanion",
              "Failed to load trusted-LAN companion status.",
            ),
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
          t(
            "settings.error.loadTrustedLanCompanion",
            "Failed to load trusted-LAN companion status.",
          ),
        ),
      );
      return null;
    } finally {
      setTrustedLanLoading(false);
    }
  }, [syncTrustedLanDraftFromStatus, t, tauri]);

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
          setInfo(
            t(
              "settings.trustedLanBrowserPairedDetected",
              "New paired browser connected.",
            ),
          );
        }
      } catch (refreshError) {
        console.error(refreshError);
        if (!options?.suppressErrors) {
          setError(
            toErrorMessage(
              refreshError,
              t(
                "settings.error.loadTrustedLanPairedBrowsers",
                "Failed to refresh paired browsers.",
              ),
            ),
          );
        }
      } finally {
        trustedLanPairedBrowsersRefreshInFlightRef.current = false;
      }
    },
    [t, tauri],
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

  const persistTrustedLanConfig = useCallback(
    async (nextEnabled: boolean, successMessage: string): Promise<boolean> => {
      if (!tauri) {
        return false;
      }

      if (nextEnabled && !trustedLanSelectedInterfaceOption) {
        setError(
          t(
            "settings.error.trustedLanNoInterface",
            "Pick a private interface before turning on the web app server.",
          ),
        );
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
            ? t("settings.trustedLanStartingInfo", "Starting web app server...")
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
            t(
              "settings.trustedLanEnabledPendingInfo",
              "Web app server is starting. Refresh status if it takes a moment.",
            ),
          );
        });
        return true;
      } catch (saveError) {
        console.error(saveError);
        setTrustedLanActionBusy(false);
        setError(
          toErrorMessage(
            saveError,
            t(
              "settings.error.saveTrustedLanConfig",
              "Failed to save trusted-LAN companion settings.",
            ),
          ),
        );
        return false;
      }
    },
    [
      refreshTrustedLanStatusUntilSettled,
      syncTrustedLanDraftFromStatus,
      t,
      tauri,
      trustedLanInterfaces,
      trustedLanPortDraft,
      trustedLanSelectedInterfaceOption,
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
          setError(
            t(
              "settings.error.trustedLanNoInterface",
              "Pick a private interface before turning on the web app server.",
            ),
          );
          return false;
        }
        if (!trustedLanSelectedInterfaceOption) {
          setTrustedLanInterfaceAddressDraft(fallbackInterface.address);
        }
        setTrustedLanEnabledDraft(true);
        const hostEnabled = await persistTrustedLanConfig(
          true,
          t("settings.trustedLanEnabledInfo", "Web app server turned on."),
        );
        if (!hostEnabled) {
          setTrustedLanEnabledDraft(Boolean(trustedLanStatus?.enabled));
          return false;
        }
      } else if (nextMode === "CLIENT") {
        setTrustedLanEnabledDraft(false);
        const disabled = await persistTrustedLanConfig(
          false,
          t("settings.trustedLanDisabledInfo", "Web app server turned off."),
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
      setInfo(
        t(
          "settings.librarySyncSaved",
          "Library role settings saved.",
        ),
      );
      return true;
    } catch (saveError) {
      console.error(saveError);
      setError(
        toErrorMessage(
          saveError,
          t("settings.error.librarySyncSave", "Failed to save library role settings."),
        ),
      );
      return false;
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncDeviceNameDraft,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncSettings,
    persistTrustedLanConfig,
    t,
    tauri,
    trustedLanInterfaces,
    trustedLanSelectedInterfaceOption,
    trustedLanStatus?.enabled,
  ]);

  const closeLibraryRoleChangeModal = useCallback(() => {
    setPendingLibraryRoleTarget(null);
    setLibraryRoleConfirmArmed(false);
    setLibrarySyncModeDraft(librarySyncSavedMode);
    setLastFullBackupExportedAt(null);
    setLastFullBackupValidatedAt(null);
    setLastFullBackupImportedAt(null);
    setLastBackupValidation(null);
  }, [librarySyncSavedMode]);

  const handleRequestLibraryRoleChange = useCallback((target: LibrarySyncMode) => {
    if (target === librarySyncSavedMode) {
      setPendingLibraryRoleTarget(null);
      setLibraryRoleConfirmArmed(false);
      setLibrarySyncModeDraft(target);
      return;
    }

    setLastFullBackupExportedAt(null);
    setLastFullBackupValidatedAt(null);
    setLastFullBackupImportedAt(null);
    setLastBackupValidation(null);
    setPendingLibraryRoleTarget(target);
    setLibraryRoleConfirmArmed(false);
    setLibrarySyncModeDraft(target);
  }, [librarySyncSavedMode]);

  const handleConfirmLibraryRoleChange = useCallback(async () => {
    if (!pendingLibraryRoleTarget || librarySyncBusy) {
      return;
    }

    const roleChangeState = buildLibraryRoleChangeState({
      target: pendingLibraryRoleTarget,
      savedMode: librarySyncSavedMode,
      hasExportedFullBackup: Boolean(lastFullBackupExportedAt),
      hasImportedFullBackup: Boolean(lastFullBackupImportedAt),
      hasValidatedFullBackup,
      hasValidatedLatestFullBackup,
    });

    if (!roleChangeState.ready) {
      return;
    }

    if (!libraryRoleConfirmArmed) {
      setLibraryRoleConfirmArmed(true);
      return;
    }

    const saved = await handleSaveLibrarySyncSettings(pendingLibraryRoleTarget);
    if (saved) {
      setPendingLibraryRoleTarget(null);
      setLibraryRoleConfirmArmed(false);
    }
  }, [
    handleSaveLibrarySyncSettings,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    libraryRoleConfirmArmed,
    librarySyncBusy,
    librarySyncSavedMode,
    pendingLibraryRoleTarget,
  ]);

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
        showTransientInfo(t("settings.librarySyncHostCheckOk", "Host check passed."));
      }
    } catch (validationError) {
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          t("settings.error.librarySyncHostCheck", "Failed to check the configured host."),
        ),
      );
    } finally {
      setLibrarySyncValidationBusy(false);
    }
  }, [
    librarySyncHostBaseUrlDraft,
    librarySyncSettings,
    settingsClientHostBaseUrl,
    showTransientInfo,
    t,
    tauri,
  ]);

  const handlePairLibrarySyncHost = useCallback(async () => {
    const pairingInput = librarySyncPairingDraft.trim();
    const derivedBaseUrl = extractBaseUrlFromPairingInput(pairingInput);
    if (!tauri || !pairingInput || !derivedBaseUrl) {
      if (tauri && pairingInput && !derivedBaseUrl) {
        setError(
          t(
            "settings.error.librarySyncPairingLinkRequired",
            "Paste the full pairing link from the host so the client can detect the host automatically.",
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
      setInfo(
        t(
          "settings.librarySyncClientPaired",
          "Desktop client paired successfully and is now using the detected host.",
        ),
      );
    } catch (pairError) {
      console.error(pairError);
      if (validation) {
        setLibrarySyncValidation({
          ...validation,
          ok: false,
          matches_library_id: false,
          message: t(
            "settings.librarySyncPairingInvalid",
            "Invalid pairing link. Create a new pairing link on the host and try again.",
          ),
        });
        setError(null);
      } else {
        setError(
          toErrorMessage(
            pairError,
            t(
              "settings.error.librarySyncPairHost",
              "Failed to pair this desktop client with the host.",
            ),
          ),
        );
      }
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [librarySyncDeviceNameDraft, librarySyncPairingDraft, t, tauri]);

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
      setInfo(
        t(
          "settings.librarySyncClientAuthCleared",
          "Desktop client pairing was removed from this device.",
        ),
      );
    } catch (clearError) {
      console.error(clearError);
      setError(
        toErrorMessage(
          clearError,
          t(
            "settings.error.librarySyncClearClientAuth",
            "Failed to remove the saved desktop client pairing.",
          ),
        ),
      );
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [librarySyncBusy, t, tauri]);

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
      setInfo(
        t(
          "settings.librarySyncRenewPairingInfo",
          "Saved pairing was cleared. Paste a fresh pairing link from the host to continue.",
        ),
      );
    } catch (clearError) {
      console.error(clearError);
      setError(
        toErrorMessage(
          clearError,
          t(
            "settings.error.librarySyncClearClientAuth",
            "Failed to remove the saved desktop client pairing.",
          ),
        ),
      );
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [librarySyncBusy, t, tauri]);

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
      setInfo(
        t("settings.librarySyncSnapshotRefreshed", "Host snapshot refreshed."),
      );
    } catch (snapshotError) {
      console.error(snapshotError);
      setError(
        toErrorMessage(
          snapshotError,
          t("settings.error.librarySyncSnapshot", "Failed to fetch host snapshot."),
        ),
      );
    } finally {
      setLibrarySyncSnapshotBusy(false);
    }
  }, [librarySyncHostBaseUrlDraft, librarySyncSettings, t, tauri]);

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

  useEffect(() => {
    if (!trustedLanPairingLink) {
      setTrustedLanPairingQrDataUrl(null);
      setTrustedLanPairingQrBusy(false);
      setTrustedLanPairingQrUnavailable(false);
      return;
    }

    let cancelled = false;
    setTrustedLanPairingQrDataUrl(null);
    setTrustedLanPairingQrBusy(true);
    setTrustedLanPairingQrUnavailable(false);

    void import("../lib/trusted_lan_pairing_qr")
      .then(({ buildTrustedLanPairingQrDataUrl }) =>
        buildTrustedLanPairingQrDataUrl(trustedLanPairingLink),
      )
      .then((dataUrl) => {
        if (cancelled) {
          return;
        }
        setTrustedLanPairingQrDataUrl(dataUrl);
      })
      .catch((qrError) => {
        console.error(qrError);
        if (cancelled) {
          return;
        }
        setTrustedLanPairingQrUnavailable(true);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setTrustedLanPairingQrBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trustedLanPairingLink]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    if (!tauri) {
      return;
    }

    void subscribeCatalogRefreshProgress((payload: CatalogRefreshProgressPayload) => {
      if (disposed) {
        return;
      }
      setCatalogRefreshVendor(payload.vendor === "eSUN" ? "eSUN" : "Bambu");
      setCatalogRefreshPhase(payload.phase);
      setCatalogRefreshProgressMessage(payload.message);
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [tauri]);

  useEffect(() => {
    const unlisten = onThemeModeChange((mode) => setThemeModeState(mode));
    return () => {
      unlisten();
    };
  }, []);

  useEffect(() => {
    if (!confirmDeletePrinterId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmDeletePrinterId(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [confirmDeletePrinterId]);

  useEffect(() => {
    if (!confirmDeletePrinterId) {
      return;
    }
    if (!printers.some((printer) => printer.id === confirmDeletePrinterId)) {
      setConfirmDeletePrinterId(null);
    }
  }, [confirmDeletePrinterId, printers]);

  useEffect(() => {
    if (!confirmResetAction) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmResetAction(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [confirmResetAction]);

  useEffect(() => {
    if (!confirmBulkSwatch) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmBulkSwatch(false);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [confirmBulkSwatch]);

  useEffect(() => {
    setConfirmBulkSwatch(false);
  }, [swatchVendorFilter, visibleMissingSwatchMasters.length]);

  useEffect(() => {
    if (!catalogRefreshSummary) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCatalogRefreshSummary(null);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [catalogRefreshSummary]);

  useEffect(() => {
    if (!catalogRefreshBusy || catalogRefreshStartedAt === null) {
      setCatalogRefreshElapsedSeconds(0);
      return;
    }
    const tick = () => {
      setCatalogRefreshElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - catalogRefreshStartedAt) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [catalogRefreshBusy, catalogRefreshStartedAt]);

  function handleStartEditPrinter(printer: PrinterRow) {
    const config = derivePrinterMultiConfig({
      printerId: printer.id,
      model: printer.model,
      printerOverview,
    });
    const liveConfig = bambuLiveIntegrations[printer.id];
    setEditPrinterId(printer.id);
    setEditPrinterModel(printer.model);
    setEditPrinterName(printer.name);
    setEditAmsUnits(String(config.units));
    setEditSlotsPerUnit(String(config.slotsPerUnit));
    setEditBambuLiveEnabled(liveConfig?.enabled ?? false);
    setEditBambuLiveHost(liveConfig?.host ?? "");
    setEditBambuLiveAccessCode(liveConfig?.access_code ?? "");
    setEditBambuLivePrinterSerial(liveConfig?.printer_serial ?? "");
    setExpandedBambuDetailsPrinterId(null);
    setConfirmDeletePrinterId(null);
  }

  function handleCancelEditPrinter() {
    setEditPrinterId(null);
    setEditPrinterModel("");
    setEditPrinterName("");
    setEditAmsUnits("0");
    setEditSlotsPerUnit("4");
    setEditBambuLiveEnabled(false);
    setEditBambuLiveHost("");
    setEditBambuLiveAccessCode("");
    setEditBambuLivePrinterSerial("");
    setExpandedBambuDetailsPrinterId(null);
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
          t(
            "settings.error.bambuLiveFieldsRequired",
            "Host, access code and printer serial are required when live Bambu status is enabled.",
          ),
        );
        return;
      }
      setError(t("settings.error.printerRequired", "Printer name and model are required."));
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (settingsClientReadOnly) {
        if (!settingsClientHostBaseUrl || !settingsClientLibraryId || !settingsClientHostWritePaired) {
          setError(
            t(
              "settings.error.librarySyncPrinterWriteRequiresPairing",
              "Pair this desktop client with the host before changing printers.",
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
        `${t("settings.updatedPrinter", "Updated printer")} "${prepared.printer.name}".`,
      );
      handleCancelEditPrinter();
    } catch (updateError) {
      console.error(updateError);
      setError(
        toErrorMessage(
          updateError,
          t("settings.error.updatePrinter", "Failed to update printer."),
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
        `${t(
          "settings.confirmDeleteTapAgain",
          "Click Remove again to confirm deleting printer",
        )} "${printer.name}".`,
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
            t(
              "settings.error.librarySyncPrinterWriteRequiresPairing",
              "Pair this desktop client with the host before changing printers.",
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
      setInfo(`${t("settings.removedPrinter", "Removed printer")} "${printer.name}".`);
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        toErrorMessage(
          deleteError,
          t("settings.error.deletePrinter", "Failed to delete printer."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetAppData() {
    if (!tauri || busy) {
      return;
    }
    if (confirmResetAction !== "APP") {
      setConfirmResetAction("APP");
      setError(null);
      setInfo(
        t(
          "settings.confirmResetAppTapAgain",
          "Click Reset app data again to confirm.",
        ),
      );
      return;
    }
    setConfirmResetAction(null);
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await resetAppData();
      setLastCatalogReset(null);
      await reloadSettings();
      setInfo(t("settings.resetDone", "App data reset completed."));
    } catch (resetError) {
      console.error(resetError);
      setError(
        toErrorMessage(
          resetError,
          t("settings.error.resetApp", "Failed to reset app data."),
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
    if (confirmResetAction !== "CATALOG") {
      setConfirmResetAction("CATALOG");
      setError(null);
      setInfo(
        t(
          "settings.confirmResetCatalogsTapAgain",
          "Click Reset catalogs again to confirm.",
        ),
      );
      return;
    }
    setConfirmResetAction(null);
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
          t("settings.error.resetCatalogs", "Failed to reset catalogs."),
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
      setLastFullBackupExportedAt(exportedAt);
      setLastBackupValidation(validationSummary);
      setLastFullBackupValidatedAt(
        isFullBackupValidationFormat(validationSummary.format) ? exportedAt : null,
      );
      setInfo(
        `${t(
          "settings.backupExported",
          "Full backup exported (inventory, history and printers).",
        )} ${t(
          "settings.librarySyncBackupAutoValidated",
          "The exported backup was validated automatically and is ready to use in the guided role-change flow.",
        )}`,
      );
    } catch (backupError) {
      console.error(backupError);
      setError(
        toErrorMessage(
          backupError,
          t("settings.error.exportBackup", "Failed to export full backup."),
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
      setInfo(t("settings.inventoryCsvExported", "Inventory CSV exported."));
    } catch (exportError) {
      console.error(exportError);
      setError(
        toErrorMessage(
          exportError,
          t("settings.error.exportInventoryCsv", "Failed to export inventory CSV."),
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
      setInfo(t("settings.inventoryJsonExported", "Inventory JSON exported."));
    } catch (exportError) {
      console.error(exportError);
      setError(
        toErrorMessage(
          exportError,
          t("settings.error.exportInventoryJson", "Failed to export inventory JSON."),
        ),
      );
    } finally {
      setBusy(false);
    }
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
        labels: {
          borrowedIn: t("inventory.borrowedIn", "Borrowed in"),
          unknown: t("common.unknown", "Unknown"),
        },
        buildFilamentQrPayload,
        buildFilamentLabelQrDataUrl,
      });

      const pdfBase64 = await buildInventoryOverviewPrintPdfBase64(printRows, {
        title: t("settings.inventoryOverviewPrintTitle", "In-stock filament overview"),
        generatedAt: t("settings.inventoryOverviewPrintGeneratedAt", "Generated"),
        groupMaterial: t("settings.inventoryOverviewPrintGroupMaterial", "Material group"),
        empty: t("settings.inventoryOverviewPrintEmpty", "No filament in stock."),
        vendor: t("settings.inventoryOverviewPrintVendor", "Vendor"),
        material: t("settings.inventoryOverviewPrintMaterial", "Material"),
        filament: t("settings.inventoryOverviewPrintFilament", "Filament"),
        homeLocation: t("inventory.homeLocationLabel", "Home location"),
        reference: t("settings.inventoryOverviewPrintReference", "Reference"),
      });
      await printLabelPdf(pdfBase64, null, 1);
      setInfo(
        t(
          "settings.inventoryOverviewPrintDone",
          "A4 inventory overview PDF opened for printing.",
        ),
      );
    } catch (printError) {
      console.error(printError);
      setError(
        toErrorMessage(
          printError,
          t(
            "settings.error.inventoryOverviewPrint",
            "Failed to print inventory overview.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleOpenDataImport() {
    if (!tauri || busy) {
      return;
    }
    setConfirmResetAction(null);
    backupImportInputRef.current?.click();
  }

  function handleOpenBackupValidate() {
    if (!tauri || busy) {
      return;
    }
    setConfirmResetAction(null);
    backupValidateInputRef.current?.click();
  }

  async function handleImportDataFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tauri || busy) {
      return;
    }
    setConfirmResetAction(null);
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      const result = await importDataFile(content);
      setLastCatalogReset(null);
      setLastBackupValidation(null);
      await reloadSettings();
      if (result.detected_format === "FULL_BACKUP") {
        const importedAt = new Date().toISOString();
        setLastFullBackupImportedAt(importedAt);
        if (librarySyncModeDraft === "CLIENT") {
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
          t("settings.error.importData", "Failed to import selected file."),
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
      setLastBackupValidation(summary);
      if (isFullBackupValidationFormat(summary.format)) {
        setLastFullBackupValidatedAt(new Date().toISOString());
      }
      setInfo(t("settings.backupValidationDone", "Backup validation completed."));
    } catch (validationError) {
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          t("settings.error.validateBackup", "Failed to validate backup file."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function updateSwatchDraft(masterId: string, value: string) {
    setSwatchDraftById((previous) => ({
      ...previous,
      [masterId]: value,
    }));
  }

  function toggleCatalogRefreshMaterial(vendor: CatalogVendor, material: string) {
    const setter = vendor === "Bambu" ? setBambuRefreshMaterials : setEsunRefreshMaterials;
    setter((previous) => toggleSettingsCatalogRefreshMaterial(previous, material));
  }

  function clearCatalogRefreshMaterials(vendor: CatalogVendor) {
    if (vendor === "Bambu") {
      setBambuRefreshMaterials([]);
      return;
    }
    setEsunRefreshMaterials([]);
  }

  async function handleRefreshVendorCatalog(vendor: CatalogVendor) {
    if (!tauri || busy || swatchBusy || catalogRefreshBusy) {
      return;
    }
    const materialTypes = vendor === "Bambu" ? bambuRefreshMaterials : esunRefreshMaterials;
    setCatalogRefreshVendor(vendor);
    setCatalogRefreshPhase("PREPARE");
    setCatalogRefreshProgressMessage(
      vendor === "Bambu"
        ? t("wishlist.refreshPreparingBambu", "Preparing Bambu catalog refresh...")
        : t("wishlist.refreshPreparingEsun", "Preparing eSUN catalog refresh..."),
    );
    setCatalogRefreshStartedAt(Date.now());
    setCatalogRefreshBusy(true);
    setCatalogRefreshSummary(null);
    setCatalogRefreshLog("");
    setError(null);
    setInfo(null);
    try {
      const summary =
        vendor === "Bambu"
          ? await refreshBambuCatalog(materialTypes)
          : await refreshEsunCatalog(materialTypes);
      setCatalogRefreshSummary(summary);
      setCatalogRefreshLog(summary.output ?? "");
      await reloadSettings();
      if (summary.imported === 0) {
        setError(
          vendor === "Bambu"
            ? t(
                "wishlist.error.zeroBambu",
                "Refresh completed with 0 imported rows. The store may be rate-limited or changed.",
              )
            : t(
                "wishlist.error.zeroEsun",
                "eSUN refresh completed with 0 imported rows. Store format may have changed.",
              ),
        );
      } else {
        setInfo(
          buildSettingsCatalogRefreshSuccessMessage(summary, {
            imported: t("inventory.imported", "Imported"),
            reactivated: t("inventory.reactivated", "Reactivated"),
            discontinued: t("inventory.discontinued", "Discontinued"),
          }),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const fallbackMessage =
        vendor === "Bambu"
          ? t("wishlist.error.refreshBambu", "Catalog refresh failed.")
          : t("wishlist.error.refreshEsun", "eSUN catalog refresh failed.");
      const message = toErrorMessage(refreshError, fallbackMessage);
      setCatalogRefreshLog(message);
      setShowCatalogRefreshLog(true);
      setError(
        message,
      );
    } finally {
      setCatalogRefreshBusy(false);
      setCatalogRefreshStartedAt(null);
    }
  }

  async function handleSaveMissingSwatch(master: MasterCatalogRow) {
    if (!tauri || busy || swatchBusy) {
      return;
    }
    const normalizedHex = resolveSettingsSwatchHex({ master, swatchDraftById });
    if (!normalizedHex) {
      setError(
        t(
          "settings.error.invalidSwatchHex",
          "Invalid swatch hex value. Use #RGB or #RRGGBB.",
        ),
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
        `${t("settings.swatchSaved", "Saved swatch")}: ${formatFilamentDisplayTitle(
          master.material,
          master.filament_name,
          master.color_name,
        )}`,
      );
      await reloadSettings();
    } catch (saveError) {
      console.error(saveError);
      setError(
        t("settings.error.saveSwatch", "Failed to save swatch for selected filament."),
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
      setConfirmBulkSwatch(false);
      setInfo(t("settings.noMissingSwatches", "No missing swatches to fill."));
      return;
    }
    if (!confirmBulkSwatch) {
      setError(null);
      setConfirmBulkSwatch(true);
      setInfo(
        t(
          "settings.confirmBulkSwatchTapAgain",
          "Click Auto-fill visible missing swatches again to confirm.",
        ),
      );
      return;
    }
    setConfirmBulkSwatch(false);
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
      failed: t("settings.failed", "failed"),
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

  function handleThemeSelection(mode: ThemeMode) {
    setThemeMode(mode);
    setThemeModeState(mode);
    setInfo(`${t("settings.themeSetTo", "Theme mode set to")} ${mode}.`);
  }

  function handleLocaleSelection(nextLocale: Locale) {
    setLocale(nextLocale);
    setInfo(
      nextLocale === "nb"
        ? t("settings.langSetNb", "Language set to Norwegian.")
        : t("settings.langSetEn", "Language set to English."),
    );
  }

  async function handleSaveTrustedLanConfig() {
    await persistTrustedLanConfig(
      trustedLanEnabledDraft,
      t("settings.trustedLanNetworkSaved", "Web app network settings saved."),
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
        ? t("settings.trustedLanEnabledInfo", "Web app server turned on.")
        : t("settings.trustedLanDisabledInfo", "Web app server turned off."),
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
      setInfo(
        t(
          "settings.trustedLanPairingCreated",
          "Trusted-LAN pairing link created and copied.",
        ),
      );
      await loadTrustedLanCompanionStatus();
    } catch (pairError) {
      console.error(pairError);
      setError(
        toErrorMessage(
          pairError,
          t(
            "settings.error.createTrustedLanPairing",
            "Failed to create a trusted-LAN pairing link.",
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
      setInfo(
        t(
          "settings.trustedLanPairingCopied",
          "Trusted-LAN pairing link copied.",
        ),
      );
    } catch (copyError) {
      console.error(copyError);
      setError(
        toErrorMessage(
          copyError,
          t(
            "settings.error.copyTrustedLanPairing",
            "Failed to copy the trusted-LAN pairing link.",
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
      setInfo(
        t(
          "settings.trustedLanBrowserRevoked",
          "Trusted-LAN browser revoked.",
        ),
      );
    } catch (revokeError) {
      console.error(revokeError);
      setError(
        toErrorMessage(
          revokeError,
          t(
            "settings.error.revokeTrustedLanBrowser",
            "Failed to revoke the trusted-LAN browser.",
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
      setInfo(
        t(
          "settings.trustedLanAllBrowsersRevoked",
          "All trusted-LAN browsers revoked.",
        ),
      );
    } catch (revokeError) {
      console.error(revokeError);
      setError(
        toErrorMessage(
          revokeError,
          t(
            "settings.error.revokeAllTrustedLanBrowsers",
            "Failed to revoke trusted-LAN browsers.",
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  const trustedLanCompanionModel = buildTrustedLanCompanionModel({
    trustedLanStatus,
    statusLoading: trustedLanLoading,
    actionBusy: trustedLanActionBusy,
    t,
  });
  const librarySyncRoleOptions = [
    {
      mode: "STANDALONE" as const,
      label: t("settings.librarySyncStandalone", "Standalone"),
    },
    {
      mode: "HOST" as const,
      label: t("settings.librarySyncHost", "Host"),
    },
    {
      mode: "CLIENT" as const,
      label: t("settings.librarySyncClient", "Client"),
    },
  ];
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

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.settings", "Settings")}</h1>
          <div className="page-subtitle">
            {t(
              "settings.subtitle",
              "Configure trusted-LAN browser access, printers, catalogue updates and maintenance actions.",
            )}
          </div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t("settings.desktopOnly", "Settings are only available in the desktop app build.")}
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
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={tabButtonClass(activeTab === tab.id)}
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
              <div className="section-eyebrow">
                {t("settings.libraryTabTitle", "Library and web app")}
              </div>

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
              onToggleCatalogRefreshLog={() => setShowCatalogRefreshLog((current) => !current)}
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
