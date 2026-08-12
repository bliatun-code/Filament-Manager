import { hasTauriRuntime, invoke } from "./tauri_invoke";

export type MasterCatalogRow = {
  id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  product_url?: string | null;
  default_weight: number;
  vendor: string;
  is_discontinued: boolean;
  discontinued_at?: string | null;
};

export type UpdateMasterCatalogEntryInput = {
  master_id: string;
  material: string;
  filament_name: string;
  color_name: string;
  hex_color?: string | null;
  product_url?: string | null;
  vendor?: string | null;
  default_weight?: number | null;
};

export type EsunSearchResult = {
  handle: string;
  title: string;
  filament_name: string;
  material: string;
  product_url: string;
  image_url?: string | null;
  default_weight_g?: number | null;
  vendor: string;
};

export type EsunColorOption = {
  color_name: string;
  hex_color?: string | null;
};

export type EsunProductDetail = {
  handle: string;
  title: string;
  filament_name: string;
  material: string;
  product_url: string;
  image_url?: string | null;
  default_weight_g?: number | null;
  vendor: string;
  colors: EsunColorOption[];
};

export type CatalogRefreshResult = {
  imported: number;
  detected_store?: string | null;
  detected_collection?: string | null;
  discovered_materials?: string[] | null;
  reactivated_count: number;
  discontinued_count: number;
  reused_cached_products?: number | null;
  detail_fetches?: number | null;
  output: string;
};

export type CatalogResetStats = {
  removed_count: number;
  remaining_count: number;
  reactivated_count: number;
};

export type CatalogRefreshProgressPayload = {
  vendor: string;
  phase: string;
  message: string;
};

export async function listMasterCatalog(limit = 250, search?: string) {
  return invoke<MasterCatalogRow[]>("list_master_catalog", { limit, search });
}

export async function refreshBambuCatalog(materialTypes?: string[]) {
  return invoke<CatalogRefreshResult>("refresh_bambu_catalog", {
    materialTypes: materialTypes && materialTypes.length > 0 ? materialTypes : null,
  });
}

export async function refreshEsunCatalog(materialTypes?: string[]) {
  return invoke<CatalogRefreshResult>("refresh_esun_catalog", {
    materialTypes: materialTypes && materialTypes.length > 0 ? materialTypes : null,
  });
}

export async function refreshLibrarySyncHostVendorCatalog(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  vendor: string,
  materialTypes?: string[],
) {
  return invoke<CatalogRefreshResult>("refresh_library_sync_host_vendor_catalog", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      vendor,
      material_types: materialTypes && materialTypes.length > 0 ? materialTypes : [],
    },
  });
}

export async function subscribeCatalogRefreshProgress(
  handler: (payload: CatalogRefreshProgressPayload) => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => {};
  }
  const events = await import("@tauri-apps/api/event");
  const unlisten = await events.listen<CatalogRefreshProgressPayload>(
    "catalog_refresh_progress",
    (event) => {
      if (event.payload) {
        handler(event.payload);
      }
    },
  );
  return unlisten;
}

export async function searchEsunFilaments(query: string, limit = 12) {
  return invoke<EsunSearchResult[]>("esun_search_filaments", { query, limit });
}

export async function fetchEsunProductDetail(handle: string) {
  return invoke<EsunProductDetail>("esun_fetch_product_detail", { handle });
}

export async function updateMasterCatalogEntry(input: UpdateMasterCatalogEntryInput) {
  return invoke<string>("update_master_catalog_entry", { input });
}

export async function updateLibrarySyncHostMasterCatalogEntry(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: UpdateMasterCatalogEntryInput,
) {
  return invoke<void>("update_library_sync_host_master_catalog_entry", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      master_id: input.master_id,
      material: input.material,
      filament_name: input.filament_name,
      color_name: input.color_name,
      hex_color: input.hex_color ?? null,
      product_url: input.product_url ?? null,
      vendor: input.vendor ?? null,
      default_weight: input.default_weight ?? null,
    },
  });
}

export async function fetchLibrarySyncCatalogMasters(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  limit = 5000,
  search?: string | null,
) {
  return invoke<MasterCatalogRow[]>("fetch_library_sync_catalog_masters", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      limit,
      search: search ?? null,
    },
  });
}

export async function resetCatalogData() {
  return invoke<CatalogResetStats>("reset_catalog_data");
}
