import {
  fetchCachedLibrarySyncPrinterOverview,
  fetchCachedLibrarySyncSpools,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  getPrinterSettings,
  listPrinterOverview,
  type BambuLiveIntegrationEntry,
  type PrinterOverviewRow,
  type SpoolWithMasterRow,
} from "./tauri_client";
import {
  DEFAULT_SPOOL_PAGE_SIZE,
  loadAllSpoolRows,
  loadAllSpoolRowsWithPageLoader,
  loadSpoolRowsPage,
} from "./spool_data_source";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import { resolveClientHostTarget } from "./host_write_target";
import { firstDefinedTimestamp } from "./source_timestamps";

export type PrinterSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";
export type PrinterLibrarySyncState = LibrarySyncPageState;

export type PrinterDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  supportedPrinterModels: string[];
};

export type PrinterOverviewDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
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
  loadHostSpools?: typeof loadSpoolRowsPage;
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

function resolveClientPrinterUpdatedAt({
  overviewLive,
  spoolsLive,
  cachedOverviewCapturedAt,
  cachedSpoolsCapturedAt,
}: {
  overviewLive: boolean;
  spoolsLive: boolean;
  cachedOverviewCapturedAt?: string | null;
  cachedSpoolsCapturedAt?: string | null;
}): string | null {
  if (!overviewLive && !spoolsLive) {
    return firstDefinedTimestamp(cachedOverviewCapturedAt, cachedSpoolsCapturedAt);
  }
  if (!overviewLive) {
    return cachedOverviewCapturedAt ?? null;
  }
  if (!spoolsLive) {
    return cachedSpoolsCapturedAt ?? null;
  }
  return firstDefinedTimestamp(cachedOverviewCapturedAt, cachedSpoolsCapturedAt);
}

export const derivePrinterLibrarySyncState = deriveLibrarySyncPageState;

function normalizePrinterSpoolRows(rows: SpoolWithMasterRow[]): NormalizedSpoolWithMasterRow[] {
  return normalizeSpoolWithMasterRows(rows);
}

async function loadPrinterSpoolRows(
  options: PrinterOverviewDataSourceOptions,
  loadPage?: typeof loadSpoolRowsPage,
): Promise<NormalizedSpoolWithMasterRow[]> {
  return loadPage
    ? loadAllSpoolRowsWithPageLoader(options, DEFAULT_SPOOL_PAGE_SIZE, loadPage)
    : loadAllSpoolRows(options);
}

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

  if (options.clientReadOnly) {
    if (!hostTarget) {
      const cached = await fetchCachedOverview().catch(() => null);
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
      const cached = await fetchCachedOverview().catch(() => null);
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
  const { clientReadOnly, clientHostBaseUrl, clientLibraryId, supportedPrinterModels } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;

  if (clientReadOnly) {
    if (!hostTarget) {
      const [cachedPrinters, cachedSpools] = await Promise.all([
        fetchCachedOverview().catch(() => null),
        fetchCachedSpools().catch(() => null),
      ]);
      const printers = cachedPrinters?.rows ?? [];
      const spools = normalizePrinterSpoolRows(cachedSpools?.rows ?? []);
      if (printers.length > 0 || spools.length > 0) {
        return {
          printers,
          spools,
          bambuLiveIntegrations: {},
          printerModels: supportedPrinterModels,
          source: "CACHED",
          updatedAt: cachedPrinters?.captured_at ?? cachedSpools?.captured_at ?? null,
          revisionPollComplete: false,
        };
      }

      return {
        printers: [],
        spools: [],
        bambuLiveIntegrations: {},
        printerModels: supportedPrinterModels,
        source: "OFFLINE",
        updatedAt: null,
        revisionPollComplete: false,
      };
    }
    const [overviewResult, spoolRowsResult, settingsResult, cachedPrinters, cachedSpools] =
      await Promise.all([
        fetchHostOverview(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        loadPrinterSpoolRows(
          {
            clientReadOnly,
            clientHostBaseUrl: hostTarget.baseUrl,
            clientLibraryId: hostTarget.libraryId,
          },
          dependencies.loadHostSpools,
        ).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchHostSettings(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchCachedOverview().catch(() => null),
        fetchCachedSpools().catch(() => null),
      ]);

    if (!overviewResult.ok) {
      onLoadError(overviewResult.error);
    }
    if (!spoolRowsResult.ok) {
      onLoadError(spoolRowsResult.error);
    }
    if (!settingsResult.ok) {
      onLoadError(settingsResult.error);
    }

    const printers = overviewResult.ok ? overviewResult.value : cachedPrinters?.rows ?? [];
    const spools = normalizePrinterSpoolRows(
      spoolRowsResult.ok ? spoolRowsResult.value : cachedSpools?.rows ?? [],
    );

    if (printers.length > 0 || spools.length > 0 || overviewResult.ok || spoolRowsResult.ok) {
      return {
        printers,
        spools,
        bambuLiveIntegrations: mapBambuLiveIntegrations(
          settingsResult.ok ? settingsResult.value.bambu_live_integrations : [],
        ),
        printerModels: resolvePrinterModels(
          settingsResult.ok ? settingsResult.value.printer_models : [],
          supportedPrinterModels,
        ),
        source: overviewResult.ok && spoolRowsResult.ok ? "LIVE" : "CACHED",
        updatedAt: resolveClientPrinterUpdatedAt({
          overviewLive: overviewResult.ok,
          spoolsLive: spoolRowsResult.ok,
          cachedOverviewCapturedAt: cachedPrinters?.captured_at,
          cachedSpoolsCapturedAt: cachedSpools?.captured_at,
        }),
        revisionPollComplete: overviewResult.ok && spoolRowsResult.ok && settingsResult.ok,
      };
    }

    return {
      printers: [],
      spools: [],
      bambuLiveIntegrations: {},
      printerModels: supportedPrinterModels,
      source: "OFFLINE",
      updatedAt: null,
      revisionPollComplete: false,
    };
  }

  const [overview, spoolRows, settings] = await Promise.all([
    listLocalOverview(),
    loadPrinterSpoolRows(
      {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      },
      dependencies.loadLocalSpools,
    ),
    loadLocalSettings(),
  ]);

  return {
    printers: overview,
    spools: normalizePrinterSpoolRows(spoolRows),
    bambuLiveIntegrations: mapBambuLiveIntegrations(settings.bambu_live_integrations),
    printerModels: resolvePrinterModels(settings.printer_models, supportedPrinterModels),
    source: "LIVE",
    updatedAt: null,
    revisionPollComplete: true,
  };
}
