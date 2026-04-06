import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanOutModal } from "../components/loan_out_modal";
import { RollUsageChart } from "../components/roll_usage_chart";
import { VendorBadge } from "../components/vendor_badge";
import { WeightInput } from "../components/weight_input";
import { neutralChipClass, semanticChipClass } from "../lib/chip_styles";
import {
  buildFilamentLabelHtml,
  buildFilamentLabelQrDataUrl,
} from "../lib/filament_label_print";
import { buildCompanionSpoolQrPayload } from "../lib/filament_qr_payload";
import { useI18n } from "../lib/i18n";
import { LOW_STOCK_GRAMS } from "../lib/inventory_constants";
import { materialTone } from "../lib/material_theme";
import { useResolvedTheme, type ResolvedTheme } from "../lib/theme_mode";
import {
  formatPrinterSlotLabelForModel,
  sortPrinterSlotsExtLast,
} from "../lib/printer_profiles";
import {
  createManualSpool,
  createSpool,
  createWishlistItem,
  deleteSpool,
  deleteWishlistItem,
  getTrustedLanCompanionStatus,
  isTauri,
  listActiveSpoolLoans,
  listMasterCatalog,
  listPrinterOverview,
  listWishlistItems,
  listSpoolHistory,
  listSpoolUsage,
  listSpools,
  printLabelHtml,
  purgeSpool,
  recordPrintUsage,
  type ActiveSpoolLoanRow,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type SpoolHistoryEventRow,
  type SpoolUsagePointRow,
  type WishlistItemRow,
  updateMasterCatalogEntry,
  updateSpoolDetails,
  updateSpoolStatus,
  updateSpoolWeight,
  updateWishlistItemStatus,
} from "../lib/tauri_client";

type SpoolStatus = "IN_STOCK" | "IN_USE" | "BORROWED" | "EMPTY" | "LOST";
type StatusFilter = "ALL" | SpoolStatus;
type OwnershipType = "OWNED" | "BORROWED_IN";
type OwnershipFilter = "ALL" | OwnershipType;
type CreateMode = "bambu" | "esun" | "manual";
type BambuCatalogFilter = "ALL" | "ACTIVE" | "DISCONTINUED";
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

type InventorySpool = {
  id: string;
  masterId: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  initialWeightGrams: number;
  status: SpoolStatus;
  ownershipType: OwnershipType;
  ownerName?: string | null;
  ownerContact?: string | null;
  ownershipNote?: string | null;
  remainingGrams?: number | null;
  location?: string | null;
  qrCode?: string | null;
};

type SpoolGroup = {
  key: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  ownershipType: OwnershipType;
  ownerName?: string | null;
  totalRemaining: number;
  rolls: InventorySpool[];
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
};

type SegmentedChoiceOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

const statuses: ReadonlyArray<StatusFilter> = [
  "ALL",
  "IN_STOCK",
  "IN_USE",
  "BORROWED",
  "EMPTY",
  "LOST",
];
const ownershipFilters: ReadonlyArray<OwnershipFilter> = [
  "ALL",
  "OWNED",
  "BORROWED_IN",
];
const bambuCatalogFilters: ReadonlyArray<BambuCatalogFilter> = [
  "ALL",
  "ACTIVE",
  "DISCONTINUED",
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

function normalizeStatus(status: string): SpoolStatus {
  const upper = status.toUpperCase();
  if (
    upper === "IN_USE" ||
    upper === "BORROWED" ||
    upper === "EMPTY" ||
    upper === "LOST"
  ) {
    return upper;
  }
  return "IN_STOCK";
}

function normalizeOwnershipType(raw?: string | null): OwnershipType {
  const normalized = (raw ?? "").trim().toUpperCase().replaceAll("-", "_");
  if (normalized === "BORROWED_IN") {
    return "BORROWED_IN";
  }
  return "OWNED";
}

function toSwatchColor(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "#CBD5E1";
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value}`;
  }
  return "#CBD5E1";
}

function hexToRgb(raw?: string | null): [number, number, number] | null {
  const normalized = toSwatchColor(raw).replace("#", "");
  if (normalized.length === 3) {
    const expanded = normalized
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  if (normalized.length === 6) {
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  return null;
}

function swatchRgba(raw: string | null | undefined, alpha: number): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return `rgba(203, 213, 225, ${alpha})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
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

function swatchTextColor(raw: string | null | undefined): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "#FFFFFF";
  }
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness >= 170 ? "#0F172A" : "#FFFFFF";
}

function blendSwatchColor(
  raw: string | null | undefined,
  target: [number, number, number],
  amount: number,
): string {
  const rgb = hexToRgb(raw) ?? [51, 65, 85];
  const mixed = rgb.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount),
  ) as [number, number, number];
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
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

function isValidHex(raw?: string | null): boolean {
  const value = (raw ?? "").trim();
  return (
    /^#[0-9a-fA-F]{3}$/.test(value) ||
    /^#[0-9a-fA-F]{6}$/.test(value) ||
    /^[0-9a-fA-F]{3}$/.test(value) ||
    /^[0-9a-fA-F]{6}$/.test(value)
  );
}

