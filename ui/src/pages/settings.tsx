import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SettingsTabKey } from "../App";
import {
  createTrustedLanPairing,
  clearLibrarySyncClientAuth,
  createPrinter,
  createLibrarySyncHostPrinter,
  deletePrinter,
  deleteLibrarySyncHostPrinter,
  exportFullBackupJson,
  exportInventoryCsv,
  exportInventoryJson,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncPrinterOverview,
  getAppVersion,
  getLibrarySyncSettings,
  pairLibrarySyncHost,
  getPrinterSettings,
  getTrustedLanCompanionStatus,
  importDataFile,
  isTauri,
  listMasterCatalog,
  listPrinterOverview,
  listSpools,
  listTrustedLanInterfaces,
  listTrustedLanPairedBrowsers,
  printLabelPdf,
  refreshBambuCatalog,
  refreshEsunCatalog,
  revokeAllTrustedLanPairedBrowsers,
  revokeTrustedLanPairedBrowser,
  resetAppData,
  resetCatalogData,
  saveLibrarySyncSettings,
  subscribeCatalogRefreshProgress,
  updateTrustedLanCompanionConfig,
  updateMasterCatalogEntry,
  validateLibrarySyncHost,
  validateFullBackupJson,
  type BackupValidationStats,
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
import { neutralChipClass } from "../lib/chip_styles";
import { copyTextToClipboard } from "../lib/clipboard";
import { PrinterModelPreview } from "../components/printer_model_preview";
import {
  describePrinterCapability,
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

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseNonNegativeInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isValidHex(raw?: string | null): boolean {
  const value = (raw ?? "").trim();
  return (
    /^#[0-9a-fA-F]{3}$/.test(value) ||
    /^#[0-9a-fA-F]{6}$/.test(value) ||
    /^[0-9a-fA-F]{3}$/.test(value) ||
    /^[0-9a-fA-F]{6}$/.test(value)
  );
}

function normalizeHex(raw?: string | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value.toUpperCase()}`;
  }
  return null;
}

function formatTrustedLanPairingExpiry(expiresAtMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(expiresAtMs);
}

function formatSettingsDateTime(raw: string, locale: Locale): string {
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  if (typeof error === "string" && error.trim()) {
    return `${fallback} (${error})`;
  }
  return fallback;
}

function isFullBackupValidationFormat(format?: string | null): boolean {
  const normalized = (format ?? "").trim().toUpperCase();
  return normalized === "FULL_BACKUP" || normalized === "FILAMENT-MANAGER-BACKUP-V1";
}

function extractBaseUrlFromPairingInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.searchParams.get("pairing")) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function toSwatchColor(raw?: string | null): string {
  return normalizeHex(raw) ?? "#CBD5E1";
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = lightness - c / 2;
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function suggestHexFromColor(master: MasterCatalogRow): string {
  const source = `${master.color_name} ${master.filament_name}`.toLowerCase();
  const named: Array<[RegExp, string]> = [
    [/(^|\s)black(\s|$)|charcoal|onyx/, "#1F2937"],
    [/(^|\s)white(\s|$)|ivory/, "#F8FAFC"],
    [/gray|grey|silver/, "#9CA3AF"],
    [/red|crimson|scarlet/, "#DC2626"],
    [/orange|amber/, "#F97316"],
    [/yellow|gold/, "#EAB308"],
    [/green|jade|olive|lime/, "#16A34A"],
    [/blue|azure|cobalt|navy|indigo/, "#2563EB"],
    [/purple|violet|lavender/, "#7C3AED"],
    [/pink|rose|magenta/, "#EC4899"],
    [/brown|chocolate|coffee/, "#8B5E3C"],
    [/beige|tan|sand|khaki/, "#C8A97E"],
    [/cyan|teal|turquoise/, "#06B6D4"],
    [/clear|natural|transparent/, "#D1D5DB"],
  ];
  for (const [pattern, hex] of named) {
    if (pattern.test(source)) {
      return hex;
    }
  }
  let hash = 2166136261 >>> 0;
  const seed = `${master.vendor}|${master.material}|${master.filament_name}|${master.color_name}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = hash % 360;
  const saturation = 50 + ((hash >>> 8) % 20);
  const lightness = 45 + ((hash >>> 16) % 18);
  return hslToHex(hue, saturation, lightness);
}

type SettingsTab = "GENERAL" | "LIBRARY" | "PRINTERS" | "CATALOG" | "MAINTENANCE";
type ResetConfirmAction = "APP" | "CATALOG";
type CatalogVendor = "Bambu" | "eSUN";
type SettingsPageProps = {
  initialTab?: SettingsTabKey;
};

function tabButtonClass(active: boolean): string {
  if (active) {
    return "rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-300/30 transition dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none";
  }
  return "rounded-2xl border border-transparent px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white/80 dark:text-slate-300 dark:hover:bg-slate-900/60";
}

function chipButtonClass(active: boolean): string {
  return neutralChipClass(active, "px-3 py-1 text-xs");
}

function settingsChoiceButtonClass(active: boolean, tone: "indigo" | "emerald" = "indigo"): string {
  if (active) {
    if (tone === "emerald") {
      return "inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm shadow-emerald-200/40 transition dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:shadow-none";
    }
    return "inline-flex items-center justify-center rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900 shadow-sm shadow-indigo-200/40 transition dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-100 dark:shadow-none";
  }
  return "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-900/80";
}

function settingsActionButtonClass(variant: "neutral" | "accent" = "neutral"): string {
  const base =
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50";
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
      className={`rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none ${className}`.trim()}
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

  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);
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
  const [editPrinterId, setEditPrinterId] = useState<string | null>(null);
  const [editPrinterModel, setEditPrinterModel] = useState("");
  const [editPrinterName, setEditPrinterName] = useState("");
  const [editAmsUnits, setEditAmsUnits] = useState("0");
  const [editSlotsPerUnit, setEditSlotsPerUnit] = useState("4");
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
  const missingSwatchMasters = useMemo(
    () => catalogMasters.filter((master) => !isValidHex(master.hex_color)),
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

  const reloadSettings = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    try {
      const [snapshot, catalogRows, syncSettings] = await Promise.all([
        getPrinterSettings(),
        listMasterCatalog(5000),
        getLibrarySyncSettings(),
      ]);
      const overviewRows =
        syncSettings.mode === "CLIENT" && syncSettings.host_base_url && syncSettings.library_id
          ? await fetchLibrarySyncPrinterOverview(syncSettings.host_base_url, syncSettings.library_id)
          : await listPrinterOverview();
      setPrinters(
        syncSettings.mode === "CLIENT" ? overviewRows.map((row) => row.printer) : snapshot.printers,
      );
      setPrinterOverview(overviewRows);
      setCatalogMasters(catalogRows);
      setLibrarySyncSettings(syncSettings);
      setLibrarySyncModeDraft((syncSettings.mode as LibrarySyncMode) ?? "STANDALONE");
      setLibrarySyncDeviceNameDraft(syncSettings.device_name ?? "");
      setLibrarySyncHostBaseUrlDraft(syncSettings.host_base_url ?? "");
      setLibrarySyncValidation(null);
      setLibrarySyncSnapshot(syncSettings.cached_snapshot ?? null);
      const nextDrafts: Record<string, string> = {};
      for (const master of catalogRows) {
        const normalized = normalizeHex(master.hex_color);
        nextDrafts[master.id] = normalized ?? suggestHexFromColor(master);
      }
      setSwatchDraftById(nextDrafts);
    } catch (loadError) {
      console.error(loadError);
      setError(t("settings.error.load", "Failed to load settings."));
    } finally {
      setLoading(false);
    }
  }, [t, tauri]);

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
        setInfo(
          t("settings.librarySyncHostCheckOk", "Host check passed."),
        );
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
  }, [librarySyncHostBaseUrlDraft, librarySyncSettings, settingsClientHostBaseUrl, t, tauri]);

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

  function handleStartEditPrinter(printer: PrinterRow) {
    const config = derivePrinterMultiConfig(printer.id, printer.model);
    setEditPrinterId(printer.id);
    setEditPrinterModel(printer.model);
    setEditPrinterName(printer.name);
    setEditAmsUnits(String(config.units));
    setEditSlotsPerUnit(String(config.slotsPerUnit));
    setConfirmDeletePrinterId(null);
  }

  function handleCancelEditPrinter() {
    setEditPrinterId(null);
    setEditPrinterModel("");
    setEditPrinterName("");
    setEditAmsUnits("0");
    setEditSlotsPerUnit("4");
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
      const payload = await exportInventoryCsv();
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
      const payload = await exportInventoryJson();
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
      const allRows: SpoolWithMasterRow[] = [];
      let offset = 0;
      const limit = 200;
      while (true) {
        const page = await listSpools(limit, offset);
        allRows.push(...page);
        if (page.length < limit) {
          break;
        }
        offset += page.length;
      }

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
        { buildCompanionSpoolQrPayload },
        { buildFilamentLabelQrDataUrl },
        { buildInventoryOverviewPrintPdfBase64 },
      ] = await Promise.all([
        import("../lib/filament_qr_payload"),
        import("../lib/filament_label_print"),
        import("../lib/inventory_overview_print"),
      ]);

      const printRows = await Promise.all(
        inStockRows.map(async (row) => {
          const qrReference = row.spool.id.trim();
          const qrPayload = buildCompanionSpoolQrPayload(
            qrReference,
            trustedLanStatus?.shell_url ?? null,
          );
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
        color: t("settings.inventoryOverviewPrintColor", "Color"),
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
      normalizeHex(swatchDraftById[master.id]) ?? suggestHexFromColor(master);
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
        `${t("settings.swatchSaved", "Saved swatch")}: ${master.material} · ${master.filament_name} · ${master.color_name}`,
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
          normalizeHex(swatchDraftById[master.id]) ?? suggestHexFromColor(master);
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

  async function persistTrustedLanConfig(
    nextEnabled: boolean,
    successMessage: string,
  ): Promise<boolean> {
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
        if (refreshedStatus?.enabled && refreshedStatus.running && refreshedStatus.shell_reachable) {
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
  const clientHasLinkedHost = Boolean(settingsClientHostBaseUrl || librarySyncHostBaseUrlDraft.trim());
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

      <div className="surface-subtle mt-6 p-2">
        <div className="flex flex-wrap gap-2">
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
                const hasMultiMaterial = hasConfiguredMultiMaterial(printerSlots);
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
                          · {printer.model} ·{" "}
                          {describePrinterCapability(t, printer.model, hasMultiMaterial)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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

                    {isEditing ? (
                      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 dark:border-slate-700 md:grid-cols-[1.2fr_1fr_110px_130px_auto]">
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
                        className={settingsChoiceButtonClass(librarySyncModeDraft === option.mode)}
                        disabled={!tauri || librarySyncBusy}
                      >
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
                        className={settingsChoiceButtonClass(
                          Boolean(trustedLanStatus?.enabled && trustedLanStatus?.running),
                          trustedLanStatus?.enabled && trustedLanStatus?.running ? "emerald" : undefined,
                        )}
                      >
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
                        onClick={() => void handleToggleTrustedLanEnabled(false)}
                        className={settingsChoiceButtonClass(!trustedLanEnabledDraft)}
                        disabled={!tauri || trustedLanActionBusy}
                      >
                        {t("common.off", "Off")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleTrustedLanEnabled(true)}
                        className={settingsChoiceButtonClass(trustedLanEnabledDraft, "emerald")}
                        disabled={
                          !tauri ||
                          trustedLanActionBusy ||
                          (!trustedLanEnabledDraft && !trustedLanHasPrivateInterfaces)
                        }
                      >
                        {trustedLanEnabledDraft
                          ? t("settings.libraryWebappRunning", "Running")
                          : t("common.on", "On")}
                      </button>
                    </div>
                  )}
                </div>

                {librarySyncModeDraft !== "CLIENT" && showLibraryWebappDetails ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-700/70 dark:bg-slate-950/35">
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
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-950/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("settings.trustedLanInterface", "Selected interface")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {trustedLanCompanionModel.interfaceValue}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-950/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("settings.trustedLanPort", "Port")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            :{trustedLanCompanionModel.portValue}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 sm:col-span-2 dark:border-slate-700/70 dark:bg-slate-950/50">
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
                      <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4 shadow-sm shadow-slate-200/20 dark:border-white/12 dark:bg-slate-950/35 dark:shadow-none">
                        <div className="grid gap-4">
                          <label className="block">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
                              {t("settings.trustedLanInterfaceSelect", "Private interface")}
                            </div>
                            <select
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
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
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
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
                  <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
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
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 dark:border-slate-700/70 dark:bg-slate-950/50">
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
                            <button
                              type="button"
                              onClick={() => void handleValidateLibrarySyncHost()}
                              className={settingsActionButtonClass("neutral")}
                              disabled={!tauri || librarySyncBusy || librarySyncValidationBusy || !clientHasLinkedHost}
                            >
                              {librarySyncValidationBusy
                                ? t("settings.librarySyncChecking", "Checking...")
                                : t("settings.librarySyncCheckHost", "Check host")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleClearLibrarySyncClientAuth()}
                              className={settingsActionButtonClass("neutral")}
                              disabled={!tauri || librarySyncBusy || !librarySyncSettings?.client_auth_paired}
                            >
                              {t("settings.librarySyncClearClientAuth", "Remove pairing")}
                            </button>
                            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200">
                              {t("settings.librarySyncClientAuthPaired", "Paired")}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {t(
                              "settings.librarySyncClientAuthPersistentHint",
                              "This client stays paired until you remove the pairing here or on the host.",
                            )}
                          </div>
                        </>
                      )}

                      {librarySyncValidation ? (
                        <div
                          className={`mt-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${
                            librarySyncValidation.ok && librarySyncValidation.matches_library_id
                              ? "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                              : librarySyncValidation.ok
                                ? "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
                                : "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100"
                          }`}
                        >
                          <div className="font-semibold">{librarySyncValidation.message}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
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
                          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
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
                            <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
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
                                  label={t("settings.librarySyncSnapshotInUse", "In use")}
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
                    <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
                      <label className="block">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                          {t("settings.trustedLanPairingLabelInput", "Browser label")}
                        </div>
                        <input
                          type="text"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
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
                          <div className="mt-2 break-all rounded-2xl border border-slate-200 bg-slate-50/85 px-3 py-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-100">
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
                    <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {t("settings.trustedLanPairingQrTitle", "Pairing QR")}
                      </div>
                      <div className="mt-3 flex min-h-[208px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-950/70">
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
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t(
                      "settings.trustedLanBrowsersEmpty",
                      "No trusted-LAN browsers have been paired yet.",
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {activeTrustedLanPairedBrowsers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
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
                            className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/55 dark:shadow-none"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
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
                      <div className="rounded-2xl border border-slate-200 bg-white/65 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45">
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
                                className="rounded-2xl border border-slate-200/80 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55"
                              >
                                <div className="flex min-w-0 items-start gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
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
                <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
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
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none">
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
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950 shadow-sm shadow-emerald-200/30 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:shadow-none">
                    <div className="grid gap-3 sm:grid-cols-3">
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
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none">
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
                <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
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
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    {t("settings.noMissingSwatches", "No missing swatches to fill.")}
                  </div>
                ) : (
                  <div className="mt-4 max-h-[460px] space-y-3 overflow-auto pr-1">
                    {visibleMissingSwatchMasters.map((master) => {
                      const draftHex = swatchDraftById[master.id] ?? suggestHexFromColor(master);
                      const normalizedDraft = normalizeHex(draftHex) ?? suggestHexFromColor(master);
                      return (
                        <div
                          key={master.id}
                          className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl border border-slate-200 shadow-inner dark:border-slate-700"
                                style={{ backgroundColor: toSwatchColor(normalizedDraft) }}
                                title={normalizedDraft}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {master.material} · {master.filament_name} · {master.color_name}
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
                <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
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

                <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
                  <div className="section-eyebrow">
                    {t("settings.backupImportGroup", "Import and validation")}
                  </div>
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
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
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
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
                        "settings.librarySyncRoleChangeClientToHostHint",
                        "This device becomes its own host after the switch. If you later want to move library data from the current host, create a full backup there and import it later under Program maintenance on this device.",
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-base leading-none text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800/60"
              >
                ×
              </button>
            </div>

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

            {roleChangeFromClient && roleChangeToHost ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
                {locale === "nb"
                  ? `Denne klienten blir stående som egen vert etter byttet. Hvis du senere vil overta bibliotekdataene fra ${
                      librarySyncSettings?.host_device_name || t("common.unknown", "Ukjent")
                    }, tar du full sikkerhetskopi på verten og importerer den senere under Programvedlikehold på denne maskinen.`
                  : `This client becomes its own host after the switch. If you later want to move library data from ${
                      librarySyncSettings?.host_device_name || t("common.unknown", "Unknown")
                    }, create a full backup on that host and import it later under Program maintenance on this device.`}
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
                className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
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
