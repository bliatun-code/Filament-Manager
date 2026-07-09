import {
  formatPrinterSlotLabelForModel,
  sortPrinterSlotsExtLast,
  summarizeEffectivePrinterSlots,
} from "./printer_profiles";
import { isLoanCurrentlyActive } from "./loan_state";
import {
  isBorrowedInOwnership,
  isInboundLoanDirection,
  isLoanDirection,
  isSpoolStatusAssigned,
  isSpoolStatusOnHand,
  normalizeOwnershipType,
  type LoanDirection,
  type OwnershipType,
} from "./inventory_domain";
export { toSwatchColor } from "./color_utils";
export {
  isBorrowedInOwnership,
  isInboundLoanDirection,
  isLoanDirection,
  normalizeOwnershipType,
  type LoanDirection,
};
import type {
  FilamentConsumptionRow,
  LoanUsageByPersonRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
} from "./tauri_client";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";

export type ConsumptionSort = "USED_DESC" | "USED_ASC" | "NAME_ASC" | "JOBS_DESC";
export type LoanUsageListFilter = "ALL" | "ACTIVE" | "COMPLETED";
export type OwnershipFilter = "ALL" | OwnershipType;
export type MetricModalKind = "LOGGED_JOBS" | "FAILED_JOBS" | "ACTIVE_SLOTS";
export type ConsumptionPopupPrefs = {
  search: string;
  vendorFilter: string;
  materialFilter: string;
  ownershipFilter: OwnershipFilter;
  sort: ConsumptionSort;
};
export type BorrowerPopupPrefs = {
  search: string;
};
export type TranslateFn = (key: string, fallback?: string) => string;
export type BorrowerFilamentUsageRow = {
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
export type ActiveSlotDisplayRow = {
  printerId: string;
  printerName: string;
  printerModel: string;
  slot: PrinterAmsSlotRow;
};
export type StatisticsTotals = {
  totalUsed: number;
  totalJobs: number;
  failedJobs: number;
  activeSlots: number;
};

export const CONSUMPTION_PREFS_STORAGE_KEY = "statistics_consumption_popup_prefs_v1";
export const BORROWER_PREFS_STORAGE_KEY = "statistics_borrower_popup_prefs_v1";
export const DEFAULT_CONSUMPTION_PREFS: ConsumptionPopupPrefs = {
  search: "",
  vendorFilter: "ALL",
  materialFilter: "ALL",
  ownershipFilter: "ALL",
  sort: "USED_DESC",
};
export const DEFAULT_BORROWER_PREFS: BorrowerPopupPrefs = {
  search: "",
};

export function gramsToKgText(value: number): string {
  return `${(value / 1000).toFixed(2)} kg`;
}

export function groupedLoanUsage(rows: NormalizedLoanDetailsRow[]): BorrowerFilamentUsageRow[] {
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
    const active = isLoanCurrentlyActive(row) ? 1 : 0;
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

export function parseConsumptionSort(raw: unknown): ConsumptionSort {
  if (raw === "USED_ASC" || raw === "NAME_ASC" || raw === "JOBS_DESC" || raw === "USED_DESC") {
    return raw;
  }
  return "USED_DESC";
}

export function parseOwnershipFilter(raw: unknown): OwnershipFilter {
  if (raw === "OWNED" || raw === "BORROWED_IN" || raw === "ALL") {
    return raw;
  }
  return "ALL";
}

export function matchesOwnershipFilter(filter: OwnershipFilter, raw?: string | null): boolean {
  return filter === "ALL" || normalizeOwnershipType(raw) === filter;
}

export function ownershipBadgeClass(raw?: string | null): string {
  return isBorrowedInOwnership(raw)
    ? "border-amber-200/85 bg-amber-50/85 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
    : "border-sky-200/85 bg-sky-50/85 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200";
}

export function ownershipLabel(
  t: TranslateFn,
  ownershipType?: string | null,
  ownerName?: string | null,
): string {
  if (isBorrowedInOwnership(ownershipType)) {
    const owner = (ownerName ?? "").trim();
    if (owner.length > 0) {
      return `${t("inventory.borrowedIn", "Borrowed in")} · ${owner}`;
    }
    return t("inventory.borrowedIn", "Borrowed in");
  }
  return t("inventory.ownedByUs", "Owned");
}

export function readConsumptionPopupPrefs(): ConsumptionPopupPrefs {
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
      materialFilter: typeof parsed.materialFilter === "string" ? parsed.materialFilter : "ALL",
      ownershipFilter: parseOwnershipFilter(parsed.ownershipFilter),
      sort: parseConsumptionSort(parsed.sort),
    };
  } catch {
    return DEFAULT_CONSUMPTION_PREFS;
  }
}

