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
  status: string;
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
      const status = (row.spool.status ?? "").trim().toUpperCase();
      const ownershipType = (row.spool.ownership_type ?? "").trim().toUpperCase();
      if (assignedSpoolIds.has(row.spool.id)) {
        return false;
      }
      if (ownershipType === "BORROWED_IN") {
        return false;
      }
      return status === "IN_STOCK";
    })
    .map((row) => ({
      id: row.spool.id,
      vendor: row.master.vendor,
      material: row.master.material,
      filamentName: row.master.filament_name,
      colorName: row.master.color_name,
      hexColor: row.master.hex_color ?? null,
      status: row.spool.status,
      remainingGrams: row.spool.remaining_g ?? row.spool.current_weight_g ?? null,
      spoolTareWeightGrams: row.spool.spool_tare_weight_g ?? null,
      location: row.spool.location_id ?? null,
    }));
}

export async function loadLoanableSpoolCandidates(
  options: LoanOutDataSourceOptions,
  dependencies: LoanOutDataSourceDependencies = {},
): Promise<LoanableSpool[]> {
  const loadSpoolRows = dependencies.loadSpoolRows ?? loadSpoolRowsPage;
  const loadPrinterOverview = dependencies.loadPrinterOverview ?? loadPrinterOverviewData;
  const [spoolRows, printerOverview] = await Promise.all([
    loadSpoolRows(options, 1200, 0),
    loadPrinterOverview(options),
  ]);

  return buildLoanableSpoolCandidates(spoolRows, printerOverview.printers);
}
