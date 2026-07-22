import { fetchCachedLibrarySyncSpools } from "./tauri_client";
import {
  isBorrowedInOwnership,
  isSpoolStatusLoanable,
  type SpoolStatus,
} from "./inventory_domain";
import { loadPrinterOverviewData } from "./printer_data_source";
import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  loadAllSpoolRowsWithPageLoader,
  loadSpoolRowsPage,
} from "./spool_data_source";
import { sortSpoolsAlphabetically } from "./spool_sort";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import type { PrinterOverviewRow } from "./tauri_client";

type LoanOutDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

type LoanOutDataSourceDependencies = {
  fetchCachedSpools?: typeof fetchCachedLibrarySyncSpools;
  loadSpoolRows?: typeof loadSpoolRowsPage;
  loadPrinterOverview?: typeof loadPrinterOverviewData;
};

export type LoanableSpool = {
  id: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  status: SpoolStatus;
  remainingGrams?: number | null;
  spoolTareWeightGrams?: number | null;
  location?: string | null;
};

function collectAssignedSpoolIds(printers: PrinterOverviewRow[]): Set<string> {
  return new Set(
    printers.flatMap((printer) =>
      printer.slots
        .map((slot) => slot.spool_id)
        .filter((spoolId): spoolId is string => typeof spoolId === "string" && spoolId.length > 0),
    ),
  );
}

export function buildLoanableSpoolCandidates(
  spoolRows: NormalizedSpoolWithMasterRow[],
  printerOverview: PrinterOverviewRow[],
): LoanableSpool[] {
  const assignedSpoolIds = collectAssignedSpoolIds(printerOverview);

  return sortSpoolsAlphabetically(spoolRows)
    .filter((row) => {
      if (assignedSpoolIds.has(row.spool.id)) {
        return false;
      }
      if (isBorrowedInOwnership(row.spool.ownership_type)) {
        return false;
      }
      return isSpoolStatusLoanable(row.spool.normalized_status);
    })
    .map((row) => ({
      id: row.spool.id,
      vendor: row.master.vendor,
      material: row.master.material,
      filamentName: row.master.filament_name,
      colorName: row.master.color_name,
      hexColor: row.master.hex_color ?? null,
      status: row.spool.normalized_status ?? "IN_STOCK",
      remainingGrams: row.spool.remaining_g ?? row.spool.current_weight_g ?? null,
      spoolTareWeightGrams: row.spool.spool_tare_weight_g ?? null,
      location: row.spool.location_id ?? null,
    }));
}

export async function loadLoanableSpoolCandidates(
  options: LoanOutDataSourceOptions,
  dependencies: LoanOutDataSourceDependencies = {},
): Promise<LoanableSpool[]> {
  const fetchCachedSpools = dependencies.fetchCachedSpools ?? fetchCachedLibrarySyncSpools;
  const loadPrinterOverview = dependencies.loadPrinterOverview ?? loadPrinterOverviewData;
  const [spoolRows, printerOverview] = await Promise.all([
    (dependencies.loadSpoolRows
      ? loadAllSpoolRowsWithPageLoader(
          options,
          DEFAULT_SPOOL_PAGE_SIZE,
          dependencies.loadSpoolRows,
        )
      : loadAllSpoolRows(options)
    ).catch(async (loadError) => {
      if (options.clientReadOnly) {
        const cached = await fetchCachedSpools().catch(() => null);
        if (cached) {
          return cached.rows;
        }
      }
      throw loadError;
    }),
    loadPrinterOverview(options),
  ]);

  return buildLoanableSpoolCandidates(
    normalizeSpoolWithMasterRows(spoolRows),
    printerOverview.printers,
  );
}