function parseWeight(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function formatGrams(value?: number | null): string {
  if (value == null) {
    return "—";
  }
  if (value <= 0) {
    return "0 g";
  }
  return `${value} g`;
}

function formatDateTime(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleString();
}

function formatMasterDisplayTitle(master: MasterCatalogRow): string {
  return formatInventoryDisplayTitle(
    master.material,
    master.filament_name,
    master.color_name,
  );
}

function normalizeDisplayToken(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitDisplayTokens(value?: string | null): string[] {
  const normalized = normalizeDisplayToken(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function tokenStartsWithToken(baseToken: string, nextToken: string): boolean {
  const base = baseToken.trim().toLowerCase();
  const next = nextToken.trim().toLowerCase();
  if (!base || !next) {
    return false;
  }
  return (
    next === base ||
    next.startsWith(`${base} `) ||
    next.startsWith(`${base}-`) ||
    next.startsWith(`${base}+`) ||
    next.startsWith(`${base}/`)
  );
}

function formatInventoryDisplayTitle(
  materialRaw?: string | null,
  filamentRaw?: string | null,
  colorRaw?: string | null,
): string {
  const tokens = [
    ...splitDisplayTokens(materialRaw),
    ...splitDisplayTokens(filamentRaw),
    ...splitDisplayTokens(colorRaw),
  ].filter((token, index, allTokens) => {
    if (index === 0) {
      return true;
    }
    return allTokens[index - 1].toLowerCase() !== token.toLowerCase();
  });

  if (tokens.length >= 2 && tokenStartsWithToken(tokens[0], tokens[1])) {
    tokens.shift();
  }

  return tokens.length > 0 ? tokens.join(" · ") : "—";
}

function formatRollReference(spool: Pick<InventorySpool, "id">): string {
  const normalizedId = spool.id.replace(/^spool_/, "");
  return `#${normalizedId.slice(-6)}`;
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function payloadString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function payloadNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function fallbackEventLabel(eventType: string): string {
  return eventType
    .toLowerCase()
    .split("_")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

function historyPayloadText(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function commandErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  if (typeof error === "string" && error.trim()) {
    return `${fallback} (${error})`;
  }
  return fallback;
}

export default function InventoryPage({
  navigationIntent = null,
  onConsumeNavigationIntent,
}: InventoryPageProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [materialFilter, setMaterialFilter] = useState("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [inventoryView, setInventoryView] = useState<InventoryViewMode>("CARDS");
  const [spools, setSpools] = useState<InventorySpool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [recentlyAddedSpoolId, setRecentlyAddedSpoolId] = useState<string | null>(null);

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
  const [showLoanTrackingModal, setShowLoanTrackingModal] = useState(false);
  const [loanTrackingSpoolId, setLoanTrackingSpoolId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("bambu");
  const [bambuCatalogQuery, setBambuCatalogQuery] = useState("");
  const [bambuCatalogFilter, setBambuCatalogFilter] =
    useState<BambuCatalogFilter>("ALL");
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
  const [wishlistQuantity, setWishlistQuantity] = useState("1");
  const [wishlistNote, setWishlistNote] = useState("");
  const [wishlistQueueFilter, setWishlistQueueFilter] =
    useState<WishlistQueueFilter>("WISHLIST");
  const [confirmWishlistRemoveId, setConfirmWishlistRemoveId] = useState<string | null>(null);

  const [esunCatalogQuery, setEsunCatalogQuery] = useState("");
  const [esunCatalogFilter, setEsunCatalogFilter] =
    useState<BambuCatalogFilter>("ALL");
  const [newEsunMasterId, setNewEsunMasterId] = useState("");

  const [masterEditUnlocked, setMasterEditUnlocked] = useState(false);
  const [editMasterVendor, setEditMasterVendor] = useState("");
  const [editMasterMaterial, setEditMasterMaterial] = useState("");
  const [editMasterFilamentName, setEditMasterFilamentName] = useState("");
  const [editMasterColorName, setEditMasterColorName] = useState("");
  const [editMasterHexColor, setEditMasterHexColor] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [selectedSpoolQrDataUrl, setSelectedSpoolQrDataUrl] = useState<string | null>(
    null,
  );
  const [selectedSpoolQrLoading, setSelectedSpoolQrLoading] = useState(false);

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
      measuredRemaining: number,
      jobName?: string | null,
    ) => {
      const safeMeasured = Math.max(0, Math.round(measuredRemaining));
      if (previousRemaining != null && Number.isFinite(previousRemaining)) {
        const baseline = Math.max(0, Math.round(previousRemaining));
        const usedGrams = Math.max(0, baseline - safeMeasured);
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
        if (safeMeasured !== baseline) {
          await updateSpoolWeight(spoolId, safeMeasured);
        }
        return;
      }
      await updateSpoolWeight(spoolId, safeMeasured);
    },
    [],
  );

  const reloadSpools = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    try {
      const rows = await listSpools(1200, 0);
      setSpools(
        rows.map((row) => {
          const fallbackInitial =
            Number.isFinite(row.master.default_weight) && row.master.default_weight > 0
              ? row.master.default_weight
              : 1000;
          return {
            id: row.spool.id,
            masterId: row.spool.master_id,
            vendor: row.master.vendor,
            material: row.master.material,
            filamentName: row.master.filament_name,
            colorName: row.master.color_name,
            hexColor: row.master.hex_color,
            initialWeightGrams:
              row.spool.initial_weight_g && row.spool.initial_weight_g > 0
                ? row.spool.initial_weight_g
                : fallbackInitial,
            status: normalizeStatus(row.spool.status),
            ownershipType: normalizeOwnershipType(row.spool.ownership_type),
            ownerName: row.spool.owner_name ?? null,
            ownerContact: row.spool.owner_contact ?? null,
            ownershipNote: row.spool.ownership_note ?? null,
            remainingGrams: row.spool.remaining_g ?? null,
            location: row.spool.location_id ?? null,
            qrCode: row.spool.qr_code ?? null,
          };
        }),
      );
    } catch (loadError) {
      console.error(loadError);
      setError(t("inventory.error.loadSpools", "Could not load inventory spools."));
    } finally {
      setLoading(false);
    }
  }, [t, tauri]);

  const reloadCatalog = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const rows = await listMasterCatalog(1000);
      setMasters(rows);
      if (!newBambuMasterId && rows.length > 0) {
        const firstBambu = rows.find((row) =>
          row.vendor.toLowerCase().includes("bambu"),
        );
        setNewBambuMasterId(firstBambu?.id ?? rows[0].id);
      }
      if (!newEsunMasterId && rows.length > 0) {
        const firstEsun = rows.find((row) =>
          row.vendor.toLowerCase().includes("esun"),
        );
        setNewEsunMasterId(firstEsun?.id ?? "");
      }
    } catch (catalogError) {
      console.error(catalogError);
      setError(t("wishlist.error.loadCatalog", "Could not load master catalog."));
    }
  }, [newBambuMasterId, newEsunMasterId, t, tauri]);

  const reloadWishlist = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setWishlistLoading(true);
    try {
      const rows = await listWishlistItems(500);
      setWishlistItems(rows);
    } catch (wishlistError) {
      console.error(wishlistError);
      setWishlistItems([]);
    } finally {
      setWishlistLoading(false);
    }
  }, [tauri]);

  const reloadActiveLoans = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const rows = await listActiveSpoolLoans();
      setActiveLoans(rows);
    } catch (loanError) {
      console.error(loanError);
      setActiveLoans([]);
    }
  }, [tauri]);

  const reloadPrinterOverview = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const rows = await listPrinterOverview();
      setPrinterOverview(
        rows.map((printer) => ({
          ...printer,
          slots: sortPrinterSlotsExtLast(printer.slots),
        })),
      );
    } catch (overviewError) {
      console.error(overviewError);
      setPrinterOverview([]);
    }
  }, [tauri]);

  const reloadHistory = useCallback(
    async (spoolId: string) => {
      if (!tauri) {
        return;
      }
      setHistoryLoading(true);
      try {
        const rows = await listSpoolHistory(spoolId, 80);
        setHistoryRows(rows);
      } catch (historyError) {
        console.error(historyError);
        setHistoryRows([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [tauri],
  );

  const reloadUsage = useCallback(
    async (spoolId: string) => {
      if (!tauri) {
        return;
      }
      setUsageLoading(true);
      try {
        const rows = await listSpoolUsage(spoolId, 500);
        setUsagePoints(rows);
      } catch (usageError) {
        console.error(usageError);
        setUsagePoints([]);
      } finally {
        setUsageLoading(false);
      }
    },
    [tauri],
  );

  useEffect(() => {
    if (!tauri) {
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
    tauri,
  ]);

  const vendorOptions = useMemo(() => {
    const values = new Set<string>();
    for (const spool of spools) {
      const vendor = (spool.vendor || "").trim();
      if (vendor) {
        values.add(vendor);
      }
    }
    return ["ALL", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [spools]);

  const materialOptions = useMemo(() => {
    const values = new Set<string>();
    for (const spool of spools) {
      const material = spool.material.trim();
      if (material) {
        values.add(material);
      }
    }
    return ["ALL", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [spools]);

  const filteredSpools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return spools.filter((spool) => {
      const statusMatch =
        statusFilter === "ALL" ? true : spool.status === statusFilter;
      const ownershipMatch =
        ownershipFilter === "ALL" ? true : spool.ownershipType === ownershipFilter;
      const materialMatch =
        materialFilter === "ALL" ? true : spool.material === materialFilter;
      const vendorMatch =
        vendorFilter === "ALL" ? true : spool.vendor === vendorFilter;
      const lowStockMatch = lowStockOnly
        ? (spool.remainingGrams ?? 9_999_999) < LOW_STOCK_GRAMS
        : true;
      const searchMatch =
        term.length === 0
          ? true
          : `${spool.material} ${spool.filamentName} ${spool.colorName} ${spool.location ?? ""} ${
              spool.qrCode ?? ""
            } ${spool.ownerName ?? ""} ${spool.ownerContact ?? ""} ${
              spool.ownershipType === "BORROWED_IN" ? "borrowed in" : "owned"
            }`
              .toLowerCase()
              .includes(term);
      return (
        statusMatch &&
        ownershipMatch &&
        materialMatch &&
        vendorMatch &&
        lowStockMatch &&
        searchMatch
      );
    });
  }, [
    lowStockOnly,
    materialFilter,
    ownershipFilter,
    search,
    spools,
    statusFilter,
    vendorFilter,
  ]);

  const groupedSpools = useMemo<SpoolGroup[]>(() => {
    const index = new Map<string, SpoolGroup>();
    for (const spool of filteredSpools) {
      const key = `${spool.vendor}|${spool.material}|${spool.filamentName}|${spool.colorName}|${
        spool.hexColor ?? ""
      }|${spool.ownershipType}|${spool.ownerName ?? ""}`;
      if (!index.has(key)) {
        index.set(key, {
          key,
          vendor: spool.vendor,
          material: spool.material,
          filamentName: spool.filamentName,
          colorName: spool.colorName,
          hexColor: spool.hexColor,
          ownershipType: spool.ownershipType,
          ownerName: spool.ownerName ?? null,
          totalRemaining: 0,
          rolls: [],
        });
      }
      const group = index.get(key);
      if (!group) {
        continue;
      }
      group.rolls.push(spool);
      group.totalRemaining += spool.remainingGrams ?? 0;
    }
    return Array.from(index.values()).sort((left, right) => {
      if (left.material !== right.material) {
        return left.material.localeCompare(right.material);
      }
      if (left.filamentName !== right.filamentName) {
        return left.filamentName.localeCompare(right.filamentName);
      }
      return left.colorName.localeCompare(right.colorName);
    });
  }, [filteredSpools]);

  const selectedSpool = useMemo(
    () => spools.find((spool) => spool.id === selectedSpoolId) ?? null,
    [selectedSpoolId, spools],
  );

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
      if (status === "IN_USE") {
        return t("inventory.statusInUse", "In use");
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
    if (status === "IN_USE") {
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
    (eventType: string) => {
      if (eventType === "WEIGHT_UPDATED") {
        return t("inventory.historyEvent.weightUpdated", "Weight updated");
      }
      if (eventType === "STATUS_UPDATED") {
        return t("inventory.historyEvent.statusUpdated", "Status updated");
      }
      if (eventType === "USED_UP") {
        return t("inventory.historyEvent.usedUp", "Marked empty");
      }
      if (eventType === "LOCATION_UPDATED") {
        return t("inventory.historyEvent.locationUpdated", "Location updated");
      }
      if (eventType === "DETAILS_UPDATED") {
        return t("inventory.historyEvent.detailsUpdated", "Details updated");
      }
      if (eventType === "ASSIGNED_TO_AMS") {
        return t("inventory.historyEvent.assignedToAms", "Assigned to printer slot");
      }
      if (eventType === "PRINT_JOB_RECORDED") {
        return t("inventory.historyEvent.printJobRecorded", "Print usage logged");
      }
      if (eventType === "LOANED_OUT") {
        return t("inventory.historyEvent.loanedOut", "Loaned out");
      }
      if (eventType === "LOAN_RETURNED") {
        return t("inventory.historyEvent.loanReturned", "Loan returned");
      }
      if (eventType === "BORROWED_IN_REGISTERED") {
        return t("inventory.historyEvent.borrowedInRegistered", "Borrowed in registered");
      }
      if (eventType === "BORROWED_IN_RETURNED") {
        return t("inventory.historyEvent.borrowedInReturned", "Borrowed in handed back");
      }
      if (eventType === "DELETED") {
        return t("inventory.historyEvent.deleted", "Deleted");
      }
      return fallbackEventLabel(eventType);
    },
    [t],
  );

  const formatHistoryEventDetails = useCallback(
    (event: SpoolHistoryEventRow) => {
      const payload = payloadRecord(event.payload_json);
      if (!payload) {
        const raw = historyPayloadText(event.payload_json);
        return raw || "—";
      }
      if (event.event_type === "WEIGHT_UPDATED") {
        const grams = payloadNumber(payload, "grams");
        const source = payloadString(payload, "source");
        const gramsText = grams == null ? "—" : `${grams} g`;
        return `${gramsText}${source ? ` · ${source.replace(/_/g, " ")}` : ""}`;
      }
      if (event.event_type === "STATUS_UPDATED" || event.event_type === "USED_UP") {
        const status = payloadString(payload, "status");
        return status
          ? `${t("inventory.status", "Status")}: ${formatStatusLabel(status)}`
          : historyPayloadText(payload);
      }
      if (event.event_type === "LOCATION_UPDATED" || event.event_type === "DETAILS_UPDATED") {
        const details: string[] = [];
        const status = payloadString(payload, "status");
        const location = payloadString(payload, "location");
        const qrCode = payloadString(payload, "qr_code");
        const ownerName = payloadString(payload, "owner_name");
        const ownerContact = payloadString(payload, "owner_contact");
        const ownershipNote = payloadString(payload, "ownership_note");
        if (status) {
          details.push(`${t("inventory.status", "Status")}: ${formatStatusLabel(status)}`);
        }
        if (location || Object.prototype.hasOwnProperty.call(payload, "location")) {
          details.push(
            `${t("inventory.location", "Location")}: ${
              location ?? t("inventory.unassigned", "Unassigned")
            }`,
          );
        }
        if (qrCode) {
          details.push(`${t("inventory.qrCode", "QR code")}: ${qrCode}`);
        }
        if (ownerName) {
          details.push(`${t("inventory.borrowedFrom", "Borrowed from")}: ${ownerName}`);
        }
        if (ownerContact) {
          details.push(ownerContact);
        }
        if (ownershipNote) {
          details.push(ownershipNote);
        }
        return details.join(" · ") || historyPayloadText(payload);
      }
      if (event.event_type === "ASSIGNED_TO_AMS") {
        const printerId = payloadString(payload, "printer_id");
        const slotId = payloadString(payload, "slot_id");
        const printerName =
          (printerId ? printerNameById.get(printerId) : null) ??
          printerId ??
          t("common.unknown", "Unknown");
        const slotLabel =
          (slotId ? slotLabelById.get(slotId) : null) ?? slotId ?? t("common.unknown", "Unknown");
        return slotLabel.includes(printerName) ? slotLabel : `${printerName} · ${slotLabel}`;
      }
      if (event.event_type === "PRINT_JOB_RECORDED") {
        const printerId = payloadString(payload, "printer_id");
        const printerName =
          (printerId ? printerNameById.get(printerId) : null) ??
          printerId ??
          t("common.unknown", "Unknown");
        const used = payloadNumber(payload, "used_grams");
        const remaining = payloadNumber(payload, "remaining_g");
        const jobName = payloadString(payload, "job_name");
        const parts = [printerName];
        if (used != null) {
          parts.push(`${t("printers.used", "Used")}: ${used} g`);
        }
        if (remaining != null) {
          parts.push(`${t("inventory.remaining", "Remaining")}: ${remaining} g`);
        }
        if (jobName) {
          parts.push(`Job: ${jobName}`);
        }
        return parts.join(" · ");
      }
      if (event.event_type === "LOANED_OUT") {
        const borrower = payloadString(payload, "borrower_name");
        const gramsOut = payloadNumber(payload, "grams_out");
        const parts: string[] = [];
        if (borrower) {
          parts.push(`${t("loans.borrower", "Borrower")}: ${borrower}`);
        }
        if (gramsOut != null) {
          parts.push(`${t("inventory.out", "Out")}: ${gramsOut} g`);
        }
        return parts.join(" · ") || historyPayloadText(payload);
      }
      if (event.event_type === "LOAN_RETURNED") {
        const borrower = payloadString(payload, "borrower_name");
        const returned = payloadNumber(payload, "returned_grams");
        const consumed = payloadNumber(payload, "consumed_grams");
        const parts: string[] = [];
        if (borrower) {
          parts.push(`${t("loans.borrower", "Borrower")}: ${borrower}`);
        }
        if (returned != null) {
          parts.push(`${t("loans.returned", "Returned")}: ${returned} g`);
        }
        if (consumed != null) {
          parts.push(`${t("loans.consumed", "Consumed")}: ${consumed} g`);
        }
        return parts.join(" · ") || historyPayloadText(payload);
      }
      if (event.event_type === "BORROWED_IN_REGISTERED") {
        const ownerName = payloadString(payload, "owner_name");
        const ownerContact = payloadString(payload, "owner_contact");
        const gramsOut = payloadNumber(payload, "grams_out");
        const parts: string[] = [];
        if (ownerName) {
          parts.push(`${t("inventory.borrowedFrom", "Borrowed from")}: ${ownerName}`);
        }
        if (ownerContact) {
          parts.push(ownerContact);
        }
        if (gramsOut != null) {
          parts.push(`${t("inventory.initialWeight", "Initial weight (g)")}: ${gramsOut} g`);
        }
        return parts.join(" · ") || historyPayloadText(payload);
      }
      if (event.event_type === "BORROWED_IN_RETURNED") {
        const counterparty = payloadString(payload, "counterparty_name");
        const returned = payloadNumber(payload, "returned_grams");
        const consumed = payloadNumber(payload, "consumed_grams");
        const parts: string[] = [];
        if (counterparty) {
          parts.push(`${t("inventory.borrowedFrom", "Borrowed from")}: ${counterparty}`);
        }
        if (returned != null) {
          parts.push(`${t("loans.returned", "Returned")}: ${returned} g`);
        }
        if (consumed != null) {
          parts.push(`${t("loans.consumed", "Consumed")}: ${consumed} g`);
        }
        return parts.join(" · ") || historyPayloadText(payload);
      }
      if (event.event_type === "DELETED") {
        const reason = payloadString(payload, "reason");
        if (reason) {
          return reason;
        }
      }
      return historyPayloadText(payload) || "—";
    },
    [formatStatusLabel, printerNameById, slotLabelById, t],
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

  const selectRollForManage = useCallback((spoolId: string) => {
    setSelectedSpoolId(spoolId);
    setSidePanelMode("MANAGE");
    setShowRollModal(true);
  }, []);

  const openAddModal = useCallback(() => {
    setSidePanelMode("ADD");
    setWishlistQueueFilter("WISHLIST");
    setNewOwnershipType("OWNED");
    setBorrowedFromName("");
    setBorrowedFromContact("");
    setBorrowedInNote("");
    setShowAddModal(true);
  }, []);

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
    const preferredSpool =
      selectedSpool && loanTrackingCandidates.some((spool) => spool.id === selectedSpool.id)
        ? selectedSpool
        : loanTrackingCandidates[0] ?? null;
    setLoanTrackingSpoolId(preferredSpool?.id ?? null);
    setShowLoanTrackingModal(true);
  }, [loanTrackingCandidates, selectedSpool]);

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
      setShowRollModal(false);
      return;
    }
    setMasterEditUnlocked(false);
    setEditMasterVendor(selectedSpool.vendor);
    setEditMasterMaterial(selectedSpool.material);
    setEditMasterFilamentName(selectedSpool.filamentName);
    setEditMasterColorName(selectedSpool.colorName);
    setEditMasterHexColor(selectedSpool.hexColor ?? "");
    setConfirmDelete(false);
    setConfirmPurge(false);
    void reloadHistory(selectedSpool.id);
    void reloadUsage(selectedSpool.id);
  }, [reloadHistory, reloadUsage, selectedSpool]);

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

  const buildSpoolQrArtifacts = useCallback(async (spool: InventorySpool) => {
    const qrReference = spool.id.trim();
    const trustedLanStatus = await getTrustedLanCompanionStatus().catch(() => null);
    const qrPayload = buildCompanionSpoolQrPayload(
      qrReference,
      trustedLanStatus?.shell_url ?? null,
    );
    const qrDataUrl = await buildFilamentLabelQrDataUrl(qrPayload);
    return {
      qrReference,
      qrPayload,
      qrDataUrl,
    };
  }, []);

  useEffect(() => {
    if (!selectedSpool || !showRollModal) {
      setSelectedSpoolQrDataUrl(null);
      setSelectedSpoolQrLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedSpoolQrLoading(true);

    void buildSpoolQrArtifacts(selectedSpool)
      .then(({ qrDataUrl }) => {
        if (cancelled) {
          return;
        }
        setSelectedSpoolQrDataUrl(qrDataUrl);
        setSelectedSpoolQrLoading(false);
      })
      .catch((qrError) => {
        console.error(qrError);
        if (cancelled) {
          return;
        }
        setSelectedSpoolQrDataUrl(null);
        setSelectedSpoolQrLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildSpoolQrArtifacts, selectedSpool, showRollModal]);

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
      const stateMatch =
        bambuCatalogFilter === "ALL"
          ? true
          : bambuCatalogFilter === "ACTIVE"
            ? !master.is_discontinued
            : master.is_discontinued;
      const textMatch =
        term.length === 0
          ? true
          : `${master.material} ${master.filament_name} ${master.color_name}`
              .toLowerCase()
              .includes(term);
      return stateMatch && textMatch;
    });
  }, [bambuCatalogFilter, bambuCatalogQuery, bambuMasters]);

  const selectedBambuMaster = useMemo(() => {
    const fromId = masters.find((master) => master.id === newBambuMasterId) ?? null;
    if (fromId) {
      return fromId;
    }
    return filteredBambuMasters[0] ?? null;
  }, [filteredBambuMasters, masters, newBambuMasterId]);

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
      const stateMatch =
        esunCatalogFilter === "ALL"
          ? true
          : esunCatalogFilter === "ACTIVE"
            ? !master.is_discontinued
            : master.is_discontinued;
      const textMatch =
        term.length === 0
          ? true
          : `${master.material} ${master.filament_name} ${master.color_name}`
              .toLowerCase()
              .includes(term);
      return stateMatch && textMatch;
    });
  }, [esunCatalogFilter, esunCatalogQuery, esunMasters]);

  const selectedEsunMaster = useMemo(() => {
    const fromId = masters.find((master) => master.id === newEsunMasterId) ?? null;
    if (fromId) {
      return fromId;
    }
    return filteredEsunMasters[0] ?? null;
  }, [filteredEsunMasters, masters, newEsunMasterId]);

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
        const initialWeight = parseWeight(
          newInitialWeight,
          selectedBambuMaster.default_weight,
        );
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
          location_id: null,
          purchase_date: null,
          purchase_price: null,
          batch_code: null,
        });
        if (newLocation.trim()) {
          await updateSpoolDetails({
            spool_id: id,
            qr_code: null,
            status: "IN_STOCK",
            location: newLocation.trim(),
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
        const initialWeight = parseWeight(
          newInitialWeight,
          selectedEsunMaster.default_weight,
        );
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
          location_id: null,
          purchase_date: null,
          purchase_price: null,
          batch_code: null,
        });
        if (newLocation.trim()) {
          await updateSpoolDetails({
            spool_id: id,
            qr_code: null,
            status: "IN_STOCK",
            location: newLocation.trim(),
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
        const initialWeight = parseWeight(newInitialWeight, 1000);
        await createManualSpool({
          id,
          vendor: manualVendor.trim() || "Generic",
          material: manualMaterial.trim() || "PLA",
          filament_name: manualFilamentName.trim(),
          color_name: manualColorName.trim(),
          hex_color: isValidHex(manualHexColor) ? toSwatchColor(manualHexColor) : null,
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

      await reloadSpools();
      await reloadCatalog();
      setSelectedSpoolId(id);
      setRecentlyAddedSpoolId(id);
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
      setSidePanelMode("MANAGE");
      setShowAddModal(false);
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
    const quantity = Number.parseInt(wishlistQuantity, 10);

    setBusy(true);
    setError(null);
    try {
      await createWishlistItem({
        id: `wish_${Date.now()}`,
        master_id: draft.master_id ?? null,
        vendor: draft.vendor,
        material: draft.material,
        filament_name: draft.filament_name,
        color_name: draft.color_name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        note: wishlistNote.trim() || null,
      });
      await reloadWishlist();
      setWishlistNote("");
    } catch (wishlistError) {
      console.error(wishlistError);
      setError(t("wishlist.error.add", "Failed to add wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWishlistStatus(itemId: string, status: WishlistStatus) {
    if (!tauri || busy) {
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    try {
      await updateWishlistItemStatus({
        item_id: itemId,
        status,
      });
      await reloadWishlist();
    } catch (statusError) {
      console.error(statusError);
      setError(t("wishlist.error.updateStatus", "Failed to update wishlist status."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWishlistItem(itemId: string) {
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
      await deleteWishlistItem(itemId);
      await reloadWishlist();
    } catch (deleteError) {
      console.error(deleteError);
      setError(t("wishlist.error.delete", "Failed to delete wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleStockFromWishlist(item: WishlistItemRow) {
    if (!tauri || busy) {
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    const id = `spool_${Date.now()}`;
    try {
      const linkedMaster = item.master_id
        ? masters.find((master) => master.id === item.master_id) ?? null
        : null;
      if (linkedMaster) {
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

      await updateWishlistItemStatus({
        item_id: item.id,
        status: "RECEIVED",
      });
      await reloadSpools();
      await reloadWishlist();
      setSelectedSpoolId(id);
      setRecentlyAddedSpoolId(id);
      setInfoMessage(
        `${t("inventory.addedFromWishlist", "Added from wishlist")}: ${formatInventoryDisplayTitle(
          item.material,
          item.filament_name,
          item.color_name,
        )}`,
      );
      setSidePanelMode("MANAGE");
      setShowAddModal(false);
    } catch (stockError) {
      console.error(stockError);
      setError(t("inventory.error.stockFromWishlist", "Failed to stock roll from wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMasterMetadata() {
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
    if (rawHex && !isValidHex(rawHex)) {
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
      await reloadHistory(selectedSpool.id);
      await reloadUsage(selectedSpool.id);
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
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmPurge(false);
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      await deleteSpool({
        spool_id: selectedSpool.id,
        reason: "manual removal",
      });
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
    setConfirmDelete(false);
    setConfirmPurge(false);
    setManageBusy(true);
    setError(null);
    try {
      await updateSpoolStatus(selectedSpool.id, "EMPTY");
      await updateSpoolWeight(selectedSpool.id, 0);
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadActiveLoans();
      await reloadHistory(selectedSpool.id);
      await reloadUsage(selectedSpool.id);
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

  async function handlePurgeSelected() {
    if (!tauri || !selectedSpool || manageBusy) {
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
      await purgeSpool({
        spool_id: selectedSpool.id,
        reason: "manual purge",
      });
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
      );
      const html = buildFilamentLabelHtml({
        vendor: selectedSpool.vendor,
        material: selectedSpool.material,
        filamentName: selectedSpool.filamentName,
        colorName: selectedSpool.colorName || null,
        reference: qrReference,
        qrPayload,
        qrDataUrl,
        labels: {
          vendor: t("inventory.vendor", "Vendor"),
          material: t("inventory.material", "Material"),
          filament: t("inventory.filament", "Filament"),
          color: t("inventory.color", "Color"),
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
      if (selectedSpoolAssignedSlot) {
        await applyMeasuredWeightWithUsage(
          selectedSpoolAssignedSlot.printerId,
          selectedSpool.id,
          selectedSpool.remainingGrams,
          safeGrams,
          null,
        );
      } else {
        await updateSpoolWeight(selectedSpool.id, safeGrams);
      }
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadHistory(selectedSpool.id);
      await reloadUsage(selectedSpool.id);
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(updateError, t("inventory.error.updateWeight", "Failed to update weight.")),
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
  const activeVendorLabel =
    createMode === "bambu"
      ? t("vendor.bambu", "Bambu")
      : createMode === "esun"
        ? t("vendor.esun", "eSUN")
        : t("vendor.generic", "Generic");
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
      ? isValidHex(manualHexColor)
        ? toSwatchColor(manualHexColor)
        : null
      : selectedCatalogMaster?.hex_color ?? null;
  const currentCreateDraft = buildWishlistDraft();
  const currentCreateDisplayTitle = currentCreateDraft
    ? formatInventoryDisplayTitle(
        currentCreateDraft.material,
        currentCreateDraft.filament_name,
        currentCreateDraft.color_name,
      )
    : "";
  const currentCreateInitialWeight =
    newInitialWeight.trim() ||
    (createMode === "manual"
      ? ""
      : selectedCatalogMaster
        ? String(selectedCatalogMaster.default_weight)
        : "");
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
  const currentCreateOwnershipLabel = formatOwnershipLabel(newOwnershipType);
  const activeCatalogFilter =
    createMode === "bambu" ? bambuCatalogFilter : esunCatalogFilter;
  const disableWishlistCreate = !tauri || busy || !currentCreateDraft;

  return (
    <div className="page-shell">
      <LoanOutModal
        open={showLoanTrackingModal}
        onClose={closeLoanTrackingModal}
        preferredSpoolId={loanTrackingSpoolId}
        onLoanCreated={async ({ spoolId }) => {
          await reloadSpools();
          await reloadPrinterOverview();
          await reloadActiveLoans();
          await reloadHistory(spoolId);
          await reloadUsage(spoolId);
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
                    {manageBusy ? (
                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
                        {t("inventory.updatingRoll", "Updating selected roll...")}
                      </div>
                    ) : null}
                    {error ? (
                      <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200">
                        {error}
                      </div>
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
                          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {formatRollReference(selectedSpool)}
                          </div>
                          <div className="mt-1 break-all text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                            ID: {selectedSpool.id}
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
                    label={t("inventory.remainingWeight", "Remaining weight (g)")}
                    value={selectedSpool.remainingGrams ?? 0}
                    onSubmit={handleWeightSubmit}
                    style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                  />

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
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      {t("inventory.rollHistory", "Roll history")}
                    </div>
                    <div className="mt-3 space-y-2">
                      {historyLoading ? (
                        <div className="text-xs text-slate-500">
                          {t("inventory.loadingHistory", "Loading history...")}
                        </div>
                      ) : null}
                      {!historyLoading && hasHiddenHistoryRows ? (
                        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100">
                          {t(
                            "inventory.historyFilteredHint",
                            "Printer slot assignments are shown above so this history stays focused on roll activity.",
                          )}
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
                            {formatDateTime(event.created_at)}
                          </div>
                          <div className="mt-1 break-words text-slate-600 dark:text-slate-300">
                            {formatHistoryEventDetails(event)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm dark:border-rose-500/35 dark:bg-rose-500/10 dark:shadow-none">
                    <div className="text-xs uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
                      {t("inventory.dangerZone", "Danger zone")}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
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
            >
              {t("inventory.addSpoolAction", "Add spool")}
            </button>
            <button
              type="button"
              onClick={openLoanTrackingModal}
              className="header-button-secondary w-full min-[920px]:w-auto"
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
                          : status === "IN_USE"
                            ? t("inventory.statusInUse", "In use")
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

      <div className="surface-subtle mt-4 px-4 py-3.5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
              {t("inventory.viewGroup", "View")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setInventoryView("CARDS")}
                className={neutralChipClass(inventoryView === "CARDS", "px-3.5 py-2 text-xs")}
              >
                {t("inventory.viewCards", "Card view")}
              </button>
              <button
                type="button"
                onClick={() => setInventoryView("LIST")}
                className={neutralChipClass(inventoryView === "LIST", "px-3.5 py-2 text-xs")}
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
                    "px-3.5 py-2 text-xs",
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
                  className={neutralChipClass(vendorFilter === vendor, "px-3.5 py-2 text-xs")}
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
            <div className="flex flex-wrap gap-1.5">
              {materialOptions.map((material) => (
                <button
                  key={material}
                  type="button"
                  onClick={() => setMaterialFilter(material)}
                  className={
                    material === "ALL"
                      ? neutralChipClass(materialFilter === material, "px-3.5 py-2 text-xs")
                      : `rounded-full border px-3.5 py-2 text-xs font-semibold ${
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
      </div>

      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}

      {infoMessage ? (
        <FeedbackBanner tone="success" className="mt-4">
          {infoMessage}
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
              const uniqueStatuses = Array.from(
                new Set(group.rolls.map((roll) => normalizeStatus(roll.status))),
              );
              const sharedStatus = uniqueStatuses.length === 1 ? uniqueStatuses[0] : null;
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
                      <div className="truncate text-[1.02rem] font-semibold leading-tight text-slate-950 dark:text-slate-50">
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
                        {sharedStatus ? (
                          <span
                            className={semanticChipClass(
                              formatStatusTone(sharedStatus),
                              "px-2 py-0.5 text-[10px]",
                            )}
                          >
                            {formatStatusLabel(sharedStatus)}
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
                              {!sharedStatus ? (
                                <span
                                  className={semanticChipClass(
                                    formatStatusTone(roll.status),
                                    "px-2 py-0.5 text-[10px]",
                                  )}
                                >
                                  {formatStatusLabel(roll.status)}
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
                      <span
                        className={semanticChipClass(
                          formatStatusTone(roll.status),
                          "px-2 py-0.5 text-[10px]",
                        )}
                      >
                        {formatStatusLabel(roll.status)}
                      </span>
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
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] xl:gap-5">
                    <div className="space-y-4">
                      <div className="surface-card space-y-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {t("inventory.stockEntry", "Stock entry")}
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {t(
                              "inventory.stockEntryHelp",
                              "Choose a vendor flow, pick a filament, then confirm stock details below.",
                            )}
                          </p>
                        </div>

                        <div className="surface-subtle px-4 py-4">
                          <div className="flex flex-col gap-3.5">
                            <SegmentedChoiceRow
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
                                  placeholder={t(
                                    "inventory.searchVendorCatalog",
                                    `Search ${activeVendorLabel} material, filament or color`,
                                  )}
                                  className="page-header-search !w-full"
                                  disabled={!tauri}
                                />

                                <SegmentedChoiceRow
                                  label={t("inventory.status", "Status")}
                                  value={activeCatalogFilter}
                                  onChange={(filter) =>
                                    createMode === "bambu"
                                      ? setBambuCatalogFilter(filter)
                                      : setEsunCatalogFilter(filter)
                                  }
                                  options={bambuCatalogFilters.map((filter) => ({
                                    value: filter,
                                    label:
                                      filter === "ALL"
                                        ? t("common.all", "All")
                                        : filter === "ACTIVE"
                                          ? t("common.active", "Active")
                                          : t("common.discontinued", "Discontinued"),
                                  }))}
                                />
                              </>
                            ) : null}
                          </div>
                        </div>

                        {isCatalogCreateMode ? (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                              <div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                                  {t("inventory.catalogSelection", "Catalog selection")}
                                </div>
                                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                  {t(
                                    "inventory.catalogManagedInSettingsHelp",
                                    "Use the local catalogue below to add rolls directly to stock, wishlist, or on-order queues.",
                                  )}
                                </div>
                              </div>
                              <span className="self-start rounded-full border border-slate-300 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200">
                                {activeCatalogMasters.length}
                              </span>
                            </div>

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
                                        <span className="block truncate font-semibold leading-tight text-slate-900 dark:text-slate-50">
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

                            {createMode === "bambu" ? (
                              <button
                                type="button"
                                className="w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80"
                                onClick={() => {
                                  setCreateMode("manual");
                                  setManualVendor("Bambu");
                                  if (selectedBambuMaster) {
                                    setManualMaterial(selectedBambuMaster.material);
                                  }
                                }}
                              >
                                {t(
                                  "wishlist.addMissingBambuManual",
                                  "Bambu filament missing? Add it manually",
                                )}
                              </button>
                            ) : null}
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

                        <div
                          className="rounded-2xl border border-slate-200 bg-white/85 p-4 transition dark:border-slate-700 dark:bg-slate-950/70"
                          style={currentCreatePanelStyle}
                        >
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {t("inventory.addDirectlyToStock", "Add directly to stock")}
                          </div>
                          <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/65 p-3 dark:border-slate-700/80 dark:bg-slate-950/40">
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
                              placeholder={t("inventory.locationOptional", "Location (optional)")}
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
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 self-start lg:sticky lg:top-0">
                      <div className="surface-card space-y-4">
                        <div
                          className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition dark:border-slate-700 dark:bg-slate-950/70"
                          style={currentCreatePanelStyle}
                        >
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {t("inventory.addToWishlist", "Add to wishlist / order")}
                          </div>
                          <div className="mt-3 flex min-w-0 items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/60 p-1.5 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                              {currentCreateSwatchHex ? (
                                <span
                                  className="h-full w-full rounded-lg border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                                  style={{
                                    background: `linear-gradient(145deg, ${toSwatchColor(
                                      currentCreateSwatchHex,
                                    )} 0%, ${toSwatchColor(currentCreateSwatchHex)}CC 58%, #0f172a33 100%)`,
                                  }}
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center rounded-lg border border-white/70 bg-white/65 text-lg font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-300">
                                  +
                                </span>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                {t("inventory.selectionPreview", "Selection preview")}
                              </div>
                              <div className="mt-1 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50">
                                {currentCreateDraft
                                  ? currentCreateDisplayTitle
                                  : isCatalogCreateMode
                                    ? t("inventory.catalogSelection", "Catalog selection")
                                    : t("inventory.manualDetails", "Manual details")}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <VendorBadge
                                  vendor={currentCreateDraft?.vendor ?? activeVendorLabel}
                                  compact
                                />
                                <span
                                  className={semanticChipClass(
                                    formatOwnershipTone(newOwnershipType),
                                    "px-2 py-0.5 text-[10px]",
                                  )}
                                >
                                  {currentCreateOwnershipLabel}
                                </span>
                                {currentCreateInitialWeight ? (
                                  <span className="rounded-full border border-slate-300 bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200">
                                    {currentCreateInitialWeight} g
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                                {currentCreateDraft
                                  ? t(
                                      "inventory.addToWishlistHelp",
                                      "Use the current selection to keep the wishlist → on order → stock workflow.",
                                    )
                                  : createMode === "manual"
                                    ? t(
                                        "inventory.manualDetailsHelp",
                                        "Use this when a filament is missing from the vendor catalog or you want a fully manual entry.",
                                      )
                                    : t(
                                        "inventory.stockEntryHelp",
                                        "Choose a vendor flow, pick a filament, then confirm stock details below.",
                                      )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[88px_1fr]">
                              <input
                                type="number"
                                min={1}
                                value={wishlistQuantity}
                                onChange={(event) => setWishlistQuantity(event.target.value)}
                                placeholder={t("wishlist.qty", "Qty")}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100"
                              />
                              <input
                                type="text"
                                value={wishlistNote}
                                onChange={(event) => setWishlistNote(event.target.value)}
                                placeholder={t("wishlist.noteOptional", "Note (optional)")}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100"
                              />
                            </div>
                            <button
                              type="button"
                              className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
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
                            <div className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-200 dark:shadow-none">
                              {visibleWishlistItems.length} / {wishlistItems.length}
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
