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

export async function fetchLibrarySyncCatalogMasters(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  limit = 1000,
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
