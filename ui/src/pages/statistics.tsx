import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "../components/app_modal";
import { StatCard } from "../components/dashboard_widgets";
import { FeedbackBanner } from "../components/feedback_banner";
import { ModalHeader, modalPanelClassName } from "../components/modal_chrome";
import { neutralChipClass } from "../lib/chip_styles";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import {
  deriveStatisticsLibrarySyncState,
  loadStatisticsData,
} from "../lib/statistics_data_source";
import { useResolvedTheme } from "../lib/theme_mode";
import {
  fetchLibrarySyncFilamentConsumption,
  getLibrarySyncSettings,
  listFilamentConsumption,
  isTauri,
  listSpoolLoans,
  type FilamentConsumptionRow,
  type InventoryOverview,
  type LoanUsageByPersonRow,
  type PrinterAmsSlotRow,
  type PrinterOverviewRow,
  type SpoolLoanDetailsRow,
} from "../lib/tauri_client";
import {
  formatPrinterSlotLabelForModel,
  sortPrinterSlotsExtLast,
  summarizeEffectivePrinterSlots,
} from "../lib/printer_profiles";

function gramsToKgText(value: number): string {
  return `${(value / 1000).toFixed(2)} kg`;
}

type ConsumptionSort = "USED_DESC" | "USED_ASC" | "NAME_ASC" | "JOBS_DESC";
type LoanDirection = "OUTBOUND" | "INBOUND";
type LoanUsageListFilter = "ALL" | "ACTIVE" | "COMPLETED";
type OwnershipFilter = "ALL" | "OWNED" | "BORROWED_IN";
type MetricModalKind = "LOGGED_JOBS" | "FAILED_JOBS" | "ACTIVE_SLOTS";
type ConsumptionPopupPrefs = {
  search: string;
  vendorFilter: string;
  materialFilter: string;
  ownershipFilter: OwnershipFilter;
  sort: ConsumptionSort;
};
type BorrowerPopupPrefs = {
  search: string;
};
type TranslateFn = (key: string, fallback: string) => string;

function normalizeLoanDirection(value?: string | null): LoanDirection {
  return (value ?? "").trim().toUpperCase() === "INBOUND" ? "INBOUND" : "OUTBOUND";
}

function loanPartyName(row: SpoolLoanDetailsRow): string {
  return (row.loan.counterparty_name ?? "").trim() || row.loan.borrower_name;
}

type BorrowerFilamentUsageRow = {
  material: string;
  filamentName: string;
  colorName: string;
  vendor: string;
  hexColor?: string | null;
  consumedGrams: number;
  lentOutGrams: number;
  loans: number;
  activeLoans: number;
};

