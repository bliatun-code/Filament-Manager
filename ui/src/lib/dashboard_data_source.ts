import {
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncWishlistItems,
  getLibrarySyncSettings,
  getPrinterSettings,
  getTrustedLanCompanionStatus,
  inventoryOverview,
  listActiveSpoolLoans,
  listPrinterOverview,
  listWishlistItems,
  type validateLibrarySyncHost,
  type LibrarySyncSettings,
  type InventoryOverview,
  type TrustedLanCompanionStatus,
  type WishlistItemRow,
} from "./tauri_client";
import {
  buildDashboardBambuLiveAttention,
  type DashboardBambuLiveAttention,
} from "./dashboard_bambu_live_attention";
import {
  buildDashboardActionItems,
  type DashboardActionItem,
} from "./dashboard_action_model";
import {
  buildDashboardDerivedState,
  type DashboardDerivedState,
} from "./dashboard_model";
import { deriveInventoryOverviewFromRows } from "./statistics_model";
import {
  normalizeActiveLoanRow,
  normalizeLoanDetailsRow,
} from "./loan_row_normalization";
import { localCalendarDate } from "./loan_due_state";
import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import { loadAllSpoolRows } from "./spool_data_source";
import { resolveClientHostTarget } from "./host_write_target";
import { firstDefinedTimestamp } from "./source_timestamps";
import {
  resolveLibraryRevisionSource,
  type LibraryRevisionSource,
} from "./library_domain_revisions";
import {
  createDashboardHostConnectionState,
  observeDashboardHostConnection,
  type DashboardHostConnectionObservation,
  type DashboardHostConnectionState,
  type DashboardHostConnectionTone,
} from "./dashboard_host_connection";
import type { NumberDisplayLocale } from "./number_display";

type TranslateFn = (key: string, fallback: string) => string;

export type DashboardCompanionTone = DashboardHostConnectionTone;
export type DashboardSyncSource =
  "local" | "client-live" | "client-cached" | "client-offline";

export type DashboardDataLoadResult = {
  actionItems: DashboardActionItem[];
  bambuLiveAttention: DashboardBambuLiveAttention[];
  derived: DashboardDerivedState;
  libraryId: string | null;
  syncMode: string;
  trustedLan: TrustedLanCompanionStatus | null;
  clientHostConnectionObservation: DashboardHostConnectionObservation;
  clientHostConnectionState: DashboardHostConnectionState;
  clientHostCompanionTone: DashboardCompanionTone;
  clientHostDisplayName: string | null;
  clientHostNeedsRepair: boolean;
  clientHostPaired: boolean;
  setupDataAvailable: boolean;
  syncSource: DashboardSyncSource;
  capturedAt: string | null;
  revisionSource: LibraryRevisionSource | null;
  revisionPollComplete: boolean;
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
  loadPrinterSettings?: typeof getPrinterSettings;
  listLocalPrinters?: typeof listPrinterOverview;
  listLocalLoans?: typeof listActiveSpoolLoans;
  listLocalWishlist?: typeof listWishlistItems;
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
    consumption_12m_available: false,
    total_consumption_12m: 0,
    consumption_12m: [],
  };
}

function preserveSnapshotConsumption(
  overview: InventoryOverview | null,
  snapshotOverview: InventoryOverview | null,
): InventoryOverview | null {
  if (!overview || !snapshotOverview) {
    return overview ?? snapshotOverview;
  }
  return {
    ...overview,
    total_consumption_30d: snapshotOverview.total_consumption_30d,
    owned_consumption_30d: snapshotOverview.owned_consumption_30d,
    borrowed_in_consumption_30d: snapshotOverview.borrowed_in_consumption_30d,
    consumption_12m_available:
      snapshotOverview.consumption_12m_available === true,
    total_consumption_12m:
      snapshotOverview.total_consumption_12m ?? overview.total_consumption_12m,
    consumption_12m:
      snapshotOverview.consumption_12m?.map((row) => ({ ...row })) ??
      overview.consumption_12m,
  };
}

export function hasInvalidClientPairingMessage(
  message?: string | null,
): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  return normalized.includes("desktop client pairing is no longer valid");
}

function hasImmediateClientPairingRepairError(error: unknown): boolean {
  if (error && typeof error === "object") {
    if (
      "status" in error &&
      Number((error as { status?: unknown }).status) === 401
    ) {
      return true;
    }
    if ("message" in error) {
      return hasImmediateClientPairingRepairError(
        (error as { message?: unknown }).message,
      );
    }
  }
  const message = String(error ?? "")
    .trim()
    .toLowerCase();
  return (
    hasInvalidClientPairingMessage(message) ||
    /(?:returned|status(?: code)?(?: is)?|response:)\s+401\b/.test(message) ||
    /\b401\s+unauthorized\b/.test(message) ||
    message.includes("unauthorized") ||
    (message.includes("pairing") &&
      (message.includes("invalid") || message.includes("expired")))
  );
}

