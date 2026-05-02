import {
  fetchCachedLibrarySyncSpools,
  type LibrarySyncCachedSpoolList,
  type SpoolWithMasterRow,
} from "./tauri_client";
import {
  normalizeOwnershipType,
  normalizeStatus,
  type InventorySpool,
} from "./inventory_list_model";
import { loadSpoolRowsPage } from "./spool_data_source";

export type InventorySnapshotSource = "LIVE" | "CACHED" | "OFFLINE";

export type InventoryDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

export type InventoryDataLoadResult = {
  rows: InventorySpool[];
  source: InventorySnapshotSource;
  updatedAt: string | null;
  usedFallback: boolean;
};

type InventoryDataSourceDependencies = {
  loadRowsPage?: typeof loadSpoolRowsPage;
  fetchCachedSpools?: typeof fetchCachedLibrarySyncSpools;
};

export function mapSpoolRowToInventorySpool(row: SpoolWithMasterRow): InventorySpool {
  const fallbackInitial =
    Number.isFinite(row.master.default_weight) && row.master.default_weight > 0
      ? row.master.default_weight
      : 1000;

  return {
    id: row.spool.id,
    masterId: row.spool.master_id,
    vendor: row.master.vendor,
    material: row.master.material,
    filamentName: row.master.filament_name,
    colorName: row.master.color_name,
    hexColor: row.master.hex_color,
    initialWeightGrams:
      row.spool.initial_weight_g && row.spool.initial_weight_g > 0
        ? row.spool.initial_weight_g
        : fallbackInitial,
    status: normalizeStatus(row.spool.status),
    ownershipType: normalizeOwnershipType(row.spool.ownership_type),
    ownerName: row.spool.owner_name ?? null,
    ownerContact: row.spool.owner_contact ?? null,
    ownershipNote: row.spool.ownership_note ?? null,
    remainingGrams: row.spool.remaining_g ?? null,
    spoolTareWeightGrams: row.spool.spool_tare_weight_g ?? null,
    location: row.spool.location_id ?? null,
    homeLocation: row.spool.home_location_id ?? null,
    qrCode: row.spool.qr_code ?? null,
    rfidTag: row.spool.rfid_tag ?? null,
    rfidObservedAt: row.spool.rfid_observed_at ?? null,
  };
}

export async function loadInventorySpools(
  options: InventoryDataSourceOptions,
  dependencies: InventoryDataSourceDependencies = {},
): Promise<InventoryDataLoadResult> {
  const loadRowsPage = dependencies.loadRowsPage ?? loadSpoolRowsPage;
  const fetchCachedSpools = dependencies.fetchCachedSpools ?? fetchCachedLibrarySyncSpools;

  try {
    const rows = await loadRowsPage(options, 1200, 0);
    const cached = options.clientReadOnly
      ? await fetchCachedSpools().catch((): LibrarySyncCachedSpoolList | null => null)
      : null;
    return {
      rows: rows.map(mapSpoolRowToInventorySpool),
      source: "LIVE",
      updatedAt: cached?.captured_at ?? null,
      usedFallback: false,
    };
  } catch (loadError) {
    if (!options.clientReadOnly) {
      throw loadError;
    }

    const cached = await fetchCachedSpools().catch((): LibrarySyncCachedSpoolList | null => null);
    if (cached) {
      return {
        rows: cached.rows.map(mapSpoolRowToInventorySpool),
        source: "CACHED",
        updatedAt: cached.captured_at ?? null,
        usedFallback: true,
      };
    }

    return {
      rows: [],
      source: "OFFLINE",
      updatedAt: null,
      usedFallback: true,
    };
  }
}
