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
import { loadSpoolRowsPage } from "./spool_data_source";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import { resolveClientHostTarget } from "./host_write_target";

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
  spools: SpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  printerModels: string[];
  source: PrinterSnapshotSource;
  updatedAt: string | null;
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

  if (hostTarget) {
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
  const loadHostSpools = dependencies.loadHostSpools ?? loadSpoolRowsPage;
  const listLocalOverview = dependencies.listLocalOverview ?? listPrinterOverview;
  const loadLocalSettings = dependencies.loadLocalSettings ?? getPrinterSettings;
  const loadLocalSpools = dependencies.loadLocalSpools ?? loadSpoolRowsPage;
  const onLoadError = dependencies.onLoadError ?? console.error;
  const { clientReadOnly, clientHostBaseUrl, clientLibraryId, supportedPrinterModels } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;

  if (hostTarget) {
    const [overviewResult, spoolRowsResult, settingsResult, cachedPrinters, cachedSpools] =
      await Promise.all([
        fetchHostOverview(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        loadHostSpools(
          {
            clientReadOnly,
            clientHostBaseUrl: hostTarget.baseUrl,
            clientLibraryId: hostTarget.libraryId,
          },
          1200,
          0,
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
    const spools = spoolRowsResult.ok ? spoolRowsResult.value : cachedSpools?.rows ?? [];

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
        updatedAt: cachedPrinters?.captured_at ?? null,
      };
    }

    return {
      printers: [],
      spools: [],
      bambuLiveIntegrations: {},
      printerModels: supportedPrinterModels,
      source: "OFFLINE",
      updatedAt: null,
    };
  }

  const [overview, spoolRows, settings] = await Promise.all([
    listLocalOverview(),
    loadLocalSpools(
      {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      },
      1200,
      0,
    ),
    loadLocalSettings(),
  ]);

  return {
    printers: overview,
    spools: spoolRows,
    bambuLiveIntegrations: mapBambuLiveIntegrations(settings.bambu_live_integrations),
    printerModels: resolvePrinterModels(settings.printer_models, supportedPrinterModels),
    source: "LIVE",
    updatedAt: null,
  };
}