export async function loadDashboardData(
  params: {
    clientCacheOnly?: boolean;
    locale?: NumberDisplayLocale;
    now?: Date;
    previousClientHostConnectionState?: DashboardHostConnectionState;
    previousClientHostNeedsRepair: boolean;
    t: TranslateFn;
    today?: string;
  },
  dependencies: DashboardDataDependencies = {},
): Promise<DashboardDataLoadResult> {
  const loadSyncSettings =
    dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const loadTrustedLanStatus =
    dependencies.loadTrustedLanStatus ?? getTrustedLanCompanionStatus;
  const fetchHostSnapshot =
    dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
  const fetchHostPrinterOverview =
    dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
  const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
  const fetchHostWishlist =
    dependencies.fetchHostWishlist ?? fetchLibrarySyncWishlistItems;
  const loadSpoolRows = dependencies.loadSpoolRows ?? loadAllSpoolRows;
  const loadInventoryOverview =
    dependencies.loadInventoryOverview ?? inventoryOverview;
  const loadPrinterSettings =
    dependencies.loadPrinterSettings ?? getPrinterSettings;
  const listLocalPrinters =
    dependencies.listLocalPrinters ?? listPrinterOverview;
  const listLocalLoans = dependencies.listLocalLoans ?? listActiveSpoolLoans;
  const listLocalWishlist = dependencies.listLocalWishlist ?? listWishlistItems;
  const onLoadError = dependencies.onLoadError ?? console.error;
  const actionNow = params.now ?? new Date();
  const actionToday = params.today ?? localCalendarDate(actionNow);

  const [syncSettings, trustedLan] = await Promise.all([
    loadSyncSettings(),
    loadTrustedLanStatus().catch((error) => {
      onLoadError(error);
      return null;
    }),
  ]);

  const syncMode = parseSyncMode(syncSettings);
  const libraryId = syncSettings?.library_id?.trim() || null;
  const cachedSnapshot = syncSettings?.cached_snapshot ?? null;
  const clientMode = syncMode === "CLIENT";
  const revisionSource = resolveLibraryRevisionSource({
    clientReadOnly: clientMode,
    clientHostBaseUrl: syncSettings?.host_base_url,
    clientLibraryId: syncSettings?.library_id,
  });
  const persistedPairingNeedsRepair =
    clientMode &&
    !!syncSettings?.client_auth_paired &&
    hasInvalidClientPairingMessage(syncSettings?.last_validation_message);
  let clientHostNeedsRepair =
    clientMode &&
    (params.previousClientHostNeedsRepair || persistedPairingNeedsRepair);
  let clientHostDisplayName =
    syncSettings?.host_device_name ?? cachedSnapshot?.device_name ?? null;
  let clientHostConnectionObservation: DashboardHostConnectionObservation =
    clientMode ? "checking" : "unconfigured";

  if (!clientMode) {
    clientHostNeedsRepair = false;
  }

  let activeClientSnapshot = cachedSnapshot;
  let clientSpoolRows = syncSettings?.cached_spools?.rows ?? null;
  let clientPrinterRows = syncSettings?.cached_printers?.rows ?? null;
  let clientLoanRows = syncSettings?.cached_loans?.rows ?? null;
  let clientWishlistRows: WishlistItemRow[] =
    syncSettings?.cached_wishlist?.rows ?? [];
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

  if (clientHostTarget && !params.clientCacheOnly) {
    const [
      snapshotResult,
      spoolsResult,
      printersResult,
      loansResult,
      wishlistResult,
    ] = await Promise.allSettled([
      fetchHostSnapshot(clientHostTarget.baseUrl, clientHostTarget.libraryId),
      loadSpoolRows({
        clientReadOnly: true,
        clientHostBaseUrl: clientHostTarget.baseUrl,
        clientLibraryId: clientHostTarget.libraryId,
        clientTargetGeneration: syncSettings?.target_generation ?? null,
      }),
      fetchHostPrinterOverview(
        clientHostTarget.baseUrl,
        clientHostTarget.libraryId,
      ),
      fetchHostLoans(
        clientHostTarget.baseUrl,
        clientHostTarget.libraryId,
        2000,
      ),
      fetchHostWishlist(
        clientHostTarget.baseUrl,
        clientHostTarget.libraryId,
        500,
      ),
    ]);

    if (snapshotResult.status === "fulfilled") {
      activeClientSnapshot = snapshotResult.value;
      clientSnapshotLive = true;
      clientHostDisplayName =
        snapshotResult.value.device_name ??
        syncSettings?.host_device_name ??
        null;
    } else {
      onLoadError(snapshotResult.reason);
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

    const rejectedHostErrors = [
      snapshotResult,
      spoolsResult,
      printersResult,
      loansResult,
      wishlistResult,
    ].flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    const anyCoreHostReadSucceeded = [
      snapshotResult,
      spoolsResult,
      printersResult,
      loansResult,
      wishlistResult,
    ].some((result) => result.status === "fulfilled");
    const pairingRepairRequired = rejectedHostErrors.some(
      hasImmediateClientPairingRepairError,
    );
    if (pairingRepairRequired) {
      clientHostNeedsRepair = true;
    } else if (anyCoreHostReadSucceeded) {
      // Every core endpoint is authenticated. Any successful response therefore proves that
      // the current pairing works, even when an older validation message was persisted.
      clientHostNeedsRepair = false;
    }
    clientHostConnectionObservation = clientHostNeedsRepair
      ? "repair"
      : anyCoreHostReadSucceeded
        ? "succeeded"
        : "failed";
  } else if (clientHostNeedsRepair) {
    clientHostConnectionObservation = "repair";
  } else if (!clientHostTarget) {
    clientHostConnectionObservation = "unconfigured";
  }

  const clientHostConnectionState = observeDashboardHostConnection(
    params.previousClientHostConnectionState ??
      createDashboardHostConnectionState(),
    clientHostConnectionObservation,
  );
  const clientHostCompanionTone = clientHostConnectionState.tone;

  const hasClientCachedRows =
    (clientSpoolRows?.length ?? 0) > 0 ||
    (clientPrinterRows?.length ?? 0) > 0 ||
    (clientLoanRows?.length ?? 0) > 0 ||
    clientWishlistRows.length > 0;
  const normalizedClientSpoolRows =
    clientSpoolRows != null
      ? normalizeSpoolWithMasterRows(clientSpoolRows)
      : null;
  const clientRowsOverview =
    (normalizedClientSpoolRows?.length ?? 0) > 0
      ? deriveInventoryOverviewFromRows(normalizedClientSpoolRows ?? [], [])
      : null;
  const clientOverview = preserveSnapshotConsumption(
    clientRowsOverview,
    activeClientSnapshot?.inventory ?? null,
  );
  const clientRowsOverviewCapturedAt =
    clientRowsOverview && !clientHostTarget
      ? (syncSettings?.cached_spools?.captured_at ?? null)
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
    const normalizedClientLoans = (clientLoanRows ?? []).map(
      normalizeLoanDetailsRow,
    );
    return {
      actionItems: buildDashboardActionItems({
        bambuLiveAttention: [],
        loans: normalizedClientLoans,
        now: actionNow,
        spoolRows: normalizedClientSpoolRows ?? [],
        today: actionToday,
        wishlist: clientWishlistRows,
      }),
      bambuLiveAttention: [],
      derived: buildDashboardDerivedState({
        overview: clientOverview ?? emptyInventoryOverview(),
        printers: clientPrinterRows ?? [],
        spoolRows: normalizedClientSpoolRows ?? [],
        loans: normalizedClientLoans,
        wishlist: clientWishlistRows,
        locale: params.locale,
        now: actionNow,
        t: params.t,
      }),
      libraryId,
      syncMode,
      trustedLan,
      clientHostConnectionObservation,
      clientHostConnectionState,
      clientHostCompanionTone,
      clientHostDisplayName,
      clientHostNeedsRepair,
      clientHostPaired:
        !!syncSettings?.client_auth_paired && !clientHostNeedsRepair,
      setupDataAvailable: hasClientData,
      syncSource,
      capturedAt:
        syncSource === "client-live"
          ? liveCapturedAt
          : (fallbackCapturedAt ?? liveCapturedAt),
      revisionSource,
      revisionPollComplete: allClientReadsLive,
    };
  }

  const [overview, printers, spoolRowsRaw, loans, wishlist, printerSettings] =
    await Promise.all([
      loadInventoryOverview(),
      listLocalPrinters(),
      loadSpoolRows({
        clientReadOnly: false,
        clientHostBaseUrl: null,
        clientLibraryId: null,
        clientTargetGeneration: null,
      }),
      listLocalLoans(),
      listLocalWishlist(500),
      loadPrinterSettings().catch((error) => {
        onLoadError(error);
        return null;
      }),
    ]);
  const spoolRows = normalizeSpoolWithMasterRows(spoolRowsRaw);
  const normalizedLoans = loans.map(normalizeActiveLoanRow);
  const bambuLiveAttention = buildDashboardBambuLiveAttention(printerSettings);

  return {
    actionItems: buildDashboardActionItems({
      bambuLiveAttention,
      loans: normalizedLoans,
      now: actionNow,
      spoolRows,
      today: actionToday,
      wishlist,
    }),
    bambuLiveAttention,
    derived: buildDashboardDerivedState({
      overview,
      printers,
      spoolRows,
      loans: normalizedLoans,
      wishlist,
      locale: params.locale,
      now: actionNow,
      t: params.t,
    }),
    libraryId,
    syncMode,
    trustedLan,
    clientHostConnectionObservation,
    clientHostConnectionState,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    clientHostPaired: false,
    setupDataAvailable: true,
    syncSource: "local",
    capturedAt: null,
    revisionSource,
    revisionPollComplete: true,
  };
}
