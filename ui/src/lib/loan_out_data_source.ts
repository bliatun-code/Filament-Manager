import { fetchCachedLibrarySyncSpools } from "./tauri_client";
import {
  isBorrowedInOwnership,
  isSpoolStatusLoanable,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  type SpoolStatus,
} from "./inventory_domain";
import { loadPrinterOverviewData } from "./printer_data_source";
import { loadSpoolRowsPage } from "./spool_data_source";
import { sortSpoolsAlphabetically } from "./spool_sort";
import type { PrinterOverviewRow, SpoolWithMasterRow } from "./tauri_client";

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
  spoolRows: SpoolWithMasterRow[],
  printerOverview: PrinterOverviewRow[],
): LoanableSpool[] {
  const assignedSpoolIds = collectAssignedSpoolIds(printerOverview);

  return sortSpoolsAlphabetically(spoolRows)
    .filter((row) => {
      const ownershipType = normalizeOwnershipType(row.spool.ownership_type);
      if (assignedSpoolIds.has(row.spool.id)) {
        return false;
      }
      if (isBorrowedInOwnership(ownershipType)) {
        return false;
      }
      return isSpoolStatusLoanable(row.spool.status);
    })
    .map((row) => ({
      id: row.spool.id,
      vendor: row.master.vendor,
      material: row.master.material,
      filamentName: row.master.filament_name,
      colorName: row.master.color_name,
      hexColor: row.master.hex_color ?? null,
      status: normalizeSpoolStatus(row.spool.status),
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
  const loadSpoolRows = dependencies.loadSpoolRows ?? loadSpoolRowsPage;
  const loadPrinterOverview = dependencies.loadPrinterOverview ?? loadPrinterOverviewData;
  const [spoolRows, printerOverview] = await Promise.all([
    loadSpoolRows(options, 1200, 0).catch(async (loadError) => {
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

  return buildLoanableSpoolCandidates(spoolRows, printerOverview.printers);
}
