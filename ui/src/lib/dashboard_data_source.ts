import {
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncWishlistItems,
  getLibrarySyncSettings,
  getTrustedLanCompanionStatus,
  inventoryOverview,
  listActiveSpoolLoans,
  listPrinterOverview,
  listWishlistItems,
  topMaterials,
  validateLibrarySyncHost,
  type LibrarySyncSettings,
  type TrustedLanCompanionStatus,
  type WishlistItemRow,
} from "./tauri_client";
import {
  buildDashboardDerivedState,
  type DashboardDerivedState,
} from "./dashboard_model";
import { loadAllSpoolRows } from "./spool_data_source";

type TranslateFn = (key: string, fallback: string) => string;

export type DashboardCompanionTone = "off" | "live" | "warn";
export type DashboardSyncSource = "local" | "client-live" | "client-cached";

export type DashboardDataLoadResult = {
  derived: DashboardDerivedState;
  syncMode: string;
  trustedLan: TrustedLanCompanionStatus | null;
  clientHostCompanionTone: DashboardCompanionTone;
  clientHostDisplayName: string | null;
  clientHostNeedsRepair: boolean;
  syncSource: DashboardSyncSource;
  capturedAt: string | null;
};

type DashboardDataDependencies = {
  loadSyncSettings?: () => Promise<LibrarySyncSettings | null>;
  loadTrustedLanStatus?: () => Promise<TrustedLanCompanionStatus | null>;
  validateHost?: typeof validateLibrarySyncHost;
  fetchHostSnapshot?: typeof fetchLibrarySyncSnapshot;
  fetchHostPrinterOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostLoans?: typeof fetchLibrarySyncLoans;
  fetchHostWishlist?: typeof fetchLibrarySyncWishlistItems;
  loadSpoolRows?: typeof loadAllSpoolRows;
  loadInventoryOverview?: typeof inventoryOverview;
  listLocalPrinters?: typeof listPrinterOverview;
  listLocalLoans?: typeof listActiveSpoolLoans;
  listLocalWishlist?: typeof listWishlistItems;
  listLocalTopMaterials?: typeof topMaterials;
  onLoadError?: (error: unknown) => void;
};

function parseSyncMode(syncSettings: LibrarySyncSettings | null): string {
  return (syncSettings?.mode ?? "STANDALONE").trim().toUpperCase();
}

export function hasInvalidClientPairingMessage(message?: string | null): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  return normalized.includes("desktop client pairing is no longer valid");
}

