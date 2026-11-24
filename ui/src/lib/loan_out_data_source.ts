import { getLoanPickerPage, type LoanableSpool, type LoanPickerQuery } from "./tauri_loan_client";
import { loadLibrarySyncPageState } from "./library_sync_state";
import { createAppError } from "./error_text";
import {
  isBorrowedInOwnership,
  isSpoolStatusLoanable,
} from "./inventory_domain";
import { loadPrinterOverviewData } from "./printer_data_source";
import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  loadAllSpoolRowsWithPageLoader,
  loadSpoolRowsPage,
} from "./spool_data_source";
import { sortSpoolsAlphabetically } from "./spool_sort";
import { resolveClientHostTarget } from "./host_write_target";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import type { PrinterOverviewRow } from "./tauri_client";

export type { LoanableSpool } from "./tauri_loan_client";

export type LoanOutDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
};

type LoanOutDataSourceDependencies = {
  loadSpoolRows?: typeof loadSpoolRowsPage;
  loadPrinterOverview?: typeof loadPrinterOverviewData;
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
      location: row.location_name?.trim() || row.spool.location_id || null,
    }));
}

export async function loadLoanableSpoolCandidates(
  options: LoanOutDataSourceOptions,
  dependencies: LoanOutDataSourceDependencies = {},
): Promise<LoanableSpool[]> {
  const loadPrinterOverview = dependencies.loadPrinterOverview ?? loadPrinterOverviewData;
  // A write picker must use current host data; cached rows are for browsing.
  if (options.clientReadOnly && !resolveClientHostTarget(options)) {
    return [];
  }
  const [spoolRows, printerOverview] = await Promise.all([
    (dependencies.loadSpoolRows
      ? loadAllSpoolRowsWithPageLoader(
          options,
          DEFAULT_SPOOL_PAGE_SIZE,
          dependencies.loadSpoolRows,
        )
      : loadAllSpoolRows(options)
    ),
    loadPrinterOverview(options),
  ]);

  if (printerOverview.source !== "LIVE") {
    throw new Error("Current printer assignments are unavailable.");
  }

  return buildLoanableSpoolCandidates(
    normalizeSpoolWithMasterRows(spoolRows),
    printerOverview.printers,
  );
}

// Only a Host that explicitly lacks the page capability takes the legacy path.
export async function readLoanPicker(options: LoanOutDataSourceOptions, query: LoanPickerQuery) {
  const { clientLibraryId, clientTargetGeneration, clientHostBaseUrl, clientReadOnly } = options;
  const baseUrl = clientReadOnly ? clientHostBaseUrl : null;
  if (!clientLibraryId || clientTargetGeneration == null || (clientReadOnly && !baseUrl)) {
    throw createAppError("common.invalid_request");
  }
  const page = await getLoanPickerPage(query, {
    base_url: baseUrl ?? null,
    expected_library_id: clientLibraryId,
    target_generation: clientTargetGeneration,
  });
  if (page !== null) return page;
  if (!clientReadOnly) throw createAppError("common.invalid_request");
  const legacy = await loadLoanableSpoolCandidates(options);
  const current = await loadLibrarySyncPageState();
  if (!current.clientReadOnly || current.clientHostBaseUrl !== clientHostBaseUrl ||
      current.clientLibraryId !== clientLibraryId || current.clientTargetGeneration !== clientTargetGeneration) {
    throw createAppError("common.invalid_request");
  }
  return legacy;
}