function groupedLoanUsage(rows: SpoolLoanDetailsRow[]): BorrowerFilamentUsageRow[] {
  const grouped = new Map<string, BorrowerFilamentUsageRow>();
  for (const row of rows) {
    const material = (row.material ?? "").trim() || "Unknown";
    const filamentName = (row.filament_name ?? "").trim() || "Unknown";
    const colorName = (row.color_name ?? "").trim() || "Unknown";
    const vendor = (row.vendor ?? "").trim() || "Unknown";
    const key = `${material}|${filamentName}|${colorName}|${vendor}|${row.hex_color ?? ""}`;
    const current = grouped.get(key) ?? {
      material,
      filamentName,
      colorName,
      vendor,
      hexColor: row.hex_color ?? null,
      consumedGrams: 0,
      lentOutGrams: 0,
      loans: 0,
      activeLoans: 0,
    };
    const consumed = Math.max(0, row.loan.consumed_grams ?? 0);
    const lentOut = Math.max(0, row.loan.grams_out ?? 0);
    const active = row.loan.returned_at ? 0 : 1;
    grouped.set(key, {
      ...current,
      consumedGrams: current.consumedGrams + consumed,
      lentOutGrams: current.lentOutGrams + lentOut,
      loans: current.loans + 1,
      activeLoans: current.activeLoans + active,
    });
  }
  return Array.from(grouped.values()).sort((left, right) => right.consumedGrams - left.consumedGrams);
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

type MetricTone = "slate" | "sky" | "emerald" | "amber" | "rose";

function metricTileClass(tone: MetricTone): string {
  switch (tone) {
    case "sky":
      return "border-sky-200/85 bg-sky-50/80 dark:border-sky-400/25 dark:bg-sky-500/10";
    case "emerald":
      return "border-emerald-200/85 bg-emerald-50/80 dark:border-emerald-400/25 dark:bg-emerald-500/10";
    case "amber":
      return "border-amber-200/85 bg-amber-50/80 dark:border-amber-400/25 dark:bg-amber-500/10";
    case "rose":
      return "border-rose-200/85 bg-rose-50/80 dark:border-rose-400/25 dark:bg-rose-500/10";
    case "slate":
    default:
      return "border-slate-200/85 bg-white/80 dark:border-slate-700 dark:bg-slate-950/45";
  }
}

function SummaryMetricTile({
  label,
  value,
  tone = "slate",
  className = "",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${metricTileClass(tone)} ${className}`.trim()}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  );
}

const CONSUMPTION_PREFS_STORAGE_KEY = "statistics_consumption_popup_prefs_v1";
const BORROWER_PREFS_STORAGE_KEY = "statistics_borrower_popup_prefs_v1";
const DEFAULT_CONSUMPTION_PREFS: ConsumptionPopupPrefs = {
  search: "",
  vendorFilter: "ALL",
  materialFilter: "ALL",
  ownershipFilter: "ALL",
  sort: "USED_DESC",
};
const DEFAULT_BORROWER_PREFS: BorrowerPopupPrefs = {
  search: "",
};

function parseConsumptionSort(raw: unknown): ConsumptionSort {
  if (raw === "USED_ASC" || raw === "NAME_ASC" || raw === "JOBS_DESC" || raw === "USED_DESC") {
    return raw;
  }
  return "USED_DESC";
}

function parseOwnershipFilter(raw: unknown): OwnershipFilter {
  if (raw === "OWNED" || raw === "BORROWED_IN" || raw === "ALL") {
    return raw;
  }
  return "ALL";
}

function normalizeOwnershipType(raw?: string | null): Exclude<OwnershipFilter, "ALL"> {
  return (raw ?? "").trim().toUpperCase() === "BORROWED_IN" ? "BORROWED_IN" : "OWNED";
}

function matchesOwnershipFilter(filter: OwnershipFilter, raw?: string | null): boolean {
  return filter === "ALL" || normalizeOwnershipType(raw) === filter;
}

function ownershipBadgeClass(raw?: string | null): string {
  return normalizeOwnershipType(raw) === "BORROWED_IN"
    ? "border-amber-200/85 bg-amber-50/85 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
    : "border-sky-200/85 bg-sky-50/85 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200";
}

function ownershipLabel(
  t: TranslateFn,
  ownershipType?: string | null,
  ownerName?: string | null,
): string {
  if (normalizeOwnershipType(ownershipType) === "BORROWED_IN") {
    const owner = (ownerName ?? "").trim();
    if (owner.length > 0) {
      return `${t("inventory.borrowedIn", "Borrowed in")} · ${owner}`;
    }
    return t("inventory.borrowedIn", "Borrowed in");
  }
  return t("inventory.ownedByUs", "Owned");
}

function formatDateTime(raw: string, locale: Locale): string {
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
    second: "2-digit",
  }).format(parsed);
}

function readConsumptionPopupPrefs(): ConsumptionPopupPrefs {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_CONSUMPTION_PREFS;
  }
  try {
    const raw = window.localStorage.getItem(CONSUMPTION_PREFS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CONSUMPTION_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<ConsumptionPopupPrefs>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      vendorFilter: typeof parsed.vendorFilter === "string" ? parsed.vendorFilter : "ALL",
      materialFilter:
        typeof parsed.materialFilter === "string" ? parsed.materialFilter : "ALL",
      ownershipFilter: parseOwnershipFilter(parsed.ownershipFilter),
      sort: parseConsumptionSort(parsed.sort),
    };
  } catch {
    return DEFAULT_CONSUMPTION_PREFS;
  }
}

function readBorrowerPopupPrefs(): BorrowerPopupPrefs {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_BORROWER_PREFS;
  }
  try {
    const raw = window.localStorage.getItem(BORROWER_PREFS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_BORROWER_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<BorrowerPopupPrefs>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
    };
  } catch {
    return DEFAULT_BORROWER_PREFS;
  }
}

export default function StatisticsPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [printers, setPrinters] = useState<PrinterOverviewRow[]>([]);
  const [loanUsage, setLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [inboundLoanUsage, setInboundLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [loanDetails, setLoanDetails] = useState<SpoolLoanDetailsRow[]>([]);
  const [loading, setLoading] = useState(tauri);
  const [error, setError] = useState<string | null>(null);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [clientStatsSource, setClientStatsSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "OFFLINE",
  );
  const [clientStatisticsUpdatedAt, setClientStatisticsUpdatedAt] = useState<string | null>(null);
  const [showConsumptionModal, setShowConsumptionModal] = useState(false);
  const [consumptionModalTitle, setConsumptionModalTitle] = useState("");
  const [consumptionRows, setConsumptionRows] = useState<FilamentConsumptionRow[]>([]);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [consumptionPrefs, setConsumptionPrefs] = useState<ConsumptionPopupPrefs>(() =>
    readConsumptionPopupPrefs(),
  );
  const [showBorrowerModal, setShowBorrowerModal] = useState(false);
  const [borrowerModalTitle, setBorrowerModalTitle] = useState("");
  const [borrowerRows, setBorrowerRows] = useState<BorrowerFilamentUsageRow[]>([]);
  const [borrowerLoading, setBorrowerLoading] = useState(false);
  const [borrowerError, setBorrowerError] = useState<string | null>(null);
  const [borrowerPrefs, setBorrowerPrefs] = useState<BorrowerPopupPrefs>(() =>
    readBorrowerPopupPrefs(),
  );
  const [borrowerModalDirection, setBorrowerModalDirection] =
    useState<LoanDirection>("OUTBOUND");
  const [metricModalKind, setMetricModalKind] = useState<MetricModalKind | null>(null);
  const [slotOwnershipFilter, setSlotOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [loanUsageListFilter, setLoanUsageListFilter] =
    useState<LoanUsageListFilter>("ACTIVE");

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(
        CONSUMPTION_PREFS_STORAGE_KEY,
        JSON.stringify(consumptionPrefs),
      );
    } catch {
      // Ignore persistence errors.
    }
  }, [consumptionPrefs]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(BORROWER_PREFS_STORAGE_KEY, JSON.stringify(borrowerPrefs));
    } catch {
      // Ignore persistence errors.
    }
  }, [borrowerPrefs]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let cancelled = false;
    async function loadStatistics() {
      setLoading(true);
      setError(null);
      try {
        const syncSettings = await getLibrarySyncSettings();
        const syncState = deriveStatisticsLibrarySyncState(syncSettings);

        if (cancelled) {
          return;
        }

        setClientReadOnly(syncState.clientReadOnly);
        setClientHostDeviceName(syncState.clientHostDeviceName);
        setClientHostBaseUrl(syncState.clientHostBaseUrl);
        setClientLibraryId(syncState.clientLibraryId);

        const result = await loadStatisticsData(syncSettings);
        if (cancelled) {
          return;
        }
        setOverview(result.overview);
        setPrinters(result.printers);
        setLoanDetails(result.loanDetails);
        setLoanUsage(result.loanUsage);
        setInboundLoanUsage(result.inboundLoanUsage);
        setClientStatisticsUpdatedAt(result.updatedAt);
        setClientStatsSource(result.source);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError(t("statistics.error.load", "Failed to load statistics."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadStatistics();
    return () => {
      cancelled = true;
    };
  }, [t, tauri]);

  const totals = useMemo(() => {
    const totalUsed = printers.reduce(
      (sum, row) => sum + (row.usage.total_used_g || 0),
      0,
    );
    const totalJobs = printers.reduce(
      (sum, row) => sum + (row.usage.total_jobs || 0),
      0,
    );
    const failedJobs = printers.reduce(
      (sum, row) => sum + (row.usage.failed_jobs || 0),
      0,
    );
    const activeSlots = printers.reduce(
      (sum, row) => sum + summarizeEffectivePrinterSlots(row.slots).loadedSlots,
      0,
    );
    return {
      totalUsed,
      totalJobs,
      failedJobs,
      activeSlots,
    };
  }, [printers]);

  const openConsumptionModal = useCallback(
    async (printer?: PrinterOverviewRow) => {
      if (!tauri) {
        return;
      }
      const title = printer
        ? `${t("statistics.consumptionByFilament", "Consumption by filament")} · ${printer.printer.name}`
        : t("statistics.consumptionByFilament", "Consumption by filament");
      if (clientReadOnly) {
        if (!clientHostBaseUrl || !clientLibraryId) {
          setConsumptionModalTitle(title);
          setShowConsumptionModal(true);
          setConsumptionLoading(false);
          setConsumptionRows([]);
          setConsumptionError(
            t(
              "statistics.clientHostBreakdownOnly",
              "Detailed filament breakdown is currently available on the host device.",
            ),
          );
          return;
        }
      }
      const printerId = printer?.printer.id ?? null;
      setConsumptionModalTitle(title);
      setShowConsumptionModal(true);
      setConsumptionLoading(true);
      setConsumptionError(null);
      try {
        const rows = clientReadOnly
          ? await fetchLibrarySyncFilamentConsumption(
              clientHostBaseUrl!,
              clientLibraryId,
              500,
              printerId,
            )
          : await listFilamentConsumption(500, printerId);
        setConsumptionRows(rows);
      } catch (loadError) {
        console.error(loadError);
        setConsumptionRows([]);
        setConsumptionError(
          t("statistics.error.loadFilamentBreakdown", "Failed to load filament breakdown."),
        );
      } finally {
        setConsumptionLoading(false);
      }
    },
    [clientHostBaseUrl, clientLibraryId, clientReadOnly, t, tauri],
  );

  const consumptionVendorOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of consumptionRows) {
      const value = row.vendor.trim();
      if (value) {
        values.add(value);
      }
    }
    return ["ALL", ...Array.from(values).sort((left, right) => left.localeCompare(right))];
  }, [consumptionRows]);

  const consumptionMaterialOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of consumptionRows) {
      const value = row.material.trim();
      if (value) {
        values.add(value);
      }
    }
    return ["ALL", ...Array.from(values).sort((left, right) => left.localeCompare(right))];
  }, [consumptionRows]);

  const filteredConsumptionRows = useMemo(() => {
    const searchTerm = consumptionPrefs.search.trim().toLowerCase();
    const filtered = consumptionRows.filter((row) => {
      const vendorMatch =
        consumptionPrefs.vendorFilter === "ALL"
          ? true
          : row.vendor === consumptionPrefs.vendorFilter;
      const materialMatch =
        consumptionPrefs.materialFilter === "ALL"
          ? true
          : row.material === consumptionPrefs.materialFilter;
      const ownershipMatch = matchesOwnershipFilter(
        consumptionPrefs.ownershipFilter,
        row.ownership_type,
      );
      const searchMatch =
        searchTerm.length === 0
          ? true
          : `${row.material} ${row.filament_name} ${row.color_name} ${row.vendor} ${row.owner_name ?? ""}`
              .toLowerCase()
              .includes(searchTerm);
      return vendorMatch && materialMatch && ownershipMatch && searchMatch;
    });
    const sorted = [...filtered];
    sorted.sort((left, right) => {
      switch (consumptionPrefs.sort) {
        case "USED_ASC":
          return left.used_grams - right.used_grams;
        case "NAME_ASC":
          return `${left.material} ${left.filament_name} ${left.color_name}`.localeCompare(
            `${right.material} ${right.filament_name} ${right.color_name}`,
          );
        case "JOBS_DESC":
          return right.jobs - left.jobs;
        case "USED_DESC":
        default:
          return right.used_grams - left.used_grams;
      }
    });
    return sorted;
  }, [
    consumptionPrefs,
    consumptionRows,
  ]);

  const filteredBorrowerRows = useMemo(() => {
    const searchTerm = borrowerPrefs.search.trim().toLowerCase();
    if (!searchTerm) {
      return borrowerRows;
    }
    return borrowerRows.filter((row) =>
      `${row.material} ${row.filamentName} ${row.colorName} ${row.vendor}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [borrowerPrefs.search, borrowerRows]);

  const openBorrowerModal = useCallback(
    async (borrowerName: string, direction: LoanDirection) => {
      if (!tauri) {
        return;
      }
      setBorrowerModalDirection(direction);
      setBorrowerModalTitle(
        `${
          direction === "INBOUND"
            ? t("statistics.inboundUsageByFilament", "Borrowed-in usage by filament")
            : t("statistics.borrowerUsageByFilament", "Loan usage by filament")
        } · ${borrowerName}`,
      );
      setShowBorrowerModal(true);
      setBorrowerLoading(true);
      setBorrowerError(null);
      setBorrowerRows([]);
      try {
        const loanRows = clientReadOnly ? loanDetails : await listSpoolLoans(2000, true, direction);
        const borrowerLoanRows = loanRows.filter(
          (row) =>
            normalizeLoanDirection(row.loan.loan_direction) === direction &&
            loanPartyName(row) === borrowerName,
        );
        setBorrowerRows(groupedLoanUsage(borrowerLoanRows));
      } catch (loadError) {
        console.error(loadError);
        setBorrowerError(
          direction === "INBOUND"
            ? t("statistics.error.loadInboundBreakdown", "Failed to load owner breakdown.")
            : t("statistics.error.loadBorrowerBreakdown", "Failed to load borrower breakdown."),
        );
      } finally {
        setBorrowerLoading(false);
      }
    },
    [clientReadOnly, loanDetails, t, tauri],
  );

  const activeSlotRows = useMemo(() => {
    const rows: Array<{
      printerId: string;
      printerName: string;
      printerModel: string;
      slot: PrinterAmsSlotRow;
    }> = [];
    for (const printer of printers) {
      for (const slot of sortPrinterSlotsExtLast(summarizeEffectivePrinterSlots(printer.slots).slots)) {
        if (!slot.spool_id) {
          continue;
        }
        rows.push({
          printerId: printer.printer.id,
          printerName: printer.printer.name,
          printerModel: printer.printer.model,
          slot,
        });
      }
    }
    return rows;
  }, [printers]);

  const filteredActiveSlotRows = useMemo(
    () =>
      activeSlotRows.filter((row) =>
        matchesOwnershipFilter(slotOwnershipFilter, row.slot.spool_ownership_type),
      ),
    [activeSlotRows, slotOwnershipFilter],
  );

  const activeSlotOwnershipCounts = useMemo(
    () => ({
      owned: activeSlotRows.filter(
        (row) => normalizeOwnershipType(row.slot.spool_ownership_type) === "OWNED",
      ).length,
      borrowedIn: activeSlotRows.filter(
        (row) => normalizeOwnershipType(row.slot.spool_ownership_type) === "BORROWED_IN",
      ).length,
    }),
    [activeSlotRows],
  );

  const failedPrinterRows = useMemo(
    () =>
      [...printers]
        .filter((row) => row.usage.failed_jobs > 0)
        .sort((left, right) => right.usage.failed_jobs - left.usage.failed_jobs),
    [printers],
  );

  const loggedPrinterRows = useMemo(
    () =>
      [...printers].sort((left, right) => right.usage.total_jobs - left.usage.total_jobs),
    [printers],
  );

  const filteredLoanUsage = useMemo(() => {
    switch (loanUsageListFilter) {
      case "ACTIVE":
        return loanUsage.filter((row) => row.active_loans > 0);
      case "COMPLETED":
        return loanUsage.filter((row) => row.active_loans === 0 && row.completed_loans > 0);
      case "ALL":
      default:
        return loanUsage;
    }
  }, [loanUsage, loanUsageListFilter]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.statistics", "Statistics")}</h1>
          <p className="page-subtitle">
            {t(
              "statistics.subtitle",
              "Track printer activity, filament usage and loan consumption in one place.",
            )}
          </p>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t("statistics.desktopOnly", "Statistics are available in the desktop app build.")}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {clientReadOnly && clientStatsSource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {[
            clientHostDeviceName
              ? `${clientHostDeviceName}. `
              : "",
            clientStatsSource === "CACHED"
              ? t(
                  "statistics.clientReadOnlyCached",
                  "Host unavailable. Showing the last cached statistics snapshot.",
                )
              : t(
                  "statistics.clientReadOnlyOffline",
                  "Host unavailable and no cached statistics snapshot is available yet.",
                ),
            clientStatisticsUpdatedAt
              ? ` ${t("statistics.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientStatisticsUpdatedAt, locale)}.`
              : "",
          ].join("")}
        </FeedbackBanner>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("statistics.totalConsumption", "Total Consumption")}
          value={gramsToKgText(totals.totalUsed)}
          subtitle={t("statistics.acrossPrinters", "Across all printers")}
          trend={`${totals.totalUsed} g`}
          accent="amber"
          onClick={() => {
            void openConsumptionModal();
          }}
        />
        <StatCard
          title={t("statistics.loggedJobs", "Logged Jobs")}
          value={totals.totalJobs.toString()}
          subtitle={t("statistics.linkedActivity", "Printer-linked activity")}
          trend={`${printers.length} ${t("nav.printers", "printers")}`}
          accent="sky"
          onClick={() => setMetricModalKind("LOGGED_JOBS")}
        />
        <StatCard
          title={t("statistics.activeAms", "Active loaded slots")}
          value={totals.activeSlots.toString()}
          subtitle={t("statistics.assignedSlots", "Slots with assigned rolls")}
          trend={t("statistics.currentSnapshot", "Current snapshot")}
          accent="emerald"
          onClick={() => setMetricModalKind("ACTIVE_SLOTS")}
        />
        <StatCard
          title={t("statistics.failedJobs", "Failed Jobs")}
          value={totals.failedJobs.toString()}
          subtitle={t("statistics.acrossPrinters", "Across all printers")}
          trend={totals.totalJobs > 0 ? `${Math.round((totals.failedJobs / totals.totalJobs) * 100)}%` : "0%"}
          accent="rose"
          onClick={() => setMetricModalKind("FAILED_JOBS")}
        />
      </div>

      <div className="mt-6 surface-card">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="section-eyebrow">
              {t("statistics.ownershipSnapshot", "Ownership snapshot")}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "statistics.ownershipSnapshotHint",
                "Additive ownership split for on-hand stock and recent print usage. The headline cards above still show the combined totals.",
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricTile
            label={t("statistics.ownedOnHand", "Owned on hand")}
            value={(overview?.total_owned_spools ?? 0).toString()}
            tone="sky"
          />
          <SummaryMetricTile
            label={t("statistics.borrowedInOnHand", "Borrowed in on hand")}
            value={(overview?.total_borrowed_in_spools ?? 0).toString()}
            tone="amber"
          />
          <SummaryMetricTile
            label={t("statistics.ownedPrintUsage30d", "Owned print use (30d)")}
            value={`${overview?.owned_consumption_30d ?? 0} g`}
            tone="emerald"
          />
          <SummaryMetricTile
            label={t("statistics.borrowedInPrintUsage30d", "Borrowed-in print use (30d)")}
            value={`${overview?.borrowed_in_consumption_30d ?? 0} g`}
            tone="amber"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricTile
            label={t("statistics.ownedInUse", "Owned assigned")}
            value={(overview?.owned_in_use ?? 0).toString()}
            tone="sky"
          />
          <SummaryMetricTile
            label={t("statistics.borrowedInInUse", "Borrowed assigned")}
            value={(overview?.borrowed_in_in_use ?? 0).toString()}
            tone="amber"
          />
          <SummaryMetricTile
            label={t("statistics.ownedLowStock", "Owned low stock")}
            value={(overview?.owned_low_stock ?? 0).toString()}
            tone="rose"
          />
          <SummaryMetricTile
            label={t("statistics.borrowedInLowStock", "Borrowed-in low stock")}
            value={(overview?.borrowed_in_low_stock ?? 0).toString()}
            tone="rose"
          />
        </div>
      </div>

      <div className="mt-8 surface-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-eyebrow">
              {t("statistics.perPrinter", "Per-printer usage")}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "statistics.perPrinterHint",
                "Open a printer to see filament consumption grouped by material.",
              )}
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none">
            {printers.length}
          </div>
        </div>
        {loading ? (
          <div className="mt-4 text-sm text-slate-500">
            {t("statistics.loadingPrinter", "Loading printer usage...")}
          </div>
        ) : null}
        {!loading && printers.length === 0 ? (
          <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
            {t("statistics.noPrinterActivity", "No printer activity available yet.")}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {printers.map((row) => (
            <div
              key={row.printer.id}
              className="cursor-pointer rounded-2xl border p-4 text-sm transition hover:-translate-y-0.5"
              role="button"
              tabIndex={0}
              onClick={() => {
                void openConsumptionModal(row);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void openConsumptionModal(row);
                }
              }}
              style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {row.printer.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {row.printer.model}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem] min-[1080px]:grid-cols-3">
                  <SummaryMetricTile
                    label={t("printers.jobs", "Jobs")}
                    value={row.usage.total_jobs.toString()}
                    tone="sky"
                  />
                  <SummaryMetricTile
                    label={t("printers.used", "Used")}
                    value={`${row.usage.total_used_g} g`}
                    tone="amber"
                  />
                  <SummaryMetricTile
                    label={t("printers.failed", "Failed")}
                    value={row.usage.failed_jobs.toString()}
                    tone="rose"
                    className="col-span-2 min-[1080px]:col-span-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showConsumptionModal ? (
        <AppModal
          closeOnBackdrop
          onBackdropClose={() => setShowConsumptionModal(false)}
          panelClassName={modalPanelClassName("xl")}
        >
          <ModalHeader
            eyebrow={t("nav.statistics", "Statistics")}
            title={consumptionModalTitle}
            onClose={() => setShowConsumptionModal(false)}
            closeLabel={t("common.close", "Close")}
            className="-mx-5 -mt-5"
          />

          {consumptionLoading ? (
            <div className="mt-4 text-sm text-slate-500">
              {t("statistics.loadingFilamentBreakdown", "Loading filament breakdown...")}
            </div>
          ) : null}
          {consumptionError ? (
            <FeedbackBanner tone="danger" className="mt-4">
              {consumptionError}
            </FeedbackBanner>
          ) : null}
          {!consumptionLoading && !consumptionError && consumptionRows.length > 0 ? (
            <div className="surface-subtle mt-4 grid grid-cols-1 gap-2 p-3 md:grid-cols-2 xl:grid-cols-6">
              <input
                type="search"
                value={consumptionPrefs.search}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder={t(
                  "statistics.searchFilamentPlaceholder",
                  "Search filament, color, vendor or owner",
                )}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100 dark:placeholder:text-slate-400 xl:col-span-2"
              />
              <select
                value={consumptionPrefs.vendorFilter}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    vendorFilter: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100"
              >
                {consumptionVendorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL"
                      ? `${t("statistics.filterVendor", "Vendor")}: ${t("common.all", "All")}`
                      : option}
                  </option>
                ))}
              </select>
              <select
                value={consumptionPrefs.materialFilter}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    materialFilter: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100"
              >
                {consumptionMaterialOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL"
                      ? `${t("statistics.filterMaterial", "Material")}: ${t("common.all", "All")}`
                      : option}
                  </option>
                ))}
              </select>
              <select
                value={consumptionPrefs.ownershipFilter}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    ownershipFilter: parseOwnershipFilter(event.target.value),
                  }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100"
              >
                <option value="ALL">
                  {`${t("inventory.ownershipGroup", "Ownership")}: ${t("common.all", "All")}`}
                </option>
                <option value="OWNED">
                  {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.ownedByUs", "Owned")}`}
                </option>
                <option value="BORROWED_IN">
                  {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.borrowedIn", "Borrowed in")}`}
                </option>
              </select>
              <select
                value={consumptionPrefs.sort}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    sort: parseConsumptionSort(event.target.value),
                  }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100"
              >
                <option value="USED_DESC">{t("statistics.sortUsedDesc", "Most used")}</option>
                <option value="USED_ASC">{t("statistics.sortUsedAsc", "Least used")}</option>
                <option value="JOBS_DESC">{t("statistics.sortJobsDesc", "Most jobs")}</option>
                <option value="NAME_ASC">{t("statistics.sortNameAsc", "Name (A-Z)")}</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setConsumptionPrefs({
                    ...DEFAULT_CONSUMPTION_PREFS,
                  })
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-900 md:col-span-2 xl:col-span-2"
              >
                {t("statistics.resetFilters", "Reset filters")}
              </button>
            </div>
          ) : null}
          {!consumptionLoading && !consumptionError && consumptionRows.length === 0 ? (
            <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
              {t(
                "statistics.noFilamentBreakdown",
                "No filament consumption has been logged yet.",
              )}
            </div>
          ) : null}
          {!consumptionLoading &&
          !consumptionError &&
          consumptionRows.length > 0 &&
          filteredConsumptionRows.length === 0 ? (
            <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
              {t("statistics.noFilamentFilterMatch", "No rows match current filters.")}
            </div>
          ) : null}
          {!consumptionLoading && !consumptionError && filteredConsumptionRows.length > 0 ? (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
              {filteredConsumptionRows.map((row, index) => (
                <div
                  key={`${row.printer_id ?? "all"}-${row.material}-${row.filament_name}-${row.color_name}-${row.vendor}-${row.ownership_type}-${row.owner_name ?? ""}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/45"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="mt-0.5 h-5 w-5 flex-none rounded-md border border-slate-300/80 dark:border-slate-600"
                        style={{ backgroundColor: toSwatchColor(row.hex_color) }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatFilamentDisplayTitle(
                            row.material,
                            row.filament_name,
                            row.color_name,
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {row.vendor}
                        </div>
                        <div className="mt-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ownershipBadgeClass(row.ownership_type)}`}
                          >
                            {ownershipLabel(t, row.ownership_type, row.owner_name)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]">
                      <SummaryMetricTile
                        label={t("printers.jobs", "Jobs")}
                        value={row.jobs.toString()}
                        tone="sky"
                      />
                      <SummaryMetricTile
                        label={t("printers.used", "Used")}
                        value={`${row.used_grams} g`}
                        tone="amber"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </AppModal>
      ) : null}

      <div className="mt-8 surface-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-eyebrow">
              {t("statistics.borrowerUsage", "Loan usage by person")}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "statistics.borrowerUsageHint",
                "Open a borrower to see which filaments make up their loan usage.",
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", "ACTIVE", "COMPLETED"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLoanUsageListFilter(mode)}
                  className={neutralChipClass(loanUsageListFilter === mode, "px-3 py-1.5 text-xs")}
                >
                  {mode === "ALL"
                    ? t("common.all", "All")
                    : mode === "ACTIVE"
                      ? t("common.active", "Active")
                      : t("statistics.completed", "Completed")}
                </button>
              ))}
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none">
              {filteredLoanUsage.length}
            </div>
          </div>
        </div>
        {loading ? (
          <div className="mt-4 text-sm text-slate-500">
            {t("statistics.loadingLoan", "Loading loan usage...")}
          </div>
        ) : null}
        {!loading && filteredLoanUsage.length === 0 ? (
          <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
            {t("statistics.noLoanUsage", "No loan usage recorded yet.")}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {filteredLoanUsage.map((row) => (
            <div
              key={`${row.loan_direction}-${row.borrower_name}`}
              className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-sm transition hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-950/45"
              role="button"
              tabIndex={0}
              onClick={() => {
                void openBorrowerModal(row.borrower_name, "OUTBOUND");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void openBorrowerModal(row.borrower_name, "OUTBOUND");
                }
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {row.borrower_name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      "statistics.borrowerBreakdownHint",
                      "Loan totals across active and completed rolls.",
                    )}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem] min-[1080px]:grid-cols-3">
                  <SummaryMetricTile
                    label={t("printers.used", "Used")}
                    value={`${row.total_consumed_g} g`}
                    tone="amber"
                  />
                  <SummaryMetricTile
                    label={t("statistics.completed", "Completed")}
                    value={row.completed_loans.toString()}
                    tone="sky"
                  />
                  <SummaryMetricTile
                    label={t("common.active", "Active")}
                    value={row.active_loans.toString()}
                    tone="emerald"
                    className="col-span-2 min-[1080px]:col-span-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 surface-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-eyebrow">
              {t("statistics.inboundUsage", "Borrowed-in usage by owner")}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "statistics.inboundUsageHint",
                "Open an owner to see which borrowed-in filaments make up their usage.",
              )}
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none">
            {inboundLoanUsage.length}
          </div>
        </div>
        {loading ? (
          <div className="mt-4 text-sm text-slate-500">
            {t("statistics.loadingInboundUsage", "Loading borrowed-in usage...")}
          </div>
        ) : null}
        {!loading && inboundLoanUsage.length === 0 ? (
          <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
            {t("statistics.noInboundUsage", "No borrowed-in usage recorded yet.")}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {inboundLoanUsage.map((row) => (
            <div
              key={`${row.loan_direction}-${row.borrower_name}`}
              className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-sm transition hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-950/45"
              role="button"
              tabIndex={0}
              onClick={() => {
                void openBorrowerModal(row.borrower_name, "INBOUND");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void openBorrowerModal(row.borrower_name, "INBOUND");
                }
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {row.borrower_name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      "statistics.inboundBreakdownHint",
                      "Borrowed-in totals across active and completed rolls.",
                    )}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem] min-[1080px]:grid-cols-3">
                  <SummaryMetricTile
                    label={t("printers.used", "Used")}
                    value={`${row.total_consumed_g} g`}
                    tone="amber"
                  />
                  <SummaryMetricTile
                    label={t("statistics.completed", "Completed")}
                    value={row.completed_loans.toString()}
                    tone="sky"
                  />
                  <SummaryMetricTile
                    label={t("common.active", "Active")}
                    value={row.active_loans.toString()}
                    tone="emerald"
                    className="col-span-2 min-[1080px]:col-span-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showBorrowerModal ? (
        <AppModal
          closeOnBackdrop
          onBackdropClose={() => setShowBorrowerModal(false)}
          panelClassName={modalPanelClassName("xl")}
        >
          <ModalHeader
            eyebrow={
              borrowerModalDirection === "INBOUND"
                ? t("statistics.inboundUsage", "Borrowed-in usage by owner")
                : t("statistics.borrowerUsage", "Loan usage by person")
            }
            title={borrowerModalTitle}
            onClose={() => setShowBorrowerModal(false)}
            closeLabel={t("common.close", "Close")}
            className="-mx-5 -mt-5"
          />

          {borrowerLoading ? (
            <div className="mt-4 text-sm text-slate-500">
              {borrowerModalDirection === "INBOUND"
                ? t("statistics.loadingInboundBreakdown", "Loading owner breakdown...")
                : t("statistics.loadingBorrowerBreakdown", "Loading borrower breakdown...")}
            </div>
          ) : null}
          {borrowerError ? (
            <FeedbackBanner tone="danger" className="mt-4">
              {borrowerError}
            </FeedbackBanner>
          ) : null}
          {!borrowerLoading && !borrowerError && borrowerRows.length > 0 ? (
            <div className="surface-subtle mt-4 flex flex-col gap-2 p-3 sm:flex-row">
              <input
                type="search"
                value={borrowerPrefs.search}
                onChange={(event) =>
                  setBorrowerPrefs((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder={t(
                  "statistics.searchBorrowerFilamentPlaceholder",
                  "Search filament, color or vendor",
                )}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() =>
                  setBorrowerPrefs({
                    ...DEFAULT_BORROWER_PREFS,
                  })
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-900 sm:w-auto"
              >
                {t("statistics.resetFilters", "Reset filters")}
              </button>
            </div>
          ) : null}
          {!borrowerLoading && !borrowerError && borrowerRows.length === 0 ? (
            <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
              {borrowerModalDirection === "INBOUND"
                ? t("statistics.noInboundBreakdown", "No borrowed-in owner usage recorded yet.")
                : t("statistics.noBorrowerBreakdown", "No borrower usage recorded yet.")}
            </div>
          ) : null}
          {!borrowerLoading &&
          !borrowerError &&
          borrowerRows.length > 0 &&
          filteredBorrowerRows.length === 0 ? (
            <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
              {t("statistics.noBorrowerFilterMatch", "No rows match current filters.")}
            </div>
          ) : null}
          {!borrowerLoading && !borrowerError && filteredBorrowerRows.length > 0 ? (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
              {filteredBorrowerRows.map((row, index) => (
                <div
                  key={`${row.material}-${row.filamentName}-${row.colorName}-${row.vendor}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/45"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="mt-0.5 h-5 w-5 flex-none rounded-md border border-slate-300/80 dark:border-slate-600"
                        style={{ backgroundColor: toSwatchColor(row.hexColor) }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatFilamentDisplayTitle(
                            row.material,
                            row.filamentName,
                            row.colorName,
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {row.vendor}
                        </div>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[18rem] min-[960px]:grid-cols-3">
                      <SummaryMetricTile
                        label={t("printers.used", "Used")}
                        value={`${row.consumedGrams} g`}
                        tone="amber"
                      />
                      <SummaryMetricTile
                        label={
                          borrowerModalDirection === "INBOUND"
                            ? t("statistics.borrowedInShort", "In")
                            : t("statistics.lentOutShort", "Out")
                        }
                        value={`${row.lentOutGrams} g`}
                        tone="sky"
                      />
                      <SummaryMetricTile
                        label={t("statistics.loansShort", "Loans")}
                        value={`${row.loans} · ${row.activeLoans} ${t("common.active", "Active")}`}
                        tone="slate"
                        className="col-span-2 min-[960px]:col-span-1"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </AppModal>
      ) : null}

      {metricModalKind ? (
        <AppModal
          closeOnBackdrop
          onBackdropClose={() => setMetricModalKind(null)}
          panelClassName={modalPanelClassName("xl")}
        >
          <ModalHeader
            eyebrow={t("nav.statistics", "Statistics")}
            title={
              metricModalKind === "LOGGED_JOBS"
                ? t("statistics.loggedJobsDetailTitle", "Logged jobs by printer")
                : metricModalKind === "FAILED_JOBS"
                  ? t("statistics.failedJobsDetailTitle", "Failed jobs by printer")
                  : t("statistics.activeSlotsDetailTitle", "Active loaded slots")
            }
            onClose={() => setMetricModalKind(null)}
            closeLabel={t("common.close", "Close")}
            className="-mx-5 -mt-5"
          />

          {metricModalKind === "LOGGED_JOBS" ? (
            loggedPrinterRows.length === 0 ? (
              <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
                {t("statistics.noLoggedJobsBreakdown", "No logged jobs yet.")}
              </div>
            ) : (
              <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                {loggedPrinterRows.map((row) => (
                  <div
                    key={row.printer.id}
                    className="rounded-2xl border p-4"
                    style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {row.printer.name}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {row.printer.model}
                        </div>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[18rem] min-[960px]:grid-cols-4">
                        <SummaryMetricTile label={t("printers.jobs", "Jobs")} value={row.usage.total_jobs.toString()} tone="sky" />
                        <SummaryMetricTile label={t("printers.success", "Success")} value={row.usage.successful_jobs.toString()} tone="emerald" />
                        <SummaryMetricTile label={t("printers.failed", "Failed")} value={row.usage.failed_jobs.toString()} tone="rose" />
                        <SummaryMetricTile label={t("printers.used", "Used")} value={`${row.usage.total_used_g} g`} tone="amber" className="col-span-2 min-[960px]:col-span-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}

          {metricModalKind === "FAILED_JOBS" ? (
            failedPrinterRows.length === 0 ? (
              <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
                {t("statistics.noFailedJobsBreakdown", "No failed jobs recorded.")}
              </div>
            ) : (
              <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                {failedPrinterRows.map((row) => {
                  const failureRate =
                    row.usage.total_jobs > 0
                      ? Math.round((row.usage.failed_jobs / row.usage.total_jobs) * 100)
                      : 0;
                  return (
                    <div
                      key={row.printer.id}
                      className="rounded-2xl border p-4"
                      style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {row.printer.name}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {row.printer.model}
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]">
                          <SummaryMetricTile
                            label={t("printers.failed", "Failed")}
                            value={row.usage.failed_jobs.toString()}
                            tone="rose"
                          />
                          <SummaryMetricTile
                            label={t("statistics.failureRate", "Failure rate")}
                            value={`${failureRate}%`}
                            tone="amber"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}

          {metricModalKind === "ACTIVE_SLOTS" ? (
            activeSlotRows.length === 0 ? (
              <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
                {t("statistics.noActiveSlotsBreakdown", "No loaded slots right now.")}
              </div>
            ) : (
              <>
                <div className="surface-subtle mt-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <select
                    value={slotOwnershipFilter}
                    onChange={(event) =>
                      setSlotOwnershipFilter(parseOwnershipFilter(event.target.value))
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100"
                  >
                    <option value="ALL">
                      {`${t("inventory.ownershipGroup", "Ownership")}: ${t("common.all", "All")}`}
                    </option>
                    <option value="OWNED">
                      {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.ownedByUs", "Owned")}`}
                    </option>
                    <option value="BORROWED_IN">
                      {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.borrowedIn", "Borrowed in")}`}
                    </option>
                  </select>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {`${t("inventory.ownedByUs", "Owned")}: ${activeSlotOwnershipCounts.owned} · ${t("inventory.borrowedIn", "Borrowed in")}: ${activeSlotOwnershipCounts.borrowedIn}`}
                  </div>
                </div>
                {filteredActiveSlotRows.length === 0 ? (
                  <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
                    {t(
                      "statistics.noActiveSlotFilterMatch",
                      "No loaded slots match the current ownership filter.",
                    )}
                  </div>
                ) : (
                  <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                    {filteredActiveSlotRows.map((row) => (
                      <div
                        key={`${row.printerId}-${row.slot.slot_id}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/45"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <span
                              className="mt-0.5 h-5 w-5 flex-none rounded-md border border-slate-300/80 dark:border-slate-600"
                              style={{ backgroundColor: toSwatchColor(row.slot.spool_hex_color) }}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                                {row.printerName} ·{" "}
                                {formatPrinterSlotLabelForModel(t, row.printerModel, row.slot)}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {formatFilamentDisplayTitle(
                                  row.slot.spool_material ?? t("common.unknown", "Unknown"),
                                  row.slot.spool_filament_name ?? t("common.unknown", "Unknown"),
                                  row.slot.spool_color_name ?? t("common.unknown", "Unknown"),
                                )}
                              </div>
                              <div className="mt-2">
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ownershipBadgeClass(row.slot.spool_ownership_type)}`}
                                >
                                  {ownershipLabel(
                                    t,
                                    row.slot.spool_ownership_type,
                                    row.slot.spool_owner_name,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]">
                            <SummaryMetricTile
                              label={t("inventory.remaining", "Remaining")}
                              value={`${row.slot.spool_remaining_g ?? 0} g`}
                              tone="emerald"
                            />
                            <SummaryMetricTile
                              label={t("inventory.statusAssigned", "Assigned")}
                              value={t("statistics.currentSnapshot", "Current snapshot")}
                              tone="sky"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          ) : null}
        </AppModal>
      ) : null}
    </div>
  );
}
