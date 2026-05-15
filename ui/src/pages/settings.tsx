import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SettingsTabKey } from "../App";
import {
  isValidHexColor,
  normalizeHexColor,
  suggestHexFromColor,
} from "../lib/color_utils";
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
  useResolvedTheme,
  type ThemeMode,
} from "../lib/theme_mode";
import { FeedbackBanner } from "../components/feedback_banner";
import { useI18n, type Locale } from "../lib/i18n";
import { toErrorMessage } from "../lib/error_text";
import { buildInventoryExportCsv, buildInventoryExportJson } from "../lib/inventory_export";
import {
  clampInt,
  extractBaseUrlFromPairingInput,
  formatDiagnosticJson,
  formatSettingsDateTime,
  isFullBackupValidationFormat,
  parseNonNegativeInt,
  parsePositiveInt,
  waitForMs,
} from "../lib/settings_utils";
import { copyTextToClipboard } from "../lib/clipboard";
import { PrinterModelPreview } from "../components/printer_model_preview";
import { SettingsGeneralTab } from "../components/settings_general_tab";
import { SettingsLibraryRoleModal } from "../components/settings_library_role_modal";
import { SettingsMaintenanceTab } from "../components/settings_maintenance_tab";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
import { SettingsPrinterEditForm } from "../components/settings_printer_edit_form";
import { SettingsMetricTile } from "../components/settings_ui";
import { SettingsBambuLiveCaptureChartPanel } from "../components/settings_bambu_live_capture_chart_panel";
import { SettingsBambuLiveCapturedFieldsPanel } from "../components/settings_bambu_live_captured_fields_panel";
import { SettingsBambuLiveDiagnosticsSummary } from "../components/settings_bambu_live_diagnostics_summary";
import { SettingsBambuLiveTrayCards } from "../components/settings_bambu_live_tray_cards";
import { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";
import { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";
import { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";
import {
  chipButtonClass,
  settingsActionButtonClass,
  settingsChoiceButtonClass,
  settingsLibraryRoleButtonClass,
  settingsWebappStatusClass,
  settingsWebappSwitchClass,
  settingsWebappSwitchKnobClass,
  settingsWebappSwitchTrackClass,
  tabButtonClass,
} from "../lib/settings_ui_classes";
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
  describePrinterCapability,
  describeConfiguredPrinterSetup,
  findPrinterModelProfileExact,
  hasConfiguredMultiMaterial,
  resolvePrinterModelProfile,
} from "../lib/printer_profiles";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import {
  buildTrustedLanCompanionModel,
  findNewTrustedLanActiveBrowserIds,
  buildTrustedLanPairedBrowserListModel,
  resolveTrustedLanInterfaceAddressDraft,
} from "./settings_companion_model";
import {
  buildLibraryRoleChangeState,
  type LibrarySyncMode,
} from "./settings_library_sync_model";
import {
  buildSettingsBambuLiveDiagnosticsModel,
  createSettingsBambuLiveCaptureSession,
} from "./settings_bambu_live_diagnostics_model";
import { derivePrinterMultiConfig, isBambuLabPrinter } from "./settings_printer_model";

type SettingsTab = "GENERAL" | "LIBRARY" | "PRINTERS" | "CATALOG" | "MAINTENANCE";
type ResetConfirmAction = "APP" | "CATALOG";
type CatalogVendor = "Bambu" | "eSUN";
type SettingsPageProps = {
  initialTab?: SettingsTabKey;
};

export default function SettingsPage({ initialTab = "GENERAL" }: SettingsPageProps) {
  const tauri = isTauri();
  const { locale, setLocale, t } = useI18n();
  const resolvedTheme = useResolvedTheme();
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

  const sortedPrinters = useMemo(() => {
    const collator = new Intl.Collator(locale, {
      numeric: true,
      sensitivity: "base",
    });
    return [...printers].sort((left, right) => {
      const byName = collator.compare(left.name, right.name);
      if (byName !== 0) {
        return byName;
      }
      return collator.compare(left.model, right.model);
    });
  }, [locale, printers]);

  const editModelProfile = useMemo(
    () => resolvePrinterModelProfile(editPrinterModel || ""),
    [editPrinterModel],
  );
  const backupValidationHasWarnings = useMemo(() => {
    if (!lastBackupValidation) {
      return false;
    }
    return (
      lastBackupValidation.missing_tables.length > 0 ||
      lastBackupValidation.extra_tables.length > 0
    );
  }, [lastBackupValidation]);
  const backupValidationHasMissingTables = useMemo(
    () => (lastBackupValidation?.missing_tables.length ?? 0) > 0,
    [lastBackupValidation],
  );
  const backupValidationHasExtraTables = useMemo(
    () => (lastBackupValidation?.extra_tables.length ?? 0) > 0,
    [lastBackupValidation],
  );
  const hasValidatedFullBackup = useMemo(
    () => isFullBackupValidationFormat(lastBackupValidation?.format),
    [lastBackupValidation],
  );
  const hasValidatedLatestFullBackup = useMemo(() => {
    if (!hasValidatedFullBackup) {
      return false;
    }
    if (!lastFullBackupExportedAt) {
      return true;
    }
    if (!lastFullBackupValidatedAt) {
      return false;
    }
    const exportedAt = new Date(lastFullBackupExportedAt).getTime();
    const validatedAt = new Date(lastFullBackupValidatedAt).getTime();
    if (Number.isNaN(exportedAt) || Number.isNaN(validatedAt)) {
      return false;
    }
    return validatedAt >= exportedAt;
  }, [hasValidatedFullBackup, lastFullBackupExportedAt, lastFullBackupValidatedAt]);
  const librarySyncSavedMode = (librarySyncSettings?.mode as LibrarySyncMode | undefined) ?? "STANDALONE";
  const settingsClientReadOnly = librarySyncSavedMode === "CLIENT";
  const settingsClientHostBaseUrl = librarySyncSettings?.host_base_url ?? null;
  const settingsClientLibraryId = librarySyncSettings?.library_id ?? null;
  const settingsClientHostWritePaired = librarySyncSettings?.client_auth_paired ?? false;
  const settingsClientHostNeedsRepair =
    settingsClientHostWritePaired &&
    Boolean(librarySyncValidation?.pairing_checked) &&
    !librarySyncValidation?.pairing_valid;
  const settingsClientHostPairingValid =
    !settingsClientHostWritePaired ||
    !librarySyncValidation?.pairing_checked ||
    librarySyncValidation.pairing_valid;
  const missingSwatchMasters = useMemo(
    () => catalogMasters.filter((master) => !isValidHexColor(master.hex_color)),
    [catalogMasters],
  );

  const visibleMissingSwatchMasters = useMemo(() => {
    if (swatchVendorFilter === "ALL") {
      return missingSwatchMasters;
    }
    return missingSwatchMasters.filter(
      (master) => master.vendor.toLowerCase() === swatchVendorFilter.toLowerCase(),
    );
  }, [missingSwatchMasters, swatchVendorFilter]);

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

  const swatchVendorOptions = useMemo(() => {
    const vendors = Array.from(
      new Set(missingSwatchMasters.map((master) => master.vendor).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
    return ["ALL", ...vendors];
  }, [missingSwatchMasters]);

  const bambuCatalogMasters = useMemo(
    () => catalogMasters.filter((master) => master.vendor.toLowerCase().includes("bambu")),
    [catalogMasters],
  );

  const esunCatalogMasters = useMemo(
    () => catalogMasters.filter((master) => master.vendor.toLowerCase().includes("esun")),
    [catalogMasters],
  );

  const bambuCatalogMaterialOptions = useMemo(
    () =>
      Array.from(
        new Set(
          bambuCatalogMasters
            .map((master) => master.material.trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [bambuCatalogMasters],
  );

  const esunCatalogMaterialOptions = useMemo(
    () =>
      Array.from(
        new Set(
          esunCatalogMasters
            .map((master) => master.material.trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [esunCatalogMasters],
  );

  const activeCatalogMaterialOptions = useMemo(
    () => (catalogVendor === "Bambu" ? bambuCatalogMaterialOptions : esunCatalogMaterialOptions),
    [bambuCatalogMaterialOptions, catalogVendor, esunCatalogMaterialOptions],
  );

  const activeCatalogRefreshMaterials = useMemo(
    () => (catalogVendor === "Bambu" ? bambuRefreshMaterials : esunRefreshMaterials),
    [bambuRefreshMaterials, catalogVendor, esunRefreshMaterials],
  );
  const activeCatalogMasterCount = useMemo(
    () => (catalogVendor === "Bambu" ? bambuCatalogMasters.length : esunCatalogMasters.length),
    [bambuCatalogMasters, catalogVendor, esunCatalogMasters],
  );
  const visibleMissingSwatchVendorCount = useMemo(
    () =>
      Array.from(
        new Set(visibleMissingSwatchMasters.map((master) => master.vendor).filter(Boolean)),
      ).length,
    [visibleMissingSwatchMasters],
  );
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
  const trustedLanNetworkDirty = useMemo(() => {
    const currentAddress = trustedLanStatus?.selected_interface_address?.trim() ?? "";
    const currentPort = trustedLanStatus?.listen_port ?? 4278;
    return (
      trustedLanInterfaceAddressDraft !== currentAddress ||
      parsePositiveInt(trustedLanPortDraft, 4278) !== currentPort
    );
  }, [trustedLanInterfaceAddressDraft, trustedLanPortDraft, trustedLanStatus]);

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
      const nextDrafts: Record<string, string> = {};
      for (const master of catalogRows) {
        const normalized = normalizeHexColor(master.hex_color, { uppercase: true });
        nextDrafts[master.id] = normalized ?? suggestHexFromColor(master);
      }
      setSwatchDraftById(nextDrafts);
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

      const saved = await saveLibrarySyncSettings({
        mode: nextMode,
        device_name: librarySyncDeviceNameDraft,
        library_id: librarySyncSettings.library_id,
        host_base_url: nextMode === "CLIENT" ? librarySyncHostBaseUrlDraft : null,
        host_device_name: nextMode === "CLIENT" ? librarySyncSettings.host_device_name ?? null : null,
        client_auth_paired: nextMode === "CLIENT" ? librarySyncSettings.client_auth_paired ?? false : false,
        client_auth_paired_at:
          nextMode === "CLIENT" ? librarySyncSettings.client_auth_paired_at ?? null : null,
        client_auth_expires_at:
          nextMode === "CLIENT" ? librarySyncSettings.client_auth_expires_at ?? null : null,
      });

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
      await saveLibrarySyncSettings({
        mode: "CLIENT",
        device_name: librarySyncDeviceNameDraft,
        library_id: validation.library_id,
        host_base_url: validation.base_url,
        host_device_name: validation.device_name ?? null,
        client_auth_paired: false,
        client_auth_paired_at: null,
        client_auth_expires_at: null,
      });
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
    const model = editPrinterModel.trim();
    const name = editPrinterName.trim();
    if (!current || !model || !name) {
      setError(t("settings.error.printerRequired", "Printer name and model are required."));
      return;
    }
    if (
      editBambuLiveEnabled &&
      (!editBambuLiveHost.trim() || !editBambuLiveAccessCode.trim() || !editBambuLivePrinterSerial.trim())
    ) {
      setError(
        t(
          "settings.error.bambuLiveFieldsRequired",
          "Host, access code and printer serial are required when live Bambu status is enabled.",
        ),
      );
      return;
    }
    const profile = resolvePrinterModelProfile(model);
    const units = clampInt(
      parseNonNegativeInt(editAmsUnits, profile.defaultUnits),
      0,
      profile.maxUnits,
    );
    const slots = clampInt(
      parsePositiveInt(editSlotsPerUnit, profile.defaultSlotsPerUnit),
      1,
      profile.maxSlotsPerUnit,
    );

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
          {
            id: editPrinterId,
            model,
            name,
            ams_units: units,
            slots_per_ams: slots,
          },
          {
            clientReadOnly: true,
            clientHostBaseUrl: settingsClientHostBaseUrl,
            clientLibraryId: settingsClientLibraryId,
          },
        );
      } else {
        await createManagedPrinter({
          id: editPrinterId,
          model,
          name,
          ams_units: units,
          slots_per_ams: slots,
        });
        if (editBambuLiveEnabled) {
          await saveBambuLiveIntegration({
            printer_id: editPrinterId,
            enabled: true,
            host: editBambuLiveHost.trim() || null,
            access_code: editBambuLiveAccessCode.trim() || null,
            printer_serial: editBambuLivePrinterSerial.trim() || null,
          });
        } else {
          await deleteBambuLiveIntegration(editPrinterId);
        }
      }
      await reloadSettings();
      setInfo(
        `${t("settings.updatedPrinter", "Updated printer")} "${name}".`,
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
      setInfo(
        `${t("settings.catalogResetDone", "Catalog reset done")}. ${t(
          "settings.removed",
          "Removed",
        )} ${result.removed_count}, ${t("settings.remaining", "remaining")} ${result.remaining_count}, ${t("settings.reactivated", "reactivated")} ${result.reactivated_count}.`,
      );
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

  function downloadTextFile(content: string, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
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

      const inStockRows = allRows
        .filter((row) => {
          const status = row.spool.status.trim().toUpperCase();
          return status !== "EMPTY";
        })
        .sort((left, right) => {
          const materialOrder = left.master.material.localeCompare(right.master.material, locale);
          if (materialOrder !== 0) {
            return materialOrder;
          }
          const filamentOrder = left.master.filament_name.localeCompare(
            right.master.filament_name,
            locale,
          );
          if (filamentOrder !== 0) {
            return filamentOrder;
          }
          return left.master.color_name.localeCompare(right.master.color_name, locale);
        });

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

      const printRows = await Promise.all(
        inStockRows.map(async (row) => {
          const qrReference = row.spool.id.trim();
          const qrPayload = buildFilamentQrPayload(qrReference, {
            mode: "companion",
            companionShellUrl,
          }).payload;
          const qrDataUrl = await buildFilamentLabelQrDataUrl(qrPayload);
          return {
            reference: row.spool.id || t("common.unknown", "Unknown"),
            vendor: row.master.vendor || t("common.unknown", "Unknown"),
            ownershipMarker:
              (row.spool.ownership_type ?? "OWNED").trim().toUpperCase() === "BORROWED_IN"
                ? t("inventory.borrowedIn", "Borrowed in")
                : null,
            material: row.master.material || t("common.unknown", "Unknown"),
            filamentName: row.master.filament_name || t("common.unknown", "Unknown"),
            colorName: row.master.color_name || t("common.unknown", "Unknown"),
            homeLocation: row.spool.home_location_id ?? null,
            swatchHex: row.master.hex_color ?? "#CBD5E1",
            qrDataUrl,
          };
        }),
      );

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
          setInfo(
            `${t("settings.backupImported", "Full backup imported successfully.")} ${t(
              "settings.validationRows",
              "Rows",
            )}: ${result.imported_count}. ${t(
              "settings.librarySyncImportedOnClientHint",
              "This device is now prepared as the next host. Review Library roles and save when ready to take over.",
            )}`,
          );
          return;
        }
        setInfo(
          `${t("settings.backupImported", "Full backup imported successfully.")} ${t(
            "settings.validationRows",
            "Rows",
          )}: ${result.imported_count}.`,
        );
      } else {
        const sourceLabel =
          result.detected_format === "INVENTORY_CSV"
            ? t("settings.importDetectedInventoryCsv", "Inventory CSV")
            : t("settings.importDetectedInventoryJson", "Inventory JSON");
        setInfo(
          `${t("settings.inventoryImportDone", "Inventory import completed.")} ${t(
            "settings.importSource",
            "Source",
          )}: ${sourceLabel}. ${t("settings.validationRows", "Rows")}: ${
            result.imported_count
          } (${t("settings.created", "created")} ${result.created_count}, ${t(
            "settings.updated",
            "updated",
          )} ${result.updated_count}).`,
        );
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
    setter((previous) =>
      previous.includes(material)
        ? previous.filter((item) => item !== material)
        : [...previous, material],
    );
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
          `${t("inventory.imported", "Imported")} ${summary.imported} · ${t(
            "inventory.reactivated",
            "Reactivated",
          )} ${summary.reactivated_count} · ${t(
            "inventory.discontinued",
            "Discontinued",
          )} ${summary.discontinued_count}`,
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
    const normalizedHex =
      normalizeHexColor(swatchDraftById[master.id], { uppercase: true }) ?? suggestHexFromColor(master);
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
        const normalizedHex =
          normalizeHexColor(swatchDraftById[master.id], { uppercase: true }) ?? suggestHexFromColor(master);
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
      if (updated === 0) {
        setError(
          `${t(
            "settings.swatchBulkNoneUpdated",
            "No visible missing swatches could be auto-filled.",
          )} ${t("settings.failed", "failed")} ${failed}${
            skipped > 0 ? `, ${t("settings.skipped", "skipped")} ${skipped}` : ""
          }.`,
        );
        return;
      }
      setInfo(
        `${t("settings.swatchBulkDone", "Swatch bulk update completed")}: ${t(
          "settings.updated",
          "updated",
        )} ${updated}${failed > 0 ? `, ${t("settings.failed", "failed")} ${failed}` : ""}${
          skipped > 0 ? `, ${t("settings.skipped", "skipped")} ${skipped}` : ""
        }.`,
      );
    } finally {
      setSwatchBusy(false);
    }
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
  const showLibraryDeviceFields = librarySyncModeDraft === "HOST";
  const showLibraryWebappDetails =
    librarySyncModeDraft === "HOST" ||
    trustedLanEnabledDraft ||
    Boolean(trustedLanStatus?.enabled) ||
    showTrustedLanNetworkEditor ||
    Boolean(trustedLanPairingLink) ||
    trustedLanPairedBrowsers.length > 0;
  const standaloneWebappEnabled = librarySyncModeDraft === "STANDALONE" && trustedLanEnabledDraft;
  const clientHasStatusDetails = Boolean(
    librarySyncSettings?.last_checked_at ||
      librarySyncSettings?.last_reachable_at ||
      librarySyncSettings?.last_validation_message,
  );
  const clientHasSnapshot = Boolean(librarySyncSnapshot);
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
          <section className="surface-card xl:col-span-2">
            <div className="section-eyebrow">
              {t("nav.printers", "Printers")}
            </div>

            <div className="mt-5 space-y-2">
              {loading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  {t("common.loadingPrinters", "Loading printers...")}
                </div>
              ) : null}
              {!loading && printers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  {t("printers.noPrinters", "No printers configured yet. Use Add printer to create one.")}
                </div>
              ) : null}
              {sortedPrinters.map((printer) => {
                const printerSlots =
                  printerOverview.find((item) => item.printer.id === printer.id)?.slots ?? [];
                const liveConfig = bambuLiveIntegrations[printer.id] ?? null;
                const diagnosticSession = diagnosticCaptureByPrinterId[printer.id] ?? null;
                const captureActive = diagnosticCaptureActiveByPrinterId[printer.id] ?? false;
                const diagnosticSort = diagnosticSortByPrinterId[printer.id] ?? "path";
                const diagnosticFilter = diagnosticFilterByPrinterId[printer.id] ?? "all";
                const {
                  amsReadInProgress,
                  diagnosticChartFields,
                  diagnosticChartPoints,
                  diagnosticFields,
                  diagnosticGroups,
                  diagnosticMetricCards,
                  diagnosticTrayCards,
                  fallbackSummaryParts,
                  observedState,
                  observedSummaryParts,
                  reviewTrayCount,
                  selectedDiagnosticChartField,
                  signalQualityBuckets,
                  sortedDiagnosticFields,
                } = buildSettingsBambuLiveDiagnosticsModel({
                  diagnosticFilter,
                  diagnosticSession,
                  diagnosticSort,
                  formatDateTime: (value) => formatSettingsDateTime(value, locale),
                  liveConfig,
                  selectedChartFieldPath: diagnosticChartFieldByPrinterId[printer.id],
                  spoolRows,
                  t,
                });
                const hasMultiMaterial = hasConfiguredMultiMaterial(printerSlots);
                const configuredSetup = describeConfiguredPrinterSetup(
                  t,
                  printer.model,
                  printerSlots,
                );
                const isEditing = editPrinterId === printer.id;
                return (
                  <div
                    key={printer.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50"
                    style={printerBrandSurfaceStyle(printer.model, "compact", resolvedTheme)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <PrinterModelPreview
                          model={printer.model}
                          hasMultiMaterial={hasMultiMaterial}
                          compact
                        />
                        <div className="text-sm text-slate-700 dark:text-slate-200">
                          <span className="font-semibold text-slate-900 dark:text-slate-50">
                            {printer.name}
                          </span>{" "}
                          {liveConfig?.enabled ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                              {t("settings.bambuLiveBadge", "Live")}
                              {reviewTrayCount > 0 ? <span aria-hidden="true">!</span> : null}
                            </span>
                          ) : null}{" "}
                          · {printer.model} ·{" "}
                          {describePrinterCapability(t, printer.model, hasMultiMaterial)} ·{" "}
                          {configuredSetup}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {liveConfig?.enabled ? (
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                            onClick={() => handleToggleBambuLiveDetails(printer.id)}
                            disabled={!tauri}
                          >
                            {expandedBambuDetailsPrinterId === printer.id
                              ? t("settings.hideObservedDetails", "Hide observed details")
                              : t("settings.showObservedDetails", "Show observed details & capture")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                            isEditing
                              ? "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
                              : "border-slate-200 text-slate-700 dark:border-slate-500 dark:text-slate-200"
                          }`}
                          onClick={() => {
                            if (isEditing) {
                              handleCancelEditPrinter();
                            } else {
                              handleStartEditPrinter(printer);
                            }
                          }}
                          disabled={!tauri || busy}
                        >
                          {isEditing
                            ? t("common.close", "Close")
                            : t("settings.reconfigure", "Reconfigure")}
                        </button>
                        <button
                          type="button"
                          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                            confirmDeletePrinterId === printer.id
                              ? "border-rose-500 bg-rose-600 text-white dark:border-rose-400 dark:bg-rose-500 dark:text-slate-900"
                              : "border-rose-200 text-rose-700 dark:border-rose-500/50 dark:text-rose-300"
                          }`}
                          onClick={() => void handleDeletePrinter(printer)}
                          disabled={!tauri || busy}
                        >
                          {confirmDeletePrinterId === printer.id
                            ? t("settings.confirmRemove", "Confirm remove")
                            : t("common.remove", "Remove")}
                        </button>
                      </div>
                    </div>

                    {expandedBambuDetailsPrinterId === printer.id && liveConfig?.enabled ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                        {observedState ? (
                          <div className="space-y-3">
                            <div>
                              {t("settings.bambuLiveStatus", "Connection status")}:{" "}
                              {observedState.mqtt_connected
                                ? t("settings.bambuLiveConnected", "Connected")
                                : t("settings.bambuLiveDisconnected", "Not connected")}
                            </div>
                            <div>
                              {t("settings.bambuLiveLastSeen", "Last seen")}:{" "}
                              {observedState.last_seen_at
                                ? formatSettingsDateTime(
                                    observedState.last_seen_at,
                                    locale,
                                  )
                                : "—"}
                            </div>
                            <div>
                              {t("settings.bambuLiveObservedSummary", "Observed summary")}:{" "}
                              {observedSummaryParts.join(" · ") ||
                                fallbackSummaryParts.join(" · ") ||
                                "—"}
                            </div>
                            {observedState.raw_status_note ? (
                              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                {observedState.raw_status_note}
                              </div>
                            ) : null}
                            {amsReadInProgress ? (
                              <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                                {t(
                                  "settings.bambuLiveAmsReading",
                                  "AMS refresh in progress. RFID and tray matching can look temporarily uncertain until reading finishes.",
                                )}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                  {captureActive
                                    ? t("settings.bambuLiveCaptureRunning", "Capture is running")
                                    : t("settings.bambuLiveCapturePaused", "Capture is paused")}
                                </span>
                                <span className="ml-2">
                                  {captureActive
                                    ? t(
                                        "settings.bambuLiveCaptureRunningHint",
                                        "Incoming live bursts are being collected into this session now.",
                                      )
                                    : t(
                                        "settings.bambuLiveCapturePausedHint",
                                        "The current session is frozen until you start capture again.",
                                      )}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className={`rounded border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                                    captureActive
                                      ? "border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-200"
                                      : "border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-200"
                                  }`}
                                  onClick={() => handleToggleBambuLiveCapture(printer.id, captureActive)}
                                >
                                  {captureActive
                                    ? t("settings.bambuLiveStopCapture", "Stop capture")
                                    : t("settings.bambuLiveStartCapture", "Start capture")}
                                </button>
                              </div>
                            </div>
                            <SettingsBambuLiveTrayCards
                              moreCandidatesLabel={t(
                                "settings.bambuLiveMoreInventoryCandidates",
                                "More matching rolls exist in inventory.",
                              )}
                              printerId={printer.id}
                              trays={diagnosticTrayCards}
                            />
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/50">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                {t("settings.bambuLiveDiagnostics", "Diagnostics")}
                              </div>
                              <div className="mt-2 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
                                <div>
                                  {t("settings.bambuLiveConfiguredHost", "Configured host")}:{" "}
                                  {liveConfig.host?.trim() || "—"}
                                </div>
                                <div>
                                  {t("settings.bambuLiveConfiguredSerial", "Configured printer serial")}:{" "}
                                  {liveConfig.printer_serial?.trim() || "—"}
                                </div>
                                <div>
                                  {t("settings.bambuLivePrinterOnline", "Online")}:{" "}
                                  {observedState.online ? "true" : "false"}
                                </div>
                                <div>
                                  {t("settings.bambuLiveMqttConnected", "MQTT connected")}:{" "}
                                  {observedState.mqtt_connected ? "true" : "false"}
                                </div>
                                <div>
                                  {t("settings.bambuLiveFieldCount", "Observed top-level fields")}:{" "}
                                  {observedState.raw_payload_json &&
                                  typeof observedState.raw_payload_json === "object" &&
                                  !Array.isArray(observedState.raw_payload_json)
                                    ? Object.keys(observedState.raw_payload_json as Record<string, unknown>).length
                                    : 0}
                                </div>
                                <div>
                                  {t("settings.bambuLiveCapturedFieldCount", "Captured fields in this session")}:{" "}
                                  {diagnosticFields.length}
                                </div>
                              </div>
                              <SettingsBambuLiveDiagnosticsSummary
                                metrics={diagnosticMetricCards}
                                printerId={printer.id}
                                signalQualityBuckets={signalQualityBuckets}
                              />
                              <SettingsBambuLiveCaptureChartPanel
                                chartFields={diagnosticChartFields}
                                chartPoints={diagnosticChartPoints}
                                onSelectedFieldChange={(fieldPath) =>
                                  setDiagnosticChartFieldByPrinterId((current) => ({
                                    ...current,
                                    [printer.id]: fieldPath,
                                  }))
                                }
                                selectedFieldPath={selectedDiagnosticChartField}
                              />
                              <SettingsBambuLiveCapturedFieldsPanel
                                diagnosticFilter={diagnosticFilter}
                                diagnosticGroups={diagnosticGroups}
                                diagnosticSession={diagnosticSession}
                                diagnosticSort={diagnosticSort}
                                downloadName={`${printer.name.replace(/\s+/g, "-").toLowerCase()}-live-capture.csv`}
                                onDiagnosticFilterChange={(filter) =>
                                  setDiagnosticFilterByPrinterId((current) => ({
                                    ...current,
                                    [printer.id]: filter,
                                  }))
                                }
                                onDiagnosticSortChange={(sort) =>
                                  setDiagnosticSortByPrinterId((current) => ({
                                    ...current,
                                    [printer.id]: sort,
                                  }))
                                }
                                sortedFieldCount={sortedDiagnosticFields.length}
                              />
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                  {t("settings.bambuLiveRawPayload", "Latest raw live payload")}
                                </div>
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                                  onClick={async () => {
                                    try {
                                      await copyTextToClipboard(
                                        formatDiagnosticJson(observedState.raw_payload_json),
                                      );
                                      setInfo(
                                        t(
                                          "settings.bambuLiveRawPayloadCopied",
                                          "Raw live payload copied.",
                                        ),
                                      );
                                    } catch (copyError) {
                                      console.error(copyError);
                                      setError(
                                        toErrorMessage(
                                          copyError,
                                          t(
                                            "settings.error.copyBambuLiveRawPayload",
                                            "Failed to copy raw live payload.",
                                          ),
                                        ),
                                      );
                                    }
                                  }}
                                  disabled={!observedState.raw_payload_json}
                                >
                                  {t("settings.bambuLiveCopyRawPayload", "Copy payload")}
                                </button>
                              </div>
                              <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-3 text-[11px] leading-5 text-emerald-200 dark:border-slate-700">
{formatDiagnosticJson(observedState.raw_payload_json)}
                              </pre>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {t("settings.bambuLiveObservedDetails", "Observed live details")}
                            </div>
                            <div>
                              {t(
                                "settings.bambuLiveObservedEmpty",
                                "No observed live data yet. This section will later show the incoming status fields, connection health and useful AMS values for this printer.",
                              )}
                            </div>
                            <div>
                              {t("settings.bambuLiveConfiguredHost", "Configured host")}:{" "}
                              {liveConfig.host?.trim() || "—"}
                            </div>
                            <div>
                              {t("settings.bambuLiveConfiguredSerial", "Configured printer serial")}:{" "}
                              {liveConfig.printer_serial?.trim() || "—"}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {isEditing ? (
                      <SettingsPrinterEditForm
                        bambuLiveAccessCode={editBambuLiveAccessCode}
                        bambuLiveEnabled={editBambuLiveEnabled}
                        bambuLiveHost={editBambuLiveHost}
                        bambuLivePrinterSerial={editBambuLivePrinterSerial}
                        busy={busy}
                        model={editPrinterModel}
                        modelProfile={editModelProfile}
                        name={editPrinterName}
                        settingsClientReadOnly={settingsClientReadOnly}
                        slotsPerUnit={editSlotsPerUnit}
                        supportsBambuLive={isBambuLabPrinter(printer.model)}
                        tauri={tauri}
                        t={t}
                        units={editAmsUnits}
                        onBambuLiveAccessCodeChange={setEditBambuLiveAccessCode}
                        onBambuLiveEnabledChange={setEditBambuLiveEnabled}
                        onBambuLiveHostChange={setEditBambuLiveHost}
                        onBambuLivePrinterSerialChange={setEditBambuLivePrinterSerial}
                        onModelChange={(nextModel) => {
                          setEditPrinterModel(nextModel);
                          const exactProfile = findPrinterModelProfileExact(nextModel);
                          if (exactProfile) {
                            setEditAmsUnits(String(exactProfile.defaultUnits));
                            setEditSlotsPerUnit(String(exactProfile.defaultSlotsPerUnit));
                          }
                        }}
                        onNameChange={setEditPrinterName}
                        onSave={() => void handleSavePrinterReconfigure()}
                        onSlotsPerUnitChange={setEditSlotsPerUnit}
                        onUnitsChange={setEditAmsUnits}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

          </section>
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
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                    {t("settings.libraryRoleLabel", "Library role")}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {librarySyncRoleOptions.map((option) => (
                      <button
                        key={option.mode}
                        type="button"
                        onClick={() => handleRequestLibraryRoleChange(option.mode)}
                        className={settingsLibraryRoleButtonClass(librarySyncModeDraft === option.mode)}
                        disabled={!tauri || librarySyncBusy}
                      >
                        {librarySyncModeDraft === option.mode ? (
                          <span className="settings-library-role-dot" aria-hidden="true" />
                        ) : null}
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t(
                      "settings.librarySyncSaveHint",
                      "Role changes open a guided flow. Nothing is saved until you confirm.",
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                    {t("settings.libraryWebappLabel", "Web app")}
                  </div>
                  {librarySyncModeDraft === "CLIENT" ? (
                    <div className="flex flex-wrap gap-2">
                      <span className={settingsChoiceButtonClass(true)}>
                        {t("settings.libraryWebappRunsOnHost", "Runs on host")}
                      </span>
                    </div>
                  ) : librarySyncModeDraft === "HOST" ? (
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={settingsWebappStatusClass(
                          Boolean(trustedLanStatus?.enabled && trustedLanStatus?.running),
                        )}
                      >
                        <span className="settings-webapp-status-dot" aria-hidden="true" />
                        {trustedLanStatus?.enabled && trustedLanStatus?.running
                          ? t("settings.libraryWebappRunning", "Running")
                          : trustedLanActionBusy
                            ? t("settings.trustedLanStatusStarting", "Starting...")
                            : t("settings.trustedLanStateNeedsAttention", "Check")}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={trustedLanEnabledDraft}
                        onClick={() => void handleToggleTrustedLanEnabled(!trustedLanEnabledDraft)}
                        className={settingsWebappSwitchClass(trustedLanEnabledDraft)}
                        disabled={
                          !tauri ||
                          trustedLanActionBusy ||
                          (!trustedLanEnabledDraft && !trustedLanHasPrivateInterfaces)
                        }
                      >
                        <span className={settingsWebappSwitchTrackClass(trustedLanEnabledDraft)} aria-hidden="true">
                          <span className={settingsWebappSwitchKnobClass(trustedLanEnabledDraft)} />
                        </span>
                        <span>
                          {trustedLanEnabledDraft
                            ? t("settings.libraryWebappRunning", "Running")
                            : t("common.off", "Off")}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {librarySyncModeDraft !== "CLIENT" && showLibraryWebappDetails ? (
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

                {librarySyncModeDraft === "HOST" ? null : (
                  <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
                    {librarySyncModeDraft === "STANDALONE"
                      ? standaloneWebappEnabled
                        ? t(
                            "settings.librarySyncStandaloneWebappHint",
                            "This device keeps its own local library and is also serving the web app from here.",
                          )
                        : t(
                            "settings.librarySyncStandaloneHint",
                            "This device keeps using its own local library only.",
                          )
                      : t(
                          "settings.librarySyncClientHint",
                          "This device connects to another host and keeps a read-only fallback cache when that host is unavailable.",
                        )}
                  </div>
                )}

                {showLibraryDeviceFields ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                        {t("settings.librarySyncDeviceName", "Device name")}
                      </div>
                      <input
                        type="text"
                        value={librarySyncDeviceNameDraft}
                        onChange={(event) => setLibrarySyncDeviceNameDraft(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400/50 dark:focus:ring-indigo-500/20"
                        placeholder={t("settings.librarySyncDeviceNamePlaceholder", "Workshop PC")}
                        disabled={!tauri || librarySyncBusy}
                      />
                    </label>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                        {t("settings.librarySyncLibraryId", "Library ID")}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
                        {librarySyncSettings?.library_id || t("common.loading", "Loading...")}
                      </div>
                    </div>
                  </div>
                ) : null}

                {librarySyncModeDraft === "CLIENT" ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-4 dark:border-slate-700/70 dark:bg-slate-950/50">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {t("settings.librarySyncClientAuthTitle", "Desktop client pairing")}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {t(
                          "settings.librarySyncClientPairingFlowHint",
                          "Start with a short-lived pairing link from the host. The client uses that link to detect, verify and connect to the correct host automatically.",
                        )}
                      </div>
                      <div className="mt-3">
                        <label className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                            {t("settings.librarySyncDeviceName", "Device name")}
                          </div>
                          <input
                            type="text"
                            value={librarySyncDeviceNameDraft}
                            onChange={(event) => setLibrarySyncDeviceNameDraft(event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400/50 dark:focus:ring-indigo-500/20"
                            placeholder={t("settings.librarySyncDeviceNamePlaceholder", "Workshop PC")}
                            disabled={!tauri || librarySyncBusy}
                          />
                        </label>
                      </div>
                      {!settingsClientHostWritePaired ? (
                        <>
                          <label className="mt-3 block space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                              {t("settings.librarySyncClientAuthInput", "Pairing link")}
                            </div>
                            <input
                              type="text"
                              value={librarySyncPairingDraft}
                              onChange={(event) => setLibrarySyncPairingDraft(event.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400/50 dark:focus:ring-indigo-500/20"
                              placeholder="http://192.168.86.25:4278/companion?pairing=..."
                              disabled={!tauri || librarySyncBusy}
                            />
                          </label>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handlePairLibrarySyncHost()}
                              className={settingsActionButtonClass("accent")}
                              disabled={!tauri || librarySyncBusy || !librarySyncPairingDraft.trim()}
                            >
                              {t("settings.librarySyncPairHost", "Pair desktop client")}
                            </button>
                            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                              {t("settings.librarySyncClientAuthUnpaired", "Not paired")}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {t("settings.librarySyncCurrentHost", "Current host")}
                            </div>
                            <div className="mt-1">
                              {librarySyncSettings?.host_device_name ||
                                librarySyncValidation?.device_name ||
                                t("common.unknown", "Unknown")}
                            </div>
                            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {librarySyncHostBaseUrlDraft.trim() ||
                                settingsClientHostBaseUrl ||
                                t("common.unknown", "Unknown")}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {settingsClientHostNeedsRepair ? (
                              <button
                                type="button"
                                onClick={() => void handleRenewLibrarySyncClientAuth()}
                                className={settingsActionButtonClass("accent")}
                                disabled={!tauri || librarySyncBusy}
                              >
                                {t("settings.librarySyncRenewPairing", "Renew pairing")}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleClearLibrarySyncClientAuth()}
                              className={settingsActionButtonClass("neutral")}
                              disabled={!tauri || librarySyncBusy || !librarySyncSettings?.client_auth_paired}
                            >
                              {t("settings.librarySyncClearClientAuth", "Remove pairing")}
                            </button>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                settingsClientHostPairingValid
                                  ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                                  : "border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100"
                              }`}
                            >
                              {settingsClientHostPairingValid
                                ? t("settings.librarySyncClientAuthPaired", "Paired")
                                : t("settings.librarySyncClientAuthNeedsRepair", "Re-pair required")}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {settingsClientHostNeedsRepair
                              ? t(
                                  "settings.librarySyncClientAuthRepairHint",
                                  "Host is still reachable, but this desktop client must be paired again before protected sync actions can continue.",
                                )
                              : t(
                                  "settings.librarySyncClientAuthPersistentHint",
                                  "This client stays paired until you remove the pairing here or on the host.",
                                )}
                          </div>
                        </>
                      )}

                      {librarySyncValidation ? (
                        <div
                          className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-6 ${
                            librarySyncValidation.ok &&
                            librarySyncValidation.matches_library_id &&
                            (!librarySyncValidation.pairing_checked ||
                              librarySyncValidation.pairing_valid)
                              ? "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                              : librarySyncValidation.ok || librarySyncValidation.reachable
                                ? "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
                                : "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100"
                          }`}
                        >
                          <div className="font-semibold">
                            {librarySyncValidation.pairing_checked &&
                            !librarySyncValidation.pairing_valid
                              ? t(
                                  "settings.librarySyncHostCheckPairingInvalid",
                                  "Host is reachable, but desktop client pairing must be refreshed.",
                                )
                              : librarySyncValidation.message}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {t("settings.librarySyncAdvancedTitle", "Advanced host details")}
                          </div>
                          <div className="mt-1 text-slate-600 dark:text-slate-300">
                            {t(
                              "settings.librarySyncAdvancedHint",
                              "Open this only when you need diagnostics or cached snapshot details.",
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowLibraryClientAdvanced((value) => !value)}
                          className={settingsActionButtonClass(showLibraryClientAdvanced ? "accent" : "neutral")}
                          disabled={!tauri || librarySyncBusy}
                        >
                          {showLibraryClientAdvanced
                            ? t("settings.librarySyncHideAdvanced", "Hide details")
                            : t("settings.librarySyncShowAdvanced", "Show details")}
                        </button>
                      </div>

                      {showLibraryClientAdvanced ? (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                                  {t("settings.librarySyncLibraryId", "Library ID")}
                                </div>
                                <div className="mt-2 break-all rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
                                  {librarySyncSettings?.library_id || t("common.loading", "Loading...")}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleFetchLibrarySyncSnapshot()}
                                className={settingsActionButtonClass("neutral")}
                                disabled={
                                  !tauri ||
                                  librarySyncBusy ||
                                  librarySyncValidationBusy ||
                                  librarySyncSnapshotBusy ||
                                  !librarySyncHostBaseUrlDraft.trim()
                                }
                              >
                                {librarySyncSnapshotBusy
                                  ? t("settings.librarySyncRefreshingSnapshot", "Refreshing snapshot...")
                                  : t("settings.librarySyncFetchSnapshot", "Fetch snapshot")}
                              </button>
                            </div>

                            {clientHasStatusDetails ? (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <SettingsMetricTile
                                  label={t("settings.librarySyncLastChecked", "Last checked")}
                                  value={
                                    librarySyncSettings?.last_checked_at
                                      ? formatSettingsDateTime(librarySyncSettings.last_checked_at, locale)
                                      : t("common.unknown", "Unknown")
                                  }
                                />
                                <SettingsMetricTile
                                  label={t("settings.librarySyncLastReachable", "Last reachable")}
                                  value={
                                    librarySyncSettings?.last_reachable_at
                                      ? formatSettingsDateTime(librarySyncSettings.last_reachable_at, locale)
                                      : t("common.unknown", "Unknown")
                                  }
                                />
                              </div>
                            ) : null}

                            {librarySyncSettings?.last_validation_message ? (
                              <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-300">
                                {librarySyncSettings.last_validation_message}
                              </div>
                            ) : null}
                          </div>

                          {clientHasSnapshot ? (
                            <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold">
                                  {t("settings.librarySyncCachedSnapshot", "Cached host snapshot")}
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                                  {librarySyncValidation?.ok && librarySyncValidation.matches_library_id
                                    ? t("settings.librarySyncStatusLive", "Live")
                                    : t("settings.librarySyncStatusCached", "Cached")}
                                </div>
                              </div>
                              <div className="mt-2 text-slate-600 dark:text-slate-300">
                                {t("settings.librarySyncSnapshotCapturedAt", "Captured")}:{" "}
                                <span className="font-semibold">
                                  {formatSettingsDateTime(librarySyncSnapshot!.captured_at, locale)}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                <SettingsMetricTile
                                  label={t("settings.librarySyncSnapshotTotalSpools", "Total spools")}
                                  value={librarySyncSnapshot!.total_spools}
                                />
                                <SettingsMetricTile
                                  label={t("settings.librarySyncSnapshotAssigned", "Assigned")}
                                  value={librarySyncSnapshot!.in_use}
                                />
                                <SettingsMetricTile
                                  label={t("settings.librarySyncSnapshotLowStock", "Low stock")}
                                  value={librarySyncSnapshot!.low_stock}
                                />
                                <SettingsMetricTile
                                  label={t("settings.librarySyncSnapshotLoans", "Active loans")}
                                  value={librarySyncSnapshot!.active_loans}
                                />
                                <SettingsMetricTile
                                  label={t("settings.librarySyncSnapshotPrinters", "Printers")}
                                  value={librarySyncSnapshot!.printers}
                                />
                              </div>
                            </div>
                          ) : null}

                        </div>
                      ) : null}
                    </div>
                  </div>
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

            <div className="surface-subtle mt-4 overflow-hidden p-0">
              <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <div className="section-eyebrow">
                      {t("settings.catalogRefreshTitle", "Vendor catalog updates")}
                    </div>
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {t(
                        "settings.catalogRefreshHelp",
                        "Choose vendor and optionally limit the refresh to selected material families to reduce traffic and spread catalogue imports over time.",
                      )}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-none">
                    {t("settings.totalCatalog", "Catalog")}: {catalogMasters.length}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SettingsMetricTile
                    label={t("settings.totalCatalog", "Catalog")}
                    value={catalogMasters.length}
                  />
                  <SettingsMetricTile label={catalogVendor} value={activeCatalogMasterCount} />
                  <SettingsMetricTile
                    label={t("inventory.materialGroup", "Material")}
                    value={activeCatalogMaterialOptions.length}
                    hint={
                      activeCatalogRefreshMaterials.length > 0
                        ? activeCatalogRefreshMaterials.join(", ")
                        : t("settings.catalogAllTypes", "All types")
                    }
                  />
                </div>
              </div>

              <div className="p-5">
                <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
                  <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        {t("inventory.vendorGroup", "Vendor")}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(["Bambu", "eSUN"] as const).map((vendor) => (
                          <button
                            key={vendor}
                            type="button"
                            onClick={() => setCatalogVendor(vendor)}
                            className={chipButtonClass(catalogVendor === vendor)}
                          >
                            {vendor}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        {t("inventory.materialGroup", "Material")}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => clearCatalogRefreshMaterials(catalogVendor)}
                          className={chipButtonClass(activeCatalogRefreshMaterials.length === 0)}
                        >
                          {t("settings.catalogAllTypes", "All types")}
                        </button>
                        {activeCatalogMaterialOptions.map((material) => (
                          <button
                            key={`${catalogVendor}-${material}`}
                            type="button"
                            onClick={() => toggleCatalogRefreshMaterial(catalogVendor, material)}
                            className={chipButtonClass(
                              activeCatalogRefreshMaterials.includes(material),
                            )}
                          >
                            {material}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={settingsActionButtonClass("accent")}
                      onClick={() => void handleRefreshVendorCatalog(catalogVendor)}
                      disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
                    >
                      {catalogRefreshBusy && catalogRefreshVendor === catalogVendor
                        ? t("wishlist.refreshing", "Refreshing")
                        : t("settings.refreshCurrentVendor", "Refresh current vendor catalog")}
                    </button>
                    <button
                      type="button"
                      className={settingsActionButtonClass()}
                      onClick={() => setShowCatalogRefreshLog((current) => !current)}
                      disabled={!catalogRefreshLog.trim()}
                    >
                      {showCatalogRefreshLog
                        ? t("settings.hideRefreshLog", "Hide refresh log")
                        : t("wishlist.viewRefreshLog", "View refresh log")}
                    </button>
                  </div>
                </div>

                {catalogRefreshBusy ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {catalogRefreshVendor} {t("wishlist.catalog", "catalog")}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {catalogRefreshProgressMessage}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                        {catalogRefreshVendor}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SettingsMetricTile
                        label={t("wishlist.phase", "Phase")}
                        value={catalogRefreshPhase}
                      />
                      <SettingsMetricTile
                        label={t("wishlist.elapsed", "Elapsed")}
                        value={`${catalogRefreshElapsedSeconds}s`}
                      />
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-2 w-2/3 animate-pulse rounded-full bg-slate-900 dark:bg-slate-100" />
                    </div>
                  </div>
                ) : null}

                {catalogRefreshSummary ? (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950 shadow-sm shadow-emerald-200/30 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:shadow-none">
                    <div
                      className={`grid gap-3 ${
                        catalogRefreshSummary.reused_cached_products != null ||
                        catalogRefreshSummary.detail_fetches != null
                          ? "sm:grid-cols-2 xl:grid-cols-5"
                          : "sm:grid-cols-3"
                      }`}
                    >
                      <SettingsMetricTile
                        label={t("inventory.imported", "Imported")}
                        value={catalogRefreshSummary.imported}
                        className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                      />
                      <SettingsMetricTile
                        label={t("inventory.reactivated", "Reactivated")}
                        value={catalogRefreshSummary.reactivated_count}
                        className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                      />
                      <SettingsMetricTile
                        label={t("inventory.discontinued", "Discontinued")}
                        value={catalogRefreshSummary.discontinued_count}
                        className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                      />
                      {catalogRefreshSummary.reused_cached_products != null ? (
                        <SettingsMetricTile
                          label={t("settings.cachedReused", "Cached reused")}
                          value={catalogRefreshSummary.reused_cached_products}
                          className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                        />
                      ) : null}
                      {catalogRefreshSummary.detail_fetches != null ? (
                        <SettingsMetricTile
                          label={t("settings.detailFetches", "Detail fetches")}
                          value={catalogRefreshSummary.detail_fetches}
                          className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                        />
                      ) : null}
                    </div>
                    {catalogRefreshSummary.detected_store ? (
                      <div className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
                        {catalogRefreshSummary.detected_store} /{" "}
                        {catalogRefreshSummary.detected_collection ??
                          t("inventory.unknownCollection", "unknown collection")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showCatalogRefreshLog ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {catalogRefreshVendor} {t("wishlist.refreshLog", "refresh log")}
                    </div>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
                      {catalogRefreshLog ||
                        t("wishlist.noRefreshOutput", "No refresh output available yet.")}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>

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
