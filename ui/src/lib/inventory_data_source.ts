import {
  fetchCachedLibrarySyncSpools,
  fetchLibrarySyncSpoolDetail,
  listSpoolHistory,
  listSpoolUsage,
  type LibrarySyncCachedSpoolList,
  type SpoolHistoryEventRow,
  type SpoolUsagePointRow,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { type InventorySpool } from "./inventory_list_model";
import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  loadAllSpoolRowsWithPageLoader,
  loadSpoolRowsPage,
} from "./spool_data_source";
import { resolveClientHostTarget } from "./host_write_target";
import {
  normalizeSpoolWithMasterRow,
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";

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

export type InventorySpoolDetailOptions = InventoryDataSourceOptions & {
  spoolId: string;
  historyLimit?: number;
  usageLimit?: number;
};

export type InventorySpoolDetailLoadResult = {
  historyRows: SpoolHistoryEventRow[];
  usagePoints: SpoolUsagePointRow[];
};

type InventoryDataSourceDependencies = {
  loadRowsPage?: typeof loadSpoolRowsPage;
  fetchCachedSpools?: typeof fetchCachedLibrarySyncSpools;
};

type InventorySpoolDetailDependencies = {
  fetchHostSpoolDetail?: typeof fetchLibrarySyncSpoolDetail;
  listLocalHistory?: typeof listSpoolHistory;
  listLocalUsage?: typeof listSpoolUsage;
};

function isNormalizedSpoolWithMasterRow(
  row: SpoolWithMasterRow,
): row is NormalizedSpoolWithMasterRow {
  return "normalized_status" in row.spool;
}

function normalizeInventorySpoolRow(row: SpoolWithMasterRow): NormalizedSpoolWithMasterRow {
  return isNormalizedSpoolWithMasterRow(row) ? row : normalizeSpoolWithMasterRow(row);
}

function mapSpoolRowsToInventorySpools(rows: SpoolWithMasterRow[]): InventorySpool[] {
  return normalizeSpoolWithMasterRows(rows).map(mapSpoolRowToInventorySpool);
}

export function mapSpoolRowToInventorySpool(row: SpoolWithMasterRow): InventorySpool {
  const normalizedRow = normalizeInventorySpoolRow(row);
  const fallbackInitial =
    Number.isFinite(normalizedRow.master.default_weight) && normalizedRow.master.default_weight > 0
      ? normalizedRow.master.default_weight
      : 1000;

  return {
    id: normalizedRow.spool.id,
    masterId: normalizedRow.spool.master_id,
    vendor: normalizedRow.master.vendor,
    material: normalizedRow.master.material,
    filamentName: normalizedRow.master.filament_name,
    colorName: normalizedRow.master.color_name,
    hexColor: normalizedRow.master.hex_color,
    initialWeightGrams:
      normalizedRow.spool.initial_weight_g && normalizedRow.spool.initial_weight_g > 0
        ? normalizedRow.spool.initial_weight_g
        : fallbackInitial,
    status: normalizedRow.spool.normalized_status ?? "IN_STOCK",
    ownershipType: normalizedRow.spool.ownership_type,
    ownerName: normalizedRow.spool.owner_name ?? null,
    ownerContact: normalizedRow.spool.owner_contact ?? null,
    ownershipNote: normalizedRow.spool.ownership_note ?? null,
    remainingGrams: normalizedRow.spool.remaining_g ?? null,
    spoolTareWeightGrams: normalizedRow.spool.spool_tare_weight_g ?? null,
    location: normalizedRow.spool.location_id ?? null,
    homeLocation: normalizedRow.spool.home_location_id ?? null,
    qrCode: normalizedRow.spool.qr_code ?? null,
    rfidTag: normalizedRow.spool.rfid_tag ?? null,
    rfidObservedAt: normalizedRow.spool.rfid_observed_at ?? null,
  };
}

export async function loadInventorySpools(
  options: InventoryDataSourceOptions,
  dependencies: InventoryDataSourceDependencies = {},
): Promise<InventoryDataLoadResult> {
  const loadRowsPage = dependencies.loadRowsPage ?? loadSpoolRowsPage;
  const fetchCachedSpools = dependencies.fetchCachedSpools ?? fetchCachedLibrarySyncSpools;

  try {
    const rows = dependencies.loadRowsPage
      ? await loadAllSpoolRowsWithPageLoader(
          options,
          DEFAULT_SPOOL_PAGE_SIZE,
          loadRowsPage,
        )
      : await loadAllSpoolRows(options);
    const cached = options.clientReadOnly
      ? await fetchCachedSpools().catch((): LibrarySyncCachedSpoolList | null => null)
      : null;
    return {
      rows: mapSpoolRowsToInventorySpools(rows),
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
        rows: mapSpoolRowsToInventorySpools(cached.rows),
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

export async function loadInventorySpoolDetail(
  options: InventorySpoolDetailOptions,
  dependencies: InventorySpoolDetailDependencies = {},
): Promise<InventorySpoolDetailLoadResult> {
  const fetchHostSpoolDetail = dependencies.fetchHostSpoolDetail ?? fetchLibrarySyncSpoolDetail;
  const listLocalHistory = dependencies.listLocalHistory ?? listSpoolHistory;
  const listLocalUsage = dependencies.listLocalUsage ?? listSpoolUsage;
  const { clientReadOnly, spoolId, historyLimit = 80, usageLimit = 500 } = options;

  if (clientReadOnly) {
    const hostTarget = resolveClientHostTarget(options);
    if (!hostTarget) {
      return {
        historyRows: [],
        usagePoints: [],
      };
    }

    const detail = await fetchHostSpoolDetail(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      spoolId,
      historyLimit,
      usageLimit,
    );
    return {
      historyRows: detail.history ?? [],
      usagePoints: detail.usage ?? [],
    };
  }

  const [historyRows, usagePoints] = await Promise.all([
    listLocalHistory(spoolId, historyLimit),
    listLocalUsage(spoolId, usageLimit),
  ]);

  return {
    historyRows,
    usagePoints,
  };
}