export function readBorrowerPopupPrefs(): BorrowerPopupPrefs {
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

export function deriveStatisticsTotals(printers: PrinterOverviewRow[]): StatisticsTotals {
  let totalUsed = 0;
  let totalJobs = 0;
  let failedJobs = 0;
  let activeSlots = 0;
  for (const row of printers) {
    totalUsed += row.usage.total_used_g || 0;
    totalJobs += row.usage.total_jobs || 0;
    failedJobs += row.usage.failed_jobs || 0;
    activeSlots += summarizeEffectivePrinterSlots(row.slots).loadedSlots;
  }
  return { totalUsed, totalJobs, failedJobs, activeSlots };
}

export function deriveInventoryOverviewFromRows(
  spools: NormalizedSpoolWithMasterRow[],
  consumptionRows: FilamentConsumptionRow[],
): {
  total_spools: number;
  total_owned_spools: number;
  total_borrowed_in_spools: number;
  in_use: number;
  owned_in_use: number;
  borrowed_in_in_use: number;
  low_stock: number;
  owned_low_stock: number;
  borrowed_in_low_stock: number;
  total_consumption_30d: number;
  owned_consumption_30d: number;
  borrowed_in_consumption_30d: number;
} {
  let totalOwnedSpools = 0;
  let totalBorrowedInSpools = 0;
  let inUse = 0;
  let ownedInUse = 0;
  let borrowedInInUse = 0;
  let lowStock = 0;
  let ownedLowStock = 0;
  let borrowedInLowStock = 0;

  for (const row of spools) {
    const isOnHand = isSpoolStatusOnHand(row.spool.normalized_status);
    const isAssigned = isSpoolStatusAssigned(row.spool.normalized_status);
    const borrowedIn = isBorrowedInOwnership(row.spool.ownership_type);
    const remaining = row.spool.remaining_g ?? null;

    if (isOnHand) {
      if (borrowedIn) {
        totalBorrowedInSpools += 1;
      } else {
        totalOwnedSpools += 1;
      }
    }

    if (isAssigned) {
      inUse += 1;
      if (borrowedIn) {
        borrowedInInUse += 1;
      } else {
        ownedInUse += 1;
      }
    }

    if (
      remaining != null &&
      Number.isFinite(remaining) &&
      remaining > 0 &&
      remaining <= 200 &&
      isOnHand
    ) {
      lowStock += 1;
      if (borrowedIn) {
        borrowedInLowStock += 1;
      } else {
        ownedLowStock += 1;
      }
    }
  }

  let totalConsumption30d = 0;
  let ownedConsumption30d = 0;
  let borrowedInConsumption30d = 0;
  for (const row of consumptionRows) {
    const usedGrams = Math.max(0, row.used_grams);
    totalConsumption30d += usedGrams;
    if (isBorrowedInOwnership(row.ownership_type)) {
      borrowedInConsumption30d += usedGrams;
    } else {
      ownedConsumption30d += usedGrams;
    }
  }

  return {
    total_spools: spools.length,
    total_owned_spools: totalOwnedSpools,
    total_borrowed_in_spools: totalBorrowedInSpools,
    in_use: inUse,
    owned_in_use: ownedInUse,
    borrowed_in_in_use: borrowedInInUse,
    low_stock: lowStock,
    owned_low_stock: ownedLowStock,
    borrowed_in_low_stock: borrowedInLowStock,
    total_consumption_30d: totalConsumption30d,
    owned_consumption_30d: ownedConsumption30d,
    borrowed_in_consumption_30d: borrowedInConsumption30d,
  };
}

export function listConsumptionVendorOptions(rows: FilamentConsumptionRow[]): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row.vendor.trim();
    if (value) {
      values.add(value);
    }
  }
  return ["ALL", ...Array.from(values).sort((left, right) => left.localeCompare(right))];
}

