import {
  fetchCachedLibrarySyncPrinterOverview,
  fetchCachedLibrarySyncSpools,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  fetchLibrarySyncSpoolSnapshot,
  getPrinterSettings,
  listPrinterOverview,
  type BambuLiveIntegrationEntry,
  type PrinterOverviewRow,
} from "./tauri_client";
import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  type loadSpoolRowsPage,
} from "./spool_data_source";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import {
  resolveClientHostCacheTarget,
  resolveClientHostTarget,
} from "./host_write_target";
import { firstDefinedTimestamp } from "./source_timestamps";

export type PrinterSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";
export type PrinterLibrarySyncState = LibrarySyncPageState;

export type PrinterDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
  supportedPrinterModels: string[];
};

export type PrinterOverviewDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
};

export type PrinterDataLoadResult = {
  printers: PrinterOverviewRow[];
  spools: NormalizedSpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  printerModels: string[];
  source: PrinterSnapshotSource;
  updatedAt: string | null;
  revisionPollComplete: boolean;
};

export type PrinterOverviewDataLoadResult = {
  printers: PrinterOverviewRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  source: PrinterSnapshotSource;
  updatedAt: string | null;
};

type PrinterOverviewDataSourceDependencies = {
  fetchHostOverview?: typeof fetchLibrarySyncPrinterOverview;
  listLocalOverview?: typeof listPrinterOverview;
  loadLocalSettings?: typeof getPrinterSettings;
  fetchCachedOverview?: typeof fetchCachedLibrarySyncPrinterOverview;
  onLoadError?: (error: unknown) => void;
};

type PrinterPageDataSourceDependencies = {
  fetchHostOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostSettings?: typeof fetchLibrarySyncPrinterSettings;
  fetchCachedOverview?: typeof fetchCachedLibrarySyncPrinterOverview;
  fetchCachedSpools?: typeof fetchCachedLibrarySyncSpools;
  fetchHostSpoolSnapshot?: typeof fetchLibrarySyncSpoolSnapshot;
  listLocalOverview?: typeof listPrinterOverview;
  loadLocalSettings?: typeof getPrinterSettings;
  loadLocalSpools?: typeof loadSpoolRowsPage;
  onLoadError?: (error: unknown) => void;
};

export function mapBambuLiveIntegrations(
  entries: BambuLiveIntegrationEntry[] | null | undefined,
): Record<string, BambuLiveIntegrationEntry["config"]> {
  return Object.fromEntries((entries ?? []).map((entry) => [entry.printer_id, entry.config]));
}

function resolvePrinterModels(
  printerModels: string[] | null | undefined,
  supportedPrinterModels: string[],
): string[] {
  return printerModels && printerModels.length > 0 ? printerModels : supportedPrinterModels;
}

export const derivePrinterLibrarySyncState = deriveLibrarySyncPageState;

export async function loadPrinterOverviewData(
  options: PrinterOverviewDataSourceOptions,
  dependencies: PrinterOverviewDataSourceDependencies = {},
): Promise<PrinterOverviewDataLoadResult> {
  const fetchHostOverview = dependencies.fetchHostOverview ?? fetchLibrarySyncPrinterOverview;
  const listLocalOverview = dependencies.listLocalOverview ?? listPrinterOverview;
  const loadLocalSettings = dependencies.loadLocalSettings ?? getPrinterSettings;
  const fetchCachedOverview =
    dependencies.fetchCachedOverview ?? fetchCachedLibrarySyncPrinterOverview;
  const onLoadError = dependencies.onLoadError ?? console.error;
  const hostTarget = options.clientReadOnly ? resolveClientHostTarget(options) : null;
  const cacheTarget = options.clientReadOnly
    ? resolveClientHostCacheTarget(options)
    : null;

  if (options.clientReadOnly) {
    if (!hostTarget) {
      const cached = cacheTarget
        ? await fetchCachedOverview(
            cacheTarget.baseUrl,
            cacheTarget.libraryId,
            cacheTarget.targetGeneration,
          ).catch(() => null)
        : null;
      if (cached?.rows) {
        return {
          printers: cached.rows,
          bambuLiveIntegrations: {},
          source: "CACHED",
          updatedAt: cached.captured_at ?? null,
        };
      }

      return {
        printers: [],
        bambuLiveIntegrations: {},
        source: "OFFLINE",
        updatedAt: null,
      };
    }
    try {
      return {
        printers: await fetchHostOverview(hostTarget.baseUrl, hostTarget.libraryId),
        bambuLiveIntegrations: {},
        source: "LIVE",
        updatedAt: null,
      };
    } catch (loadError) {
      onLoadError(loadError);
      const cached = cacheTarget
        ? await fetchCachedOverview(
            cacheTarget.baseUrl,
            cacheTarget.libraryId,
            cacheTarget.targetGeneration,
          ).catch(() => null)
        : null;
      if (cached?.rows) {
        return {
          printers: cached.rows,
          bambuLiveIntegrations: {},
          source: "CACHED",
          updatedAt: cached.captured_at ?? null,
        };
      }

      return {
        printers: [],
        bambuLiveIntegrations: {},
        source: "OFFLINE",
        updatedAt: null,
      };
    }
  }

  const [printers, settings] = await Promise.all([listLocalOverview(), loadLocalSettings()]);
  return {
    printers,
    bambuLiveIntegrations: mapBambuLiveIntegrations(settings.bambu_live_integrations),
    source: "LIVE",
    updatedAt: null,
  };
}

