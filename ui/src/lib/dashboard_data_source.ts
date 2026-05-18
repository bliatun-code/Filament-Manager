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
import { deriveInventoryOverviewFromRows } from "./statistics_model";
import { loadAllSpoolRows } from "./spool_data_source";
import { resolveClientHostTarget } from "./host_write_target";

type TranslateFn = (key: string, fallback: string) => string;

export type DashboardCompanionTone = "off" | "live" | "warn";
export type DashboardSyncSource = "local" | "client-live" | "client-cached" | "client-offline";

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

function emptyInventoryOverview() {
  return {
    total_spools: 0,
    total_owned_spools: 0,
    total_borrowed_in_spools: 0,
    in_use: 0,
    owned_in_use: 0,
    borrowed_in_in_use: 0,
    low_stock: 0,
    owned_low_stock: 0,
    borrowed_in_low_stock: 0,
    total_consumption_30d: 0,
    owned_consumption_30d: 0,
    borrowed_in_consumption_30d: 0,
  };
}

export function hasInvalidClientPairingMessage(message?: string | null): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  return normalized.includes("desktop client pairing is no longer valid");
}

function firstDefinedTimestamp(
  ...values: Array<string | null | undefined>
): string | null {
  return values.find((value): value is string => !!value) ?? null;
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
  let clientSpoolRows = syncSettings?.cached_spools?.rows ?? null;
  let clientPrinterRows = syncSettings?.cached_printers?.rows ?? null;
  let clientLoanRows = syncSettings?.cached_loans?.rows ?? null;
  let clientWishlistRows: WishlistItemRow[] = syncSettings?.cached_wishlist?.rows ?? [];
  let clientSnapshotLive = false;
  let clientSpoolsLive = false;
  let clientPrintersLive = false;
  let clientLoansLive = false;
  let clientWishlistLive = false;
  const clientHostTarget = clientMode
    ? resolveClientHostTarget({
        clientHostBaseUrl: syncSettings?.host_base_url,
        clientLibraryId: syncSettings?.library_id,
      })
    : null;

  if (clientHostTarget) {
    const [
      validationResult,
      snapshotResult,
      spoolsResult,
      printersResult,
      loansResult,
      wishlistResult,
    ] = await Promise.allSettled([
      validateHost(clientHostTarget.baseUrl, clientHostTarget.libraryId),
      fetchHostSnapshot(clientHostTarget.baseUrl, clientHostTarget.libraryId),
      loadSpoolRows({
        clientReadOnly: true,
        clientHostBaseUrl: clientHostTarget.baseUrl,
        clientLibraryId: clientHostTarget.libraryId,
      }),
      fetchHostPrinterOverview(clientHostTarget.baseUrl, clientHostTarget.libraryId),
      fetchHostLoans(clientHostTarget.baseUrl, clientHostTarget.libraryId, 2000),
      fetchHostWishlist(clientHostTarget.baseUrl, clientHostTarget.libraryId, 500),
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
      clientSnapshotLive = true;
      clientHostCompanionTone = clientHostNeedsRepair ? "warn" : "live";
      clientHostDisplayName =
        snapshotResult.value.device_name ?? syncSettings?.host_device_name ?? null;
    } else {
      onLoadError(snapshotResult.reason);
      clientHostCompanionTone = syncSettings?.host_base_url ? "warn" : "off";
    }

    if (spoolsResult.status === "fulfilled") {
      clientSpoolRows = spoolsResult.value;
      clientSpoolsLive = true;
    } else {
      onLoadError(spoolsResult.reason);
    }
    if (printersResult.status === "fulfilled") {
      clientPrinterRows = printersResult.value;
      clientPrintersLive = true;
    } else {
      onLoadError(printersResult.reason);
    }
    if (loansResult.status === "fulfilled") {
      clientLoanRows = loansResult.value;
      clientLoansLive = true;
    } else {
      onLoadError(loansResult.reason);
    }
    if (wishlistResult.status === "fulfilled") {
      clientWishlistRows = wishlistResult.value;
      clientWishlistLive = true;
    } else {
      onLoadError(wishlistResult.reason);
    }
  }

  const hasClientCachedRows =
    (clientSpoolRows?.length ?? 0) > 0 ||
    (clientPrinterRows?.length ?? 0) > 0 ||
    (clientLoanRows?.length ?? 0) > 0 ||
    clientWishlistRows.length > 0;
  const clientRowsOverview =
    (clientSpoolRows?.length ?? 0) > 0
      ? deriveInventoryOverviewFromRows(clientSpoolRows ?? [], [])
      : null;
  const clientOverview = clientRowsOverview ?? activeClientSnapshot?.inventory ?? null;
  const clientRowsOverviewCapturedAt =
    clientRowsOverview && !clientHostTarget
      ? syncSettings?.cached_spools?.captured_at ?? null
      : null;

  if (clientMode) {
    const hasClientData = !!clientOverview || hasClientCachedRows;
    const allClientReadsLive =
      !!clientHostTarget &&
      clientSnapshotLive &&
      clientSpoolsLive &&
      clientPrintersLive &&
      clientLoansLive &&
      clientWishlistLive;
    const syncSource: DashboardSyncSource = hasClientData
      ? allClientReadsLive
        ? "client-live"
        : "client-cached"
      : "client-offline";
    const fallbackCapturedAt = firstDefinedTimestamp(
      clientRowsOverviewCapturedAt,
      clientSpoolsLive ? null : syncSettings?.cached_spools?.captured_at,
      clientPrintersLive ? null : syncSettings?.cached_printers?.captured_at,
      clientLoansLive ? null : syncSettings?.cached_loans?.captured_at,
      clientWishlistLive ? null : syncSettings?.cached_wishlist?.captured_at,
      clientSnapshotLive ? null : activeClientSnapshot?.captured_at,
    );
    const liveCapturedAt = firstDefinedTimestamp(
      activeClientSnapshot?.captured_at,
      syncSettings?.cached_spools?.captured_at,
      syncSettings?.cached_printers?.captured_at,
      syncSettings?.cached_loans?.captured_at,
      syncSettings?.cached_wishlist?.captured_at,
    );
    return {
      derived: buildDashboardDerivedState({
        overview: clientOverview ?? emptyInventoryOverview(),
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
      syncSource,
      capturedAt: syncSource === "client-live" ? liveCapturedAt : fallbackCapturedAt ?? liveCapturedAt,
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
