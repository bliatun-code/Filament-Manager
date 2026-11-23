import {
  fetchLibrarySyncActiveLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncWishlistItems,
  getLibrarySyncPageStatus,
  getLibrarySyncSettings,
  getPrinterSettings,
  getTrustedLanCompanionStatus,
  inventoryOverview,
  listActiveSpoolLoans,
  listPrinterOverview,
  listWishlistItems,
  type validateLibrarySyncHost,
  type LibrarySyncCacheDomain,
  type LibrarySyncPageStatus,
  type LibrarySyncSettings,
  type InventoryOverview,
  type TrustedLanCompanionStatus,
  type WishlistItemRow,
  type WishlistPurchaseTarget,
  type BambuLiveIntegrationEntry,
  type PrinterOverviewRow,
} from "./tauri_client";
import { buildDashboardLowStockPreview, sanitizeDashboardBambuLiveIntegrations, type DashboardStockPreviewRow } from "./dashboard_overview_data";
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
import { parseDateTimeMs } from "./date_time";
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
  printerOverview: PrinterOverviewRow[];
  printerOverviewAvailable: boolean;
  bambuLiveIntegrations: BambuLiveIntegrationEntry[];
  lowStockPreview: DashboardStockPreviewRow[];
  lowStockPreviewAvailable: boolean;
  actionItems: DashboardActionItem[];
  libraryTarget?: WishlistPurchaseTarget;
  wishlistFresh: boolean;
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
  loadSyncSettings?: (domains?: readonly LibrarySyncCacheDomain[]) => Promise<DashboardSyncSettings | null>;
  loadTrustedLanStatus?: () => Promise<TrustedLanCompanionStatus | null>;
  validateHost?: typeof validateLibrarySyncHost;
  fetchHostSnapshot?: typeof fetchLibrarySyncSnapshot;
  fetchHostPrinterOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostPrinterSettings?: typeof fetchLibrarySyncPrinterSettings;
  fetchHostActiveLoans?: typeof fetchLibrarySyncActiveLoans;
  fetchHostWishlist?: typeof fetchLibrarySyncWishlistItems;
  loadSpoolRows?: typeof loadAllSpoolRows;
  loadInventoryOverview?: typeof inventoryOverview;
  loadPrinterSettings?: typeof getPrinterSettings;
  listLocalPrinters?: typeof listPrinterOverview;
  listLocalLoans?: typeof listActiveSpoolLoans;
  listLocalWishlist?: typeof listWishlistItems;
  onLoadError?: (error: unknown) => void;
};