export async function loadPrinterPageData(
  options: PrinterDataSourceOptions,
  dependencies: PrinterPageDataSourceDependencies = {},
): Promise<PrinterDataLoadResult> {
  const fetchHostOverview = dependencies.fetchHostOverview ?? fetchLibrarySyncPrinterOverview;
  const fetchHostSettings = dependencies.fetchHostSettings ?? fetchLibrarySyncPrinterSettings;
  const fetchCachedOverview =
    dependencies.fetchCachedOverview ?? fetchCachedLibrarySyncPrinterOverview;
  const fetchCachedSpools = dependencies.fetchCachedSpools ?? fetchCachedLibrarySyncSpools;
  const listLocalOverview = dependencies.listLocalOverview ?? listPrinterOverview;
  const loadLocalSettings = dependencies.loadLocalSettings ?? getPrinterSettings;
  const onLoadError = dependencies.onLoadError ?? console.error;
  const { clientReadOnly, supportedPrinterModels } = options;
  if (clientReadOnly) {
    const target = resolveClientHostCacheTarget(options);
    const offline: PrinterDataLoadResult = {
      printers: [],
      spools: [],
      bambuLiveIntegrations: {},
      printerModels: supportedPrinterModels,
      source: "OFFLINE",
      updatedAt: null,
      revisionPollComplete: false,
    };
    if (!target) return offline;

    const { baseUrl, libraryId, targetGeneration } = target;
    const fetchSpools = dependencies.fetchHostSpoolSnapshot ?? fetchLibrarySyncSpoolSnapshot;
    const results = await Promise.allSettled([
      fetchHostOverview(baseUrl, libraryId),
      fetchSpools(baseUrl, libraryId, targetGeneration),
      fetchHostSettings(baseUrl, libraryId),
    ]);
    for (const result of results) {
      if (result.status === "rejected") onLoadError(result.reason);
    }
    const [overview, spools, settings] = results;
    const [cachedPrinters, cachedSpools] = await Promise.all([
      overview.status === "rejected"
        ? fetchCachedOverview(baseUrl, libraryId, targetGeneration).catch(() => null)
        : null,
      spools.status === "rejected"
        ? fetchCachedSpools(baseUrl, libraryId, targetGeneration).catch(() => null)
        : null,
    ]);
    if (overview.status === "rejected" && spools.status === "rejected" && !cachedPrinters && !cachedSpools) {
      return offline;
    }

    const live = overview.status === "fulfilled" && spools.status === "fulfilled";
    const hostSettings = settings.status === "fulfilled" ? settings.value : null;
    return {
      printers: overview.status === "fulfilled" ? overview.value : cachedPrinters?.rows ?? [],
      spools: normalizeSpoolWithMasterRows(
        spools.status === "fulfilled" ? spools.value.rows : cachedSpools?.rows ?? [],
      ),
      bambuLiveIntegrations: mapBambuLiveIntegrations(hostSettings?.bambu_live_integrations),
      printerModels: resolvePrinterModels(hostSettings?.printer_models, supportedPrinterModels),
      source: live ? "LIVE" : "CACHED",
      updatedAt: live
        ? spools.value.captured_at
        : firstDefinedTimestamp(cachedPrinters?.captured_at, cachedSpools?.captured_at),
      revisionPollComplete: live && settings.status === "fulfilled",
    };
  }

  const [overview, spoolRows, settings] = await Promise.all([
    listLocalOverview(),
    loadAllSpoolRows(options, DEFAULT_SPOOL_PAGE_SIZE, { loadPage: dependencies.loadLocalSpools }),
    loadLocalSettings(),
  ]);

  return {
    printers: overview,
    spools: spoolRows,
    bambuLiveIntegrations: mapBambuLiveIntegrations(settings.bambu_live_integrations),
    printerModels: resolvePrinterModels(settings.printer_models, supportedPrinterModels),
    source: "LIVE",
    updatedAt: null,
    revisionPollComplete: true,
  };
}