export function listConsumptionMaterialOptions(rows: FilamentConsumptionRow[]): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row.material.trim();
    if (value) {
      values.add(value);
    }
  }
  return ["ALL", ...Array.from(values).sort((left, right) => left.localeCompare(right))];
}

export function filterConsumptionRows(
  rows: FilamentConsumptionRow[],
  prefs: ConsumptionPopupPrefs,
): FilamentConsumptionRow[] {
  const searchTerm = prefs.search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const vendorMatch = prefs.vendorFilter === "ALL" ? true : row.vendor === prefs.vendorFilter;
    const materialMatch =
      prefs.materialFilter === "ALL" ? true : row.material === prefs.materialFilter;
    const ownershipMatch = matchesOwnershipFilter(prefs.ownershipFilter, row.ownership_type);
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
    switch (prefs.sort) {
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
}

export function filterBorrowerRows(
  rows: BorrowerFilamentUsageRow[],
  prefs: BorrowerPopupPrefs,
): BorrowerFilamentUsageRow[] {
  const searchTerm = prefs.search.trim().toLowerCase();
  if (!searchTerm) {
    return rows;
  }
  return rows.filter((row) =>
    `${row.material} ${row.filamentName} ${row.colorName} ${row.vendor}`
      .toLowerCase()
      .includes(searchTerm),
  );
}

export function buildActiveSlotRows(printers: PrinterOverviewRow[]): ActiveSlotDisplayRow[] {
  const rows: ActiveSlotDisplayRow[] = [];
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
}

export function filterActiveSlotRows(
  rows: ActiveSlotDisplayRow[],
  ownershipFilter: OwnershipFilter,
): ActiveSlotDisplayRow[] {
  return rows.filter((row) => matchesOwnershipFilter(ownershipFilter, row.slot.spool_ownership_type));
}

export function countActiveSlotOwnerships(rows: ActiveSlotDisplayRow[]) {
  let owned = 0;
  let borrowedIn = 0;
  for (const row of rows) {
    if (isBorrowedInOwnership(row.slot.spool_ownership_type)) {
      borrowedIn += 1;
    } else {
      owned += 1;
    }
  }
  return { owned, borrowedIn };
}

export function sortFailedPrinterRows(printers: PrinterOverviewRow[]): PrinterOverviewRow[] {
  return [...printers]
    .filter((row) => row.usage.failed_jobs > 0)
    .sort((left, right) => right.usage.failed_jobs - left.usage.failed_jobs);
}

export function sortLoggedPrinterRows(printers: PrinterOverviewRow[]): PrinterOverviewRow[] {
  return [...printers].sort((left, right) => right.usage.total_jobs - left.usage.total_jobs);
}

export function filterLoanUsageRows(
  rows: LoanUsageByPersonRow[],
  filter: LoanUsageListFilter,
): LoanUsageByPersonRow[] {
  switch (filter) {
    case "ACTIVE":
      return rows.filter((row) => row.active_loans > 0);
    case "COMPLETED":
      return rows.filter((row) => row.active_loans === 0 && row.completed_loans > 0);
    case "ALL":
    default:
      return rows;
  }
}

export function formatActiveSlotLabel(
  t: TranslateFn,
  printerModel: string,
  slot: PrinterAmsSlotRow,
): string {
  return formatPrinterSlotLabelForModel(t, printerModel, slot);
}
