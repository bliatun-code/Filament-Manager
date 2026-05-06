import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanOutModal } from "../components/loan_out_modal";
import { RollUsageChart } from "../components/roll_usage_chart";
import { VendorBadge } from "../components/vendor_badge";
import { WeightInput } from "../components/weight_input";
import { neutralChipClass, semanticChipClass } from "../lib/chip_styles";
import {
  blendSwatchColor,
  hexToRgb,
  isValidHexColor,
  swatchRgba,
  swatchTextColor,
  toSwatchColor,
} from "../lib/color_utils";
import { formatDateTime } from "../lib/date_time";
import { commandErrorText } from "../lib/error_text";
import {
  buildFilamentLabelHtml,
  buildFilamentLabelQrDataUrl,
} from "../lib/filament_label_print";
import {
  buildFilamentQrPayload,
  deriveCompanionShellUrl,
  type FilamentQrMode,
} from "../lib/filament_qr_payload";
import { useI18n } from "../lib/i18n";
import {
  buildMaterialOptions,
  buildVendorOptions,
  filterInventorySpools,
  formatInventoryDisplayTitle,
  formatMasterDisplayTitle,
  formatRollReference,
  groupInventorySpools,
  normalizeDisplayToken,
  normalizeOwnershipType,
  normalizeStatus,
  type InventorySpool,
  type OwnershipFilter,
  type OwnershipType,
  type SpoolGroup,
  type SpoolStatus,
  type StatusFilter,
} from "../lib/inventory_list_model";
import {
  buildBaselineCaptureFieldsBySlotId,
  buildObservedTrayCaptureSnapshot,
  buildObservedTrayCaptureSnapshotFromHostSlot,
  assessRfidCaptureMatch,
  extractRfidCaptureFields,
  formatCaptureTimestamp,
  formatObservedAge,
  getIdentityFreshness,
  hasHostRfidCaptureData,
  identityFreshnessCopy,
  latestRfidCaptureSeenAt,
  mergeRfidCaptureFields,
  rfidCaptureMatchMeta,
  summarizeRfidCapture,
  type RfidCaptureField,
  type RfidCaptureSummary,
} from "../lib/inventory_rfid_capture";
import {
  formatInventoryHistoryEventDetails,
  formatInventoryHistoryEventType,
} from "../lib/inventory_history";
import { materialTone } from "../lib/material_theme";
import {
  loadCatalogMasters,
  resolveCatalogSelectionDefaults,
} from "../lib/catalog_data_source";
import {
  loadInventorySpoolDetail,
  loadInventorySpools,
} from "../lib/inventory_data_source";
import { loadPrinterOverviewData } from "../lib/printer_data_source";
import { resolveSpoolTareWeight } from "../lib/spool_weight";
import { useResolvedTheme, type ResolvedTheme } from "../lib/theme_mode";
import { formatGrams, parsePositiveWeight } from "../lib/weight_display";
import { loadWishlistItems } from "../lib/wishlist_data_source";
import {
  formatPrinterSlotLabelForModel,
  sortPrinterSlotsExtLast,
} from "../lib/printer_profiles";
import {
  assignPrinterSlot,
  assignLibrarySyncHostPrinterSlot,
  createManualSpool,
  createLibrarySyncHostSpool,
  createSpool,
  createLibrarySyncHostWishlistItem,
  createWishlistItem,
  deleteLibrarySyncHostSpool,
  deleteLibrarySyncHostWishlistItem,
  deleteSpool,
  deleteWishlistItem,
  getPrinterSettings,
  getLibrarySyncSettings,
  getTrustedLanCompanionStatus,
  isTauri,
  listActiveSpoolLoans,
  printLabelHtml,
  purgeLibrarySyncHostSpool,
  purgeSpool,
  recordPrintUsage,
  type ActiveSpoolLoanRow,
  type BambuLiveIntegrationSettings,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type SpoolHistoryEventRow,
  type SpoolUsagePointRow,
  type WishlistItemRow,
  updateMasterCatalogEntry,
  updateLibrarySyncHostSpoolDetails,
  updateLibrarySyncHostSpoolRfidTag,
  updateSpoolDetails,
  updateSpoolRfidTag,
  updateSpoolStatus,
  updateLibrarySyncHostSpoolTareWeight,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolTareWeight,
  updateSpoolWeight,
  updateLibrarySyncHostWishlistItemStatus,
  updateWishlistItemStatus,
} from "../lib/tauri_client";

type CreateMode = "bambu" | "esun" | "manual";
type SidePanelMode = "MANAGE" | "ADD";
type WishlistStatus = "WISHLIST" | "ON_ORDER" | "RECEIVED";
type WishlistQueueFilter = "ALL" | WishlistStatus;
type InventoryViewMode = "CARDS" | "LIST";
type InventoryPageProps = {
  navigationIntent?: {
    kind: "LOW_STOCK";
    seq: number;
  } | null;
  onConsumeNavigationIntent?: () => void;
};

type PrinterSlotOption = {
  printerId: string;
  printerName: string;
  printerModel: string;
  amsId: string;
  slotId: string;
  slotIndex: number;
  spoolId?: string | null;
  spoolRemaining?: number | null;
  spoolMaterial?: string | null;
  spoolFilamentName?: string | null;
  spoolColorName?: string | null;
  spoolHexColor?: string | null;
  liveLoaded?: boolean | null;
  liveObservedRfidTag?: string | null;
  liveTrayUuid?: string | null;
  liveChipId?: string | null;
  liveTrayInfoIdx?: string | null;
  liveTrayIdName?: string | null;
  liveFilamentType?: string | null;
  liveFilamentName?: string | null;
  liveColorHex?: string | null;
  liveTrayWeightG?: number | null;
  liveRemainingPercent?: number | null;
  liveLastIdentitySeenAt?: string | null;
  livePrinterLastSeenAt?: string | null;
  liveMqttConnected?: boolean | null;
  liveAmsReadDoneBits?: string | null;
  liveAmsBambuBits?: string | null;
};

type SegmentedChoiceOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

const statuses: ReadonlyArray<StatusFilter> = [
  "ALL",
  "IN_STOCK",
  "ASSIGNED",
  "BORROWED",
  "EMPTY",
  "LOST",
];
const ownershipFilters: ReadonlyArray<OwnershipFilter> = [
  "ALL",
  "OWNED",
  "BORROWED_IN",
];

function segmentedChoiceGroupClass(className = ""): string {
  return `inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200/85 bg-white/72 p-1 shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-950/55 dark:shadow-none ${className}`.trim();
}

function segmentedChoiceButtonClass(
  active: boolean,
  sizeClasses = "px-3 py-2 text-xs",
): string {
  return `inline-flex items-center gap-2 rounded-xl ${sizeClasses} font-semibold transition ${
    active
      ? "bg-slate-900 text-white shadow-sm shadow-slate-900/10 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none"
      : "text-slate-600 hover:bg-white/85 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/80 dark:hover:text-slate-100"
  }`;
}

function segmentedChoiceCountClass(active: boolean): string {
  return `rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
    active
      ? "bg-white/15 text-white dark:bg-slate-900/15 dark:text-slate-900"
      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  }`;
}

type SegmentedChoiceRowProps<T extends string> = {
  label?: string;
  labelWidthClassName?: string;
  options: ReadonlyArray<SegmentedChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

function SegmentedChoiceRow<T extends string>({
  label,
  labelWidthClassName = "min-[920px]:w-24",
  options,
  value,
  onChange,
  className = "",
}: SegmentedChoiceRowProps<T>) {
  return (
    <div
      className={`flex flex-col gap-2.5 ${
        label ? "min-[920px]:flex-row min-[920px]:items-center min-[920px]:gap-4" : ""
      } ${className}`.trim()}
    >
      {label ? (
        <div
          className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 ${labelWidthClassName} min-[920px]:shrink-0`}
        >
          {label}
        </div>
      ) : null}
      <div className={segmentedChoiceGroupClass()}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={segmentedChoiceButtonClass(active)}
            >
              <span>{option.label}</span>
              {typeof option.count === "number" ? (
                <span className={segmentedChoiceCountClass(active)}>{option.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function inventorySwatchBorderColor(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return resolvedTheme === "dark"
      ? "rgba(100, 116, 139, 0.42)"
      : "rgba(148, 163, 184, 0.28)";
  }
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (brightness >= 228) {
    return resolvedTheme === "dark"
      ? "rgba(255, 255, 255, 0.4)"
      : "rgba(148, 163, 184, 0.34)";
  }
  if (brightness <= 42) {
    return resolvedTheme === "dark"
      ? "rgba(148, 163, 184, 0.34)"
      : "rgba(71, 85, 105, 0.34)";
  }
  return swatchRgba(raw, resolvedTheme === "dark" ? 0.4 : 0.28);
}

type InventorySwatchSurfaceTone = "card" | "panel" | "inset";

function inventorySwatchSurfaceStyle(
  raw: string | null | undefined,
  tone: InventorySwatchSurfaceTone,
  resolvedTheme: ResolvedTheme,
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? tone === "panel"
        ? {
            top: 0.34,
            mid: 0.18,
            bottom: 0.08,
            base: "rgb(8, 15, 29)",
            shadow: 0.42,
            border: 0.46,
            ambientShadow: "rgba(2, 6, 23, 0.54)",
            inset: "rgba(255, 255, 255, 0.03)",
          }
        : tone === "inset"
          ? {
              top: 0.28,
              mid: 0.14,
              bottom: 0.06,
              base: "rgb(13, 21, 39)",
              shadow: 0.34,
              border: 0.4,
              ambientShadow: "rgba(2, 6, 23, 0.46)",
              inset: "rgba(255, 255, 255, 0.028)",
            }
          : {
              top: 0.3,
              mid: 0.15,
              bottom: 0.07,
              base: "rgb(10, 17, 31)",
              shadow: 0.38,
              border: 0.42,
              ambientShadow: "rgba(2, 6, 23, 0.5)",
              inset: "rgba(255, 255, 255, 0.03)",
            }
      : tone === "panel"
        ? {
            top: 0.15,
            mid: 0.075,
            bottom: 0.025,
            base: "rgba(252, 254, 255, 0.96)",
            shadow: 0.28,
            border: 0.22,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          }
        : tone === "inset"
          ? {
              top: 0.11,
              mid: 0.055,
              bottom: 0.02,
              base: "rgba(253, 254, 255, 0.97)",
              shadow: 0.22,
              border: 0.18,
              ambientShadow: "rgba(148, 163, 184, 0.08)",
              inset: "rgba(255, 255, 255, 0.8)",
            }
          : {
              top: 0.125,
              mid: 0.06,
              bottom: 0.022,
              base: "rgba(252, 254, 255, 0.95)",
              shadow: 0.26,
              border: 0.2,
              ambientShadow: "rgba(148, 163, 184, 0.08)",
              inset: "rgba(255, 255, 255, 0.8)",
            };

  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${swatchRgba(raw, strength.top)} 0%, ${swatchRgba(
      raw,
      strength.mid,
    )} ${darkTheme ? "24%" : "38%"}, ${swatchRgba(
      raw,
      strength.bottom,
    )} ${darkTheme ? "66%" : "74%"}, ${strength.base} 100%)`,
    borderColor: inventorySwatchBorderColor(raw, resolvedTheme),
    boxShadow: `inset 0 1px 0 ${strength.inset}, 0 18px 38px -34px ${swatchRgba(raw, strength.shadow)}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
}

function inventorySwatchCardStyle(raw: string | null | undefined, resolvedTheme: ResolvedTheme) {
  return inventorySwatchSurfaceStyle(raw, "card", resolvedTheme);
}

function inventorySwatchPanelStyle(raw: string | null | undefined, resolvedTheme: ResolvedTheme) {
  return inventorySwatchSurfaceStyle(raw, "panel", resolvedTheme);
}

function inventorySwatchInsetStyle(raw: string | null | undefined, resolvedTheme: ResolvedTheme) {
  return inventorySwatchSurfaceStyle(raw, "inset", resolvedTheme);
}

function inventorySwatchInteractiveInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
  emphasis: "default" | "selected" | "recent" = "default",
) {
  const base = inventorySwatchInsetStyle(raw, resolvedTheme);
  if (emphasis === "selected") {
    return {
      ...base,
      borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.54 : 0.34),
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(226, 232, 240, 0.12)"
          : "rgba(15, 23, 42, 0.08)"
      }, 0 16px 30px -26px ${swatchRgba(raw, resolvedTheme === "dark" ? 0.42 : 0.3)}`,
    } as const;
  }
  if (emphasis === "recent") {
    return {
      ...base,
      borderColor:
        resolvedTheme === "dark"
          ? "rgba(52, 211, 153, 0.42)"
          : "rgba(16, 185, 129, 0.36)",
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(52, 211, 153, 0.16)"
          : "rgba(16, 185, 129, 0.12)"
      }, 0 16px 30px -26px ${
        resolvedTheme === "dark"
          ? "rgba(16, 185, 129, 0.28)"
          : "rgba(16, 185, 129, 0.22)"
      }`,
    } as const;
  }
  return base;
}

function inventorySwatchActionButtonStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return {
    background:
      resolvedTheme === "dark"
        ? `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.04)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.42,
          )} 100%)`
        : `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.08)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.2,
          )} 100%)`,
    borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.6 : 0.48),
    color: swatchTextColor(raw),
    boxShadow:
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${swatchRgba(raw, 0.74)}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
        : `0 18px 36px -24px ${swatchRgba(raw, 0.62)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
  } as const;
}

