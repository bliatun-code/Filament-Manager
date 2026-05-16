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