function parseSyncMode(syncSettings: LibrarySyncPageStatus | null): string {
  return (syncSettings?.mode ?? "STANDALONE").trim().toUpperCase();
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

const dashboardCacheDomains = ["dashboard_stock", "printers", "active_loans", "wishlist"] as const;

export type DashboardSyncSettings = LibrarySyncPageStatus & Partial<LibrarySyncSettings>;
type DashboardBootstrapCache = { current: DashboardSyncSettings | null };

// Omitted domains request only target status. An empty list also returns validation metadata.
function readDashboardSettings(domains?: readonly LibrarySyncCacheDomain[]): Promise<DashboardSyncSettings> {
  return domains ? getLibrarySyncSettings(domains) : getLibrarySyncPageStatus();
}

class DashboardTargetChanged extends Error {
  constructor() {
    super("The dashboard library changed during refresh.");
  }
}

function assertDashboardTarget(expected: LibrarySyncPageStatus | null, current: LibrarySyncPageStatus | null) {
  if (
    expected?.mode !== current?.mode || expected?.host_base_url !== current?.host_base_url ||
    expected?.library_id !== current?.library_id || expected?.target_generation !== current?.target_generation
  ) {
    throw new DashboardTargetChanged();
  }
}

type DashboardLoadParams = {
  clientCacheOnly?: boolean;
  bootstrapCache?: DashboardBootstrapCache;
  locale?: NumberDisplayLocale;
  now?: Date;
  previousClientHostConnectionState?: DashboardHostConnectionState;
  previousClientHostNeedsRepair: boolean;
  t: TranslateFn;
  today?: string;
};

export async function loadDashboardData(
  params: DashboardLoadParams,
  dependencies: DashboardDataDependencies = {},
): Promise<DashboardDataLoadResult> {
  try {
    return await readDashboardData(params, dependencies);
  } catch (error) {
    if (!(error instanceof DashboardTargetChanged)) throw error;
    // Discard the entire old response. Paint the new target's offline view before retrying live.
    return readDashboardData({
      ...params,
      clientCacheOnly: true,
      previousClientHostConnectionState: undefined,
      previousClientHostNeedsRepair: false,
    }, dependencies);
  }
}

async function readDashboardData(
  params: DashboardLoadParams,
  dependencies: DashboardDataDependencies,
): Promise<DashboardDataLoadResult> {
  const loadSyncSettings =
    dependencies.loadSyncSettings ?? readDashboardSettings;
  const loadTrustedLanStatus =
    dependencies.loadTrustedLanStatus ?? getTrustedLanCompanionStatus;
  const fetchHostSnapshot =
    dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
  const fetchHostPrinterOverview =
    dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
  const fetchHostPrinterSettings = dependencies.fetchHostPrinterSettings ?? fetchLibrarySyncPrinterSettings;
  const fetchHostActiveLoans = dependencies.fetchHostActiveLoans ?? fetchLibrarySyncActiveLoans;
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

  const bootstrap = params.bootstrapCache?.current;
  if (params.bootstrapCache) params.bootstrapCache.current = null;
  // The handoff already includes validation metadata. Only recheck its current target.
  const domains = params.clientCacheOnly
    ? dashboardCacheDomains
    : bootstrap ? undefined : [];
  const [syncSettings, trustedLan] = await Promise.all([
    loadSyncSettings(domains),
    loadTrustedLanStatus().catch((error) => {
      onLoadError(error);
      return null;
    }),
  ]);

  const syncMode = parseSyncMode(syncSettings);
  const libraryId = syncSettings?.library_id?.trim() || null;
  // Only the displayed identity travels with a suggestion, including when restored from the page cache.
  const generation = syncSettings?.target_generation;
  const purchaseTarget = libraryId && generation !== undefined && Number.isSafeInteger(generation) && generation >= 0
    ? { mode: syncMode, library_id: libraryId, host_base_url: syncSettings?.host_base_url ?? null, target_generation: generation }
    : undefined;
  const clientMode = syncMode === "CLIENT";
  const revisionSource = resolveLibraryRevisionSource({
    clientReadOnly: clientMode,
    clientHostBaseUrl: syncSettings?.host_base_url,
    clientLibraryId: syncSettings?.library_id,
  });
  if (bootstrap && !params.clientCacheOnly) assertDashboardTarget(bootstrap, syncSettings);
  const pairingMetadata = params.clientCacheOnly ? syncSettings : bootstrap ?? syncSettings;
  const persistedPairingNeedsRepair =
    clientMode &&
    !!syncSettings?.client_auth_paired &&
    hasInvalidClientPairingMessage(pairingMetadata?.last_validation_message);
  let clientHostNeedsRepair =
    clientMode &&
    (params.previousClientHostNeedsRepair || persistedPairingNeedsRepair);
  let clientHostConnectionObservation: DashboardHostConnectionObservation =
    clientMode ? "checking" : "unconfigured";

  if (!clientMode) {
    clientHostNeedsRepair = false;
  }

  let clientLiveIntegrations: BambuLiveIntegrationEntry[] = [];
  let clientPrinterSettingsLive = false;
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

  const loadLegacyStock = (target: NonNullable<typeof clientHostTarget>) => loadSpoolRows({
    clientReadOnly: true,
    clientHostBaseUrl: target.baseUrl,
    clientLibraryId: target.libraryId,
    clientTargetGeneration: syncSettings?.target_generation ?? null,
  });
  const stockSnapshot = clientHostTarget && !params.clientCacheOnly
    ? fetchHostSnapshot(clientHostTarget.baseUrl, clientHostTarget.libraryId, {
        dashboard: true, expectedGeneration: syncSettings?.target_generation,
      })
    : null;
  const live = clientHostTarget && stockSnapshot
    ? await Promise.allSettled([
        stockSnapshot,
        // Older Hosts omit the projection. Only those successful replies need the full legacy list.
        stockSnapshot.then(snapshot => snapshot.dashboard_stock ? null : loadLegacyStock(clientHostTarget)),
        fetchHostPrinterOverview(
          clientHostTarget.baseUrl,
          clientHostTarget.libraryId,
        ),
        fetchHostActiveLoans(
          clientHostTarget.baseUrl,
          clientHostTarget.libraryId,
        ),
        fetchHostWishlist(
          clientHostTarget.baseUrl,
          clientHostTarget.libraryId,
          500,
        ),
        fetchHostPrinterSettings(clientHostTarget.baseUrl, clientHostTarget.libraryId),
      ])
    : null;

  let cache = syncSettings;
  if (clientMode && params.clientCacheOnly) {
    assertDashboardTarget(syncSettings, await loadSyncSettings());
    if (params.bootstrapCache) params.bootstrapCache.current = syncSettings;
  } else if (clientMode) {
    const [summary, spools, printers, loans, wishlist] = live ?? [];
    const cacheableReads = [
      ["dashboard_stock", summary], ["printers", printers],
      ["active_loans", loans], ["wishlist", wishlist],
    ] as const;
    const missing: LibrarySyncCacheDomain[] = cacheableReads.flatMap(([domain, result]) =>
      result?.status === "fulfilled" ? [] : [domain],
    );
    if (summary?.status === "fulfilled" && spools?.status === "rejected") missing.push("spools");
    const reuseBootstrap = bootstrap && Number.isSafeInteger(bootstrap.target_generation);
    if (missing.length > 0 && !reuseBootstrap) {
      // This one transaction both reads the failed domains and confirms their target.
      cache = await loadSyncSettings(missing).catch((error) => {
        onLoadError(error);
        return null;
      });
      assertDashboardTarget(syncSettings, cache ?? await loadSyncSettings());
    } else {
      if (reuseBootstrap) cache = bootstrap;
      // A switch (including A -> B -> A) invalidates already completed Host replies, too.
      assertDashboardTarget(syncSettings, await loadSyncSettings());
    }
  }

  const cachedSnapshot = cache?.cached_snapshot ?? null;
  let clientHostDisplayName =
    syncSettings?.host_device_name ?? cachedSnapshot?.device_name ?? null;
  let activeClientSnapshot = cachedSnapshot;
  let clientSpoolRows = cache?.cached_spools?.rows ?? null;
  let clientPrinterRows = cache?.cached_printers?.rows ?? null;
  const cachedActiveLoans = cache?.cached_active_loans ?? cache?.cached_loans;
  let clientLoanRows = cachedActiveLoans?.rows ?? null;
  let clientWishlistRows: WishlistItemRow[] =
    cache?.cached_wishlist?.rows ?? [];

  if (live) {
    const [
      snapshotResult, spoolsResult, printersResult, loansResult, wishlistResult, printerSettingsResult,
    ] = live;

    for (const result of live) {
      if (result.status === "rejected" && (result !== spoolsResult || snapshotResult.status === "fulfilled")) {
        onLoadError(result.reason);
      }
    }
    if (printerSettingsResult.status === "fulfilled") {
      clientLiveIntegrations = sanitizeDashboardBambuLiveIntegrations(
        printerSettingsResult.value.bambu_live_integrations,
      );
      clientPrinterSettingsLive = true;
    }

    if (snapshotResult.status === "fulfilled") {
      activeClientSnapshot = snapshotResult.value;
      clientSnapshotLive = true;
      clientHostDisplayName =
        snapshotResult.value.device_name ??
        syncSettings?.host_device_name ??
        null;
    }

    if (spoolsResult.status === "fulfilled") {
      clientSpoolRows = spoolsResult.value;
      clientSpoolsLive = true;
    } else if (clientHostTarget && snapshotResult.status === "rejected" && cachedSnapshot && !cachedSnapshot.dashboard_stock &&
        [printersResult, loansResult, wishlistResult].some(result => result.status === "fulfilled")) {
      // A legacy Host may still serve fresh stock when only its summary endpoint fails.
      try {
        clientSpoolRows = await loadLegacyStock(clientHostTarget);
        clientSpoolsLive = true;
      } catch (error) {
        onLoadError(error);
      }
      assertDashboardTarget(syncSettings, await loadSyncSettings());
    }
    if (printersResult.status === "fulfilled") {
      clientPrinterRows = printersResult.value;
      clientPrintersLive = true;
    }
    if (loansResult.status === "fulfilled") {
      clientLoanRows = loansResult.value;
      clientLoansLive = true;
    }
    if (wishlistResult.status === "fulfilled") {
      clientWishlistRows = wishlistResult.value;
      clientWishlistLive = true;
    }

    const coreReads = [snapshotResult, spoolsResult, printersResult, loansResult, wishlistResult];
    const anyCoreHostReadSucceeded = coreReads.some((result) => result.status === "fulfilled");
    const pairingRepairRequired = coreReads.some((result) =>
      result.status === "rejected" && hasImmediateClientPairingRepairError(result.reason),
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

  const dashboardStock = activeClientSnapshot?.dashboard_stock;
  const normalizedClientSpoolRows =
    !dashboardStock && clientSpoolRows != null
      ? normalizeSpoolWithMasterRows(clientSpoolRows)
      : null;
  const rowsCapturedAt = parseDateTimeMs(cache?.cached_spools?.captured_at);
  const summaryCapturedAt = parseDateTimeMs(activeClientSnapshot?.captured_at);
  const cacheConfirmsEmptyStock = !clientSnapshotLive && (
    activeClientSnapshot == null ||
    (rowsCapturedAt != null && summaryCapturedAt != null && rowsCapturedAt >= summaryCapturedAt)
  );
  const clientRowsOverview =
    normalizedClientSpoolRows &&
    (clientSpoolsLive || normalizedClientSpoolRows.length > 0 || cacheConfirmsEmptyStock)
      ? deriveInventoryOverviewFromRows(normalizedClientSpoolRows, [])
      : null;
  const clientOverview = preserveSnapshotConsumption(
    clientRowsOverview,
    activeClientSnapshot?.inventory ?? null,
  );
  const clientRowsOverviewCapturedAt =
    clientRowsOverview && !clientHostTarget
      ? (cache?.cached_spools?.captured_at ?? null)
      : null;

  if (clientMode) {
    const hasClientData =
      clientOverview != null || clientSpoolRows != null || clientPrinterRows != null ||
      clientLoanRows != null || clientWishlistLive || cache?.cached_wishlist != null;
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
      clientSpoolsLive ? null : cache?.cached_spools?.captured_at,
      clientPrintersLive ? null : cache?.cached_printers?.captured_at,
      clientLoansLive ? null : cachedActiveLoans?.captured_at,
      clientWishlistLive ? null : cache?.cached_wishlist?.captured_at,
      clientSnapshotLive ? null : activeClientSnapshot?.captured_at,
    );
    const liveCapturedAt = firstDefinedTimestamp(
      activeClientSnapshot?.captured_at,
      cache?.cached_spools?.captured_at,
      cache?.cached_printers?.captured_at,
      cachedActiveLoans?.captured_at,
      cache?.cached_wishlist?.captured_at,
    );
    const normalizedClientLoans = (clientLoanRows ?? []).map(
      normalizeLoanDetailsRow,
    );
    return {
      printerOverview: clientPrinterRows ?? [],
      printerOverviewAvailable: clientPrinterRows != null,
      bambuLiveIntegrations: syncSource === "client-live" ? clientLiveIntegrations : [],
      lowStockPreview: dashboardStock?.preview ?? buildDashboardLowStockPreview(normalizedClientSpoolRows ?? []),
      lowStockPreviewAvailable: dashboardStock != null || normalizedClientSpoolRows != null,
      libraryTarget: purchaseTarget,
      wishlistFresh: clientWishlistLive,
      actionItems: buildDashboardActionItems({
        stockGroups: dashboardStock?.groups,
        purchaseTarget,
        bambuLiveAttention: [],
        loans: normalizedClientLoans,
        now: actionNow,
        spoolRows: normalizedClientSpoolRows ?? [],
        today: actionToday,
        wishlist: clientWishlistRows,
      }),
      bambuLiveAttention: [],
      derived: buildDashboardDerivedState({
        dashboardStock,
        overview: clientOverview ?? deriveInventoryOverviewFromRows([], []),
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
      setupDataAvailable:
        activeClientSnapshot != null || (clientSpoolRows != null && clientPrinterRows != null),
      syncSource,
      capturedAt:
        syncSource === "client-live"
          ? liveCapturedAt
          : (fallbackCapturedAt ?? liveCapturedAt),
      revisionSource,
      revisionPollComplete: allClientReadsLive && clientPrinterSettingsLive,
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
    printerOverview: printers,
    printerOverviewAvailable: true,
    bambuLiveIntegrations: sanitizeDashboardBambuLiveIntegrations(printerSettings?.bambu_live_integrations ?? []),
    lowStockPreview: buildDashboardLowStockPreview(spoolRows),
    lowStockPreviewAvailable: true,
    libraryTarget: purchaseTarget,
    wishlistFresh: true,
    actionItems: buildDashboardActionItems({
      purchaseTarget,
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
