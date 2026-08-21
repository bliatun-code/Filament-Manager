import { invoke } from "./tauri_invoke";

export type MaterialUsageRow = {
  material: string;
  used_grams: number;
};

export type FilamentConsumptionRow = {
  printer_id?: string | null;
  printer_name?: string | null;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  vendor: string;
  ownership_type: string;
  owner_name?: string | null;
  used_grams: number;
  jobs: number;
};

/** Half-open UTC reporting range: `[start_at_utc, end_at_utc)`. */
export type StatisticsPeriod = {
  start_at_utc: string;
  end_at_utc: string;
};

export type StatisticsPeriodPrinterUsageRow = {
  printer_id: string;
  total_jobs: number;
  successful_jobs: number;
  failed_jobs: number;
  total_used_g: number;
  last_job_at?: string | null;
};

export type StatisticsPeriodReport = {
  period: StatisticsPeriod;
  total_used_g: number;
  owned_used_g: number;
  borrowed_in_used_g: number;
  total_jobs: number;
  successful_jobs: number;
  failed_jobs: number;
  printer_usage: StatisticsPeriodPrinterUsageRow[];
  filament_consumption: FilamentConsumptionRow[];
};

export async function topMaterials(limit = 12) {
  return invoke<MaterialUsageRow[]>("top_materials", { limit });
}

export async function listFilamentConsumption(limit = 500, printerId?: string | null) {
  return invoke<FilamentConsumptionRow[]>("list_filament_consumption", {
    limit,
    printerId: printerId ?? null,
    printer_id: printerId ?? null,
  });
}

export async function fetchLibrarySyncFilamentConsumption(
  baseUrl: string,
  expectedLibraryId?: string | null,
  limit = 500,
  printerId?: string | null,
) {
  return invoke<FilamentConsumptionRow[]>("fetch_library_sync_filament_consumption", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
      printer_id: printerId ?? null,
    },
  });
}

export async function statisticsPeriodReport(period: StatisticsPeriod) {
  return invoke<StatisticsPeriodReport>("statistics_period_report", { period });
}

export async function fetchLibrarySyncStatisticsPeriodReport(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  period: StatisticsPeriod,
) {
  return invoke<StatisticsPeriodReport | null>(
    "fetch_library_sync_statistics_period_report",
    {
      input: {
        base_url: baseUrl,
        expected_library_id: expectedLibraryId ?? null,
        period,
      },
    },
  );
}