export async function loadDashboardData(
  params: {
    previousClientHostNeedsRepair: boolean;
    t: TranslateFn;
  },
  dependencies: DashboardDataDependencies = {},
): Promise<DashboardDataLoadResult> {
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const loadTrustedLanStatus = dependencies.loadTrustedLanStatus ?? getTrustedLanCompanionStatus;
  const validateHost = dependencies.validateHost ?? validateLibrarySyncHost;
  const fetchHostSnapshot = dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
  const fetchHostPrinterOverview =
    dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
  const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
  const fetchHostWishlist = dependencies.fetchHostWishlist ?? fetchLibrarySyncWishlistItems;
  const loadSpoolRows = dependencies.loadSpoolRows ?? loadAllSpoolRows;
  const loadInventoryOverview = dependencies.loadInventoryOverview ?? inventoryOverview;
  const listLocalPrinters = dependencies.listLocalPrinters ?? listPrinterOverview;
  const listLocalLoans = dependencies.listLocalLoans ?? listActiveSpoolLoans;
  const listLocalWishlist = dependencies.listLocalWishlist ?? listWishlistItems;
  const listLocalTopMaterials = dependencies.listLocalTopMaterials ?? topMaterials;
  const onLoadError = dependencies.onLoadError ?? console.error;

  const [syncSettings, trustedLan] = await Promise.all([
    loadSyncSettings().catch((error) => {
      onLoadError(error);
      return null;
    }),
    loadTrustedLanStatus().catch((error) => {
      onLoadError(error);
      return null;
    }),
  ]);

  const syncMode = parseSyncMode(syncSettings);
  const cachedSnapshot = syncSettings?.cached_snapshot ?? null;
  const clientMode = syncMode === "CLIENT";
  const persistedPairingNeedsRepair =
    clientMode &&
    !!syncSettings?.client_auth_paired &&
    hasInvalidClientPairingMessage(syncSettings?.last_validation_message);
  let clientHostNeedsRepair =
    clientMode && (params.previousClientHostNeedsRepair || persistedPairingNeedsRepair);
  let clientHostDisplayName = syncSettings?.host_device_name ?? cachedSnapshot?.device_name ?? null;
  let clientHostCompanionTone: DashboardCompanionTone = "off";

  if (clientMode) {
    if (syncSettings?.host_base_url && clientHostNeedsRepair) {
      clientHostCompanionTone = "warn";
    }
  } else {
    clientHostNeedsRepair = false;
  }

  let activeClientSnapshot = cachedSnapshot;
  let clientSnapshotSource: DashboardSyncSource = "client-cached";
  let clientSpoolRows = syncSettings?.cached_spools?.rows ?? null;
  let clientPrinterRows = syncSettings?.cached_printers?.rows ?? null;
  let clientLoanRows = syncSettings?.cached_loans?.rows ?? null;
  let clientWishlistRows: WishlistItemRow[] = [];

  if (clientMode && syncSettings?.host_base_url) {
    const [
      validationResult,
      snapshotResult,
      spoolsResult,
      printersResult,
      loansResult,
      wishlistResult,
    ] = await Promise.allSettled([
      validateHost(syncSettings.host_base_url, syncSettings.library_id),
      fetchHostSnapshot(syncSettings.host_base_url, syncSettings.library_id),
      loadSpoolRows({
        clientReadOnly: true,
        clientHostBaseUrl: syncSettings.host_base_url,
        clientLibraryId: syncSettings.library_id,
      }),
      fetchHostPrinterOverview(syncSettings.host_base_url, syncSettings.library_id),
      fetchHostLoans(syncSettings.host_base_url, syncSettings.library_id, 2000),
      fetchHostWishlist(syncSettings.host_base_url, syncSettings.library_id, 500),
    ]);

    if (validationResult.status === "fulfilled") {
      const validation = validationResult.value;
      clientHostNeedsRepair = validation.pairing_checked && !validation.pairing_valid;
      if (validation.device_name) {
        clientHostDisplayName = validation.device_name;
      }
    } else {
      onLoadError(validationResult.reason);
    }

    if (snapshotResult.status === "fulfilled") {
      activeClientSnapshot = snapshotResult.value;
      clientSnapshotSource = "client-live";
      clientHostCompanionTone = clientHostNeedsRepair ? "warn" : "live";
      clientHostDisplayName = snapshotResult.value.device_name ?? syncSettings.host_device_name ?? null;
    } else {
      onLoadError(snapshotResult.reason);
      clientHostCompanionTone = syncSettings.host_base_url ? "warn" : "off";
    }

    if (spoolsResult.status === "fulfilled") {
      clientSpoolRows = spoolsResult.value;
    } else {
      onLoadError(spoolsResult.reason);
    }
    if (printersResult.status === "fulfilled") {
      clientPrinterRows = printersResult.value;
    } else {
      onLoadError(printersResult.reason);
    }
    if (loansResult.status === "fulfilled") {
      clientLoanRows = loansResult.value;
    } else {
      onLoadError(loansResult.reason);
    }
    if (wishlistResult.status === "fulfilled") {
      clientWishlistRows = wishlistResult.value;
    } else {
      onLoadError(wishlistResult.reason);
    }
  }

  if (clientMode && activeClientSnapshot) {
    return {
      derived: buildDashboardDerivedState({
        overview: activeClientSnapshot.inventory,
        printers: clientPrinterRows ?? [],
        spoolRows: clientSpoolRows ?? [],
        loans: clientLoanRows ?? [],
        wishlist: clientWishlistRows,
        materialRows: null,
        t: params.t,
      }),
      syncMode,
      trustedLan,
      clientHostCompanionTone,
      clientHostDisplayName,
      clientHostNeedsRepair,
      syncSource: clientSnapshotSource,
      capturedAt: activeClientSnapshot.captured_at,
    };
  }

  const [overview, printers, spoolRows, loans, wishlist, materialRows] = await Promise.all([
    loadInventoryOverview(),
    listLocalPrinters(),
    loadSpoolRows({
      clientReadOnly: false,
      clientHostBaseUrl: null,
      clientLibraryId: null,
    }),
    listLocalLoans(),
    listLocalWishlist(500),
    listLocalTopMaterials(12),
  ]);

  return {
    derived: buildDashboardDerivedState({
      overview,
      printers,
      spoolRows,
      loans,
      wishlist,
      materialRows,
      t: params.t,
    }),
    syncMode,
    trustedLan,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    syncSource: "local",
    capturedAt: null,
  };
}
