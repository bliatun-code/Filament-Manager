import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SettingsTabKey } from "../App";
import {
  isValidHexColor,
  normalizeHexColor,
  suggestHexFromColor,
  toSwatchColor,
} from "../lib/color_utils";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import {
  createTrustedLanPairing,
  clearLibrarySyncClientAuth,
  createPrinter,
  createLibrarySyncHostPrinter,
  deleteBambuLiveIntegration,
  deletePrinter,
  deleteLibrarySyncHostPrinter,
  exportFullBackupJson,
  exportInventoryCsv,
  exportInventoryJson,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  getAppVersion,
  getLibrarySyncSettings,
  pairLibrarySyncHost,
  getPrinterSettings,
  getTrustedLanCompanionStatus,
  importDataFile,
  isTauri,
  listMasterCatalog,
  listPrinterOverview,
  listTrustedLanInterfaces,
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
import { AppModal } from "../components/app_modal";
import { useI18n, type Locale } from "../lib/i18n";
import { toErrorMessage } from "../lib/error_text";
import { buildInventoryExportCsv, buildInventoryExportJson } from "../lib/inventory_export";
import {
  buildInventoryMatchResult,
  translateObservedMatchNote,
} from "../lib/inventory_match";
import {
  clampInt,
  extractBaseUrlFromPairingInput,
  formatDiagnosticJson,
  formatSettingsDateTime,
  formatTrustedLanPairingExpiry,
  isFullBackupValidationFormat,
  parseNonNegativeInt,
  parsePositiveInt,
  waitForMs,
} from "../lib/settings_utils";
import { neutralChipClass } from "../lib/chip_styles";
import { copyTextToClipboard } from "../lib/clipboard";
import { PrinterModelPreview } from "../components/printer_model_preview";
import { DiagnosticCaptureChart } from "../components/diagnostic_capture_chart";
import { loadAllSpoolRows } from "../lib/spool_data_source";
import {
  averageIntervalMs,
  buildDiagnosticDisplayTrays,
  buildDiagnosticCaptureSession,
  buildDiagnosticChartFieldOptions,
  buildDiagnosticChartPoints,
  buildDiagnosticFallbackSummary,
  buildDiagnosticSignalQualityBuckets,
  countChangedDiagnosticFields,
  countDiagnosticIdentitySignals,
  countReviewDiagnosticTrays,
  diffMs,
  exportDiagnosticCaptureSessionCsv,
  extractDiagnosticTraySnapshots,
  flattenDiagnosticFields,
  groupDiagnosticFields,
  isDiagnosticAmsReadInProgress,
  latestDiagnosticCaptureSeenAt,
  filterDiagnosticFields,
  formatIntervalMs,
  pushRecentDiagnosticValue,
  sortDiagnosticFields,
  type DiagnosticCaptureSession,
  type DiagnosticFilterKey,
  type DiagnosticFieldGroup,
  type DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import {
  describePrinterCapability,
  describeConfiguredPrinterSetup,
  findPrinterModelProfileExact,
  hasConfiguredMultiMaterial,
  isExternalSlotId,
  multiMaterialSlotsInputLabel,
  multiMaterialUnitsInputLabel,
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
  type LibrarySyncMode,
} from "./settings_library_sync_model";

type SettingsTab = "GENERAL" | "LIBRARY" | "PRINTERS" | "CATALOG" | "MAINTENANCE";
type ResetConfirmAction = "APP" | "CATALOG";
type CatalogVendor = "Bambu" | "eSUN";
type SettingsPageProps = {
  initialTab?: SettingsTabKey;
};

function tabButtonClass(active: boolean): string {
  if (active) {
    return "rounded-lg border border-slate-300/80 bg-white/88 px-3.5 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-slate-300/20 outline-none transition focus-visible:border-sky-300/80 dark:border-slate-500/70 dark:bg-slate-800/86 dark:text-slate-50 dark:shadow-none";
  }
  return "rounded-lg border border-transparent px-3.5 py-2 text-sm font-semibold text-slate-600 outline-none transition hover:border-slate-300/70 hover:bg-white/66 hover:text-slate-900 focus-visible:border-sky-300/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900/62 dark:hover:text-slate-50";
}

function chipButtonClass(active: boolean): string {
  return neutralChipClass(active, "px-3 py-1 text-xs");
}

function settingsChoiceButtonClass(active: boolean, tone: "indigo" | "emerald" = "indigo"): string {
  if (active) {
    if (tone === "emerald") {
      return "inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50/85 px-3.5 py-2.5 text-sm font-semibold text-emerald-900 outline-none transition focus-visible:border-sky-300/80 dark:border-emerald-400/40 dark:bg-emerald-500/14 dark:text-emerald-100";
    }
    return "inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50/86 px-3.5 py-2.5 text-sm font-semibold text-indigo-900 outline-none transition focus-visible:border-sky-300/80 dark:border-indigo-400/40 dark:bg-indigo-500/14 dark:text-indigo-100";
  }
  return "inline-flex items-center justify-center rounded-lg border border-slate-300/80 bg-white/72 px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-white focus-visible:border-sky-300/70 dark:border-slate-700 dark:bg-slate-950/42 dark:text-slate-200 dark:hover:bg-slate-900/72";
}

function settingsLibraryRoleButtonClass(active: boolean): string {
  const activeClass = "settings-library-role-active";
  const idleClass =
    "border-slate-300/80 bg-white/72 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-950/42 dark:text-slate-200 dark:hover:bg-slate-900/72";
  return `inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold outline-none transition focus-visible:border-sky-300/80 disabled:opacity-70 ${active ? activeClass : idleClass}`;
}

function settingsWebappStatusClass(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold outline-none transition ${active ? "settings-webapp-status-active" : "settings-webapp-status-warn"}`;
}

function settingsWebappSwitchClass(active: boolean): string {
  const activeClass = "settings-webapp-switch-active";
  const idleClass =
    "border-slate-300/80 bg-white/72 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-950/42 dark:text-slate-200 dark:hover:bg-slate-900/72";
  return `inline-flex items-center gap-3 rounded-full border px-3 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300/80 disabled:opacity-70 ${active ? activeClass : idleClass}`;
}

function settingsWebappSwitchTrackClass(active: boolean): string {
  return `relative h-7 w-12 rounded-full border transition ${
    active
      ? "settings-webapp-switch-track-active"
      : "border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-800"
  }`;
}

function settingsWebappSwitchKnobClass(active: boolean): string {
  return `absolute top-1 h-5 w-5 rounded-full shadow-sm shadow-slate-900/30 transition ${
    active ? "left-6" : "left-1"
  } ${active ? "settings-webapp-switch-knob-active" : "bg-white dark:bg-slate-950"}`;
}

function settingsActionButtonClass(variant: "neutral" | "accent" = "neutral"): string {
  const base =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300/70 disabled:opacity-50";
  if (variant === "accent") {
    return `${base} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25`;
  }
  return `${base} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/80`;
}

function SettingsMetricTile({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-300/70 bg-white/58 px-4 py-3 dark:border-slate-700/72 dark:bg-slate-950/30 ${className}`.trim()}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 break-words text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hint}</div>
      ) : null}
    </div>
  );
}


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
      const [snapshot, catalogRows, syncSettings, localSpoolSnapshot] = await Promise.all([
        getPrinterSettings(),
        listMasterCatalog(5000),
        getLibrarySyncSettings(),
        loadAllSpoolRows(
          {
            clientReadOnly: false,
          },
          5000,
        ),
      ]);
      let overviewRows: PrinterOverviewRow[] = [];
      let nextSpoolRows = localSpoolSnapshot;
      let nextBambuLiveIntegrations = Object.fromEntries(
        (snapshot.bambu_live_integrations ?? []).map((entry) => [entry.printer_id, entry.config]),
      );
      if (syncSettings.mode === "CLIENT") {
        const cachedPrinterRows = syncSettings.cached_printers?.rows ?? [];
        if (syncSettings.host_base_url && syncSettings.library_id) {
          try {
            const [hostOverviewRows, hostPrinterSettings, hostSpoolRows] = await Promise.all([
              fetchLibrarySyncPrinterOverview(syncSettings.host_base_url, syncSettings.library_id),
              fetchLibrarySyncPrinterSettings(syncSettings.host_base_url, syncSettings.library_id),
              loadAllSpoolRows(
                {
                  clientReadOnly: true,
                  clientHostBaseUrl: syncSettings.host_base_url,
                  clientLibraryId: syncSettings.library_id,
                },
                5000,
              ),
            ]);
            overviewRows = hostOverviewRows;
            nextSpoolRows = hostSpoolRows;
            nextBambuLiveIntegrations = Object.fromEntries(
              (hostPrinterSettings.bambu_live_integrations ?? []).map((entry) => [
                entry.printer_id,
                entry.config,
              ]),
            );
          } catch (loadError) {
            console.warn("Settings host printer overview unavailable, using cached snapshot.", loadError);
            overviewRows = cachedPrinterRows;
          }
        } else {
          overviewRows = cachedPrinterRows;
        }
      } else {
        overviewRows = await listPrinterOverview();
      }
      setPrinters(
        syncSettings.mode === "CLIENT" ? overviewRows.map((row) => row.printer) : snapshot.printers,
      );
      setPrinterOverview(overviewRows);
      setSpoolRows(nextSpoolRows);
      setBambuLiveIntegrations(nextBambuLiveIntegrations);
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
    const flattened = flattenDiagnosticFields(observedState.raw_payload_json);
    if (flattened.length === 0) {
      return;
    }
    const observedAt = observedState.last_seen_at ?? new Date().toISOString();
    setDiagnosticCaptureByPrinterId((current) => {
      const next = { ...current };
      const existingSession = next[expandedBambuDetailsPrinterId] ?? buildDiagnosticCaptureSession(null);
      const previousFields = new Map(
        existingSession.fields.map((field) => [field.path, field]),
      );
      const nextSamples = [...existingSession.samples];
      for (const { path, valueText } of flattened) {
        const existing = previousFields.get(path);
        if (!existing) {
          previousFields.set(path, {
            path,
            valueText,
            firstSeenAt: observedAt,
            lastSeenAt: observedAt,
            lastChangedAt: observedAt,
            receiveCount: 1,
            changeCount: 1,
            avgReceiveIntervalMs: null,
            avgChangeIntervalMs: null,
            recentValues: [
              {
                valueText,
                seenAt: observedAt,
                changed: true,
              },
            ],
          });
          nextSamples.push({
            fieldPath: path,
            observedAt,
            valueText,
            changeKind: existingSession.seededFromObservedAt == null ? "first_seen" : "changed",
          });
          continue;
        }
        const receiveIntervalMs = diffMs(observedAt, existing.lastSeenAt);
        if (existing.valueText === valueText) {
          previousFields.set(path, {
            ...existing,
            lastSeenAt: observedAt,
            receiveCount: existing.receiveCount + 1,
            avgReceiveIntervalMs:
              receiveIntervalMs == null
                ? existing.avgReceiveIntervalMs
                : averageIntervalMs(
                    existing.avgReceiveIntervalMs,
                    Math.max(0, existing.receiveCount - 1),
                    receiveIntervalMs,
                  ),
            recentValues: pushRecentDiagnosticValue(existing.recentValues, {
              valueText,
              seenAt: observedAt,
              changed: false,
            }),
          });
          nextSamples.push({
            fieldPath: path,
            observedAt,
            valueText,
            changeKind: "refresh",
          });
          continue;
        }
        const changeIntervalMs = diffMs(observedAt, existing.lastChangedAt);
        previousFields.set(path, {
          path,
          valueText,
          firstSeenAt: existing.firstSeenAt,
          lastSeenAt: observedAt,
          lastChangedAt: observedAt,
          receiveCount: existing.receiveCount + 1,
          changeCount: existing.changeCount + 1,
          avgReceiveIntervalMs:
            receiveIntervalMs == null
              ? existing.avgReceiveIntervalMs
              : averageIntervalMs(
                  existing.avgReceiveIntervalMs,
                  Math.max(0, existing.receiveCount - 1),
                  receiveIntervalMs,
                ),
          avgChangeIntervalMs:
            changeIntervalMs == null
              ? existing.avgChangeIntervalMs
              : averageIntervalMs(
                  existing.avgChangeIntervalMs,
                  Math.max(0, existing.changeCount - 1),
                  changeIntervalMs,
                ),
          recentValues: pushRecentDiagnosticValue(existing.recentValues, {
            valueText,
            seenAt: observedAt,
            changed: true,
          }),
        });
        nextSamples.push({
          fieldPath: path,
          observedAt,
          valueText,
          changeKind: "changed",
        });
      }
      next[expandedBambuDetailsPrinterId] = {
        ...existingSession,
        lastCapturedAt: observedAt,
        fields: Array.from(previousFields.values()).sort((left, right) =>
          left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" }),
        ),
        samples: nextSamples,
      };
      return next;
    });
  }, [bambuLiveIntegrations, diagnosticCaptureActiveByPrinterId, expandedBambuDetailsPrinterId]);

  const loadTrustedLanCompanionStatus = useCallback(async (): Promise<TrustedLanCompanionStatus | null> => {
    if (!tauri) {
      return null;
    }
    setTrustedLanLoading(true);
    let nextTrustedLanStatus: TrustedLanCompanionStatus | null = null;
    try {
      const [trustedLanResult, trustedLanInterfacesResult, pairedBrowsersResult] =
        await Promise.allSettled([
          getTrustedLanCompanionStatus(),
          listTrustedLanInterfaces(),
          listTrustedLanPairedBrowsers(),
        ]);
      const nextTrustedLanInterfaces =
        trustedLanInterfacesResult.status === "fulfilled" ? trustedLanInterfacesResult.value : [];

      if (trustedLanResult.status === "fulfilled") {
        nextTrustedLanStatus = trustedLanResult.value;
        setTrustedLanStatus(trustedLanResult.value);
        syncTrustedLanDraftFromStatus(trustedLanResult.value, nextTrustedLanInterfaces);
      } else {
        console.error(trustedLanResult.reason);
        nextTrustedLanStatus = null;
        setTrustedLanStatus(null);
        syncTrustedLanDraftFromStatus(null, nextTrustedLanInterfaces);
        setError(
          toErrorMessage(
            trustedLanResult.reason,
            t(
              "settings.error.loadTrustedLanCompanion",
              "Failed to load trusted-LAN companion status.",
            ),
          ),
        );
      }

      if (trustedLanInterfacesResult.status === "fulfilled") {
        setTrustedLanInterfaces(nextTrustedLanInterfaces);
      } else {
        console.error(trustedLanInterfacesResult.reason);
        setTrustedLanInterfaces([]);
      }

      if (pairedBrowsersResult.status === "fulfilled") {
        setTrustedLanPairedBrowsers(pairedBrowsersResult.value);
      } else {
        console.error(pairedBrowsersResult.reason);
        setTrustedLanPairedBrowsers([]);
      }
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
    return nextTrustedLanStatus;
  }, [syncTrustedLanDraftFromStatus, t, tauri]);

  const refreshTrustedLanPairedBrowsers = useCallback(
    async (options?: { announceNewPairing?: boolean; suppressErrors?: boolean }) => {
      if (!tauri) {
        return;
      }
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

    const roleActuallyChanges = pendingLibraryRoleTarget !== librarySyncSavedMode;
    const leavingClient = librarySyncSavedMode === "CLIENT";
    const requiresExport =
      roleActuallyChanges && !leavingClient;
    const requiresValidate = requiresExport;
    const requiresImport = false;
    const validateDone = requiresExport
      ? Boolean(lastFullBackupExportedAt) && hasValidatedFullBackup
      : hasValidatedLatestFullBackup;

    const ready =
      (!requiresExport || Boolean(lastFullBackupExportedAt)) &&
      (!requiresValidate || validateDone) &&
      (!requiresImport || Boolean(lastFullBackupImportedAt));

    if (!ready) {
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
      const snapshot = await fetchLibrarySyncSnapshot(
        librarySyncHostBaseUrlDraft,
        librarySyncSettings.library_id,
      );
      setLibrarySyncSnapshot(snapshot);
      const refreshed = await getLibrarySyncSettings();
      setLibrarySyncSettings(refreshed);
      setLibrarySyncSnapshot(refreshed.cached_snapshot ?? snapshot);
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

  function derivePrinterMultiConfig(
    printerId: string,
    model: string,
  ): { units: number; slotsPerUnit: number } {
    const slots = printerOverview.find((item) => item.printer.id === printerId)?.slots ?? [];
    const profile = resolvePrinterModelProfile(model);
    const slotCountByUnit = new Map<string, number>();
    for (const slot of slots) {
      if (isExternalSlotId(slot.ams_id)) {
        continue;
      }
      slotCountByUnit.set(slot.ams_id, (slotCountByUnit.get(slot.ams_id) ?? 0) + 1);
    }
    const units = slotCountByUnit.size;
    const slotsPerUnit =
      units > 0
        ? Math.max(...Array.from(slotCountByUnit.values()))
        : profile.defaultSlotsPerUnit;
    return { units, slotsPerUnit };
  }

  function isBambuLabPrinter(model: string): boolean {
    return model.trim().toLowerCase().startsWith("bambu lab");
  }

  function handleStartEditPrinter(printer: PrinterRow) {
    const config = derivePrinterMultiConfig(printer.id, printer.model);
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
        await createLibrarySyncHostPrinter(settingsClientHostBaseUrl, settingsClientLibraryId, {
          id: editPrinterId,
          model,
          name,
          ams_units: units,
          slots_per_ams: slots,
        });
      } else {
        await createPrinter({
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
        await deleteLibrarySyncHostPrinter(
          settingsClientHostBaseUrl,
          settingsClientLibraryId,
          printer.id,
        );
      } else {
        await deletePrinter(printer.id);
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
  const roleChangeTarget = pendingLibraryRoleTarget;
  const roleChangeFromClient = librarySyncSavedMode === "CLIENT";
  const roleChangeToHost = roleChangeTarget === "HOST";
  const roleChangeToClient = roleChangeTarget === "CLIENT";
  const roleChangeToStandalone = roleChangeTarget === "STANDALONE";
  const roleChangeRequiresExport =
    Boolean(roleChangeTarget) &&
    roleChangeTarget !== librarySyncSavedMode &&
    librarySyncSavedMode !== "CLIENT";
  const roleChangeRequiresValidate = roleChangeRequiresExport;
  const roleChangeRequiresImport = false;
  const roleChangeValidateDone =
    roleChangeRequiresExport
      ? Boolean(lastFullBackupExportedAt) && hasValidatedFullBackup
      : hasValidatedLatestFullBackup;
  const roleChangeReady =
    (!roleChangeRequiresExport || Boolean(lastFullBackupExportedAt)) &&
    (!roleChangeRequiresValidate || roleChangeValidateDone) &&
    (!roleChangeRequiresImport || Boolean(lastFullBackupImportedAt));

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
                const observedState = liveConfig?.observed_state ?? null;
                const diagnosticSession = diagnosticCaptureByPrinterId[printer.id] ?? null;
                const captureActive = diagnosticCaptureActiveByPrinterId[printer.id] ?? false;
                const diagnosticFields = diagnosticSession?.fields ?? [];
                const diagnosticSort = diagnosticSortByPrinterId[printer.id] ?? "path";
                const diagnosticFilter = diagnosticFilterByPrinterId[printer.id] ?? "all";
                const diagnosticChartFields = buildDiagnosticChartFieldOptions(diagnosticFields);
                const selectedDiagnosticChartField =
                  diagnosticChartFields.find(
                    (option) => option.path === diagnosticChartFieldByPrinterId[printer.id],
                  )?.path ??
                  diagnosticChartFields[0]?.path ??
                  null;
                const diagnosticChartPoints = buildDiagnosticChartPoints(
                  diagnosticSession,
                  selectedDiagnosticChartField,
                );
                const captureTraySnapshots = extractDiagnosticTraySnapshots(diagnosticFields);
                const captureTrayByIndex = new Map(
                  captureTraySnapshots.map((tray) => [tray.trayIndex, tray]),
                );
                const displayTrays = buildDiagnosticDisplayTrays(observedState?.trays ?? [], diagnosticFields);
                const captureSessionStartedAt = diagnosticSession?.startedAt ?? null;
                const captureSessionSeededAt = diagnosticSession?.seededFromObservedAt ?? null;
                const captureSessionLastSeenAt = latestDiagnosticCaptureSeenAt(
                  diagnosticSession,
                  diagnosticFields,
                );
                const changedFieldCount = countChangedDiagnosticFields(diagnosticFields);
                const identityFieldCount = countDiagnosticIdentitySignals(diagnosticFields);
                const amsReadInProgress = isDiagnosticAmsReadInProgress(diagnosticFields);
                const signalQualityBuckets = buildDiagnosticSignalQualityBuckets(diagnosticFields);
                const fallbackSummary = buildDiagnosticFallbackSummary(diagnosticFields);
                const fallbackSummaryParts = [
                  fallbackSummary.progressPercent != null ? `${fallbackSummary.progressPercent}%` : null,
                  fallbackSummary.remainingMinutes != null ? `${fallbackSummary.remainingMinutes} min` : null,
                  fallbackSummary.activeTrayIndex != null
                    ? `${t("settings.bambuLiveSummaryTray", "Tray")} ${fallbackSummary.activeTrayIndex}`
                    : null,
                  fallbackSummary.amsHumidityIndex != null
                    ? `${t("settings.bambuLiveSummaryAmsHumidity", "AMS humidity")} ${fallbackSummary.amsHumidityIndex}`
                    : null,
                ].filter(Boolean);
                const filteredDiagnosticFields = filterDiagnosticFields(diagnosticFields, diagnosticFilter);
                const sortedDiagnosticFields = sortDiagnosticFields(filteredDiagnosticFields, diagnosticSort);
                const diagnosticGroups: Array<DiagnosticFieldGroup & { label: string }> = groupDiagnosticFields(
                  sortedDiagnosticFields,
                ).map((group) => ({
                  ...group,
                  label:
                    group.key === "print"
                      ? t("settings.bambuLiveGroupPrint", "Print & status")
                      : group.key === "ams"
                        ? t("settings.bambuLiveGroupAms", "AMS")
                        : group.key === "tray"
                          ? t("settings.bambuLiveGroupTray", "Tray & chip")
                          : t("settings.bambuLiveGroupOther", "Other"),
                }));
                const reviewTrayCount = countReviewDiagnosticTrays(observedState?.trays ?? []);
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
                            onClick={() => {
                              setExpandedBambuDetailsPrinterId((currentExpanded) => {
                                const nextExpanded = currentExpanded === printer.id ? null : printer.id;
                                if (nextExpanded === printer.id) {
                                  const observedState =
                                    bambuLiveIntegrations[printer.id]?.observed_state ?? null;
                                  setDiagnosticCaptureByPrinterId((current) => {
                                    if (current[printer.id]) {
                                      return current;
                                    }
                                    return {
                                      ...current,
                                      [printer.id]: buildDiagnosticCaptureSession(observedState),
                                    };
                                  });
                                  setDiagnosticCaptureActiveByPrinterId((current) => ({
                                    ...current,
                                    [printer.id]: current[printer.id] ?? true,
                                  }));
                                  setDiagnosticSortByPrinterId((current) => ({
                                    ...current,
                                    [printer.id]: current[printer.id] ?? "path",
                                  }));
                                  setDiagnosticFilterByPrinterId((current) => ({
                                    ...current,
                                    [printer.id]: current[printer.id] ?? "all",
                                  }));
                                }
                                return nextExpanded;
                              });
                            }}
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
                              {[
                                observedState.progress_percent != null
                                  ? `${observedState.progress_percent}%`
                                  : null,
                                observedState.remaining_minutes != null
                                  ? `${observedState.remaining_minutes} min`
                                  : null,
                                observedState.active_tray_index != null
                                  ? `${t("settings.bambuLiveSummaryTray", "Tray")} ${observedState.active_tray_index}`
                                  : null,
                                observedState.ams_humidity_index != null
                                  ? `${t("settings.bambuLiveSummaryAmsHumidity", "AMS humidity")} ${observedState.ams_humidity_index}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") ||
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
                                  onClick={() => {
                                    if (captureActive) {
                                      setDiagnosticCaptureActiveByPrinterId((current) => ({
                                        ...current,
                                        [printer.id]: false,
                                      }));
                                      return;
                                    }
                                    const nextObservedState =
                                      bambuLiveIntegrations[printer.id]?.observed_state ?? null;
                                    const nextSession = buildDiagnosticCaptureSession(nextObservedState);
                                    setDiagnosticCaptureByPrinterId((current) => ({
                                      ...current,
                                      [printer.id]: nextSession,
                                    }));
                                    setDiagnosticCaptureActiveByPrinterId((current) => ({
                                      ...current,
                                      [printer.id]: true,
                                    }));
                                    setDiagnosticChartFieldByPrinterId((current) => {
                                      if (!current[printer.id]) {
                                        return current;
                                      }
                                      return {
                                        ...current,
                                        [printer.id]: "",
                                      };
                                    });
                                  }}
                                >
                                  {captureActive
                                    ? t("settings.bambuLiveStopCapture", "Stop capture")
                                    : t("settings.bambuLiveStartCapture", "Start capture")}
                                </button>
                              </div>
                            </div>
                            {displayTrays.length > 0 ? (
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                                {displayTrays.map((tray) => {
                                  const slotNumber = tray.tray_index + 1;
                                  const capturedTraySnapshot =
                                    captureTrayByIndex.get(tray.tray_index) ?? null;
                                  const observedRfid =
                                    capturedTraySnapshot?.trayUuid?.trim() &&
                                    !/^0+$/.test(capturedTraySnapshot.trayUuid.trim())
                                      ? capturedTraySnapshot.trayUuid.trim()
                                      : null;
                                  const inventoryMatch = buildInventoryMatchResult(spoolRows, {
                                    rfid: observedRfid,
                                    material: tray.filament_type ?? capturedTraySnapshot?.filamentType ?? null,
                                    filamentName:
                                      tray.filament_name ?? capturedTraySnapshot?.filamentName ?? null,
                                    colorHex: tray.color_hex ?? capturedTraySnapshot?.colorHex ?? null,
                                  });
                                  const primaryInventoryMatch = inventoryMatch.candidates[0] ?? null;
                                  const hasReview =
                                    !amsReadInProgress &&
                                    tray.match_status &&
                                    tray.match_status !== "clear_match" &&
                                    tray.match_status !== "unknown_from_printer";
                                  return (
                                    <div
                                      key={`${printer.id}-live-tray-${tray.tray_index}`}
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-950/50"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                                          {`${t("settings.bambuLiveSlotLabel", "Slot")} ${slotNumber}`}
                                        </div>
                                        {hasReview ? (
                                          <span
                                            title={tray.match_note ?? ""}
                                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-1 text-[11px] font-bold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                                          >
                                            !
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                        {`${t("settings.bambuLiveMqttTrayLabel", "MQTT tray")} ${tray.tray_index}`}
                                      </div>
                                      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                                        {tray.loaded
                                          ? tray.filament_name ||
                                            tray.filament_type ||
                                            t("settings.bambuLiveTrayLoaded", "Loaded")
                                          : t("settings.bambuLiveTrayEmptyUnknown", "Empty / unknown")}
                                      </div>
                                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                        {[
                                          tray.filament_type,
                                          tray.remaining_percent != null
                                            ? `${tray.remaining_percent}%`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ") || "—"}
                                      </div>
                                      <div className="mt-2 rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 text-[11px] leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                                        <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                                          <span
                                            className="h-3.5 w-3.5 rounded-sm border border-slate-300/80 dark:border-slate-600"
                                            style={{
                                              backgroundColor: primaryInventoryMatch
                                                ? toSwatchColor(primaryInventoryMatch.master.hex_color)
                                                : toSwatchColor(tray.color_hex ?? capturedTraySnapshot?.colorHex),
                                            }}
                                          />
                                          <span>
                                            {primaryInventoryMatch
                                              ? `${primaryInventoryMatch.master.filament_name} · ${primaryInventoryMatch.master.color_name}`
                                              : t("settings.bambuLiveNoInventoryMatch", "No clear inventory match")}
                                          </span>
                                        </div>
                                        <div className="mt-1">
                                          {inventoryMatch.kind === "rfid_exact"
                                            ? t(
                                                "settings.bambuLiveInventoryRfidMatch",
                                                "Exact tray identity match against inventory.",
                                              )
                                            : inventoryMatch.kind === "metadata_single"
                                              ? t(
                                                  "settings.bambuLiveInventoryLikelyMatch",
                                                  "Single likely inventory match from material/name/color.",
                                                )
                                              : inventoryMatch.kind === "metadata_multiple"
                                                ? t(
                                                    "settings.bambuLiveInventoryMultipleMatches",
                                                    "Multiple inventory rolls could match this filament.",
                                                  )
                                                : observedRfid
                                                  ? t(
                                                      "settings.bambuLiveInventoryNoRfidMatch",
                                                      "Observed tray identity did not match anything in inventory.",
                                                    )
                                                  : t(
                                                      "settings.bambuLiveInventoryNoMatch",
                                                      "No clear inventory match yet.",
                                                    )}
                                        </div>
                                        {(observedRfid || inventoryMatch.candidates.length > 1) ? (
                                          <div className="mt-1 break-all text-[10px] text-slate-500 dark:text-slate-400">
                                            {observedRfid
                                              ? `${t("settings.bambuLiveObservedPrefix", "Observed")}: ${observedRfid}`
                                              : null}
                                            {observedRfid && inventoryMatch.kind === "metadata_multiple" ? " · " : null}
                                            {inventoryMatch.kind === "metadata_multiple"
                                              ? `${inventoryMatch.candidates.length} ${t("settings.bambuLiveCandidateCount", "candidates")}`
                                              : null}
                                          </div>
                                        ) : null}
                                        {inventoryMatch.kind === "metadata_multiple" ? (
                                          <div className="mt-2 space-y-1.5">
                                            {inventoryMatch.candidates.slice(0, 3).map((candidate) => (
                                              <div
                                                key={candidate.spool.id}
                                                className="flex items-center gap-2 rounded border border-slate-200/80 bg-white/70 px-2 py-1 dark:border-slate-700 dark:bg-slate-950/40"
                                              >
                                                <span
                                                  className="h-3 w-3 rounded-sm border border-slate-300/80 dark:border-slate-600"
                                                  style={{
                                                    backgroundColor: toSwatchColor(candidate.master.hex_color),
                                                  }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                  <div className="truncate text-[10px] font-medium text-slate-700 dark:text-slate-200">
                                                    {candidate.master.filament_name} · {candidate.master.color_name}
                                                  </div>
                                                  <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                                                    {candidate.spool.rfid_tag?.trim()
                                                      ? `RFID saved · ${candidate.spool.id}`
                                                      : `No RFID saved · ${candidate.spool.id}`}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                            {inventoryMatch.candidates.length > 3 ? (
                                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                                {t(
                                                  "settings.bambuLiveMoreInventoryCandidates",
                                                  "More matching rolls exist in inventory.",
                                                )}
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                      {tray.match_note && !amsReadInProgress ? (
                                        <div className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                                          {translateObservedMatchNote(tray.match_note, t)}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
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
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                    {t("settings.bambuLiveCaptureStarted", "Capture started")}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
                                    {captureSessionStartedAt
                                      ? formatSettingsDateTime(captureSessionStartedAt, locale)
                                      : "—"}
                                  </div>
                                </div>
                                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                    {t("settings.bambuLiveCaptureLastUpdate", "Last captured")}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
                                    {captureSessionLastSeenAt
                                      ? formatSettingsDateTime(captureSessionLastSeenAt, locale)
                                      : "—"}
                                  </div>
                                </div>
                                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                    {t("settings.bambuLiveCaptureSeededFrom", "Seeded from live state")}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
                                    {captureSessionSeededAt
                                      ? formatSettingsDateTime(captureSessionSeededAt, locale)
                                      : "—"}
                                  </div>
                                </div>
                                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                    {t("settings.bambuLiveChangedFields", "Changed fields")}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
                                    {changedFieldCount}
                                  </div>
                                </div>
                                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                    {t("settings.bambuLiveIdentitySignals", "Identity signals")}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-700 dark:text-slate-200">
                                    {identityFieldCount}
                                  </div>
                                </div>
                              </div>
                              {signalQualityBuckets.length > 0 ? (
                                <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
                                  {signalQualityBuckets.map((bucket) => (
                                    <div
                                      key={`${printer.id}-${bucket.label}`}
                                      className="rounded border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/60"
                                    >
                                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                        {bucket.label === "Stable metadata"
                                          ? t("settings.bambuLiveSignalStable", "Stable metadata")
                                          : bucket.label === "Event-driven identity"
                                            ? t("settings.bambuLiveSignalEventDriven", "Event-driven identity")
                                            : t("settings.bambuLiveSignalContinuous", "Continuous telemetry")}
                                      </div>
                                      <div className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                                        {bucket.label === "Stable metadata"
                                          ? t(
                                              "settings.bambuLiveSignalStableDesc",
                                              "Identity and tray metadata that appears stable when observed.",
                                            )
                                          : bucket.label === "Event-driven identity"
                                            ? t(
                                                "settings.bambuLiveSignalEventDrivenDesc",
                                                "Fields that tend to appear or change around AMS read/sync events.",
                                              )
                                            : t(
                                                "settings.bambuLiveSignalContinuousDesc",
                                                "Fields that look like normal status/telemetry updates during operation.",
                                              )}
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {bucket.fields.slice(0, 6).map((field) => (
                                          <span
                                            key={`${printer.id}-${bucket.label}-${field.path}`}
                                            className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300"
                                            title={field.path}
                                          >
                                            {field.path}
                                          </span>
                                        ))}
                                        {bucket.fields.length > 6 ? (
                                          <span className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
                                            +{bucket.fields.length - 6}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/40">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                      {t("settings.bambuLiveChartTitle", "Capture chart")}
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                      {t(
                                        "settings.bambuLiveChartHint",
                                        "Choose a numeric field to plot only the values captured in this session.",
                                      )}
                                    </div>
                                  </div>
                                  <select
                                    value={selectedDiagnosticChartField ?? ""}
                                    onChange={(event) =>
                                      setDiagnosticChartFieldByPrinterId((current) => ({
                                        ...current,
                                        [printer.id]: event.target.value,
                                      }))
                                    }
                                    disabled={diagnosticChartFields.length === 0}
                                    className="min-w-[260px] rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                  >
                                    {diagnosticChartFields.length === 0 ? (
                                      <option value="">
                                        {t(
                                          "settings.bambuLiveChartNoFields",
                                          "No chart-ready numeric fields yet",
                                        )}
                                      </option>
                                    ) : null}
                                    {diagnosticChartFields.map((field) => (
                                      <option key={`${printer.id}-${field.path}`} value={field.path}>
                                        {field.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="mt-3">
                                  {selectedDiagnosticChartField ? (
                                    <DiagnosticCaptureChart
                                      fieldPath={selectedDiagnosticChartField}
                                      points={diagnosticChartPoints}
                                    />
                                  ) : (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                      {t(
                                        "settings.bambuLiveChartNoFields",
                                        "No chart-ready numeric fields yet",
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                {t("settings.bambuLiveCapturedTable", "Captured live fields")}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={diagnosticSort}
                                    onChange={(event) =>
                                      setDiagnosticSortByPrinterId((current) => ({
                                        ...current,
                                        [printer.id]: event.target.value as DiagnosticSortKey,
                                      }))
                                    }
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                  >
                                    <option value="path">{t("settings.bambuLiveSortPath", "Sort: Field")}</option>
                                    <option value="last_seen_desc">
                                      {t("settings.bambuLiveSortLastSeen", "Sort: Most recently seen")}
                                    </option>
                                    <option value="avg_seen_interval">
                                      {t("settings.bambuLiveSortSeenInterval", "Sort: Fastest seen")}
                                    </option>
                                    <option value="change_count">
                                      {t("settings.bambuLiveSortChangeCount", "Sort: Most changed")}
                                    </option>
                                    <option value="avg_change_interval">
                                      {t("settings.bambuLiveSortChangeInterval", "Sort: Fastest changed")}
                                    </option>
                                  </select>
                                  <select
                                    value={diagnosticFilter}
                                    onChange={(event) =>
                                      setDiagnosticFilterByPrinterId((current) => ({
                                        ...current,
                                        [printer.id]: event.target.value as DiagnosticFilterKey,
                                      }))
                                    }
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                  >
                                    <option value="all">{t("settings.bambuLiveFilterAll", "Filter: All")}</option>
                                    <option value="changed">
                                      {t("settings.bambuLiveFilterChanged", "Filter: Changed fields")}
                                    </option>
                                    <option value="recent">
                                      {t("settings.bambuLiveFilterRecent", "Filter: Seen in last minute")}
                                    </option>
                                    <option value="high_frequency">
                                      {t("settings.bambuLiveFilterFrequent", "Filter: High frequency")}
                                    </option>
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                                  onClick={() => {
                                    if (!diagnosticSession) {
                                      return;
                                    }
                                    const csv = exportDiagnosticCaptureSessionCsv(diagnosticSession);
                                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                                    const url = URL.createObjectURL(blob);
                                    const anchor = document.createElement("a");
                                    anchor.href = url;
                                    anchor.download = `${printer.name.replace(/\s+/g, "-").toLowerCase()}-live-capture.csv`;
                                    anchor.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  disabled={!diagnosticSession || diagnosticSession.fields.length === 0}
                                >
                                  {t("settings.bambuLiveExportCsv", "Export CSV")}
                                </button>
                              </div>
                              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="max-h-80 overflow-auto">
                                  {sortedDiagnosticFields.length > 0 ? (
                                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                      {diagnosticGroups.map((group) => (
                                        <div key={`${printer.id}-${group.key}`}>
                                          <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                                            {group.label}
                                          </div>
                                          <table className="min-w-full divide-y divide-slate-200 text-left text-[11px] dark:divide-slate-700">
                                            <thead className="bg-slate-50/80 dark:bg-slate-900/40">
                                              <tr>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldPath", "Field")}
                                                </th>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldValue", "Value")}
                                                </th>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldUpdated", "Last seen")}
                                                </th>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldCadence", "Avg seen interval")}
                                                </th>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldChanges", "Changes")}
                                                </th>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldChangeCadence", "Avg change interval")}
                                                </th>
                                                <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                                                  {t("settings.bambuLiveFieldRecentValues", "Recent values")}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                                              {group.fields.map((field) => (
                                                <tr key={`${printer.id}-${group.key}-${field.path}`}>
                                                  <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">
                                                    {field.path}
                                                  </td>
                                                  <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">
                                                    {field.valueText}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                                    {formatSettingsDateTime(field.lastSeenAt, locale)}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                                    {formatIntervalMs(field.avgReceiveIntervalMs)}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                                    {field.changeCount}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                                    {formatIntervalMs(field.avgChangeIntervalMs)}
                                                  </td>
                                                  <td className="px-3 py-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                                                    <div className="flex min-w-[220px] flex-wrap gap-1">
                                                      {field.recentValues.length > 0 ? (
                                                        field.recentValues.map((sample, index) => (
                                                          <span
                                                            key={`${field.path}-sample-${index}`}
                                                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                                                              sample.changed
                                                                ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                                                                : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
                                                            }`}
                                                            title={formatSettingsDateTime(sample.seenAt, locale)}
                                                          >
                                                            <span className="font-mono">
                                                              {sample.valueText}
                                                            </span>
                                                            <span aria-hidden="true">
                                                              {sample.changed ? "•" : "·"}
                                                            </span>
                                                          </span>
                                                        ))
                                                      ) : (
                                                        <span>—</span>
                                                      )}
                                                    </div>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <table className="min-w-full divide-y divide-slate-200 text-left text-[11px] dark:divide-slate-700">
                                      <tbody className="bg-white dark:bg-slate-950/40">
                                        <tr>
                                          <td
                                            colSpan={7}
                                            className="px-3 py-3 text-slate-500 dark:text-slate-400"
                                          >
                                            {t(
                                              "settings.bambuLiveCaptureWaiting",
                                              "Waiting for live field updates. Start a print or let the printer report more data while this panel is open.",
                                            )}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
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
                      <div className="mt-3 space-y-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_110px_130px_auto]">
                          <input
                            type="text"
                            value={editPrinterModel}
                            onChange={(event) => {
                              const nextModel = event.target.value;
                              setEditPrinterModel(nextModel);
                              const exactProfile = findPrinterModelProfileExact(nextModel);
                              if (exactProfile) {
                                setEditAmsUnits(String(exactProfile.defaultUnits));
                                setEditSlotsPerUnit(String(exactProfile.defaultSlotsPerUnit));
                              }
                            }}
                            list="printer-model-options"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                            placeholder={t("settings.printerModel", "Printer model")}
                            disabled={!tauri || busy}
                          />
                          <input
                            type="text"
                            value={editPrinterName}
                            onChange={(event) => setEditPrinterName(event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                            placeholder={t("settings.printerName", "Printer name")}
                            disabled={!tauri || busy}
                          />
                          <input
                            type="number"
                            min={0}
                            max={editModelProfile.maxUnits}
                            value={editAmsUnits}
                            onChange={(event) => setEditAmsUnits(event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                            title={multiMaterialUnitsInputLabel(t, editPrinterModel)}
                            disabled={!tauri || busy || editModelProfile.maxUnits === 0}
                          />
                          <input
                            type="number"
                            min={1}
                            max={editModelProfile.maxSlotsPerUnit}
                            value={editSlotsPerUnit}
                            onChange={(event) => setEditSlotsPerUnit(event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                            title={multiMaterialSlotsInputLabel(t, editPrinterModel)}
                            disabled={!tauri || busy || editModelProfile.maxUnits === 0}
                          />
                          <button
                            type="button"
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                            onClick={() => void handleSavePrinterReconfigure()}
                            disabled={!tauri || busy}
                          >
                            {t("settings.saveReconfigure", "Save changes")}
                          </button>
                        </div>

	                        {isBambuLabPrinter(printer.model) ? (
	                        <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-3 dark:border-slate-600 dark:bg-slate-950/40">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {t("settings.bambuLiveSection", "Live Bambu status (beta)")}
                              </div>
                              <div className="max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">
                                {t(
                                  "settings.bambuLiveHint",
                                  "Optional local read-only integration for observing printer and AMS status while we evaluate which live fields are stable and valuable.",
                                )}
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                              <input
                                type="checkbox"
                                checked={editBambuLiveEnabled}
                                onChange={(event) => setEditBambuLiveEnabled(event.target.checked)}
                                disabled={!tauri || busy || settingsClientReadOnly}
                              />
                              {t("settings.enableBambuLive", "Enable live status")}
                            </label>
                          </div>

                          {settingsClientReadOnly ? (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                              {t(
                                "settings.bambuLiveStandaloneOnly",
                                "Live Bambu status can only be configured on the host desktop in this phase.",
                              )}
                            </div>
                          ) : null}

                          {editBambuLiveEnabled ? (
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                              <input
                                type="text"
                                value={editBambuLiveHost}
                                onChange={(event) => setEditBambuLiveHost(event.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                                placeholder={t("settings.bambuLiveHost", "Printer host / IP")}
                                disabled={!tauri || busy || settingsClientReadOnly}
                              />
                              <input
                                type="password"
                                value={editBambuLiveAccessCode}
                                onChange={(event) => setEditBambuLiveAccessCode(event.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                                placeholder={t("settings.bambuLiveAccessCode", "Access code")}
                                disabled={!tauri || busy || settingsClientReadOnly}
                              />
                              <input
                                type="text"
                                value={editBambuLivePrinterSerial}
                                onChange={(event) => setEditBambuLivePrinterSerial(event.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                                placeholder={t("settings.bambuLivePrinterSerial", "Printer serial")}
                                disabled={!tauri || busy || settingsClientReadOnly}
                              />
                            </div>
                          ) : null}

	                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
	                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {editBambuLiveEnabled
                                ? t(
                                    "settings.bambuLiveOptInNote",
                                    "Credentials are stored locally on this desktop as part of the current experimental opt-in flow.",
                                  )
                                : t(
                                    "settings.bambuLiveDisabledNote",
                                    "Leave disabled to keep the current printer flow unchanged.",
                                  )}
	                            </div>
	                          </div>
	                        </div>
	                        ) : null}
	                      </div>
	                    ) : null}
                  </div>
                );
              })}
            </div>

          </section>
        ) : null}

        {activeTab === "GENERAL" ? (
          <>
            <section className="surface-card space-y-3">
              <div className="section-eyebrow">
                {t("settings.program", "Program")}
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300">
                {t("settings.version", "Version")}:{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {appVersion?.trim() || t("common.unknown", "Unknown")}
                </span>
              </div>
            </section>

            <section className="surface-card space-y-4">
              <div className="section-eyebrow">
                {t("settings.appearance", "Appearance")}
              </div>
              <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t("settings.autoHint", "Auto follows your system light/dark preference.")}
              </div>
              <div className="surface-subtle p-3">
                <div className="flex flex-wrap gap-2">
                  {(["auto", "light", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleThemeSelection(mode)}
                      className={chipButtonClass(themeMode === mode)}
                    >
                      {mode === "auto"
                        ? t("settings.auto", "Auto (system)")
                        : mode === "light"
                          ? t("settings.light", "Light")
                          : t("settings.dark", "Dark")}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="surface-card space-y-4">
              <div className="section-eyebrow">
                {t("settings.language", "Language")}
              </div>
              <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t(
                  "settings.languageHint",
                  "Choose app language. More sections will be localized incrementally.",
                )}
              </div>
              <div className="surface-subtle p-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleLocaleSelection("nb")}
                    className={chipButtonClass(locale === "nb")}
                  >
                    Norsk (bokmål)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLocaleSelection("en")}
                    className={chipButtonClass(locale === "en")}
                  >
                    English
                  </button>
                </div>
              </div>
            </section>

            <section className="surface-card space-y-4">
              <div className="section-eyebrow">
                {t("settings.inventoryOverviewPrint", "Inventory A4 overview")}
              </div>
              <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t(
                  "settings.inventoryOverviewPrintHint",
                  "Print a material-sorted list with swatch, QR and filament details for all in-stock spools.",
                )}
              </div>
              <button
                type="button"
                onClick={() => void handlePrintInventoryOverviewA4()}
                className={settingsActionButtonClass("accent")}
                disabled={!tauri || busy}
              >
                {t("settings.inventoryOverviewPrintAction", "Print A4 inventory overview")}
              </button>
            </section>

          </>
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
                  <div className="space-y-4 rounded-lg border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-700/70 dark:bg-slate-950/35">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {t("settings.trustedLanServerTitle", "Web app server")}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {t(
                            "settings.trustedLanCompactNetworkHint",
                            "The web app runs on one selected private LAN interface. Open the network details only when you need them.",
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowTrustedLanNetworkSummary((value) => !value)}
                          className={settingsActionButtonClass(
                            showTrustedLanNetworkSummary ? "accent" : "neutral",
                          )}
                          disabled={!tauri || trustedLanActionBusy}
                        >
                          {showTrustedLanNetworkSummary
                            ? t("settings.trustedLanHideNetworkSummary", "Hide network")
                            : t("settings.trustedLanShowNetwork", "Show network")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTrustedLanNetworkEditor((value) => !value)}
                          className={settingsActionButtonClass(
                            showTrustedLanNetworkEditor ? "accent" : "neutral",
                          )}
                          disabled={!tauri || trustedLanActionBusy}
                        >
                          {showTrustedLanNetworkEditor
                            ? t("settings.trustedLanHideNetwork", "Hide network")
                            : t("settings.trustedLanEditNetwork", "Edit network")}
                        </button>
                      </div>
                    </div>

                    {showTrustedLanNetworkSummary ? (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                        <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-950/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("settings.trustedLanInterface", "Selected interface")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {trustedLanCompanionModel.interfaceValue}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-950/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("settings.trustedLanPort", "Port")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            :{trustedLanCompanionModel.portValue}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 sm:col-span-2 dark:border-slate-700/70 dark:bg-slate-950/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("settings.trustedLanShellUrl", "LAN URL")}
                          </div>
                          <div className="mt-2 break-all text-sm font-medium text-slate-800 dark:text-slate-100">
                            {trustedLanCompanionModel.shellUrlValue}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {showTrustedLanNetworkEditor ? (
                      <div className="rounded-lg border border-slate-200/80 bg-white/78 px-4 py-4 shadow-sm shadow-slate-200/20 dark:border-white/12 dark:bg-slate-950/35 dark:shadow-none">
                        <div className="grid gap-4">
                          <label className="block">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
                              {t("settings.trustedLanInterfaceSelect", "Private interface")}
                            </div>
                            <select
                              className="mt-2 w-full rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                              value={trustedLanInterfaceAddressDraft}
                              disabled={trustedLanCompanionModel.configActionDisabled}
                              onChange={(event) => setTrustedLanInterfaceAddressDraft(event.target.value)}
                            >
                              {trustedLanInterfaces.length === 0 ? (
                                <option value="">
                                  {t(
                                    "settings.trustedLanNoInterfaces",
                                    "No private IPv4 interfaces detected",
                                  )}
                                </option>
                              ) : null}
                              {trustedLanInterfaces.map((option) => (
                                <option key={`${option.name}-${option.address}`} value={option.address}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid gap-3 sm:grid-cols-[140px_auto] sm:items-end">
                            <label className="block">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
                                {t("settings.trustedLanPortInput", "Listener port")}
                              </div>
                              <input
                                type="number"
                                min={1}
                                max={65535}
                                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                                value={trustedLanPortDraft}
                                disabled={trustedLanCompanionModel.configActionDisabled}
                                onChange={(event) => setTrustedLanPortDraft(event.target.value)}
                              />
                            </label>

                            <button
                              type="button"
                              className={settingsActionButtonClass("accent")}
                              disabled={trustedLanCompanionModel.configActionDisabled || !trustedLanNetworkDirty}
                              onClick={() => void handleSaveTrustedLanConfig()}
                            >
                              {t("settings.trustedLanSave", "Save network")}
                            </button>
                          </div>

                          <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {t(
                              "settings.trustedLanBindBody",
                              "Binds to one explicit private interface. Never 0.0.0.0.",
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
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
              <div className="mt-4">
                <div className="surface-subtle px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {t("settings.trustedLanPairingTitle", "Browser pairing")}
                      </div>
                      <div className="mt-1 text-sm leading-6">
                        {t(
                          "settings.trustedLanPairingBody",
                          "Create a short-lived link or QR for one browser.",
                        )}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t(
                          "settings.trustedLanPairingNoteBody",
                          "Browser-only access. This does not add any device-ingestion route.",
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-4 ${trustedLanPairingLink ? "lg:grid-cols-[1fr_220px]" : ""}`}>
                    <div className="rounded-lg border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
                      <label className="block">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                          {t("settings.trustedLanPairingLabelInput", "Browser label")}
                        </div>
                        <input
                          type="text"
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                          value={trustedLanPairingBrowserLabelDraft}
                          disabled={trustedLanCompanionModel.pairActionDisabled}
                          onChange={(event) => setTrustedLanPairingBrowserLabelDraft(event.target.value)}
                          placeholder={t(
                            "settings.trustedLanPairingLabelPlaceholder",
                            "iPad Safari, kitchen phone, workshop MacBook...",
                          )}
                        />
                      </label>
                      <div className="mt-3">
                        <button
                          type="button"
                          className={settingsActionButtonClass("accent")}
                          disabled={trustedLanCompanionModel.pairActionDisabled}
                          onClick={() => void handleCreateTrustedLanPairingLink()}
                        >
                          {t("settings.trustedLanCreatePairing", "Create pairing link")}
                        </button>
                      </div>

                      {trustedLanPairingLink ? (
                        <>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                              {t("settings.trustedLanPairingLabelMeta", "Browser label")}:{" "}
                              {trustedLanPairingLabel ??
                                t("settings.trustedLanPairingLabelEmpty", "No label")}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                              {t("settings.trustedLanPairingExpiresAt", "Expires at")}:{" "}
                              {trustedLanPairingExpiresAtMs
                                ? formatTrustedLanPairingExpiry(
                                    trustedLanPairingExpiresAtMs,
                                    locale,
                                  )
                                : t("common.loading", "Loading...")}
                            </span>
                          </div>

                          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("settings.trustedLanLatestPairing", "Latest pairing link")}
                          </div>
                          <div className="mt-2 break-all rounded-lg border border-slate-200 bg-slate-50/85 px-3 py-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-100">
                            {trustedLanPairingLink}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={settingsActionButtonClass()}
                              disabled={!trustedLanPairingLink || trustedLanActionBusy}
                              onClick={() => void handleCopyTrustedLanPairingLink()}
                            >
                              {t("settings.trustedLanCopyPairing", "Copy pairing link")}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>

                    {trustedLanPairingLink ? (
                    <div className="rounded-lg border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {t("settings.trustedLanPairingQrTitle", "Pairing QR")}
                      </div>
                      <div className="mt-3 flex min-h-[208px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-950/70">
                        {trustedLanPairingQrDataUrl ? (
                          <img
                            src={trustedLanPairingQrDataUrl}
                            alt={t("settings.trustedLanPairingQrAlt", "Trusted-LAN pairing QR")}
                            className="h-44 w-44 rounded-xl bg-white p-2 shadow-sm shadow-slate-200/60 dark:shadow-none"
                          />
                        ) : (
                          <div className="max-w-[12rem] text-center text-xs leading-6 text-slate-500 dark:text-slate-400">
                            {trustedLanPairingQrBusy
                              ? t(
                                  "settings.trustedLanPairingQrLoading",
                                  "Building QR preview...",
                                )
                              : trustedLanPairingQrUnavailable
                                ? t(
                                    "settings.trustedLanPairingQrUnavailable",
                                    "QR preview is unavailable in this build. The pairing link still works.",
                                  )
                                : t(
                                    "settings.trustedLanPairingQrHint",
                                    "Create a pairing link to generate a QR preview.",
                                  )}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                        {t(
                          "settings.trustedLanPairingQrScanBody",
                          "Scan with the browser you want to pair. The link stays short-lived and single-use.",
                        )}
                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>
              </div>
              ) : null}

              {librarySyncModeDraft !== "CLIENT" ? (
              <div className="surface-subtle mt-4 px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {t("settings.trustedLanBrowsersTitle", "Paired browsers")}
                    </div>
                    <div className="mt-1 text-sm leading-6">
                      {t(
                        "settings.trustedLanBrowsersBody",
                        "Revoke a browser to stop future renewals and cut off its current sessions.",
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                      {activeTrustedLanPairedBrowsers.length}{" "}
                      {t("settings.trustedLanActive", "Active")}
                    </span>
                    {revokedTrustedLanPairedBrowsers.length > 0 ? (
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-950/60 dark:text-slate-200">
                        {revokedTrustedLanPairedBrowsers.length}{" "}
                        {t("settings.trustedLanRevoked", "Revoked")}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={settingsActionButtonClass()}
                      disabled={
                        trustedLanActionBusy || activeTrustedLanPairedBrowsers.length === 0
                      }
                      onClick={() => void handleRevokeAllTrustedLanBrowsers()}
                    >
                      {t("settings.trustedLanRevokeAll", "Revoke all")}
                    </button>
                  </div>
                </div>

                {trustedLanPairedBrowsers.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t(
                      "settings.trustedLanBrowsersEmpty",
                      "No trusted-LAN browsers have been paired yet.",
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {activeTrustedLanPairedBrowsers.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        {t(
                          "settings.trustedLanNoActiveBrowsers",
                          "No active browsers right now.",
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {activeTrustedLanPairedBrowsers.map((browser) => (
                          <div
                            key={browser.id}
                            className="rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/55 dark:shadow-none"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                                  {browser.initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                      {browser.displayName}
                                    </div>
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                      {browser.statusLabel}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/60">
                                      {browser.activityLabel}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/60">
                                      {browser.pairedLabel}
                                    </span>
                                    {browser.originLabel ? (
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/60">
                                        {t("settings.trustedLanOrigin", "Origin")} {browser.originLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                className={settingsActionButtonClass()}
                                disabled={trustedLanActionBusy}
                                onClick={() => void handleRevokeTrustedLanBrowser(browser.id)}
                              >
                                {t("settings.trustedLanRevoke", "Revoke")}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {revokedTrustedLanPairedBrowsers.length > 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white/65 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {t("settings.trustedLanRevokedHistory", "Revoked history")}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {t(
                                "settings.trustedLanRevokedHistoryBody",
                                "Keep this tucked away unless you need to audit older browser access.",
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className={settingsActionButtonClass()}
                            onClick={() =>
                              setShowTrustedLanRevokedBrowsers((value) => !value)
                            }
                          >
                            {showTrustedLanRevokedBrowsers
                              ? t("settings.trustedLanHideRevoked", "Hide revoked")
                              : t("settings.trustedLanShowRevoked", "Show revoked")}
                          </button>
                        </div>

                        {showTrustedLanRevokedBrowsers ? (
                          <div className="mt-3 grid gap-3">
                            {revokedTrustedLanPairedBrowsers.map((browser) => (
                              <div
                                key={browser.id}
                                className="rounded-lg border border-slate-200/80 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55"
                              >
                                <div className="flex min-w-0 items-start gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                                    {browser.initials}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
                                        {browser.displayName}
                                      </div>
                                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {browser.statusLabel}
                                      </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                                        {browser.activityLabel}
                                      </span>
                                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                                        {browser.pairedLabel}
                                      </span>
                                      {browser.originLabel ? (
                                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                                          {t("settings.trustedLanOrigin", "Origin")} {browser.originLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
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

            <div className="surface-subtle mt-6 overflow-hidden p-0">
              <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <div className="section-eyebrow">
                      {t("settings.swatchQuality", "Swatch quality")}
                    </div>
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {t(
                        "settings.swatchQualityHelp",
                        "Review missing swatches here, then save manual fixes or fill the visible list in bulk.",
                      )}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-none">
                    {t("settings.missingSwatches", "Missing swatches")}:{" "}
                    {missingSwatchMasters.length}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SettingsMetricTile
                    label={t("settings.missingSwatches", "Missing swatches")}
                    value={missingSwatchMasters.length}
                  />
                  <SettingsMetricTile
                    label={t("settings.visibleMissing", "Visible missing")}
                    value={visibleMissingSwatchMasters.length}
                  />
                  <SettingsMetricTile
                    label={t("inventory.vendorGroup", "Vendor")}
                    value={visibleMissingSwatchVendorCount}
                    hint={t("settings.missingSwatches", "Missing swatches")}
                  />
                </div>
              </div>

              <div className="p-5">
                <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
                  <div className="flex flex-wrap items-center gap-2">
                    {swatchVendorOptions.map((vendor) => (
                      <button
                        key={vendor}
                        type="button"
                        onClick={() => setSwatchVendorFilter(vendor)}
                        className={chipButtonClass(swatchVendorFilter === vendor)}
                      >
                        {vendor === "ALL" ? t("common.all", "All") : vendor}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={settingsActionButtonClass()}
                      onClick={() => void reloadSettings()}
                      disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
                    >
                      {t("common.refresh", "Refresh")}
                    </button>
                    <button
                      type="button"
                      className={settingsActionButtonClass("accent")}
                      onClick={() => void handleBulkAutoFillMissingSwatches()}
                      disabled={
                        !tauri ||
                        busy ||
                        swatchBusy ||
                        catalogRefreshBusy ||
                        visibleMissingSwatchMasters.length === 0
                      }
                    >
                      {swatchBusy
                        ? t("settings.updatingSwatches", "Updating swatches...")
                        : confirmBulkSwatch
                          ? t("settings.confirmBulkSwatchAction", "Confirm auto-fill")
                          : t(
                              "settings.autofillVisibleSwatches",
                              "Auto-fill visible missing swatches",
                            )}
                    </button>
                  </div>
                  {confirmBulkSwatch ? (
                    <div className="mt-3 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                      {t(
                        "settings.confirmBulkSwatchTapAgain",
                        "Click Auto-fill visible missing swatches again to confirm.",
                      )}
                    </div>
                  ) : null}
                </div>

                {visibleMissingSwatchMasters.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    {t("settings.noMissingSwatches", "No missing swatches to fill.")}
                  </div>
                ) : (
                  <div className="mt-4 max-h-[460px] space-y-3 overflow-auto pr-1">
                    {visibleMissingSwatchMasters.map((master) => {
                      const draftHex = swatchDraftById[master.id] ?? suggestHexFromColor(master);
                      const normalizedDraft =
                        normalizeHexColor(draftHex, { uppercase: true }) ?? suggestHexFromColor(master);
                      return (
                        <div
                          key={master.id}
                          className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                className="mt-0.5 h-11 w-11 shrink-0 rounded-lg border border-slate-200 shadow-inner dark:border-slate-700"
                                style={{ backgroundColor: toSwatchColor(normalizedDraft) }}
                                title={normalizedDraft}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatFilamentDisplayTitle(
                                    master.material,
                                    master.filament_name,
                                    master.color_name,
                                  )}
                                </div>
                                <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                                  {master.vendor} · ID: {master.id}
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-[120px_56px_auto] xl:min-w-[308px]">
                              <input
                                type="text"
                                value={draftHex}
                                onChange={(event) =>
                                  updateSwatchDraft(master.id, event.target.value)
                                }
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                                placeholder="#RRGGBB"
                                disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
                              />
                              <input
                                type="color"
                                value={toSwatchColor(normalizedDraft)}
                                onChange={(event) =>
                                  updateSwatchDraft(master.id, event.target.value)
                                }
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-900/70"
                                disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
                              />
                              <button
                                type="button"
                                className={settingsActionButtonClass()}
                                onClick={() => void handleSaveMissingSwatch(master)}
                                disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
                              >
                                {t("common.save", "Save")}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "MAINTENANCE" ? (
          <section className="surface-card xl:col-span-2">
            <div className="section-eyebrow">
              {t("settings.maintenance", "Maintenance")}
            </div>
            <div className="surface-subtle mt-4 overflow-hidden p-0">
              <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
                <div className="max-w-3xl">
                    <div className="section-eyebrow">
                      {t("settings.backupTitle", "Backup")}
                    </div>
                    <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {t(
                        "settings.backupDescription",
                        "Export a full JSON backup with inventory, history and configured printers.",
                      )}
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SettingsMetricTile label={t("nav.printers", "Printers")} value={printers.length} />
                  <SettingsMetricTile
                    label={t("settings.totalCatalog", "Catalog")}
                    value={catalogMasters.length}
                  />
                  <SettingsMetricTile
                    label={t("settings.missingSwatches", "Missing swatches")}
                    value={missingSwatchMasters.length}
                  />
                </div>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.95fr]">
                <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
                  <div className="section-eyebrow">
                    {t("settings.backupExportGroup", "Backup and export")}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className={settingsActionButtonClass("accent")}
                      onClick={() => void handleExportFullBackup()}
                      disabled={!tauri || busy}
                    >
                      {t("settings.exportFullBackup", "Export full backup (JSON)")}
                    </button>
                    <button
                      type="button"
                      className={settingsActionButtonClass()}
                      onClick={() => void handleExportInventoryCsv()}
                      disabled={!tauri || busy}
                    >
                      {t("settings.exportInventoryCsv", "Export inventory CSV")}
                    </button>
                    <button
                      type="button"
                      className={settingsActionButtonClass()}
                      onClick={() => void handleExportInventoryJson()}
                      disabled={!tauri || busy}
                    >
                      {t("settings.exportInventoryJson", "Export inventory JSON")}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
                  <div className="section-eyebrow">
                    {t("settings.backupImportGroup", "Import and validation")}
                  </div>
                  <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
                    {t(
                      "settings.noBackupValidationYet",
                      "Validate a backup file here to see compatibility details before importing.",
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      className={`${settingsActionButtonClass()} w-full`}
                      onClick={handleOpenDataImport}
                      disabled={!tauri || busy}
                    >
                      {t("settings.importDataFile", "Import backup/data file")}
                    </button>
                    <button
                      type="button"
                      className={`${settingsActionButtonClass()} w-full`}
                      onClick={handleOpenBackupValidate}
                      disabled={!tauri || busy}
                    >
                      {t("settings.validateBackup", "Validate backup file")}
                    </button>
                  </div>

                  {lastBackupValidation ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/90 p-4 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          {t("settings.backupValidationSummary", "Backup validation summary")}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            backupValidationHasWarnings
                              ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200"
                              : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-200"
                          }`}
                        >
                          {backupValidationHasWarnings
                            ? t("settings.validationStatusWarn", "Has warnings")
                            : t("settings.validationStatusOk", "Fully compatible")}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <SettingsMetricTile
                          label={t("settings.validationFormat", "Format")}
                          value={lastBackupValidation.format}
                          className="bg-white/80 dark:bg-slate-900/60"
                        />
                        <SettingsMetricTile
                          label={t("settings.validationTables", "Tables")}
                          value={`${lastBackupValidation.present_tables}/${lastBackupValidation.expected_tables}`}
                          className="bg-white/80 dark:bg-slate-900/60"
                        />
                        <SettingsMetricTile
                          label={t("settings.validationRows", "Rows")}
                          value={lastBackupValidation.total_rows}
                          className="bg-white/80 dark:bg-slate-900/60"
                        />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div
                          className={`rounded-xl border px-3 py-3 ${
                            backupValidationHasMissingTables
                              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                          }`}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                            {t("settings.validationMissingTables", "Missing tables")}
                          </div>
                          <div className="mt-1 text-xs leading-relaxed">
                            {lastBackupValidation.missing_tables.length > 0
                              ? lastBackupValidation.missing_tables.join(", ")
                              : "0"}
                          </div>
                        </div>
                        <div
                          className={`rounded-xl border px-3 py-3 ${
                            backupValidationHasExtraTables
                              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                          }`}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                            {t("settings.validationExtraTables", "Extra tables")}
                          </div>
                          <div className="mt-1 text-xs leading-relaxed">
                            {lastBackupValidation.extra_tables.length > 0
                              ? lastBackupValidation.extra_tables.join(", ")
                              : "0"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <input
                ref={backupImportInputRef}
                type="file"
                accept="application/json,.json,text/csv,.csv"
                className="hidden"
                onChange={(event) => void handleImportDataFile(event)}
              />
              <input
                ref={backupValidateInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleValidateBackupFile(event)}
              />
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="section-eyebrow">
                {t("settings.resetSectionTitle", "Reset and cleanup")}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="min-h-[250px] rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm shadow-amber-200/30 dark:border-amber-500/40 dark:bg-amber-500/10 dark:shadow-none">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-200">
                    <span aria-hidden="true">⚠️</span>
                    {t("settings.resetCatalogs", "Reset catalogs")}
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-amber-400 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm shadow-amber-200/30 disabled:opacity-50 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-100 dark:shadow-none"
                    onClick={handleResetCatalogs}
                    disabled={!tauri || busy}
                  >
                    {confirmResetAction === "CATALOG"
                      ? t("settings.confirmResetCatalogsAction", "Confirm reset catalogs")
                      : t("settings.resetCatalogs", "Reset catalogs")}
                  </button>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-amber-900 dark:text-amber-100/90">
                    <li>
                      {t(
                        "settings.resetCatalogsList1",
                        "Keeps catalog entries linked to inventory rolls or wishlist items.",
                      )}
                    </li>
                    <li>
                      {t(
                        "settings.resetCatalogsList2",
                        "Removes only unused catalog entries.",
                      )}
                    </li>
                    <li>
                      {t(
                        "settings.resetCatalogsList3",
                        "Reactivates remaining discontinued catalog entries.",
                      )}
                    </li>
                  </ul>
                </div>

                <div className="min-h-[250px] rounded-xl border border-rose-300 bg-rose-50/90 p-4 shadow-sm shadow-rose-200/30 dark:border-rose-500/40 dark:bg-rose-500/10 dark:shadow-none">
                  <div className="flex items-center gap-2 text-sm font-semibold text-rose-950 dark:text-rose-200">
                    <span aria-hidden="true">🧹</span>
                    {t("settings.resetApp", "Reset app data")}
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-rose-400 bg-rose-200 px-4 py-2 text-sm font-semibold text-rose-950 shadow-sm shadow-rose-200/30 disabled:opacity-50 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-100 dark:shadow-none"
                    onClick={handleResetAppData}
                    disabled={!tauri || busy}
                  >
                    {confirmResetAction === "APP"
                      ? t("settings.confirmResetAppAction", "Confirm reset app data")
                      : t("settings.resetApp", "Reset app data")}
                  </button>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-rose-900 dark:text-rose-100/90">
                    <li>
                      {t(
                        "settings.resetAppList1",
                        "Clears inventory rolls and roll lifecycle history.",
                      )}
                    </li>
                    <li>
                      {t(
                        "settings.resetAppList2",
                        "Clears printer mappings, print statistics and wishlist.",
                      )}
                    </li>
                    <li>
                      {t(
                        "settings.resetAppList3",
                        "Keeps master catalog entries and swatch data.",
                      )}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            {lastCatalogReset ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                {t("settings.removed", "Removed")}: {lastCatalogReset.removed_count} ·{" "}
                {t("settings.remaining", "Remaining")}: {lastCatalogReset.remaining_count} ·{" "}
                {t("settings.reactivated", "Reactivated")}: {lastCatalogReset.reactivated_count}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      {roleChangeTarget ? (
        <AppModal closeOnBackdrop onBackdropClose={closeLibraryRoleChangeModal}>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  {t("settings.libraryRoleLabel", "Library role")}
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                  {roleChangeTarget === "HOST"
                    ? t("settings.librarySyncConfirmSwitchToHost", "Switch to Host")
                    : roleChangeTarget === "CLIENT"
                      ? t("settings.librarySyncConfirmSwitchToClient", "Switch to Client")
                      : t("settings.librarySyncConfirmSwitchToStandalone", "Switch to Standalone")}
                </div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {roleChangeFromClient && roleChangeToHost
                    ? t(
                        "settings.librarySyncHostHint",
                        "This device is prepared to host the library for other desktop or browser clients.",
                      )
                    : roleChangeFromClient && roleChangeToStandalone
                      ? t(
                          "settings.librarySyncStandaloneHint",
                          "This device keeps using its own local library only.",
                        )
                    : roleChangeTarget === "HOST"
                      ? t(
                          "settings.librarySyncHostHint",
                          "This device is prepared to host the library for other desktop or browser clients.",
                        )
                      : roleChangeTarget === "CLIENT"
                        ? t(
                            "settings.librarySyncClientHint",
                            "This device connects to another host and keeps a read-only fallback cache when that host is unavailable.",
                          )
                        : t(
                          "settings.librarySyncStandaloneHint",
                          "This device keeps using its own local library only.",
                        )}
                </div>
              </div>
              <button
                type="button"
                onClick={closeLibraryRoleChangeModal}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/85 text-[1.35rem] leading-none text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800/60"
              >
                ×
              </button>
            </div>

            {roleChangeFromClient && roleChangeToHost ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
                {t(
                  "settings.librarySyncRoleChangeClientToHostHint",
                  "This client becomes its own host after the switch. If you later want to move library data from the current host, create a full backup there and import it later under Program maintenance on this device.",
                )}
              </div>
            ) : null}

            {roleChangeFromClient && roleChangeToStandalone ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
                {locale === "nb"
                  ? `Denne klienten forventer vanligvis at et vertsbibliotek er tilgjengelig. Du kan eksportere en full sikkerhetskopi på ${
                      librarySyncSettings?.host_device_name || t("common.unknown", "Ukjent")
                    } og importere den senere under Programvedlikehold hvis du vil fortsette lokalt.`
                  : `This client normally expects a host library. You can export a full backup on ${
                      librarySyncSettings?.host_device_name || t("common.unknown", "Unknown")
                    } and import it later under Program maintenance if you want to continue locally.`}
              </div>
            ) : null}

            {roleChangeToClient ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
                {t(
                  "settings.librarySyncRoleChangeClientHint",
                  "Client mode expects a host connection. After switching, use Desktop client pairing to connect this device to the host you want to use.",
                )}
              </div>
            ) : null}

            {(roleChangeRequiresExport || roleChangeRequiresValidate || roleChangeRequiresImport) ? (
              <div className="space-y-3">
                {roleChangeRequiresExport ? (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t("settings.exportFullBackup", "Export full backup (JSON)")}
                        </div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {lastFullBackupExportedAt
                            ? formatSettingsDateTime(lastFullBackupExportedAt, locale)
                            : t(
                                "settings.librarySyncMigrationStepExportHint",
                                "Use the export button below before importing on the next machine.",
                              )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lastFullBackupExportedAt
                              ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                              : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                          }`}
                        >
                          {lastFullBackupExportedAt
                            ? t("settings.librarySyncStepDone", "Done")
                            : t("settings.librarySyncStepPending", "Pending")}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleExportFullBackup()}
                          className={settingsActionButtonClass("neutral")}
                          disabled={!tauri || busy}
                        >
                          {t("settings.exportFullBackup", "Export full backup (JSON)")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {roleChangeRequiresValidate ? (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t("settings.validateBackup", "Validate backup file")}
                        </div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {roleChangeValidateDone
                            ? `${t(
                                "settings.librarySyncRoleChangeAutoValidatedHint",
                                "The latest exported backup was validated automatically in this guided flow.",
                              )} ${formatSettingsDateTime(
                                lastFullBackupValidatedAt || lastFullBackupExportedAt || "",
                                locale,
                              )}`
                            : t(
                                "settings.librarySyncRoleChangeValidateImportHint",
                                "Validate the same backup here. That backup can be imported later under Program maintenance on the device that should continue with the library.",
                              )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            roleChangeValidateDone
                              ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                              : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                          }`}
                        >
                          {roleChangeValidateDone
                            ? t("settings.librarySyncStepDone", "Done")
                            : t("settings.librarySyncStepPending", "Pending")}
                        </span>
                        {roleChangeValidateDone ? null : (
                          <button
                            type="button"
                            onClick={() => handleOpenBackupValidate()}
                            className={settingsActionButtonClass("neutral")}
                            disabled={!tauri || busy}
                          >
                            {t("settings.validateBackup", "Validate backup file")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {roleChangeRequiresImport ? (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {t("settings.importDataFile", "Import backup/data file")}
                        </div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {lastFullBackupImportedAt
                            ? formatSettingsDateTime(lastFullBackupImportedAt, locale)
                            : t(
                                "settings.librarySyncMigrationStepImportHint",
                                "Import the host backup here before this device takes over.",
                              )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lastFullBackupImportedAt
                              ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                              : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                          }`}
                        >
                          {lastFullBackupImportedAt
                            ? t("settings.librarySyncStepDone", "Done")
                            : t("settings.librarySyncStepPending", "Pending")}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenDataImport()}
                          className={settingsActionButtonClass("neutral")}
                          disabled={!tauri || busy}
                        >
                          {t("settings.importDataFile", "Import backup/data file")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {libraryRoleConfirmArmed ? (
              <div className="rounded-xl border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                {t(
                  "settings.librarySyncConfirmArmedHint",
                  "One more click confirms this role change.",
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
              <button
                type="button"
                onClick={closeLibraryRoleChangeModal}
                className={settingsActionButtonClass("neutral")}
                disabled={librarySyncBusy}
              >
                {t("common.close", "Close")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmLibraryRoleChange()}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
                  libraryRoleConfirmArmed
                    ? "border border-amber-300 bg-amber-500 text-slate-950 shadow-amber-900/20 hover:bg-amber-400 dark:border-amber-400/40 dark:bg-amber-400 dark:hover:bg-amber-300"
                    : "border border-indigo-300 bg-indigo-500 text-white shadow-indigo-900/20 hover:bg-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-400 dark:text-slate-950 dark:hover:bg-indigo-300"
                }`}
                disabled={!tauri || librarySyncBusy || !roleChangeReady}
              >
                {librarySyncBusy
                  ? t("settings.librarySyncSaving", "Saving...")
                  : libraryRoleConfirmArmed
                    ? t("settings.librarySyncConfirmAgain", "Click again to confirm")
                    : roleChangeTarget === "HOST"
                      ? t("settings.librarySyncConfirmSwitchToHost", "Switch to Host")
                      : roleChangeTarget === "CLIENT"
                        ? t("settings.librarySyncConfirmSwitchToClient", "Switch to Client")
                      : t("settings.librarySyncConfirmSwitchToStandalone", "Switch to Standalone")}
              </button>
            </div>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
