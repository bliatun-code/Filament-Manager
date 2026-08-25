import { invoke } from "./tauri_invoke";

export const FILAMENT_STANDARDS_SCHEMA_VERSION = 1;

export type FilamentPriceStandard = {
  group_key: string;
  vendor: string;
  material: string;
  filament_name: string;
  nominal_weight_g: number;
  price: number;
  currency: string;
};

export type FilamentStandardsSettings = {
  schema_version: number;
  default_purchase_currency?: string | null;
  price_standards: FilamentPriceStandard[];
};

export type FilamentPriceGroupSpool = {
  spool_id: string;
  master_id: string;
  color_name: string;
  status: string;
  ownership_type: string;
  purchase_price?: number | null;
  purchase_currency?: string | null;
  purchase_price_source?: string | null;
  purchase_price_batch_locked: boolean;
};

export type FilamentPriceGroup = {
  group_key: string;
  vendor: string;
  material: string;
  filament_name: string;
  nominal_weight_g: number;
  spool_count: number;
  owned_spool_count: number;
  borrowed_in_spool_count: number;
  missing_price_count: number;
  missing_currency_count: number;
  manual_price_count: number;
  standard_batch_price_count: number;
  locked_count: number;
  standard?: FilamentPriceStandard | null;
  spools: FilamentPriceGroupSpool[];
};

export type FilamentStandardsSnapshot = {
  settings: FilamentStandardsSettings;
  settings_valid: boolean;
  groups: FilamentPriceGroup[];
};

export type FilamentPriceBatchMode = "MISSING_ONLY" | "OVERWRITE";

export type FilamentPriceBatchSpoolPrecondition = {
  spool_id: string;
  expected_master_id: string;
  expected_status: string;
  expected_ownership_type: string;
  expected_purchase_price?: number | null;
  expected_purchase_currency?: string | null;
  expected_purchase_price_source?: string | null;
  expected_purchase_price_batch_locked: boolean;
};

export type FilamentPriceBatchInput = {
  mode: FilamentPriceBatchMode;
  group_key: string;
  price: number;
  currency: string;
  spools: FilamentPriceBatchSpoolPrecondition[];
};

export type FilamentPriceBatchSkipReason =
  | "BATCH_LOCKED"
  | "BORROWED_IN"
  | "INACTIVE"
  | "ALREADY_PRICED"
  | "MANUAL_UPDATE_REQUIRED";

export type FilamentPriceBatchUpdatedSpool = {
  spool_id: string;
  master_id: string;
  color_name: string;
  previous_purchase_price?: number | null;
  previous_purchase_currency?: string | null;
  purchase_price: number;
  purchase_currency: string;
  purchase_price_source: string;
};

export type FilamentPriceBatchSkippedSpool = {
  spool_id: string;
  master_id: string;
  color_name: string;
  reason: FilamentPriceBatchSkipReason;
};

export type FilamentPriceBatchReceipt = {
  batch_id: string;
  mode: FilamentPriceBatchMode;
  group_key: string;
  committed: boolean;
  updated_count: number;
  skipped_count: number;
  updated: FilamentPriceBatchUpdatedSpool[];
  skipped: FilamentPriceBatchSkippedSpool[];
};

export function getFilamentStandards() {
  return invoke<FilamentStandardsSnapshot>("get_filament_standards");
}

export function fetchLibrarySyncFilamentStandards(
  baseUrl: string,
  expectedLibraryId?: string | null,
) {
  return invoke<FilamentStandardsSnapshot>(
    "fetch_library_sync_filament_standards",
    {
      input: {
        base_url: baseUrl,
        expected_library_id: expectedLibraryId ?? null,
      },
    },
  );
}

export function saveFilamentStandards(settings: FilamentStandardsSettings) {
  return invoke<FilamentStandardsSnapshot>("save_filament_standards", {
    settings,
  });
}

export function applyFilamentPriceBatch(input: FilamentPriceBatchInput) {
  return invoke<FilamentPriceBatchReceipt>("apply_filament_price_batch", {
    input,
  });
}