export default function InventoryPage({
  navigationIntent = null,
  onConsumeNavigationIntent,
}: InventoryPageProps) {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [materialFilter, setMaterialFilter] = useState("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [inventoryView, setInventoryView] = useState<InventoryViewMode>("CARDS");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [spools, setSpools] = useState<InventorySpool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [recentlyAddedSpoolId, setRecentlyAddedSpoolId] = useState<string | null>(null);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [librarySyncReady, setLibrarySyncReady] = useState(!tauri);
  const [clientInventorySource, setClientInventorySource] = useState<
    "LIVE" | "CACHED" | "OFFLINE"
  >("LIVE");
  const [clientInventoryUpdatedAt, setClientInventoryUpdatedAt] = useState<string | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<SpoolHistoryEventRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usagePoints, setUsagePoints] = useState<SpoolUsagePointRow[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistItems, setWishlistItems] = useState<WishlistItemRow[]>([]);
  const [activeLoans, setActiveLoans] = useState<ActiveSpoolLoanRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);

  const [masters, setMasters] = useState<MasterCatalogRow[]>([]);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("MANAGE");
  const [showRollModal, setShowRollModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRollHistory, setShowRollHistory] = useState(false);
  const [showLoanTrackingModal, setShowLoanTrackingModal] = useState(false);
  const [loanTrackingSpoolId, setLoanTrackingSpoolId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("bambu");
  const [bambuCatalogQuery, setBambuCatalogQuery] = useState("");
  const [newBambuMasterId, setNewBambuMasterId] = useState("");
  const [newInitialWeight, setNewInitialWeight] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newOwnershipType, setNewOwnershipType] = useState<OwnershipType>("OWNED");
  const [borrowedFromName, setBorrowedFromName] = useState("");
  const [borrowedFromContact, setBorrowedFromContact] = useState("");
  const [borrowedInNote, setBorrowedInNote] = useState("");

  const [manualVendor, setManualVendor] = useState("Generic");
  const [manualMaterial, setManualMaterial] = useState("PLA");
  const [manualFilamentName, setManualFilamentName] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualHexColor, setManualHexColor] = useState("");
  const [wishlistQueueFilter, setWishlistQueueFilter] =
    useState<WishlistQueueFilter>("WISHLIST");
  const [confirmWishlistRemoveId, setConfirmWishlistRemoveId] = useState<string | null>(null);

  const [esunCatalogQuery, setEsunCatalogQuery] = useState("");
  const [newEsunMasterId, setNewEsunMasterId] = useState("");

  const [masterEditUnlocked, setMasterEditUnlocked] = useState(false);
  const [editMasterVendor, setEditMasterVendor] = useState("");
  const [editMasterMaterial, setEditMasterMaterial] = useState("");
  const [editMasterFilamentName, setEditMasterFilamentName] = useState("");
  const [editMasterColorName, setEditMasterColorName] = useState("");
  const [editMasterHexColor, setEditMasterHexColor] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [selectedSpoolTareDraft, setSelectedSpoolTareDraft] = useState("");
  const [selectedSpoolLocationDraft, setSelectedSpoolLocationDraft] = useState("");
  const [selectedSpoolQrDataUrl, setSelectedSpoolQrDataUrl] = useState<string | null>(
    null,
  );
  const [selectedSpoolQrLoading, setSelectedSpoolQrLoading] = useState(false);
  const [selectedSpoolQrMode, setSelectedSpoolQrMode] = useState<FilamentQrMode>("companion");
  const [selectedSpoolQrResolvedMode, setSelectedSpoolQrResolvedMode] =
    useState<FilamentQrMode>("portable");
  const [selectedSpoolQrTarget, setSelectedSpoolQrTarget] = useState<string | null>(null);
  const [selectedSpoolQrCompanionShellUrl, setSelectedSpoolQrCompanionShellUrl] = useState<
    string | null
  >(null);
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationSettings>
  >({});
  const [showRfidCaptureModal, setShowRfidCaptureModal] = useState(false);
  const [showRfidCapturedFields, setShowRfidCapturedFields] = useState(false);
  const [rfidCaptureFieldsBySlotId, setRfidCaptureFieldsBySlotId] = useState<
    Record<string, RfidCaptureField[]>
  >({});
  const [selectedRfidCaptureSlotId, setSelectedRfidCaptureSlotId] = useState<string | null>(null);
  const [rfidCaptureError, setRfidCaptureError] = useState<string | null>(null);
  const [rfidCaptureLoading, setRfidCaptureLoading] = useState(false);
  const rfidCaptureRefreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const syncSettings = await getLibrarySyncSettings();
        if (cancelled) {
          return;
        }
        setClientReadOnly(syncSettings.mode === "CLIENT");
        setClientHostWritePaired(syncSettings.client_auth_paired ?? false);
        setClientHostDeviceName(syncSettings.host_device_name ?? null);
        setClientHostBaseUrl(syncSettings.host_base_url ?? null);
        setClientLibraryId(syncSettings.library_id ?? null);
      } catch (syncError) {
        console.error(syncError);
      } finally {
        if (!cancelled) {
          setLibrarySyncReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  useEffect(() => {
    if (navigationIntent?.kind !== "LOW_STOCK") {
      return;
    }
    setInventoryView("LIST");
    setStatusFilter("ALL");
    setOwnershipFilter("ALL");
    setVendorFilter("ALL");
    setMaterialFilter("ALL");
    setSearch("");
    setLowStockOnly(true);
    onConsumeNavigationIntent?.();
  }, [navigationIntent, onConsumeNavigationIntent]);

  useEffect(() => {
    if (!infoMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setInfoMessage(null);
      setRecentlyAddedSpoolId(null);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [infoMessage]);

  const applyMeasuredWeightWithUsage = useCallback(
    async (
      printerId: string,
      spoolId: string,
      previousRemaining: number | null | undefined,
      measuredTotalWeight: number,
      tareWeight: number,
      jobName?: string | null,
    ) => {
      const safeMeasuredTotal = Math.max(0, Math.round(measuredTotalWeight));
      const safeTareWeight = Math.max(0, Math.round(tareWeight));
      const measuredFilament = Math.max(0, safeMeasuredTotal - safeTareWeight);
      if (previousRemaining != null && Number.isFinite(previousRemaining)) {
        const baseline = Math.max(0, Math.round(previousRemaining));
        const usedGrams = Math.max(0, baseline - measuredFilament);
        if (usedGrams > 0) {
          await recordPrintUsage({
            printer_id: printerId,
            spool_id: spoolId,
            grams: usedGrams,
            job_name: jobName?.trim() ? jobName.trim() : null,
            success: true,
          });
          return;
        }
        if (measuredFilament !== baseline) {
          await updateSpoolWeight(spoolId, safeMeasuredTotal);
        }
        return;
      }
      await updateSpoolWeight(spoolId, safeMeasuredTotal);
    },
    [],
  );

  const reloadSpools = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    try {
      const result = await loadInventorySpools({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      if (clientReadOnly) {
        setClientInventorySource(result.source);
        setClientInventoryUpdatedAt(result.updatedAt);
        if (result.source === "OFFLINE") {
          setError(t("inventory.error.loadSpools", "Could not load inventory spools."));
        }
      }
      setSpools(result.rows);
    } catch (loadError) {
      console.error(loadError);
      setError(t("inventory.error.loadSpools", "Could not load inventory spools."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, t, tauri]);

  const reloadCatalog = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const rows = await loadCatalogMasters({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      setMasters(rows);
      const defaults = resolveCatalogSelectionDefaults(rows);
      setNewBambuMasterId((current) => current || defaults.bambuMasterId);
      setNewEsunMasterId((current) => current || defaults.esunMasterId);
    } catch (catalogError) {
      console.error(catalogError);
      if (clientReadOnly) {
        setMasters([]);
        return;
      }
      setError(t("wishlist.error.loadCatalog", "Could not load master catalog."));
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, t, tauri]);

  const reloadWishlist = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setWishlistLoading(true);
    try {
      const rows = await loadWishlistItems({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      setWishlistItems(rows);
    } catch (wishlistError) {
      console.error(wishlistError);
      setWishlistItems([]);
    } finally {
      setWishlistLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauri]);

  const reloadActiveLoans = useCallback(async () => {
    if (!tauri) {
      return;
    }
    if (clientReadOnly) {
      setActiveLoans([]);
      return;
    }
    try {
      const rows = await listActiveSpoolLoans();
      setActiveLoans(rows);
    } catch (loanError) {
      console.error(loanError);
      setActiveLoans([]);
    }
  }, [clientReadOnly, tauri]);

  const reloadPrinterOverview = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const overview = await loadPrinterOverviewData({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      const rows = overview.printers;
      setPrinterOverview(
        rows.map((printer) => ({
          ...printer,
          slots: sortPrinterSlotsExtLast(printer.slots),
        })),
      );
      const nextIntegrations = overview.bambuLiveIntegrations;
      setBambuLiveIntegrations(nextIntegrations);
      setRfidCaptureFieldsBySlotId((current) => {
        const seeded = buildBaselineCaptureFieldsBySlotId(rows, nextIntegrations);
        if (Object.keys(seeded).length === 0) {
          return current;
        }
        const merged = { ...current };
        for (const [slotId, baselineFields] of Object.entries(seeded)) {
          merged[slotId] = mergeRfidCaptureFields(baselineFields, merged[slotId] ?? []);
        }
        return merged;
      });
    } catch (overviewError) {
      console.error(overviewError);
      setPrinterOverview([]);
      setBambuLiveIntegrations({});
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauri]);

  const reloadSpoolDetail = useCallback(
    async (spoolId: string) => {
      if (!tauri) {
        return;
      }
      setHistoryLoading(true);
      setUsageLoading(true);
      try {
        const detail = await loadInventorySpoolDetail({
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
          spoolId,
        });
        setHistoryRows(detail.historyRows);
        setUsagePoints(detail.usagePoints);
      } catch (detailError) {
        console.error(detailError);
        setHistoryRows([]);
        setUsagePoints([]);
      } finally {
        setHistoryLoading(false);
        setUsageLoading(false);
      }
    },
    [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauri],
  );

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    reloadSpools();
    reloadCatalog();
    reloadWishlist();
    reloadActiveLoans();
    reloadPrinterOverview();
  }, [
    reloadActiveLoans,
    reloadCatalog,
    reloadPrinterOverview,
    reloadSpools,
    reloadWishlist,
    librarySyncReady,
    tauri,
  ]);

  useEffect(() => {
    if (
      !tauri ||
      !librarySyncReady ||
      !showAddModal ||
      sidePanelMode !== "ADD"
    ) {
      return;
    }

    void reloadCatalog();
    void reloadWishlist();
  }, [
    librarySyncReady,
    reloadCatalog,
    reloadWishlist,
    showAddModal,
    sidePanelMode,
    tauri,
  ]);

  const vendorOptions = useMemo(() => buildVendorOptions(spools), [spools]);

  const materialOptions = useMemo(() => buildMaterialOptions(spools), [spools]);

  const filteredSpools = useMemo(
    () =>
      filterInventorySpools(spools, {
        search,
        statusFilter,
        ownershipFilter,
        materialFilter,
        vendorFilter,
        lowStockOnly,
      }),
    [
      lowStockOnly,
      materialFilter,
      ownershipFilter,
      search,
      spools,
      statusFilter,
      vendorFilter,
    ],
  );

  const groupedSpools = useMemo<SpoolGroup[]>(() => groupInventorySpools(filteredSpools), [filteredSpools]);
  const visibleInventoryCount = filteredSpools.length;
  const activeAdvancedFilterCount = [
    inventoryView !== "CARDS",
    ownershipFilter !== "ALL",
    vendorFilter !== "ALL",
    materialFilter !== "ALL",
  ].filter(Boolean).length;
  const showAdvancedFilters = advancedFiltersOpen;

  const selectedSpool = useMemo(
    () => spools.find((spool) => spool.id === selectedSpoolId) ?? null,
    [selectedSpoolId, spools],
  );

  const selectedSpoolResolvedTare = useMemo(
    () =>
      selectedSpool
        ? resolveSpoolTareWeight(selectedSpool.spoolTareWeightGrams, selectedSpool.vendor)
        : 0,
    [selectedSpool],
  );

  const selectedSpoolMeasuredTotal = useMemo(() => {
    if (!selectedSpool) {
      return 0;
    }
    return Math.max(0, (selectedSpool.remainingGrams ?? 0) + selectedSpoolResolvedTare);
  }, [selectedSpool, selectedSpoolResolvedTare]);

  const activeLoanSpoolIds = useMemo(
    () => new Set(activeLoans.map((loan) => loan.loan.spool_id)),
    [activeLoans],
  );

  const printerSlotOptions = useMemo<PrinterSlotOption[]>(() => {
    const rows: PrinterSlotOption[] = [];
    for (const printer of printerOverview) {
      for (const slot of printer.slots) {
        rows.push({
          printerId: printer.printer.id,
          printerName: printer.printer.name,
          printerModel: printer.printer.model,
          amsId: slot.ams_id,
          slotId: slot.slot_id,
          slotIndex: slot.slot_index,
          spoolId: slot.spool_id ?? null,
          spoolRemaining: slot.spool_remaining_g ?? null,
          spoolMaterial: slot.spool_material ?? null,
          spoolFilamentName: slot.spool_filament_name ?? null,
          spoolColorName: slot.spool_color_name ?? null,
          spoolHexColor: slot.spool_hex_color ?? null,
          liveLoaded: slot.live_loaded ?? null,
          liveObservedRfidTag: slot.live_observed_rfid_tag ?? null,
          liveTrayUuid: slot.live_tray_uuid ?? null,
          liveChipId: slot.live_chip_id ?? null,
          liveTrayInfoIdx: slot.live_tray_info_idx ?? null,
          liveTrayIdName: slot.live_tray_id_name ?? null,
          liveFilamentType: slot.live_filament_type ?? null,
          liveFilamentName: slot.live_filament_name ?? null,
          liveColorHex: slot.live_color_hex ?? null,
          liveTrayWeightG: slot.live_tray_weight_g ?? null,
          liveRemainingPercent: slot.live_remaining_percent ?? null,
          liveLastIdentitySeenAt: slot.live_last_identity_seen_at ?? null,
          livePrinterLastSeenAt: slot.live_printer_last_seen_at ?? null,
          liveMqttConnected: slot.live_mqtt_connected ?? null,
          liveAmsReadDoneBits: slot.live_ams_read_done_bits ?? null,
          liveAmsBambuBits: slot.live_ams_bambu_bits ?? null,
        });
      }
    }
    return rows;
  }, [printerOverview]);

  const selectedSpoolAssignedSlot = useMemo(
    () =>
      selectedSpool
        ? printerSlotOptions.find((slot) => slot.spoolId === selectedSpool.id) ?? null
        : null,
    [printerSlotOptions, selectedSpool],
  );

  const selectedSpoolRfidCaptureSlots = useMemo(() => {
    if (clientReadOnly) {
      const allEligible = printerSlotOptions.filter((slot) => hasHostRfidCaptureData(slot));
      if (selectedSpoolAssignedSlot) {
        const samePrinter = allEligible.filter((slot) => slot.printerId === selectedSpoolAssignedSlot.printerId);
        if (samePrinter.length > 0) {
          return samePrinter;
        }
      }
      return allEligible;
    }
    const enabledPrinterIds = new Set(
      Object.entries(bambuLiveIntegrations)
        .filter(([, config]) => config?.enabled)
        .map(([printerId]) => printerId),
    );
    const allEligible = printerSlotOptions.filter(
      (slot) => enabledPrinterIds.has(slot.printerId) && !slot.amsId.endsWith("_ext"),
    );
    if (selectedSpoolAssignedSlot) {
      const samePrinter = allEligible.filter((slot) => slot.printerId === selectedSpoolAssignedSlot.printerId);
      if (samePrinter.length > 0) {
        return samePrinter;
      }
    }
    return allEligible;
  }, [bambuLiveIntegrations, clientReadOnly, printerSlotOptions, selectedSpoolAssignedSlot]);

  const selectedRfidCaptureSlot = useMemo(() => {
    if (selectedSpoolRfidCaptureSlots.length === 0) {
      return null;
    }
    if (selectedRfidCaptureSlotId) {
      return (
        selectedSpoolRfidCaptureSlots.find((slot) => slot.slotId === selectedRfidCaptureSlotId) ?? null
      );
    }
    if (selectedSpoolAssignedSlot) {
      return (
        selectedSpoolRfidCaptureSlots.find((slot) => slot.slotId === selectedSpoolAssignedSlot.slotId) ??
        selectedSpoolRfidCaptureSlots[0] ??
        null
      );
    }
    return selectedSpoolRfidCaptureSlots[0] ?? null;
  }, [selectedRfidCaptureSlotId, selectedSpoolAssignedSlot, selectedSpoolRfidCaptureSlots]);

  const selectedRfidCaptureLiveIntegration = useMemo(
    () =>
      selectedRfidCaptureSlot && !clientReadOnly
        ? bambuLiveIntegrations[selectedRfidCaptureSlot.printerId] ?? null
        : null,
    [bambuLiveIntegrations, clientReadOnly, selectedRfidCaptureSlot],
  );

  const selectedSpoolIdentityFreshness = useMemo(
    () => getIdentityFreshness(selectedSpool?.rfidTag, selectedSpool?.rfidObservedAt),
    [selectedSpool],
  );

  const selectedSpoolIdentityFreshnessMeta = useMemo(
    () => identityFreshnessCopy(selectedSpoolIdentityFreshness, t),
    [selectedSpoolIdentityFreshness, t],
  );

  const selectedSpoolSupportsRfidCapture = useMemo(
    () => {
      if (!tauri || selectedSpoolRfidCaptureSlots.length === 0) {
        return false;
      }
      if (clientReadOnly) {
        return hasHostRfidCaptureData(selectedRfidCaptureSlot);
      }
      return Boolean(selectedRfidCaptureLiveIntegration?.enabled);
    },
    [clientReadOnly, selectedRfidCaptureLiveIntegration, selectedRfidCaptureSlot, selectedSpoolRfidCaptureSlots.length, tauri],
  );

  const selectedSpoolRfidSlotLabel = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? formatPrinterSlotLabelForModel(t, selectedRfidCaptureSlot.printerModel, {
            ams_id: selectedRfidCaptureSlot.amsId,
            slot_index: selectedRfidCaptureSlot.slotIndex,
          })
        : null,
    [selectedRfidCaptureSlot, t],
  );

  const rfidCaptureFields = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? rfidCaptureFieldsBySlotId[selectedRfidCaptureSlot.slotId] ?? []
        : [],
    [rfidCaptureFieldsBySlotId, selectedRfidCaptureSlot],
  );

  const observedTrayCaptureSnapshot = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? clientReadOnly
          ? buildObservedTrayCaptureSnapshotFromHostSlot(selectedRfidCaptureSlot)
          : buildObservedTrayCaptureSnapshot(
              selectedRfidCaptureLiveIntegration ?? null,
              selectedRfidCaptureSlot.slotIndex,
            )
        : null,
    [clientReadOnly, selectedRfidCaptureLiveIntegration, selectedRfidCaptureSlot],
  );

  const effectiveRfidCaptureFields = useMemo(
    () => mergeRfidCaptureFields(observedTrayCaptureSnapshot?.fields ?? [], rfidCaptureFields),
    [observedTrayCaptureSnapshot, rfidCaptureFields],
  );

  const rfidCaptureLastSeenAt = useMemo(
    () =>
      latestRfidCaptureSeenAt(effectiveRfidCaptureFields) ??
      observedTrayCaptureSnapshot?.observedAt ??
      null,
    [effectiveRfidCaptureFields, observedTrayCaptureSnapshot],
  );

  const rfidCaptureSummary = useMemo(
    () =>
      selectedRfidCaptureSlot
        ? summarizeRfidCapture(effectiveRfidCaptureFields, selectedRfidCaptureSlot.slotIndex)
        : {},
    [effectiveRfidCaptureFields, selectedRfidCaptureSlot],
  );

  const rfidCaptureSlotSummaries = useMemo(() => {
    const summaries: Record<string, RfidCaptureSummary> = {};
    for (const slot of selectedSpoolRfidCaptureSlots) {
      const snapshot = clientReadOnly
        ? buildObservedTrayCaptureSnapshotFromHostSlot(slot)
        : buildObservedTrayCaptureSnapshot(
            bambuLiveIntegrations[slot.printerId] ?? null,
            slot.slotIndex,
          );
      const cachedFields = rfidCaptureFieldsBySlotId[slot.slotId] ?? [];
      const mergedFields = mergeRfidCaptureFields(snapshot?.fields ?? [], cachedFields);
      summaries[slot.slotId] = summarizeRfidCapture(mergedFields, slot.slotIndex);
    }
    return summaries;
  }, [bambuLiveIntegrations, clientReadOnly, rfidCaptureFieldsBySlotId, selectedSpoolRfidCaptureSlots]);

  const rfidCaptureMatchConfidence = useMemo(
    () => assessRfidCaptureMatch(selectedSpool, rfidCaptureSummary),
    [rfidCaptureSummary, selectedSpool],
  );

  const rfidCaptureMatchMetaForSelected = useMemo(
    () => rfidCaptureMatchMeta(rfidCaptureMatchConfidence, t),
    [rfidCaptureMatchConfidence, t],
  );

  const loanTrackingCandidates = useMemo(
    () =>
      spools.filter(
        (spool) =>
          spool.ownershipType !== "BORROWED_IN" &&
          spool.status !== "EMPTY" &&
          spool.status !== "LOST" &&
          !activeLoanSpoolIds.has(spool.id),
      ),
    [activeLoanSpoolIds, spools],
  );

  const printerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const printer of printerOverview) {
      map.set(printer.printer.id, printer.printer.name);
    }
    return map;
  }, [printerOverview]);

  const slotLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const printer of printerOverview) {
      for (const slot of printer.slots) {
        map.set(
          slot.slot_id,
          `${printer.printer.name} · ${formatPrinterSlotLabelForModel(t, printer.printer.model, {
            ams_id: slot.ams_id,
            slot_index: slot.slot_index,
          })}`,
        );
      }
    }
    return map;
  }, [printerOverview, t]);

  const formatStatusLabel = useCallback(
    (statusRaw: string) => {
      const status = normalizeStatus(statusRaw);
      if (status === "IN_STOCK") {
        return t("inventory.statusInStock", "In stock");
      }
      if (status === "ASSIGNED") {
        return t("inventory.statusAssigned", "Assigned");
      }
      if (status === "BORROWED") {
        return t("inventory.statusBorrowed", "Loaned out");
      }
      if (status === "EMPTY") {
        return t("inventory.statusEmpty", "Empty");
      }
      return t("inventory.statusLost", "Lost");
    },
    [t],
  );

  const formatStatusTone = useCallback((statusRaw: string) => {
    const status = normalizeStatus(statusRaw);
    if (status === "IN_STOCK") {
      return "success" as const;
    }
    if (status === "ASSIGNED") {
      return "info" as const;
    }
    if (status === "BORROWED") {
      return "warning" as const;
    }
    if (status === "EMPTY") {
      return "neutral" as const;
    }
    return "danger" as const;
  }, []);

  const formatOwnershipLabel = useCallback(
    (ownershipRaw?: string | null) => {
      const ownership = normalizeOwnershipType(ownershipRaw);
      return ownership === "BORROWED_IN"
        ? t("inventory.borrowedIn", "Borrowed in")
        : t("inventory.ownedByUs", "Owned");
    },
    [t],
  );

  const formatOwnershipTone = useCallback((ownershipRaw?: string | null) => {
    const ownership = normalizeOwnershipType(ownershipRaw);
    return ownership === "BORROWED_IN" ? ("warning" as const) : ("neutral" as const);
  }, []);

  const formatOwnershipSummary = useCallback(
    (spool: InventorySpool) => {
      if (spool.ownershipType === "BORROWED_IN") {
        return spool.ownerName?.trim()
          ? `${t("inventory.borrowedFrom", "Borrowed from")}: ${spool.ownerName.trim()}`
          : t("inventory.borrowedIn", "Borrowed in");
      }
      return t("inventory.ownedByUsDetail", "Owned by us");
    },
    [t],
  );

  const formatInventoryPlacementLabel = useCallback(
    (locationRaw?: string | null) => {
      const location = normalizeDisplayToken(locationRaw);
      if (!location) {
        return t("inventory.unassigned", "Unassigned");
      }

      if (!location.startsWith("Printer:")) {
        return location;
      }

      const match = location.match(/^Printer:([^:]+):(.+)$/);
      if (!match) {
        return location.replace(/^Printer:/, "");
      }

      const [, printerName, rawSlotId] = match;
      const mappedLabel = slotLabelById.get(rawSlotId);
      if (mappedLabel) {
        return mappedLabel;
      }

      if (/ext/i.test(rawSlotId)) {
        return `${printerName} · ${t("printers.extSlot", "EXT Slot")}`;
      }

      const amsMatch = rawSlotId.match(/ams[_-](\d+)[_-]slot[_-](\d+)/i);
      if (amsMatch) {
        return `${printerName} · AMS ${amsMatch[1]} · ${t("printers.slot", "Slot")} ${amsMatch[2]}`;
      }

      const mmuMatch = rawSlotId.match(/mmu3?[_-](?:channel|slot)[_-](\d+)/i);
      if (mmuMatch) {
        return `${printerName} · MMU3 · ${t("printers.channel", "Channel")} ${mmuMatch[1]}`;
      }

      const toolheadMatch = rawSlotId.match(/toolhead[_-](\d+)/i);
      if (toolheadMatch) {
        return `${printerName} · ${t("printers.toolhead", "Toolhead")} ${toolheadMatch[1]}`;
      }

      return printerName;
    },
    [slotLabelById, t],
  );

  const formatHistoryEventType = useCallback(
    (eventType: string) => formatInventoryHistoryEventType(eventType, t),
    [t],
  );

  const formatHistoryEventDetails = useCallback(
    (event: SpoolHistoryEventRow) =>
      formatInventoryHistoryEventDetails(event, {
        t,
        formatDateTime,
        formatStatusLabel,
        locale,
        printerNameById,
        slotLabelById,
      }),
    [formatStatusLabel, locale, printerNameById, slotLabelById, t],
  );

  const visibleHistoryRows = useMemo(
    () => historyRows.filter((event) => event.event_type !== "ASSIGNED_TO_AMS"),
    [historyRows],
  );

  const hasHiddenHistoryRows = visibleHistoryRows.length !== historyRows.length;

  const selectedSpoolStatusLabel = useMemo(
    () => (selectedSpool ? formatStatusLabel(selectedSpool.status) : ""),
    [formatStatusLabel, selectedSpool],
  );

  const selectedSpoolStatusTone = useMemo(
    () => (selectedSpool ? formatStatusTone(selectedSpool.status) : "neutral"),
    [formatStatusTone, selectedSpool],
  );

  const selectedSpoolOwnershipLabel = useMemo(
    () => (selectedSpool ? formatOwnershipLabel(selectedSpool.ownershipType) : ""),
    [formatOwnershipLabel, selectedSpool],
  );

  const selectedSpoolOwnershipTone = useMemo(
    () => (selectedSpool ? formatOwnershipTone(selectedSpool.ownershipType) : "neutral"),
    [formatOwnershipTone, selectedSpool],
  );

  const selectedSpoolDisplayTitle = useMemo(
    () =>
      selectedSpool
        ? formatInventoryDisplayTitle(
            selectedSpool.material,
            selectedSpool.filamentName,
            selectedSpool.colorName,
          )
        : "",
    [selectedSpool],
  );

  const selectedSpoolLocationValue = useMemo(() => {
    if (!selectedSpool) {
      return "";
    }
    if (selectedSpoolAssignedSlot) {
      return selectedSpoolAssignedSlot.printerName;
    }
    return formatInventoryPlacementLabel(selectedSpool.location);
  }, [formatInventoryPlacementLabel, selectedSpool, selectedSpoolAssignedSlot]);

  const selectedSpoolQrCompanionAvailable = Boolean(selectedSpoolQrCompanionShellUrl?.trim());

  const selectRollForManage = useCallback((spoolId: string) => {
    if (clientReadOnly && !clientHostWritePaired) {
      setInfoMessage(
        t(
          "inventory.clientReadOnlyManage",
          "This device is connected as a client. You can review the roll here, and paired host actions will stay limited and explicit.",
        ),
      );
    } else {
      setInfoMessage(null);
    }
    setSelectedSpoolId(spoolId);
    setSidePanelMode("MANAGE");
    setShowRollHistory(false);
    setShowRollModal(true);
  }, [clientHostWritePaired, clientReadOnly, t]);

  const ensureLocalWriteAllowed = useCallback(() => {
    if (!clientReadOnly) {
      return true;
    }
    setInfoMessage(
      t(
        "inventory.clientReadOnlyAction",
        "This device is connected as a client. Use the host for inventory changes.",
      ),
    );
    return false;
  }, [clientReadOnly, t]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(
        t(
          "inventory.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return false;
    }
    if (!clientHostWritePaired) {
      setError(
        t(
          "inventory.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected sync actions.",
        ),
      );
      return false;
    }
    return true;
  }, [clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly, t]);

  const openAddModal = useCallback(() => {
    if (clientReadOnly) {
      if (!canUseClientHostWrite()) {
        return;
      }
    } else if (!ensureLocalWriteAllowed()) {
      return;
    }
    setSidePanelMode("ADD");
    setWishlistQueueFilter("WISHLIST");
    setNewOwnershipType("OWNED");
    setBorrowedFromName("");
    setBorrowedFromContact("");
    setBorrowedInNote("");
    setShowAddModal(true);
  }, [canUseClientHostWrite, clientReadOnly, ensureLocalWriteAllowed]);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setSidePanelMode("MANAGE");
    setNewOwnershipType("OWNED");
    setBorrowedFromName("");
    setBorrowedFromContact("");
    setBorrowedInNote("");
  }, []);

  const closeLoanTrackingModal = useCallback(() => {
    setShowLoanTrackingModal(false);
    setLoanTrackingSpoolId(null);
  }, []);

  const openLoanTrackingModal = useCallback(() => {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const preferredSpool =
      selectedSpool && loanTrackingCandidates.some((spool) => spool.id === selectedSpool.id)
        ? selectedSpool
        : loanTrackingCandidates[0] ?? null;
    setLoanTrackingSpoolId(preferredSpool?.id ?? null);
    setShowLoanTrackingModal(true);
  }, [
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    loanTrackingCandidates,
    selectedSpool,
  ]);

  useEffect(() => {
    if (!selectedSpool) {
      setMasterEditUnlocked(false);
      setEditMasterVendor("");
      setEditMasterMaterial("");
      setEditMasterFilamentName("");
      setEditMasterColorName("");
      setEditMasterHexColor("");
      setHistoryRows([]);
      setUsagePoints([]);
      setConfirmDelete(false);
      setConfirmPurge(false);
      setSelectedSpoolLocationDraft("");
      setSelectedSpoolTareDraft("");
      setSelectedSpoolQrMode("companion");
      setSelectedSpoolQrResolvedMode("portable");
      setSelectedSpoolQrTarget(null);
      setSelectedSpoolQrCompanionShellUrl(null);
      setShowRfidCaptureModal(false);
      setSelectedRfidCaptureSlotId(null);
      setRfidCaptureError(null);
      setRfidCaptureLoading(false);
      setShowRollModal(false);
      return;
    }
    setMasterEditUnlocked(false);
    setEditMasterVendor(selectedSpool.vendor);
    setEditMasterMaterial(selectedSpool.material);
    setEditMasterFilamentName(selectedSpool.filamentName);
    setEditMasterColorName(selectedSpool.colorName);
    setEditMasterHexColor(selectedSpool.hexColor ?? "");
    setSelectedSpoolLocationDraft(selectedSpool.homeLocation ?? "");
    setSelectedSpoolTareDraft(
      String(resolveSpoolTareWeight(selectedSpool.spoolTareWeightGrams, selectedSpool.vendor)),
    );
    setSelectedSpoolQrMode("companion");
    setShowRfidCaptureModal(false);
    setSelectedRfidCaptureSlotId(null);
    setRfidCaptureError(null);
    setRfidCaptureLoading(false);
    setConfirmDelete(false);
    setConfirmPurge(false);
    void reloadSpoolDetail(selectedSpool.id);
  }, [reloadSpoolDetail, selectedSpool]);

  useEffect(() => {
    if (!showRollModal) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowRollModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRollModal]);

  const resolveSpoolQrCompanionShellUrl = useCallback(async () => {
    if (clientReadOnly && clientHostBaseUrl?.trim()) {
      return deriveCompanionShellUrl(clientHostBaseUrl);
    }
    const trustedLanStatus = await getTrustedLanCompanionStatus().catch(() => null);
    return trustedLanStatus?.shell_url?.trim() || null;
  }, [clientHostBaseUrl, clientReadOnly]);

  const buildSpoolQrArtifacts = useCallback(async (
    spool: InventorySpool,
    mode: FilamentQrMode = "companion",
  ) => {
    const qrReference = spool.id.trim();
    const companionShellUrl = await resolveSpoolQrCompanionShellUrl();
    const qr = buildFilamentQrPayload(qrReference, {
      mode,
      companionShellUrl,
    });
    const qrDataUrl = await buildFilamentLabelQrDataUrl(qr.payload);
    return {
      qrReference,
      qrPayload: qr.payload,
      qrDataUrl,
      qrMode: qr.mode,
      qrTarget: qr.target,
      companionShellUrl,
    };
  }, [resolveSpoolQrCompanionShellUrl]);

  useEffect(() => {
    if (!selectedSpool || !showRollModal) {
      setSelectedSpoolQrDataUrl(null);
      setSelectedSpoolQrLoading(false);
      setSelectedSpoolQrResolvedMode("portable");
      setSelectedSpoolQrTarget(null);
      setSelectedSpoolQrCompanionShellUrl(null);
      return;
    }

    let cancelled = false;
    setSelectedSpoolQrLoading(true);

    void buildSpoolQrArtifacts(selectedSpool, selectedSpoolQrMode)
      .then(({ qrDataUrl, qrMode, qrTarget, companionShellUrl }) => {
        if (cancelled) {
          return;
        }
        setSelectedSpoolQrDataUrl(qrDataUrl);
        setSelectedSpoolQrResolvedMode(qrMode);
        setSelectedSpoolQrTarget(qrTarget);
        setSelectedSpoolQrCompanionShellUrl(companionShellUrl);
        setSelectedSpoolQrLoading(false);
      })
      .catch((qrError) => {
        console.error(qrError);
        if (cancelled) {
          return;
        }
        setSelectedSpoolQrDataUrl(null);
        setSelectedSpoolQrResolvedMode("portable");
        setSelectedSpoolQrTarget(null);
        setSelectedSpoolQrCompanionShellUrl(null);
        setSelectedSpoolQrLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildSpoolQrArtifacts, selectedSpool, selectedSpoolQrMode, showRollModal]);

  useEffect(() => {
    if (!showRfidCaptureModal || !tauri || clientReadOnly || !selectedRfidCaptureSlot) {
      return;
    }
    let cancelled = false;

    const refreshCapture = async () => {
      if (cancelled || rfidCaptureRefreshInFlightRef.current) {
        return;
      }
      rfidCaptureRefreshInFlightRef.current = true;
      setRfidCaptureLoading(true);
      try {
        const snapshot = await getPrinterSettings();
        if (cancelled) {
          return;
        }
        const nextIntegrations = Object.fromEntries(
          (snapshot.bambu_live_integrations ?? []).map((entry) => [entry.printer_id, entry.config]),
        ) as Record<string, BambuLiveIntegrationSettings>;
        setBambuLiveIntegrations(nextIntegrations);
        const observedState = nextIntegrations[selectedRfidCaptureSlot.printerId]?.observed_state;
        if (!observedState?.raw_payload_json) {
          if (rfidCaptureFields.length === 0 && !(observedTrayCaptureSnapshot?.fields.length)) {
            setRfidCaptureError(
              t(
                "inventory.rfidCaptureNoPayload",
                "Waiting for tray data from the printer. Start or resume a print if the stream is idle.",
              ),
            );
          } else {
            setRfidCaptureError(null);
          }
          return;
        }
        const capturedBySlot = selectedSpoolRfidCaptureSlots.map((slot) => ({
          slotId: slot.slotId,
          captured: extractRfidCaptureFields(observedState.raw_payload_json, slot.slotIndex),
        }));
        const captured =
          capturedBySlot.find((entry) => entry.slotId === selectedRfidCaptureSlot.slotId)?.captured ?? [];
        if (captured.length === 0) {
          if (rfidCaptureFields.length === 0 && !(observedTrayCaptureSnapshot?.fields.length)) {
            setRfidCaptureError(
              t(
                "inventory.rfidCaptureNoSlotData",
                "No slot-specific AMS fields have arrived yet for this slot.",
              ),
            );
          } else {
            setRfidCaptureError(null);
          }
          return;
        }
        setRfidCaptureError(null);
        const observedAt = observedState.last_seen_at ?? new Date().toISOString();
        setRfidCaptureFieldsBySlotId((current) => {
          const next = { ...current };
          for (const slotEntry of capturedBySlot) {
            if (slotEntry.captured.length === 0) {
              continue;
            }
            const existingFields = next[slotEntry.slotId] ?? [];
            const merged = new Map(existingFields.map((field) => [field.path, field]));
            for (const field of slotEntry.captured) {
              const existing = merged.get(field.path);
              if (!existing) {
                merged.set(field.path, {
                  path: field.path,
                  label: field.label,
                  valueText: field.valueText,
                  lastSeenAt: observedAt,
                  receiveCount: 1,
                  changeCount: 1,
                });
                continue;
              }
              merged.set(field.path, {
                ...existing,
                label: field.label,
                valueText: field.valueText,
                lastSeenAt: observedAt,
                receiveCount: existing.receiveCount + 1,
                changeCount:
                  existing.valueText === field.valueText
                    ? existing.changeCount
                    : existing.changeCount + 1,
              });
            }
            next[slotEntry.slotId] = Array.from(merged.values()).sort((left, right) =>
              left.label.localeCompare(right.label, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );
          }
          return next;
        });
      } catch (captureError) {
        console.error(captureError);
        if (!cancelled) {
          setRfidCaptureError(
            t("inventory.rfidCaptureFailed", "Could not refresh RFID capture from the printer."),
          );
        }
      } finally {
        rfidCaptureRefreshInFlightRef.current = false;
        if (!cancelled) {
          setRfidCaptureLoading(false);
        }
      }
    };

    void refreshCapture();
    const timer = window.setInterval(() => {
      void refreshCapture();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    clientReadOnly,
    rfidCaptureFields.length,
    observedTrayCaptureSnapshot,
    selectedRfidCaptureSlot,
    selectedSpoolRfidCaptureSlots,
    showRfidCaptureModal,
    t,
    tauri,
  ]);

  const bambuMasters = useMemo(
    () =>
      masters
        .filter((master) => master.vendor.toLowerCase().includes("bambu"))
        .sort((left, right) => {
          if (left.is_discontinued !== right.is_discontinued) {
            return Number(left.is_discontinued) - Number(right.is_discontinued);
          }
          return `${left.material} ${left.filament_name} ${left.color_name}`.localeCompare(
            `${right.material} ${right.filament_name} ${right.color_name}`,
          );
        }),
    [masters],
  );

  const filteredBambuMasters = useMemo(() => {
    const term = bambuCatalogQuery.trim().toLowerCase();
    return bambuMasters.filter((master) => {
      const textMatch =
        term.length === 0
          ? true
          : `${master.material} ${master.filament_name} ${master.color_name}`
              .toLowerCase()
              .includes(term);
      return textMatch;
    });
  }, [bambuCatalogQuery, bambuMasters]);

  const selectedBambuMaster = useMemo(() => {
    const fromId =
      filteredBambuMasters.find((master) => master.id === newBambuMasterId) ?? null;
    if (fromId) {
      return fromId;
    }
    return filteredBambuMasters[0] ?? null;
  }, [filteredBambuMasters, newBambuMasterId]);

  useEffect(() => {
    if (createMode !== "bambu") {
      return;
    }
    if (filteredBambuMasters.length === 0) {
      setNewBambuMasterId("");
      return;
    }
    const exists = filteredBambuMasters.some(
      (master) => master.id === newBambuMasterId,
    );
    if (!exists) {
      setNewBambuMasterId(filteredBambuMasters[0].id);
    }
  }, [createMode, filteredBambuMasters, newBambuMasterId]);

  useEffect(() => {
    if (createMode !== "bambu" || !selectedBambuMaster) {
      return;
    }
    setNewInitialWeight(String(selectedBambuMaster.default_weight));
  }, [createMode, selectedBambuMaster]);

  const esunMasters = useMemo(
    () =>
      masters
        .filter((master) => master.vendor.toLowerCase().includes("esun"))
        .sort((left, right) => {
          if (left.is_discontinued !== right.is_discontinued) {
            return Number(left.is_discontinued) - Number(right.is_discontinued);
          }
          return `${left.material} ${left.filament_name} ${left.color_name}`.localeCompare(
            `${right.material} ${right.filament_name} ${right.color_name}`,
          );
        }),
    [masters],
  );

  const filteredEsunMasters = useMemo(() => {
    const term = esunCatalogQuery.trim().toLowerCase();
    return esunMasters.filter((master) => {
      const textMatch =
        term.length === 0
          ? true
          : `${master.material} ${master.filament_name} ${master.color_name}`
              .toLowerCase()
              .includes(term);
      return textMatch;
    });
  }, [esunCatalogQuery, esunMasters]);

  const selectedEsunMaster = useMemo(() => {
    const fromId =
      filteredEsunMasters.find((master) => master.id === newEsunMasterId) ?? null;
    if (fromId) {
      return fromId;
    }
    return filteredEsunMasters[0] ?? null;
  }, [filteredEsunMasters, newEsunMasterId]);

  useEffect(() => {
    if (createMode !== "esun") {
      return;
    }
    if (filteredEsunMasters.length === 0) {
      setNewEsunMasterId("");
      return;
    }
    const exists = filteredEsunMasters.some(
      (master) => master.id === newEsunMasterId,
    );
    if (!exists) {
      setNewEsunMasterId(filteredEsunMasters[0].id);
    }
  }, [createMode, filteredEsunMasters, newEsunMasterId]);

  useEffect(() => {
    if (createMode !== "esun" || !selectedEsunMaster) {
      return;
    }
    setNewInitialWeight(String(selectedEsunMaster.default_weight));
  }, [createMode, selectedEsunMaster]);

  const catalogMasterById = useMemo(
    () => new Map(masters.map((master) => [master.id, master])),
    [masters],
  );

  const visibleWishlistItems = useMemo(() => {
    return wishlistItems.filter((item) =>
      wishlistQueueFilter === "ALL" ? true : item.status === wishlistQueueFilter,
    );
  }, [wishlistItems, wishlistQueueFilter]);

  const wishlistQueueSummary = useMemo(
    () => ({
      all: wishlistItems.length,
      wishlist: wishlistItems.filter((item) => item.status === "WISHLIST").length,
      onOrder: wishlistItems.filter((item) => item.status === "ON_ORDER").length,
      received: wishlistItems.filter((item) => item.status === "RECEIVED").length,
    }),
    [wishlistItems],
  );

  async function handleCreateSpool() {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const id = `spool_${Date.now()}`;
    const ownerName = borrowedFromName.trim();
    const ownerContact = borrowedFromContact.trim();
    const ownershipNote = borrowedInNote.trim();
    const createOwnershipType = newOwnershipType;
    try {
      let createdSpoolId = id;
      if (createOwnershipType === "BORROWED_IN" && !ownerName) {
        setError(
          t(
            "inventory.error.borrowedInNeedsOwner",
            "Borrowed-in registration needs a name for who the spool is borrowed from.",
          ),
        );
        setBusy(false);
        return;
      }
      if (createMode === "bambu") {
        if (!selectedBambuMaster) {
          setError(t("inventory.error.selectBambuFirst", "Select a Bambu filament first."));
          setBusy(false);
          return;
        }
        const initialWeight = parsePositiveWeight(
          newInitialWeight,
          selectedBambuMaster.default_weight,
        );
        if (clientReadOnly) {
          createdSpoolId = await createLibrarySyncHostSpool(clientHostBaseUrl!, clientLibraryId, {
            id,
            master_id: selectedBambuMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            ownership_type: createOwnershipType,
            owner_name: ownerName || null,
            owner_contact: ownerContact || null,
            ownership_note: ownershipNote || null,
            initial_weight_g: initialWeight,
            current_weight_g: initialWeight,
            location_id: newLocation.trim() || null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        } else {
          await createSpool({
            id,
            master_id: selectedBambuMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            ownership_type: createOwnershipType,
            owner_name: ownerName || null,
            owner_contact: ownerContact || null,
            ownership_note: ownershipNote || null,
            initial_weight_g: initialWeight,
            current_weight_g: initialWeight,
            location_id: newLocation.trim() || null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        }
      } else if (createMode === "esun") {
        if (!selectedEsunMaster) {
          setError(
            t("inventory.error.selectEsunFirst", "Select an eSUN filament first."),
          );
          setBusy(false);
          return;
        }
        const initialWeight = parsePositiveWeight(
          newInitialWeight,
          selectedEsunMaster.default_weight,
        );
        if (clientReadOnly) {
          createdSpoolId = await createLibrarySyncHostSpool(clientHostBaseUrl!, clientLibraryId, {
            id,
            master_id: selectedEsunMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            ownership_type: createOwnershipType,
            owner_name: ownerName || null,
            owner_contact: ownerContact || null,
            ownership_note: ownershipNote || null,
            initial_weight_g: initialWeight,
            current_weight_g: initialWeight,
            location_id: newLocation.trim() || null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        } else {
          await createSpool({
            id,
            master_id: selectedEsunMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            ownership_type: createOwnershipType,
            owner_name: ownerName || null,
            owner_contact: ownerContact || null,
            ownership_note: ownershipNote || null,
            initial_weight_g: initialWeight,
            current_weight_g: initialWeight,
            location_id: newLocation.trim() || null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        }
      } else {
        if (!manualFilamentName.trim() || !manualColorName.trim()) {
          setError(
            t(
              "inventory.error.manualNeedsFields",
              "Manual create needs filament name and color.",
            ),
          );
          setBusy(false);
          return;
        }
        const initialWeight = parsePositiveWeight(newInitialWeight, 1000);
        if (clientReadOnly) {
          createdSpoolId = await createLibrarySyncHostSpool(clientHostBaseUrl!, clientLibraryId, {
            id,
            vendor: manualVendor.trim() || "Generic",
            material: manualMaterial.trim() || "PLA",
            filament_name: manualFilamentName.trim(),
            color_name: manualColorName.trim(),
            hex_color: isValidHexColor(manualHexColor) ? toSwatchColor(manualHexColor) : null,
            product_url: null,
            default_weight_g: initialWeight,
            qr_code: null,
            status: "IN_STOCK",
            ownership_type: createOwnershipType,
            owner_name: ownerName || null,
            owner_contact: ownerContact || null,
            ownership_note: ownershipNote || null,
            initial_weight_g: initialWeight,
            location: newLocation.trim() || null,
          });
        } else {
          await createManualSpool({
            id,
            vendor: manualVendor.trim() || "Generic",
            material: manualMaterial.trim() || "PLA",
            filament_name: manualFilamentName.trim(),
            color_name: manualColorName.trim(),
            hex_color: isValidHexColor(manualHexColor) ? toSwatchColor(manualHexColor) : null,
            product_url: null,
            default_weight_g: initialWeight,
            qr_code: null,
            status: "IN_STOCK",
            ownership_type: createOwnershipType,
            owner_name: ownerName || null,
            owner_contact: ownerContact || null,
            ownership_note: ownershipNote || null,
            initial_weight_g: initialWeight,
            location: newLocation.trim() || null,
          });
        }
      }

      await reloadSpools();
      await reloadCatalog();
      setSelectedSpoolId(createdSpoolId);
      setRecentlyAddedSpoolId(createdSpoolId);
      const addedLabel =
        createMode === "bambu" && selectedBambuMaster
          ? `${selectedBambuMaster.filament_name} · ${selectedBambuMaster.color_name}`
          : createMode === "esun" && selectedEsunMaster
            ? `${selectedEsunMaster.filament_name} · ${selectedEsunMaster.color_name}`
            : `${manualFilamentName.trim()} · ${manualColorName.trim()}`;
      setInfoMessage(
        `${
          createOwnershipType === "BORROWED_IN"
            ? t("inventory.borrowedInRegistered", "Borrowed-in spool registered")
            : t("inventory.addedToInventory", "Added to inventory")
        }: ${addedLabel}`,
      );
      setNewLocation("");
      setNewOwnershipType("OWNED");
      setBorrowedFromName("");
      setBorrowedFromContact("");
      setBorrowedInNote("");
    } catch (createError) {
      console.error(createError);
      setError(
        commandErrorText(
          createError,
          t(
            "inventory.error.createSpool",
            "Failed to create spool. Check QR uniqueness and values.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function buildWishlistDraft():
    | {
        master_id?: string | null;
        vendor: string;
        material: string;
        filament_name: string;
        color_name: string;
      }
    | null {
    if (createMode === "bambu") {
      if (!selectedBambuMaster) {
        return null;
      }
      return {
        master_id: selectedBambuMaster.id,
        vendor: selectedBambuMaster.vendor,
        material: selectedBambuMaster.material,
        filament_name: selectedBambuMaster.filament_name,
        color_name: selectedBambuMaster.color_name,
      };
    }

    if (createMode === "esun") {
      if (!selectedEsunMaster) {
        return null;
      }
      return {
        master_id: selectedEsunMaster.id,
        vendor: selectedEsunMaster.vendor,
        material: selectedEsunMaster.material,
        filament_name: selectedEsunMaster.filament_name,
        color_name: selectedEsunMaster.color_name,
      };
    }

    if (!manualFilamentName.trim() || !manualColorName.trim()) {
      return null;
    }
    return {
      master_id: null,
      vendor: manualVendor.trim() || "Generic",
      material: manualMaterial.trim() || "PLA",
      filament_name: manualFilamentName.trim(),
      color_name: manualColorName.trim(),
    };
  }

  async function handleAddCurrentToWishlist() {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    const draft = buildWishlistDraft();
    if (!draft) {
      setError(
        t(
          "wishlist.error.invalidSelection",
          "Pick a valid filament setup before adding to wishlist.",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = {
        id: `wish_${Date.now()}`,
        master_id: draft.master_id ?? null,
        vendor: draft.vendor,
        material: draft.material,
        filament_name: draft.filament_name,
        color_name: draft.color_name,
        quantity: 1,
        note: null,
      };
      if (clientReadOnly) {
        await createLibrarySyncHostWishlistItem(clientHostBaseUrl!, clientLibraryId, input);
      } else {
        await createWishlistItem(input);
      }
      await reloadWishlist();
    } catch (wishlistError) {
      console.error(wishlistError);
      setError(t("wishlist.error.add", "Failed to add wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWishlistStatus(itemId: string, status: WishlistStatus) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    try {
      const input = {
        item_id: itemId,
        status,
      };
      if (clientReadOnly) {
        await updateLibrarySyncHostWishlistItemStatus(clientHostBaseUrl!, clientLibraryId, input);
      } else {
        await updateWishlistItemStatus(input);
      }
      await reloadWishlist();
    } catch (statusError) {
      console.error(statusError);
      setError(t("wishlist.error.updateStatus", "Failed to update wishlist status."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWishlistItem(itemId: string) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    if (confirmWishlistRemoveId !== itemId) {
      setConfirmWishlistRemoveId(itemId);
      setInfoMessage(
        t(
          "wishlist.confirmRemoveTapAgain",
          "Click Remove again to confirm deleting this wishlist entry.",
        ),
      );
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        await deleteLibrarySyncHostWishlistItem(clientHostBaseUrl!, clientLibraryId, itemId);
      } else {
        await deleteWishlistItem(itemId);
      }
      await reloadWishlist();
    } catch (deleteError) {
      console.error(deleteError);
      setError(t("wishlist.error.delete", "Failed to delete wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleStockFromWishlist(item: WishlistItemRow) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    const id = `spool_${Date.now()}`;
    try {
      let createdSpoolId = id;
      const linkedMaster = item.master_id
        ? masters.find((master) => master.id === item.master_id) ?? null
        : null;
      if (linkedMaster) {
        if (clientReadOnly) {
          createdSpoolId = await createLibrarySyncHostSpool(clientHostBaseUrl!, clientLibraryId, {
            id,
            master_id: linkedMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            initial_weight_g: linkedMaster.default_weight,
            current_weight_g: linkedMaster.default_weight,
            location_id: null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        } else {
          await createSpool({
            id,
            master_id: linkedMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            initial_weight_g: linkedMaster.default_weight,
            current_weight_g: linkedMaster.default_weight,
            location_id: null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        }
      } else {
        if (clientReadOnly) {
          createdSpoolId = await createLibrarySyncHostSpool(clientHostBaseUrl!, clientLibraryId, {
            id,
            vendor: item.vendor,
            material: item.material,
            filament_name: item.filament_name,
            color_name: item.color_name,
            hex_color: null,
            product_url: null,
            default_weight_g: 1000,
            qr_code: null,
            status: "IN_STOCK",
            initial_weight_g: 1000,
            location: null,
          });
        } else {
          await createManualSpool({
            id,
            vendor: item.vendor,
            material: item.material,
            filament_name: item.filament_name,
            color_name: item.color_name,
            hex_color: null,
            product_url: null,
            default_weight_g: 1000,
            qr_code: null,
            status: "IN_STOCK",
            initial_weight_g: 1000,
            location: null,
          });
        }
      }

      if (clientReadOnly) {
        await updateLibrarySyncHostWishlistItemStatus(clientHostBaseUrl!, clientLibraryId, {
          item_id: item.id,
          status: "RECEIVED",
        });
      } else {
        await updateWishlistItemStatus({
          item_id: item.id,
          status: "RECEIVED",
        });
      }
      await reloadSpools();
      await reloadWishlist();
      setSelectedSpoolId(createdSpoolId);
      setRecentlyAddedSpoolId(createdSpoolId);
      setInfoMessage(
        `${t("inventory.addedFromWishlist", "Added from wishlist")}: ${formatInventoryDisplayTitle(
          item.material,
          item.filament_name,
          item.color_name,
        )}`,
      );
    } catch (stockError) {
      console.error(stockError);
      setError(t("inventory.error.stockFromWishlist", "Failed to stock roll from wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMasterMetadata() {
    if (!ensureLocalWriteAllowed()) {
      return;
    }
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    if (!masterEditUnlocked) {
      setError(
        t(
          "inventory.error.unlockMetadataFirst",
          "Unlock roll metadata before editing catalog fields.",
        ),
      );
      return;
    }

    const vendor = editMasterVendor.trim() || "Manual";
    const material = editMasterMaterial.trim();
    const filamentName = editMasterFilamentName.trim();
    const colorName = editMasterColorName.trim();
    if (!material || !filamentName || !colorName) {
      setError(
        t(
          "inventory.error.masterFieldsRequired",
          "Material, filament name and color are required.",
        ),
      );
      return;
    }

    const rawHex = editMasterHexColor.trim();
    if (rawHex && !isValidHexColor(rawHex)) {
      setError(
        t(
          "inventory.error.invalidHex",
          "Invalid hex color. Use 3 or 6 hex digits (with or without #).",
        ),
      );
      return;
    }
    const hexColor = rawHex ? toSwatchColor(rawHex) : null;

    setManageBusy(true);
    setError(null);
    try {
      await updateMasterCatalogEntry({
        master_id: selectedSpool.masterId,
        vendor,
        material,
        filament_name: filamentName,
        color_name: colorName,
        hex_color: hexColor,
      });
      await reloadSpools();
      await reloadCatalog();
      await reloadActiveLoans();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
      setMasterEditUnlocked(false);
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.updateMetadata", "Failed to update roll metadata."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleDeleteSelected() {
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmPurge(false);
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        await deleteLibrarySyncHostSpool(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            spool_id: selectedSpool.id,
            reason: "manual removal",
          },
        );
      } else {
        await deleteSpool({
          spool_id: selectedSpool.id,
          reason: "manual removal",
        });
      }
      setSelectedSpoolId(null);
      setHistoryRows([]);
      setUsagePoints([]);
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        commandErrorText(deleteError, t("inventory.error.deleteRoll", "Failed to delete roll.")),
      );
    } finally {
      setConfirmDelete(false);
      setManageBusy(false);
    }
  }

  async function handleMarkEmpty() {
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    setConfirmDelete(false);
    setConfirmPurge(false);
    setManageBusy(true);
    setError(null);
    try {
      if (selectedSpoolAssignedSlot) {
        if (clientReadOnly) {
          await assignLibrarySyncHostPrinterSlot(
            clientHostBaseUrl!,
            clientLibraryId,
            {
              printer_id: selectedSpoolAssignedSlot.printerId,
              slot_id: selectedSpoolAssignedSlot.slotId,
              spool_id: null,
            },
          );
        } else {
          await assignPrinterSlot({
            printer_id: selectedSpoolAssignedSlot.printerId,
            slot_id: selectedSpoolAssignedSlot.slotId,
            spool_id: null,
          });
        }
      }
      if (clientReadOnly) {
        await updateLibrarySyncHostSpoolDetails(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            spool_id: selectedSpool.id,
            qr_code: selectedSpool.qrCode ?? null,
            status: "EMPTY",
            location: selectedSpool.location ?? null,
          },
        );
        await updateLibrarySyncHostSpoolWeight(
          clientHostBaseUrl!,
          clientLibraryId,
          selectedSpool.id,
          0,
        );
      } else {
        await updateSpoolStatus(selectedSpool.id, "EMPTY");
        await updateSpoolWeight(selectedSpool.id, 0);
      }
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
      await reloadSpoolDetail(selectedSpool.id);
    } catch (statusError) {
      console.error(statusError);
      setError(
        commandErrorText(
          statusError,
          t("inventory.error.markEmpty", "Failed to mark roll as empty."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleSaveSpoolLocation() {
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    const location = selectedSpoolLocationDraft.trim();
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        if (!canUseClientHostWrite()) {
          return;
        }
        await updateLibrarySyncHostSpoolDetails(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            spool_id: selectedSpool.id,
            qr_code: selectedSpool.qrCode ?? null,
            status: selectedSpool.status,
            location: selectedSpool.location ?? null,
            home_location: location || null,
          },
        );
        await reloadSpools();
        await reloadPrinterOverview();
        setInfoMessage(t("inventory.homeLocationSaved", "Home location saved."));
        return;
      }
      await updateSpoolDetails({
        spool_id: selectedSpool.id,
        qr_code: selectedSpool.qrCode ?? null,
        status: selectedSpool.status,
        location: selectedSpool.location ?? null,
        home_location: location || null,
      });
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(t("inventory.homeLocationSaved", "Home location saved."));
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.updateHomeLocation", "Failed to save home location."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleRefillSpool() {
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (selectedSpool.status !== "EMPTY") {
      return;
    }
    if ((selectedSpool.remainingGrams ?? 0) <= 0) {
      setError(
        t(
          "inventory.error.refillRequiresWeight",
          "Set measured total weight above empty spool weight before reactivating.",
        ),
      );
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        await updateLibrarySyncHostSpoolDetails(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            spool_id: selectedSpool.id,
            qr_code: selectedSpool.qrCode ?? null,
            status: "IN_STOCK",
            location: selectedSpool.location ?? null,
          },
        );
      } else {
        await updateSpoolStatus(selectedSpool.id, "IN_STOCK");
      }
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(t("inventory.refilled", "Roll reactivated and ready for use."));
    } catch (statusError) {
      console.error(statusError);
      setError(
        commandErrorText(
          statusError,
          t("inventory.error.refill", "Failed to reactivate roll."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleToggleLostStatus() {
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    const nextStatus: SpoolStatus = selectedSpool.status === "LOST" ? "IN_STOCK" : "LOST";
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        if (!canUseClientHostWrite()) {
          return;
        }
        if (nextStatus === "LOST" && selectedSpoolAssignedSlot) {
          setError(
            t(
              "inventory.clientAssignedStatusUnsupported",
              "Paired desktop status changes are not available while the roll is still loaded in a printer.",
            ),
          );
          return;
        }
        await updateLibrarySyncHostSpoolDetails(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            spool_id: selectedSpool.id,
            qr_code: selectedSpool.qrCode ?? null,
            status: nextStatus,
            location: selectedSpool.location ?? null,
          },
        );
        await reloadSpools();
        await reloadPrinterOverview();
        await reloadActiveLoans();
        setInfoMessage(
          nextStatus === "LOST"
            ? t("inventory.markedLost", "Roll marked as lost.")
            : t("inventory.markedFound", "Roll restored to in stock."),
        );
        return;
      }
      if (nextStatus === "LOST" && selectedSpoolAssignedSlot) {
        await assignPrinterSlot({
          printer_id: selectedSpoolAssignedSlot.printerId,
          slot_id: selectedSpoolAssignedSlot.slotId,
          spool_id: null,
        });
      }
      await updateSpoolStatus(selectedSpool.id, nextStatus);
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(
        nextStatus === "LOST"
          ? t("inventory.markedLost", "Roll marked as lost.")
          : t("inventory.markedFound", "Roll restored to in stock."),
      );
    } catch (statusError) {
      console.error(statusError);
      setError(
        commandErrorText(
          statusError,
          t("inventory.error.toggleLost", "Failed to update lost status."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handlePurgeSelected() {
    if (!tauri || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!confirmPurge) {
      setConfirmPurge(true);
      setConfirmDelete(false);
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        await purgeLibrarySyncHostSpool(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            spool_id: selectedSpool.id,
            reason: "manual purge",
          },
        );
      } else {
        await purgeSpool({
          spool_id: selectedSpool.id,
          reason: "manual purge",
        });
      }
      setSelectedSpoolId(null);
      setHistoryRows([]);
      setUsagePoints([]);
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
    } catch (purgeError) {
      console.error(purgeError);
      setError(
        commandErrorText(purgeError, t("inventory.error.purgeRoll", "Failed to purge roll.")),
      );
    } finally {
      setConfirmPurge(false);
      setManageBusy(false);
    }
  }

  async function handlePrintLabel() {
    if (!tauri || !selectedSpool) {
      return;
    }
    try {
      const { qrReference, qrPayload, qrDataUrl } = await buildSpoolQrArtifacts(
        selectedSpool,
        selectedSpoolQrMode,
      );
      const html = buildFilamentLabelHtml({
        vendor: selectedSpool.vendor,
        material: selectedSpool.material,
        filamentName: selectedSpool.filamentName,
        colorName: selectedSpool.colorName || null,
        homeLocation: selectedSpool.homeLocation ?? null,
        reference: qrReference,
        qrPayload,
        qrDataUrl,
        labels: {
          vendor: t("inventory.vendor", "Vendor"),
          material: t("inventory.material", "Material"),
          filament: t("inventory.filament", "Filament"),
          homeLocation: t("inventory.homeLocationLabel", "Home location"),
          reference: t("inventory.reference", "Reference"),
          qrPayload: t("inventory.qrPayload", "QR payload"),
        },
      });
      await printLabelHtml(html, null, 1);
    } catch (printError) {
      console.error(printError);
      setError(
        commandErrorText(printError, t("inventory.error.printLabel", "Failed to generate label.")),
      );
    }
  }

  async function handleSaveCapturedRfid() {
    if (!selectedSpool || !tauri || manageBusy) {
      return;
    }
    const nextRfidTag = rfidCaptureSummary.rfidTag?.trim() ?? "";
    if (!nextRfidTag) {
      setRfidCaptureError(
        t(
          "inventory.rfidCaptureNothingToSave",
          "No non-empty RFID tag has been observed for this slot yet.",
        ),
      );
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      const observedAt =
        rfidCaptureLastSeenAt ??
        selectedRfidCaptureLiveIntegration?.observed_state?.last_seen_at ??
        new Date().toISOString();
      if (clientReadOnly) {
        if (!canUseClientHostWrite()) {
          return;
        }
        await updateLibrarySyncHostSpoolRfidTag(clientHostBaseUrl!, clientLibraryId!, {
          spool_id: selectedSpool.id,
          rfid_tag: nextRfidTag,
          rfid_observed_at: observedAt,
        });
      } else {
        await updateSpoolRfidTag({
          spool_id: selectedSpool.id,
          rfid_tag: nextRfidTag,
          rfid_observed_at: observedAt,
        });
      }
      await reloadSpools();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(
        t("inventory.rfidSaved", "RFID tag saved on the selected roll."),
      );
      setShowRfidCaptureModal(false);
    } catch (saveError) {
      console.error(saveError);
      setRfidCaptureError(
        commandErrorText(saveError, t("inventory.error.saveRfid", "Failed to save RFID tag.")),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleWeightSubmit(grams: number) {
    if (!selectedSpool || !tauri || manageBusy) {
      return;
    }
    if (!Number.isFinite(grams)) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return;
    }
    setConfirmDelete(false);
    setConfirmPurge(false);
    const safeGrams = Math.max(0, Math.round(grams));
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        if (!canUseClientHostWrite()) {
          return;
        }
        if (selectedSpoolAssignedSlot) {
          setError(
            t(
              "inventory.clientAssignedWeightUnsupported",
              "Paired desktop weight updates are only available for rolls that are not currently loaded in a printer.",
            ),
          );
          return;
        }
        await updateLibrarySyncHostSpoolWeight(
          clientHostBaseUrl!,
          clientLibraryId,
          selectedSpool.id,
          safeGrams,
        );
        await reloadSpools();
        await reloadPrinterOverview();
        setInfoMessage(
          t(
            "inventory.clientWeightUpdated",
            "Weight updated on the host library.",
          ),
        );
        return;
      }
      if (selectedSpoolAssignedSlot) {
        await applyMeasuredWeightWithUsage(
          selectedSpoolAssignedSlot.printerId,
          selectedSpool.id,
          selectedSpool.remainingGrams,
          safeGrams,
          selectedSpoolResolvedTare,
          null,
        );
      } else {
        await updateSpoolWeight(selectedSpool.id, safeGrams);
      }
      const calculatedRemaining = Math.max(0, safeGrams - selectedSpoolResolvedTare);
      if (selectedSpool.status === "EMPTY" && calculatedRemaining > 0) {
        await updateSpoolStatus(selectedSpool.id, "IN_STOCK");
        setInfoMessage(t("inventory.refilledAuto", "Roll reactivated from new measured weight."));
      }
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(updateError, t("inventory.error.updateWeight", "Failed to update weight.")),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleSaveSpoolTareWeight() {
    if (!selectedSpool || !tauri || manageBusy) {
      return;
    }
    const parsed = Number.parseInt(selectedSpoolTareDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return;
    }
    const safeGrams = Math.max(0, Math.round(parsed));
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        if (!canUseClientHostWrite()) {
          return;
        }
        await updateLibrarySyncHostSpoolTareWeight(
          clientHostBaseUrl!,
          clientLibraryId,
          selectedSpool.id,
          safeGrams,
        );
        await reloadSpools();
        setSelectedSpoolTareDraft(String(safeGrams));
        setInfoMessage(
          t(
            "inventory.clientTareWeightUpdated",
            "Empty spool weight updated on the host library.",
          ),
        );
        return;
      }
      await updateSpoolTareWeight(selectedSpool.id, safeGrams);
      await reloadSpools();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(t("inventory.tareWeightUpdated", "Empty spool weight updated."));
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.updateTareWeight", "Failed to update empty spool weight."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  const disableCreate =
    !tauri ||
    busy ||
    (createMode === "bambu" && !selectedBambuMaster) ||
    (createMode === "esun" && !selectedEsunMaster) ||
    (createMode === "manual" &&
      (!manualFilamentName.trim() || !manualColorName.trim())) ||
    (newOwnershipType === "BORROWED_IN" && !borrowedFromName.trim());

  const isCatalogCreateMode = createMode === "bambu" || createMode === "esun";
  const activeCatalogMasters =
    createMode === "bambu"
      ? filteredBambuMasters
      : createMode === "esun"
        ? filteredEsunMasters
        : [];
  const selectedCatalogMaster =
    createMode === "bambu"
      ? selectedBambuMaster
      : createMode === "esun"
        ? selectedEsunMaster
        : null;
  const currentCreateSwatchHex =
    createMode === "manual"
      ? isValidHexColor(manualHexColor)
        ? toSwatchColor(manualHexColor)
        : null
      : selectedCatalogMaster?.hex_color ?? null;
  const currentCreateDraft = buildWishlistDraft();
  const currentCreatePanelStyle = currentCreateSwatchHex
    ? {
        ...inventorySwatchPanelStyle(currentCreateSwatchHex, resolvedTheme),
        borderColor: swatchRgba(
          currentCreateSwatchHex,
          resolvedTheme === "dark" ? 0.42 : 0.28,
        ),
        boxShadow:
          resolvedTheme === "dark"
            ? `inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 36px -28px ${swatchRgba(
                currentCreateSwatchHex,
                0.42,
              )}, 0 3px 10px rgba(2, 6, 23, 0.32)`
            : `inset 0 1px 0 rgba(255,255,255,0.86), 0 18px 36px -28px ${swatchRgba(
                currentCreateSwatchHex,
                0.34,
              )}`,
      }
    : undefined;
  const currentCreateActionStyle = currentCreateSwatchHex
    ? inventorySwatchActionButtonStyle(currentCreateSwatchHex, resolvedTheme)
    : undefined;
  const disableWishlistCreate = !tauri || busy || !currentCreateDraft;

  return (
    <div className="page-shell">
      <LoanOutModal
        open={showLoanTrackingModal}
        onClose={closeLoanTrackingModal}
        preferredSpoolId={loanTrackingSpoolId}
        clientReadOnly={clientReadOnly}
        clientHostWritePaired={clientHostWritePaired}
        clientHostBaseUrl={clientHostBaseUrl}
        clientLibraryId={clientLibraryId}
        onLoanCreated={async ({ spoolId }) => {
          await reloadSpools();
          await reloadPrinterOverview();
          await reloadActiveLoans();
          await reloadSpoolDetail(spoolId);
          setInfoMessage(t("inventory.loanCreated", "Loan created."));
        }}
      />

      {showRollModal && selectedSpool ? (
        <AppModal
          zIndex={50}
          closeOnBackdrop
          onBackdropClose={() => setShowRollModal(false)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6 backdrop-blur-md dark:bg-black/45"
          panelClassName="flex max-h-[92vh] min-w-0 w-[min(100%,72rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
        >
          <>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200/80 bg-white/88 px-4 py-4 backdrop-blur-xl sm:px-5 dark:border-slate-700/80 dark:bg-slate-950/88">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/60 p-2 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/30 dark:shadow-none">
                  <span
                    className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                    style={{
                      background: `linear-gradient(145deg, ${toSwatchColor(
                        selectedSpool.hexColor,
                      )} 0%, ${toSwatchColor(selectedSpool.hexColor)}CC 58%, #0f172a33 100%)`,
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {t("inventory.selectedRoll", "Selected roll")}
                  </div>
                  <div className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                    {selectedSpoolDisplayTitle}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VendorBadge vendor={selectedSpool.vendor} compact />
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${materialTone(selectedSpool.material).badge} ${materialTone(selectedSpool.material).badgeText}`}
                    >
                      {selectedSpool.material}
                    </span>
                    <span
                      className={semanticChipClass(
                        selectedSpoolOwnershipTone,
                        "px-2.5 py-1 text-[11px]",
                      )}
                    >
                      {selectedSpoolOwnershipLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  <span
                    className={semanticChipClass(
                      selectedSpoolStatusTone,
                      "px-3 py-1 text-xs",
                    )}
                  >
                    {selectedSpoolStatusLabel}
                  </span>
                  <span className={neutralChipClass(true, "px-3 py-1 text-xs")}>
                    {formatGrams(selectedSpool.remainingGrams)}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={t("common.close", "Close")}
                  title={t("common.close", "Close")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-lg leading-none text-slate-700 shadow-sm shadow-slate-900/5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-black/30 dark:hover:bg-slate-800/70"
                  onClick={() => setShowRollModal(false)}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-4 pb-4 pt-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                <div
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                >
                  <div className="space-y-5 text-sm text-slate-700 dark:text-slate-200">
                    {error ? (
                      <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200">
                        {error}
                      </div>
                    ) : null}
                    {!error && infoMessage ? (
                      <FeedbackBanner tone="success">
                        {infoMessage}
                      </FeedbackBanner>
                    ) : null}

                    <div
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                      style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                    >
                      <div className="grid gap-3 min-[760px]:grid-cols-2 2xl:grid-cols-3">
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 min-[760px]:col-span-2 2xl:col-span-1 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {t("inventory.reference", "Reference")}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {formatRollReference(selectedSpool)}
                          <span className={selectedSpoolIdentityFreshnessMeta.className}>
                            {selectedSpoolIdentityFreshnessMeta.label}
                          </span>
                        </div>
                          <div className="mt-1 break-all text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                            ID: {selectedSpool.id}
                          </div>
                          <div className="mt-1 break-all text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                            RFID: {selectedSpool.rfidTag?.trim() || "—"}
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                            {t("inventory.lastAmsIdentitySeen", "Last AMS identity seen")}:{" "}
                            {selectedSpool.rfidObservedAt
                              ? `${formatCaptureTimestamp(selectedSpool.rfidObservedAt, locale)} (${formatObservedAge(selectedSpool.rfidObservedAt, locale)})`
                              : "—"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {selectedSpoolAssignedSlot
                              ? t("nav.printers", "Printers")
                              : t("inventory.location", "Location")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {selectedSpoolLocationValue}
                          </div>
                          {selectedSpoolAssignedSlot ? (
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                              {t(
                                "inventory.assignmentManagedOnPrinters",
                                "Filament placement and slot assignment is managed on the Printers page.",
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {t("inventory.ownership", "Ownership")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {formatOwnershipSummary(selectedSpool)}
                          </div>
                          {selectedSpool.ownershipType === "BORROWED_IN" &&
                          (selectedSpool.ownerContact || selectedSpool.ownershipNote) ? (
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                              {selectedSpool.ownerContact ? (
                                <div>{selectedSpool.ownerContact}</div>
                              ) : null}
                              {selectedSpool.ownershipNote ? (
                                <div>{selectedSpool.ownershipNote}</div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {t("inventory.initialWeight", "Initial weight (g)")}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {formatGrams(selectedSpool.initialWeightGrams)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                    >
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {t("inventory.qrLabel", "QR")}
                      </div>
                      <div className="mt-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          {t("inventory.qrMode", "QR mode")}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                              selectedSpoolQrMode === "companion"
                                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
                                : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/70"
                            }`}
                            onClick={() => setSelectedSpoolQrMode("companion")}
                            disabled={!selectedSpoolQrCompanionAvailable}
                          >
                            {t("inventory.qrModeCompanion", "Companion link")}
                          </button>
                          <button
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                              selectedSpoolQrMode === "portable"
                                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
                                : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/70"
                            }`}
                            onClick={() => setSelectedSpoolQrMode("portable")}
                          >
                            {t("inventory.qrModePortable", "Portable")}
                          </button>
                        </div>
                        {!selectedSpoolQrCompanionAvailable ? (
                          <div className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {t(
                              "inventory.qrCompanionUnavailable",
                              "Companion link is unavailable right now. Start the Trusted-LAN companion on the active host to build a direct browser link.",
                            )}
                          </div>
                        ) : null}
                      </div>
                      {selectedSpoolQrDataUrl ? (
                        <div className="mt-3 flex justify-center">
                          <img
                            src={selectedSpoolQrDataUrl}
                            alt={t(
                              "inventory.qrCode",
                              "QR code",
                            )}
                            className="h-36 w-36 rounded-lg border border-slate-200 bg-white object-contain p-0.5 dark:border-slate-700"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                          {selectedSpoolQrLoading
                            ? t("common.loading", "Loading...")
                            : t("inventory.error.printLabel", "Failed to generate label.")}
                        </div>
                      )}
                      {selectedSpoolQrTarget ? (
                        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                          <div className="font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            {t("inventory.qrTarget", "QR target")}
                          </div>
                          <div className="mt-1 break-all font-mono text-[11px] leading-relaxed">
                            {selectedSpoolQrTarget}
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {selectedSpoolQrResolvedMode === "companion"
                              ? t(
                                  "inventory.qrTargetCompanionHint",
                                  "This QR opens the browser companion directly as long as the target URL is still reachable.",
                                )
                              : t(
                                  "inventory.qrTargetPortableHint",
                                  "This QR contains only the spool reference, which is more robust for small prints and host changes.",
                                )}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <button
                          type="button"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100"
                          onClick={handlePrintLabel}
                          disabled={!tauri}
                        >
                          {t("inventory.printQr", "Print QR label")}
                        </button>
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100"
                          onClick={() => {
	                            setSelectedRfidCaptureSlotId(
	                              selectedSpoolAssignedSlot?.slotId ??
	                                selectedSpoolRfidCaptureSlots[0]?.slotId ??
	                                null,
	                            );
	                            setRfidCaptureError(null);
	                            setShowRfidCapturedFields(false);
	                            void reloadPrinterOverview();
	                            setShowRfidCaptureModal(true);
	                          }}
	                          disabled={!tauri || !selectedSpoolSupportsRfidCapture}
	                        >
                          {t("inventory.rfidButton", "RFID")}
                        </button>
                      </div>
                      <div className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {selectedSpoolSupportsRfidCapture
                          ? t(
                              "inventory.rfidHintReady",
                              "Capture AMS slot identity data, review it, and save the observed RFID tag when it looks correct.",
                            )
                          : t(
                              "inventory.rfidHintNeedsLive",
                              "RFID capture needs a printer with Live Bambu status enabled and at least one AMS slot available.",
                            )}
                      </div>
                    </div>

                    <div
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("inventory.catalogDetails", "Catalog details")}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {t(
                              "inventory.metadataAppliesToFamily",
                              "Changes apply to all rolls using this catalog filament.",
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`rounded border px-2 py-1 text-[10px] font-semibold ${
                            masterEditUnlocked
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                          onClick={() => setMasterEditUnlocked((value) => !value)}
                          disabled={!tauri || manageBusy}
                        >
                          {masterEditUnlocked
                            ? t("inventory.lockMetadata", "Lock metadata")
                            : t("inventory.unlockMetadata", "Unlock metadata")}
                        </button>
                      </div>
                      {masterEditUnlocked ? (
                        <div className="mt-3 grid grid-cols-1 gap-2">
                          <input
                            type="text"
                            value={editMasterVendor}
                            onChange={(event) => setEditMasterVendor(event.target.value)}
                            placeholder={t("wishlist.vendorPlaceholder", "Vendor")}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
                            disabled={!tauri || manageBusy}
                          />
                          <input
                            type="text"
                            value={editMasterMaterial}
                            onChange={(event) => setEditMasterMaterial(event.target.value)}
                            placeholder={t("wishlist.materialPlaceholder", "Material")}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
                            disabled={!tauri || manageBusy}
                          />
                          <input
                            type="text"
                            value={editMasterFilamentName}
                            onChange={(event) => setEditMasterFilamentName(event.target.value)}
                            placeholder={t("wishlist.filamentName", "Filament name")}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
                            disabled={!tauri || manageBusy}
                          />
                          <input
                            type="text"
                            value={editMasterColorName}
                            onChange={(event) => setEditMasterColorName(event.target.value)}
                            placeholder={t("wishlist.colorName", "Color name")}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
                            disabled={!tauri || manageBusy}
                          />
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                            <input
                              type="text"
                              value={editMasterHexColor}
                              onChange={(event) => setEditMasterHexColor(event.target.value)}
                              placeholder={t("wishlist.hexOptional", "Hex color")}
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
                              disabled={!tauri || manageBusy}
                            />
                            <input
                              type="color"
                              value={toSwatchColor(editMasterHexColor)}
                              onChange={(event) => setEditMasterHexColor(event.target.value)}
                              className="h-7 w-10 rounded border border-slate-200 bg-white p-0.5"
                              disabled={!tauri || manageBusy}
                            />
                            <span
                              className="h-7 w-7 rounded border border-slate-200"
                              style={{ backgroundColor: toSwatchColor(editMasterHexColor) }}
                            />
                          </div>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
                            onClick={handleSaveMasterMetadata}
                            disabled={!tauri || manageBusy}
                          >
                            {t("inventory.saveMetadata", "Save metadata")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <WeightInput
                    label={t("inventory.measuredTotalWeight", "Measured total weight (g)")}
                    value={selectedSpoolMeasuredTotal}
                    onSubmit={handleWeightSubmit}
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                  />

                  <div
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      {t("inventory.emptySpoolWeight", "Empty spool weight (g)")}
                    </div>
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {t(
                        "inventory.emptySpoolWeightHelp",
                        "Used to subtract spool tare from measured total so remaining filament stays accurate.",
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={selectedSpoolTareDraft}
                        onChange={(event) => setSelectedSpoolTareDraft(event.target.value)}
                        className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                        disabled={!tauri || manageBusy}
                      />
                      <button
                        type="button"
                        onClick={handleSaveSpoolTareWeight}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300/30 transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white"
                        disabled={!tauri || manageBusy}
                      >
                        {t("common.save", "Save")}
                      </button>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      {t("inventory.editHomeLocation", "Home location")}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="text"
                        value={selectedSpoolLocationDraft}
                        onChange={(event) => setSelectedSpoolLocationDraft(event.target.value)}
                        placeholder={t("inventory.homeLocationOptional", "Home location (optional)")}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                        disabled={!tauri || manageBusy}
                      />
                      <button
                        type="button"
                        onClick={handleSaveSpoolLocation}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300/30 transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white"
                        disabled={!tauri || manageBusy}
                      >
                        {t("common.save", "Save")}
                      </button>
                    </div>
                    {selectedSpoolAssignedSlot ? (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {t(
                          "inventory.homeLocationHintWhileAssigned",
                          "Current placement is managed on the Printers page. Home location is where the spool returns when it is no longer loaded.",
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      {t("inventory.lostStatus", "Lost status")}
                    </div>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200"
                      onClick={handleToggleLostStatus}
                      disabled={!tauri || manageBusy}
                    >
                      {selectedSpool.status === "LOST"
                        ? t("inventory.markFound", "Mark as found (in stock)")
                        : t("inventory.markLost", "Mark as lost")}
                    </button>
                  </div>

                  <div
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      {t("inventory.usageDiagram", "Usage diagram")}
                    </div>
                    <RollUsageChart
                      points={usagePoints}
                      loading={usageLoading}
                      initialWeight={selectedSpool.initialWeightGrams}
                    />
                  </div>

                  <div
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
	                  >
	                    <div className="flex items-center justify-between gap-3">
	                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
	                        {t("inventory.rollHistory", "Roll history")}
	                      </div>
	                      <button
	                        type="button"
	                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200"
	                        onClick={() => setShowRollHistory((current) => !current)}
	                      >
	                        {showRollHistory
	                          ? t("common.hide", "Hide")
	                          : t("common.show", "Show")}
	                      </button>
	                    </div>
	                    {showRollHistory ? (
	                    <div className="mt-3 space-y-2">
	                      {historyLoading ? (
	                        <div className="text-xs text-slate-500">
	                          {t("inventory.loadingHistory", "Loading history...")}
                        </div>
                      ) : null}
                      {!historyLoading && visibleHistoryRows.length === 0 ? (
                        <div className="text-xs text-slate-500">
                          {hasHiddenHistoryRows
                            ? t(
                                "inventory.noVisibleHistory",
                                "No roll history beyond printer slot assignments yet.",
                              )
                            : t("inventory.noHistory", "No history events yet.")}
                        </div>
                      ) : null}
                      {visibleHistoryRows.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/55 dark:text-slate-200"
                        >
                          <div className="font-semibold text-slate-900 dark:text-slate-50">
                            {formatHistoryEventType(event.event_type)} ·{" "}
                            {formatDateTime(event.created_at, locale)}
                          </div>
                          <div className="mt-1 break-words text-slate-600 dark:text-slate-300">
                            {formatHistoryEventDetails(event)}
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                    ) : (
	                      <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
	                        {t(
	                          "inventory.rollHistoryCollapsed",
	                          "Filamenthistorikk er kollapset som standard. Utvid når du vil se hendelsene.",
	                        )}
	                      </div>
	                    )}
	                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm dark:border-rose-500/35 dark:bg-rose-500/10 dark:shadow-none">
                    <div className="text-xs uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
                      {t("inventory.dangerZone", "Danger zone")}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {selectedSpool.status === "EMPTY" ? (
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                          onClick={handleRefillSpool}
                          disabled={!tauri || manageBusy}
                        >
                          {t("inventory.refill", "Refill / Reactivate roll")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50 dark:border-rose-400/35 dark:bg-slate-950/55 dark:text-rose-200"
                        onClick={handleMarkEmpty}
                        disabled={!tauri || manageBusy}
                      >
                        {t("inventory.markEmpty", "Mark as used up (empty)")}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200"
                        onClick={handleDeleteSelected}
                        disabled={!tauri || manageBusy}
                      >
                        {confirmDelete
                          ? t("inventory.confirmDelete", "Click again to confirm delete")
                          : t("inventory.deleteRoll", "Delete roll from active inventory")}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-400 bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:border-red-400/45 dark:bg-red-500/85 dark:text-white"
                        onClick={handlePurgeSelected}
                        disabled={!tauri || manageBusy}
                      >
                        {confirmPurge
                          ? t(
                              "inventory.confirmPurge",
                              "Click again to confirm permanent purge",
                            )
                          : t(
                              "inventory.purgeRoll",
                              "Purge roll + all history permanently",
                            )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        </AppModal>
      ) : null}

      {showRfidCaptureModal && showRollModal && selectedSpool ? (
        <AppModal
          onBackdropClose={() => setShowRfidCaptureModal(false)}
          panelClassName="w-full max-w-6xl rounded-3xl border border-slate-200/90 bg-white/95 p-0 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
        >
          <div className="mx-auto w-full max-w-none rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
	              <div>
	                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
	                  {t("inventory.rfidCaptureTitle", "RFID capture")}
	                </div>
		                <div className="mt-2 flex flex-wrap items-center gap-3">
		                  <span
		                    className="h-5 w-5 rounded-md border border-slate-200 dark:border-slate-700"
		                    style={{
		                      backgroundColor: toSwatchColor(selectedSpool.hexColor),
		                    }}
		                  />
		                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
		                    {selectedSpoolDisplayTitle}
		                  </div>
	                  {rfidCaptureMatchMetaForSelected ? (
	                    <span className={rfidCaptureMatchMetaForSelected.className}>
	                      {rfidCaptureMatchMetaForSelected.label}
	                    </span>
	                  ) : null}
	                </div>
		                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
		                  {selectedRfidCaptureSlot
		                    ? `${selectedRfidCaptureSlot.printerName} · ${selectedSpoolRfidSlotLabel ?? `Slot ${selectedRfidCaptureSlot.slotIndex}`}`
		                    : t("inventory.rfidNoCaptureSource", "No live AMS slot available")}
		                </div>
		                {rfidCaptureMatchMetaForSelected ? (
		                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
		                    {rfidCaptureMatchMetaForSelected.hint}
		                  </div>
		                ) : null}
	              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-100"
                onClick={() => setShowRfidCaptureModal(false)}
              >
                {t("common.close", "Close")}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 md:col-span-2 xl:col-span-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidSourceSlot", "RFID source slot")}
                </div>
	                <div className="mt-3 flex flex-wrap gap-2">
	                  {selectedSpoolRfidCaptureSlots.map((slot) => {
	                    const active = selectedRfidCaptureSlot?.slotId === slot.slotId;
	                    const label = formatPrinterSlotLabelForModel(t, slot.printerModel, {
	                      ams_id: slot.amsId,
	                      slot_index: slot.slotIndex,
	                    });
	                    const slotSummary = rfidCaptureSlotSummaries[slot.slotId] ?? {};
	                    const slotMatchMeta = rfidCaptureMatchMeta(
	                      assessRfidCaptureMatch(selectedSpool, slotSummary),
	                      t,
	                    );
	                    return (
	                      <button
	                        key={slot.slotId}
	                        type="button"
	                        className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
	                          active
	                            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/50 dark:bg-sky-500/15 dark:text-sky-200"
	                            : "border-slate-200 text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-950/70"
	                        }`}
	                        onClick={() => {
	                          setSelectedRfidCaptureSlotId(slot.slotId);
	                          setRfidCaptureError(null);
	                        }}
	                      >
	                        <div className="flex items-center gap-2">
	                          <span
	                            className="h-4 w-4 shrink-0 rounded border border-slate-200 dark:border-slate-700"
	                            style={{
	                              backgroundColor: toSwatchColor(
	                                slotSummary.colorHex ?? selectedSpool.hexColor,
	                              ),
	                            }}
	                          />
	                          <span>{label ?? `Slot ${slot.slotIndex}`}</span>
	                        </div>
	                        {slotMatchMeta ? (
	                          <div className="mt-1">
	                            <span className={slotMatchMeta.className}>{slotMatchMeta.label}</span>
	                          </div>
	                        ) : null}
	                      </button>
	                    );
	                  })}
	                </div>
	              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidCurrentTag", "Saved RFID")}
                </div>
                <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">
                  {selectedSpool.rfidTag?.trim() || "—"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidObservedTag", "Observed RFID")}
                </div>
                <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">
                  {rfidCaptureSummary.rfidTag || "—"}
                </div>
              </div>
	              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
	                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
	                  {t("inventory.rfidObservedMaterial", "Observed filament")}
	                </div>
	                <div className="mt-2 text-sm text-slate-900 dark:text-slate-100">
	                  {[rfidCaptureSummary.material, rfidCaptureSummary.filamentName].filter(Boolean).join(" · ") || "—"}
	                </div>
	                {rfidCaptureMatchMetaForSelected ? (
	                  <div className="mt-2">
	                    <span className={rfidCaptureMatchMetaForSelected.className}>
	                      {rfidCaptureMatchMetaForSelected.label}
	                    </span>
	                  </div>
	                ) : null}
	              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidObservedColor", "Observed color")}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                  <span
                    className="h-5 w-5 rounded border border-slate-200 dark:border-slate-700"
                    style={{ backgroundColor: rfidCaptureSummary.colorHex ?? "#0F172A" }}
                  />
                  <span className="font-mono">
                    {rfidCaptureSummary.colorHex || rfidCaptureSummary.trayColorRaw || "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidIdentityCandidates", "Identity candidates")}
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400"><code>tag_uid</code></dt>
                    <dd className="break-all font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.rfidTag || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400"><code>tray_uuid</code></dt>
                    <dd className="break-all font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.trayUuid || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400"><code>chip_id</code></dt>
                    <dd className="break-all font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.chipId || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400"><code>tray_info_idx</code></dt>
                    <dd className="break-all font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.trayInfoIdx || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400"><code>tray_id_name</code></dt>
                    <dd className="break-all font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.trayIdName || "—"}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidCaptureStatus", "Capture status")}
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidPrinterLive", "Printer live")}</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {selectedRfidCaptureLiveIntegration?.observed_state?.mqtt_connected
                        ? t("inventory.connected", "Connected")
                        : clientReadOnly
                          ? selectedRfidCaptureSlot?.liveMqttConnected
                            ? t("inventory.connected", "Connected")
                            : t("inventory.disconnected", "Not connected")
                        : t("inventory.disconnected", "Not connected")}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidLastSeen", "Last seen")}</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {(selectedRfidCaptureLiveIntegration?.observed_state?.last_seen_at ||
                        selectedRfidCaptureSlot?.livePrinterLastSeenAt)
                        ? formatCaptureTimestamp(
                            selectedRfidCaptureLiveIntegration?.observed_state?.last_seen_at ??
                              selectedRfidCaptureSlot?.livePrinterLastSeenAt ??
                              "",
                            locale,
                          )
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidLastSlotData", "Last slot data")}</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {rfidCaptureLastSeenAt ? formatCaptureTimestamp(rfidCaptureLastSeenAt, locale) : "—"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidActiveSource", "Active source")}</dt>
                    <dd className="text-slate-900 dark:text-slate-100">
                      {selectedSpoolRfidSlotLabel ?? "—"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidAmsReadDone", "AMS read done bits")}</dt>
                    <dd className="font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.trayReadDoneBits || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidAmsBambuBits", "AMS Bambu bits")}</dt>
                    <dd className="font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.trayIsBblBits || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{t("inventory.rfidAmsStatus", "AMS RFID status")}</dt>
                    <dd className="font-mono text-slate-900 dark:text-slate-100">{rfidCaptureSummary.amsRfidStatus || "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {rfidCaptureError ? (
              <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
                {rfidCaptureError}
              </div>
            ) : null}

	            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700">
	              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-xs dark:border-slate-700">
	                <div className="font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
	                  {t("inventory.rfidCapturedFields", "Captured slot fields")}
	                </div>
	                <div className="flex items-center gap-3">
	                  <div className="text-slate-500 dark:text-slate-400">
	                    {rfidCaptureLoading
	                      ? t("common.loading", "Loading...")
	                      : `${effectiveRfidCaptureFields.length} ${t("inventory.fields", "fields")}`}
	                  </div>
	                  <button
	                    type="button"
	                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200"
	                    onClick={() => setShowRfidCapturedFields((current) => !current)}
	                  >
	                    {showRfidCapturedFields
	                      ? t("common.hide", "Hide")
	                      : t("common.show", "Show")}
	                  </button>
	                </div>
	              </div>
	              {showRfidCapturedFields ? (
	              <div className="max-h-80 overflow-auto">
	                {effectiveRfidCaptureFields.length > 0 ? (
	                  <table className="min-w-full text-left text-xs">
	                    <thead className="bg-slate-50 dark:bg-slate-900/60">
                      <tr>
                        <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t("inventory.field", "Field")}</th>
                        <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t("inventory.value", "Value")}</th>
                        <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t("inventory.lastUpdated", "Last updated")}</th>
                        <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">{t("inventory.changes", "Changes")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                      {effectiveRfidCaptureFields.map((field) => (
                        <tr key={field.path}>
                          <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">{field.label}</td>
                          <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">{field.valueText}</td>
                          <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                            {formatCaptureTimestamp(field.lastSeenAt, locale)}
                          </td>
                          <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{field.changeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
                    {selectedSpoolSupportsRfidCapture
                      ? observedTrayCaptureSnapshot?.fields.length
                        ? t(
                            "inventory.rfidCaptureUsingLastKnown",
                            "Showing the last known AMS slot data until newer tray data arrives.",
                          )
                        : t(
                            "inventory.rfidCaptureWaiting",
                            "Waiting for fresh AMS slot data. Previously captured values stay visible until newer data arrives.",
                          )
                      : t(
                          "inventory.rfidCaptureUnavailable",
                          "RFID capture needs live Bambu data from this device or the connected host on a printer with at least one AMS slot.",
	                        )}
	                  </div>
	                )}
	              </div>
	              ) : (
	                <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
	                  {t(
	                    "inventory.rfidCapturedFieldsCollapsed",
	                    "Captured slot fields are collapsed by default. Expand when you want to inspect the raw field list.",
	                  )}
	                </div>
	              )}
	            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-100"
                onClick={() => setShowRfidCaptureModal(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:border-sky-400/40 dark:bg-sky-500"
                onClick={() => void handleSaveCapturedRfid()}
                disabled={!rfidCaptureSummary.rfidTag || manageBusy}
              >
                {t("inventory.saveRfid", "Save RFID")}
              </button>
            </div>
          </div>
        </AppModal>
      ) : null}

      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("inventory.title", "Spools")}</h1>
          <div className="page-subtitle max-w-2xl">
            {t(
              "inventory.subtitle",
              "Track stock, assignments, loans and weight updates from one clear workspace.",
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <div className="page-header-tools">
            <button
              type="button"
              onClick={openAddModal}
              className="header-button-primary w-full min-[920px]:w-auto"
              disabled={clientReadOnly ? !clientHostWritePaired : false}
            >
              {t("inventory.addSpoolAction", "Add spool")}
            </button>
            <button
              type="button"
              onClick={openLoanTrackingModal}
              className="header-button-secondary w-full min-[920px]:w-auto"
              disabled={clientReadOnly ? !clientHostWritePaired : false}
            >
              {t("inventory.loanOutRoll", "Loan out roll")}
            </button>
          </div>
          <div className="flex w-full flex-col gap-2 min-[920px]:items-end">
            <input
              type="search"
              placeholder={t(
                "inventory.searchPlaceholder",
                "Search by material, color, location or QR",
              )}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="page-header-search"
            />
            <div className="page-header-filter-surface">
              <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-20">
                  {t("inventory.status", "Status")}
                </div>
                <div className="flex flex-wrap gap-1.5 min-[920px]:justify-end">
                  <button
                    type="button"
                    onClick={() => setLowStockOnly((current) => !current)}
                    className={neutralChipClass(lowStockOnly, "px-3.5 py-2 text-xs")}
                  >
                    {t("inventory.lowStockOnly", "Low stock (<200 g)")}
                  </button>
                  {statuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={neutralChipClass(statusFilter === status, "px-3.5 py-2 text-xs")}
                    >
                      {status === "ALL"
                        ? t("common.all", "All")
                        : status === "IN_STOCK"
                          ? t("inventory.statusInStock", "In stock")
                          : status === "ASSIGNED"
                            ? t("inventory.statusAssigned", "Assigned")
                            : status === "BORROWED"
                              ? t("inventory.statusBorrowed", "Loaned out")
                              : status === "EMPTY"
                                ? t("inventory.statusEmpty", "Empty")
                                : t("inventory.statusLost", "Lost")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-subtle mt-4 px-3 py-2.5">
        <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center min-[920px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("inventory.filters", "Filters")}
            </div>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200 dark:shadow-none">
              {visibleInventoryCount}
            </span>
            {activeAdvancedFilterCount > 0 ? (
              <span className="rounded-full border border-sky-300/65 bg-sky-50/70 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-200">
                {activeAdvancedFilterCount} {t("inventory.activeFilters", "active")}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
            className={neutralChipClass(showAdvancedFilters, "px-3 py-1.5 text-xs")}
          >
            {showAdvancedFilters
              ? t("inventory.hideAdvancedFilters", "Hide details")
              : t("inventory.showAdvancedFilters", "More filters")}
          </button>
        </div>

        {showAdvancedFilters ? (
          <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.viewGroup", "View")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setInventoryView("CARDS")}
                  className={neutralChipClass(inventoryView === "CARDS", "px-3 py-1.5 text-xs")}
                >
                  {t("inventory.viewCards", "Card view")}
                </button>
                <button
                  type="button"
                  onClick={() => setInventoryView("LIST")}
                  className={neutralChipClass(inventoryView === "LIST", "px-3 py-1.5 text-xs")}
                >
                  {t("inventory.viewList", "List view")}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.ownershipGroup", "Ownership")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ownershipFilters.map((ownership) => (
                  <button
                    key={ownership}
                    type="button"
                    onClick={() => setOwnershipFilter(ownership)}
                    className={neutralChipClass(
                      ownershipFilter === ownership,
                      "px-3 py-1.5 text-xs",
                    )}
                  >
                    {ownership === "ALL"
                      ? t("inventory.ownershipAll", "All")
                      : ownership === "OWNED"
                        ? t("inventory.ownedByUs", "Owned")
                        : t("inventory.borrowedIn", "Borrowed in")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.vendorGroup", "Vendor")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vendorOptions.map((vendor) => (
                  <button
                    key={vendor}
                    type="button"
                    onClick={() => setVendorFilter(vendor)}
                    className={neutralChipClass(vendorFilter === vendor, "px-3 py-1.5 text-xs")}
                  >
                    {vendor === "ALL"
                      ? t("inventory.vendorAll", "All")
                      : vendor}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.materialGroup", "Material")}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {materialOptions.map((material) => (
                  <button
                    key={material}
                    type="button"
                    onClick={() => setMaterialFilter(material)}
                    className={
                      material === "ALL"
                        ? neutralChipClass(materialFilter === material, "px-3 py-1.5 text-xs")
                        : `rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            materialFilter === material
                              ? materialTone(material).filterActive
                              : materialTone(material).filterInactive
                          }`
                    }
                  >
                    {material === "ALL"
                      ? t("inventory.typeAll", "All")
                      : material}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error && !(showAddModal && sidePanelMode === "ADD") ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}

      {!error && infoMessage && !(showAddModal && sidePanelMode === "ADD") && !showRollModal ? (
        <FeedbackBanner tone="success" className="mt-4">
          {infoMessage}
        </FeedbackBanner>
      ) : null}

      {clientReadOnly && clientInventorySource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {clientHostDeviceName
            ? `${clientHostDeviceName}. `
            : null}
          {clientInventorySource === "CACHED"
            ? t(
                "inventory.clientReadOnlyCached",
                "Host unavailable. Showing the last cached inventory snapshot.",
              )
            : t(
                "inventory.clientReadOnlyOffline",
                "Host unavailable and no cached inventory snapshot is available yet.",
              )}
          {clientInventoryUpdatedAt
            ? ` ${t("inventory.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientInventoryUpdatedAt, locale)}.`
            : null}
        </FeedbackBanner>
      ) : null}

      <div className="mt-8">
        <div
          className={
            inventoryView === "CARDS"
              ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "space-y-3"
          }
        >
          {inventoryView === "CARDS" ? (
            groupedSpools.map((group) => {
              const hasRecentRoll = group.rolls.some(
                (roll) => roll.id === recentlyAddedSpoolId,
              );
              const visibleRolls = [...group.rolls]
                .sort((left, right) => {
                  if (left.id === recentlyAddedSpoolId) {
                    return -1;
                  }
                  if (right.id === recentlyAddedSpoolId) {
                    return 1;
                  }
                  return 0;
                })
                .slice(0, 3);

              return (
                <div
                  key={group.key}
                  className={`surface-card-compact flex h-full flex-col gap-4 overflow-hidden ${
                    hasRecentRoll
                      ? "ring-2 ring-emerald-200/80 dark:ring-emerald-400/20"
                      : ""
                  }`}
                  style={inventorySwatchCardStyle(group.hexColor, resolvedTheme)}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/60 p-2 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                      <span
                        className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                        style={{
                          background: `linear-gradient(145deg, ${toSwatchColor(
                            group.hexColor,
                          )} 0%, ${toSwatchColor(group.hexColor)}CC 58%, #0f172a33 100%)`,
                        }}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div
                        className="overflow-hidden break-words text-[1.02rem] font-semibold leading-tight text-slate-950 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                        title={formatInventoryDisplayTitle(
                          group.material,
                          group.filamentName,
                          group.colorName,
                        )}
                      >
                        {formatInventoryDisplayTitle(
                          group.material,
                          group.filamentName,
                          group.colorName,
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                        <VendorBadge vendor={group.vendor} compact />
                        {group.ownershipType === "BORROWED_IN" ? (
                          <span
                            className={semanticChipClass(
                              formatOwnershipTone(group.ownershipType),
                              "px-2 py-0.5 text-[10px]",
                            )}
                          >
                            {formatOwnershipLabel(group.ownershipType)}
                          </span>
                        ) : null}
                        <span>
                          {t("inventory.rolls", "Rolls")}: {group.rolls.length}
                        </span>
                        <span>
                          {t("inventory.total", "Total")}: {formatGrams(group.totalRemaining)}
                        </span>
                      </div>
                      {group.ownershipType === "BORROWED_IN" && group.ownerName ? (
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                          {t("inventory.borrowedFrom", "Borrowed from")}: {group.ownerName}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {visibleRolls.map((roll) => {
                      const emphasis =
                        selectedSpoolId === roll.id
                          ? "selected"
                          : roll.id === recentlyAddedSpoolId
                            ? "recent"
                            : "default";
                      return (
                        <button
                          key={roll.id}
                          type="button"
                          onClick={() => selectRollForManage(roll.id)}
                          className="flex w-full items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition hover:-translate-y-[1px]"
                          style={inventorySwatchInteractiveInsetStyle(
                            roll.hexColor ?? group.hexColor,
                            resolvedTheme,
                            emphasis,
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
                                {formatInventoryPlacementLabel(roll.location)}
                              </div>
                              {roll.ownershipType === "BORROWED_IN" ? (
                                <span
                                  className={semanticChipClass(
                                    formatOwnershipTone(roll.ownershipType),
                                    "px-2 py-0.5 text-[10px]",
                                  )}
                                >
                                  {formatOwnershipLabel(roll.ownershipType)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                              {formatRollReference(roll)}
                            </div>
                            {roll.ownershipType === "BORROWED_IN" && roll.ownerName ? (
                              <div className="mt-1 truncate text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                                {t("inventory.borrowedFrom", "Borrowed from")}: {roll.ownerName}
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              {t("inventory.remaining", "Remaining")}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-tight text-slate-900 dark:text-slate-50">
                              {formatGrams(roll.remainingGrams)}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {group.rolls.length > 3 ? (
                      <div className="rounded-xl border border-dashed border-slate-200/80 px-3.5 py-2 text-[11px] font-medium text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
                        + {group.rolls.length - 3} {t("inventory.moreRolls", "more roll(s)")}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            filteredSpools.map((roll) => (
              <button
                key={roll.id}
                type="button"
                onClick={() => selectRollForManage(roll.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left shadow-sm ${
                  selectedSpoolId === roll.id
                    ? "border-slate-900 ring-1 ring-slate-300"
                    : roll.id === recentlyAddedSpoolId
                      ? "border-emerald-300 ring-2 ring-emerald-200"
                      : ""
                }`}
                style={inventorySwatchCardStyle(roll.hexColor, resolvedTheme)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatInventoryDisplayTitle(
                        roll.material,
                        roll.filamentName,
                        roll.colorName,
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${materialTone(roll.material).badge} ${materialTone(roll.material).badgeText}`}
                      >
                        {roll.material}
                      </span>
                      {roll.ownershipType === "BORROWED_IN" ? (
                        <span
                          className={semanticChipClass(
                            formatOwnershipTone(roll.ownershipType),
                            "px-2 py-0.5 text-[10px]",
                          )}
                        >
                          {formatOwnershipLabel(roll.ownershipType)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatInventoryPlacementLabel(roll.location)} ·{" "}
                      {formatRollReference(roll)}
                    </div>
                    {roll.ownershipType === "BORROWED_IN" && roll.ownerName ? (
                      <div className="mt-1 text-xs text-slate-500">
                        {t("inventory.borrowedFrom", "Borrowed from")}: {roll.ownerName}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-700">
                      {formatGrams(roll.remainingGrams)}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
          {(inventoryView === "CARDS" ? groupedSpools.length === 0 : filteredSpools.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
              {loading
                ? t("inventory.loading", "Loading spools...")
                : t("inventory.noMatch", "No spools match current filters.")}
            </div>
          ) : null}
        </div>

        {showAddModal && sidePanelMode === "ADD" ? (
            <AppModal
              closeOnBackdrop
              onBackdropClose={closeAddModal}
              overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6 backdrop-blur-md dark:bg-black/45"
              panelClassName="flex max-h-[92vh] min-w-0 w-[min(100%,72rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
            >
              <>
                <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/88">
                  <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {t("inventory.stockEntry", "Stock entry")}
                      </div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">
                        {t("inventory.addFilament", "Add filament")}
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {t(
                          "inventory.addFilamentSubtitle",
                          "Add directly to stock, or keep the wishlist → on order → stock workflow.",
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeAddModal}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-base leading-none text-slate-600 shadow-sm shadow-slate-900/5 backdrop-blur-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/30 dark:hover:bg-slate-800/60"
                      aria-label={t("common.close", "Close")}
                      title={t("common.close", "Close")}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                  {error ? (
                    <FeedbackBanner tone="danger" className="mb-4">
                      {error}
                    </FeedbackBanner>
                  ) : null}

                  {!error && infoMessage ? (
                    <FeedbackBanner tone="success" className="mb-4">
                      {infoMessage}
                    </FeedbackBanner>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] xl:gap-5">
                    <div className="space-y-4">
                      <div className="surface-card space-y-4">
                        <div className="surface-subtle px-4 py-4">
                          <div className="flex flex-col gap-3.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <SegmentedChoiceRow
                                className="min-w-0 flex-1"
                                label={t("inventory.vendorSource", "Vendor source")}
                                labelWidthClassName="min-[920px]:w-32"
                                value={createMode}
                                onChange={setCreateMode}
                                options={[
                                  {
                                    value: "bambu",
                                    label: t("vendor.bambu", "Bambu"),
                                  },
                                  {
                                    value: "esun",
                                    label: t("vendor.esun", "eSUN"),
                                  },
                                  {
                                    value: "manual",
                                    label: t("vendor.generic", "Generic"),
                                  },
                                ]}
                              />
                              {isCatalogCreateMode ? (
                                <span className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200">
                                  {activeCatalogMasters.length}
                                </span>
                              ) : null}
                            </div>

                            {isCatalogCreateMode ? (
                              <>
                                <input
                                  type="search"
                                  value={
                                    createMode === "bambu"
                                      ? bambuCatalogQuery
                                      : esunCatalogQuery
                                  }
                                  onChange={(event) =>
                                    createMode === "bambu"
                                      ? setBambuCatalogQuery(event.target.value)
                                      : setEsunCatalogQuery(event.target.value)
                                  }
                                  placeholder={
                                    createMode === "bambu"
                                      ? t(
                                          "wishlist.searchBambu",
                                          "Search Bambu material/color",
                                        )
                                      : t(
                                          "wishlist.searchEsun",
                                          "Search eSUN material/color",
                                        )
                                  }
                                  className="page-header-search !w-full"
                                  disabled={!tauri}
                                />

                              </>
                            ) : null}
                          </div>
                        </div>

                        {isCatalogCreateMode ? (
                          <div className="space-y-3">
                            <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950/70 lg:max-h-[26rem] lg:overflow-y-auto">
                              {activeCatalogMasters.map((master) => {
                                const selected =
                                  createMode === "bambu"
                                    ? newBambuMasterId === master.id
                                    : newEsunMasterId === master.id;
                                const rowStyle = inventorySwatchInsetStyle(
                                  master.hex_color ?? null,
                                  resolvedTheme,
                                );
                                const selectedRowStyle = selected
                                  ? {
                                      ...rowStyle,
                                      borderColor: swatchRgba(
                                        master.hex_color ?? null,
                                        resolvedTheme === "dark" ? 0.54 : 0.36,
                                      ),
                                      boxShadow: `${rowStyle.boxShadow}, 0 0 0 2px ${swatchRgba(
                                        master.hex_color ?? null,
                                        resolvedTheme === "dark" ? 0.24 : 0.18,
                                      )}, 0 14px 28px -24px ${swatchRgba(
                                        master.hex_color ?? null,
                                        resolvedTheme === "dark" ? 0.54 : 0.42,
                                      )}`,
                                    }
                                  : rowStyle;

                                return (
                                  <button
                                    key={master.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => {
                                      if (createMode === "bambu") {
                                        setNewBambuMasterId(master.id);
                                      } else {
                                        setNewEsunMasterId(master.id);
                                      }
                                      setNewInitialWeight(String(master.default_weight));
                                    }}
                                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                                      selected
                                        ? "border-slate-900/20 ring-1 ring-slate-900/10 dark:border-slate-400/50 dark:ring-slate-400/20"
                                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500"
                                    }`}
                                    style={selectedRowStyle}
                                  >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                      <span
                                        className="h-8 w-8 shrink-0 rounded-md border border-slate-200 dark:border-slate-600"
                                        style={{
                                          background: `linear-gradient(145deg, ${toSwatchColor(
                                            master.hex_color,
                                          )} 0%, ${toSwatchColor(master.hex_color)}CC 60%, #0f172a26 100%)`,
                                        }}
                                      />
                                      <span className="min-w-0">
                                        <span
                                          className="block overflow-hidden break-words font-semibold leading-tight text-slate-900 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                                          title={formatMasterDisplayTitle(master)}
                                        >
                                          {formatMasterDisplayTitle(master)}
                                        </span>
                                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                          <VendorBadge vendor={master.vendor} compact />
                                          <span>{master.default_weight} g</span>
                                          {master.is_discontinued ? (
                                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-200">
                                              {t("common.discontinued", "Discontinued")}
                                            </span>
                                          ) : null}
                                        </span>
                                      </span>
                                    </span>

                                    {selected ? (
                                      <span className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm dark:border-slate-500 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-none">
                                        ✓ {t("common.selected", "Selected")}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}

                              {activeCatalogMasters.length === 0 ? (
                                <div className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400">
                                  {t(
                                    "inventory.noCatalogMatches",
                                    "No catalog entries match the current vendor filters.",
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80"
                              onClick={() => {
                                setCreateMode("manual");
                                const selectedCatalogMaster =
                                  createMode === "bambu" ? selectedBambuMaster : selectedEsunMaster;
                                const manualVendorPreset =
                                  createMode === "bambu" ? "Bambu" : "eSUN";
                                setManualVendor(manualVendorPreset);
                                if (selectedCatalogMaster) {
                                  setManualMaterial(selectedCatalogMaster.material);
                                }
                              }}
                            >
                              {t("wishlist.addMissingFilamentManual", "Missing filament? Add it manually")}
                            </button>
                          </div>
                        ) : null}

                        {createMode === "manual" ? (
                          <div className="surface-subtle p-4">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                              {t("inventory.manualDetails", "Manual details")}
                            </div>
                            <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                              {t(
                                "inventory.manualDetailsHelp",
                                "Use this when a filament is missing from the vendor catalog or you want a fully manual entry.",
                              )}
                            </div>

                            <div className="mt-4 space-y-3">
                              <div className="flex flex-wrap gap-2">
                                {["Bambu", "eSUN", "Generic"].map((vendorPreset) => (
                                  <button
                                    key={vendorPreset}
                                    type="button"
                                    onClick={() => setManualVendor(vendorPreset)}
                                    className={neutralChipClass(
                                      manualVendor.trim().toLowerCase() ===
                                        vendorPreset.toLowerCase(),
                                      "px-3 py-1 text-[11px]",
                                    )}
                                  >
                                    {vendorPreset}
                                  </button>
                                ))}
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <input
                                  type="text"
                                  value={manualVendor}
                                  onChange={(event) => setManualVendor(event.target.value)}
                                  placeholder={t("wishlist.vendorPlaceholder", "Vendor")}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                  disabled={!tauri}
                                />
                                <input
                                  type="text"
                                  value={manualMaterial}
                                  onChange={(event) => setManualMaterial(event.target.value)}
                                  placeholder={t("wishlist.materialPlaceholder", "Material")}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                  disabled={!tauri}
                                />
                                <input
                                  type="text"
                                  value={manualFilamentName}
                                  onChange={(event) => setManualFilamentName(event.target.value)}
                                  placeholder={t("wishlist.filamentName", "Filament name")}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                  disabled={!tauri}
                                />
                                <input
                                  type="text"
                                  value={manualColorName}
                                  onChange={(event) => setManualColorName(event.target.value)}
                                  placeholder={t("wishlist.colorName", "Color name")}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                  disabled={!tauri}
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={manualHexColor}
                                  onChange={(event) => setManualHexColor(event.target.value)}
                                  placeholder={t("wishlist.hexOptional", "Hex color")}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                  disabled={!tauri}
                                />
                                <input
                                  type="color"
                                  value={toSwatchColor(manualHexColor)}
                                  onChange={(event) => setManualHexColor(event.target.value)}
                                  className="h-10 w-12 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950/80"
                                  disabled={!tauri}
                                />
                                <span
                                  className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-600"
                                  style={{ backgroundColor: toSwatchColor(manualHexColor) }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                      </div>
                    </div>

                    <div className="space-y-4 self-start lg:sticky lg:top-0">
                      <div
                        className="rounded-2xl border border-slate-200 bg-white/85 p-4 transition dark:border-slate-700 dark:bg-slate-950/70"
                        style={currentCreatePanelStyle}
                      >
                        <div className="rounded-xl border border-slate-200/80 bg-white/65 p-3 dark:border-slate-700/80 dark:bg-slate-950/40">
                          <SegmentedChoiceRow
                            label={t("inventory.ownership", "Ownership")}
                            value={newOwnershipType}
                            onChange={setNewOwnershipType}
                            options={[
                              {
                                value: "OWNED",
                                label: t("inventory.ownedByUs", "Owned"),
                              },
                              {
                                value: "BORROWED_IN",
                                label: t("inventory.borrowedIn", "Borrowed in"),
                              },
                            ]}
                          />
                          <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {newOwnershipType === "BORROWED_IN"
                              ? t(
                                  "inventory.borrowedInHelp",
                                  "Register this spool as borrowed from someone else. It can still be used in printers, but it will not appear in loan-out candidates.",
                                )
                              : t("inventory.ownedByUsDetail", "Owned by us")}
                          </div>
                          {newOwnershipType === "BORROWED_IN" ? (
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                              <input
                                type="text"
                                value={borrowedFromName}
                                onChange={(event) => setBorrowedFromName(event.target.value)}
                                placeholder={t("inventory.borrowedFrom", "Borrowed from")}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                disabled={!tauri}
                              />
                              <input
                                type="text"
                                value={borrowedFromContact}
                                onChange={(event) => setBorrowedFromContact(event.target.value)}
                                placeholder={t(
                                  "inventory.ownerContactOptional",
                                  "Owner contact (optional)",
                                )}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                                disabled={!tauri}
                              />
                              <input
                                type="text"
                                value={borrowedInNote}
                                onChange={(event) => setBorrowedInNote(event.target.value)}
                                placeholder={t(
                                  "inventory.borrowedInNoteOptional",
                                  "Borrowed-in note (optional)",
                                )}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100 md:col-span-2"
                                disabled={!tauri}
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3">
                          <input
                            type="number"
                            value={newInitialWeight}
                            onChange={(event) => setNewInitialWeight(event.target.value)}
                            placeholder={t("inventory.initialWeight", "Initial weight (g)")}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                            disabled={!tauri}
                          />
                          <input
                            type="text"
                            value={newLocation}
                            onChange={(event) => setNewLocation(event.target.value)}
                            placeholder={t(
                              "inventory.homeLocationOptional",
                              "Home location (optional)",
                            )}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                            disabled={!tauri}
                          />
                        </div>
                        <button
                          type="button"
                          className={`mt-4 w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                            currentCreateActionStyle
                              ? "shadow-sm"
                              : "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                          }`}
                          style={currentCreateActionStyle}
                          onClick={handleCreateSpool}
                          disabled={disableCreate}
                        >
                          {newOwnershipType === "BORROWED_IN"
                            ? t("inventory.registerBorrowedIn", "Register borrowed-in spool")
                            : t("inventory.addSpool", "Add spool to inventory")}
                        </button>

                        <div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                          <button
                            type="button"
                            className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                              currentCreateActionStyle
                                ? "shadow-sm"
                                : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100"
                            }`}
                            style={currentCreateActionStyle}
                            onClick={handleAddCurrentToWishlist}
                            disabled={disableWishlistCreate}
                          >
                            {t(
                              "inventory.addCurrentSelectionToWishlist",
                              "Add current selection to wishlist",
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="surface-card space-y-4">
                        <div className="surface-subtle p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                                {t("inventory.wishlistOrders", "Wishlist & orders")}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                {t(
                                  "inventory.wishlistQueueHelp",
                                  "Keep planned purchases here, move them to on order, then stock them when they arrive.",
                                )}
                              </div>
                            </div>
                          </div>
                          <SegmentedChoiceRow
                            className="mt-4"
                            value={wishlistQueueFilter}
                            onChange={setWishlistQueueFilter}
                            options={[
                              {
                                value: "ALL",
                                label: t("common.all", "All"),
                                count: wishlistQueueSummary.all,
                              },
                              {
                                value: "WISHLIST",
                                label: t("wishlist.statusWishlist", "Wishlist"),
                                count: wishlistQueueSummary.wishlist,
                              },
                              {
                                value: "ON_ORDER",
                                label: t("wishlist.statusOnOrder", "On order"),
                                count: wishlistQueueSummary.onOrder,
                              },
                              {
                                value: "RECEIVED",
                                label: t("wishlist.statusReceived", "Received"),
                                count: wishlistQueueSummary.received,
                              },
                            ]}
                          />
                        </div>

                        {wishlistLoading ? (
                          <div className="surface-subtle border-dashed px-4 py-3 text-xs text-slate-500 dark:text-slate-300">
                            {t("wishlist.loading", "Loading wishlist...")}
                          </div>
                        ) : null}
                        {!wishlistLoading && wishlistItems.length === 0 ? (
                          <div className="surface-subtle border-dashed px-4 py-3 text-xs text-slate-500 dark:text-slate-300">
                            {t("wishlist.empty", "No wishlist items yet.")}
                          </div>
                        ) : null}
                        {!wishlistLoading &&
                        wishlistItems.length > 0 &&
                        visibleWishlistItems.length === 0 ? (
                          <div className="surface-subtle border-dashed px-4 py-3 text-xs text-slate-500 dark:text-slate-300">
                            {t(
                              "wishlist.noneFiltered",
                              "No items match the selected status filter.",
                            )}
                          </div>
                        ) : null}

                        <div className="space-y-2 lg:max-h-[32rem] lg:overflow-y-auto lg:pr-1">
                          {visibleWishlistItems.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-slate-200 p-3.5 text-xs shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:shadow-none"
                              style={inventorySwatchInsetStyle(
                                item.master_id
                                  ? catalogMasterById.get(item.master_id)?.hex_color ?? null
                                  : null,
                                resolvedTheme,
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <span
                                  className="h-12 w-12 shrink-0 rounded-2xl border border-white/70 shadow-inner shadow-white/30 dark:border-white/10 dark:shadow-black/30"
                                  style={{
                                    backgroundColor: toSwatchColor(
                                      item.master_id
                                        ? catalogMasterById.get(item.master_id)?.hex_color ?? null
                                        : null,
                                    ),
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                                    {formatInventoryDisplayTitle(
                                      item.material,
                                      item.filament_name,
                                      item.color_name,
                                    )}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <VendorBadge vendor={item.vendor} compact />
                                    <span className={semanticChipClass("info", "px-3 py-1 text-[11px]")}>
                                      {t("wishlist.qty", "Qty")} {item.quantity}
                                    </span>
                                  </div>
                                  {item.note ? (
                                    <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                                      {item.note}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-4 border-t border-slate-200/80 pt-3 dark:border-slate-700/80">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                  {t("inventory.status", "Status")}
                                </div>
                                <div className={segmentedChoiceGroupClass("mt-2")}>
                                  {([
                                    ["WISHLIST", t("wishlist.statusWishlist", "Wishlist")],
                                    ["ON_ORDER", t("wishlist.statusOnOrder", "On order")],
                                    ["RECEIVED", t("wishlist.statusReceived", "Received")],
                                  ] as const).map(([value, label]) => (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => handleWishlistStatus(item.id, value)}
                                      disabled={!tauri || busy || item.status === value}
                                      className={`${segmentedChoiceButtonClass(
                                        item.status === value,
                                        "px-3 py-1.5 text-[11px]",
                                      )} disabled:cursor-not-allowed disabled:opacity-50`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                                    onClick={() => handleStockFromWishlist(item)}
                                    disabled={!tauri || busy}
                                  >
                                    {t("inventory.stockRollNow", "Stock roll now")}
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900/80"
                                    onClick={() => handleDeleteWishlistItem(item.id)}
                                    disabled={!tauri || busy}
                                  >
                                    {confirmWishlistRemoveId === item.id
                                      ? t("wishlist.confirmRemoveAction", "Confirm remove")
                                      : t("common.remove", "Remove")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            </AppModal>
          ) : null}

      </div>
    </div>
  );
}
