import {
  fetchCachedLibrarySyncPrinterOverview,
  fetchCachedLibrarySyncSpools,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  getPrinterSettings,
  listPrinterOverview,
  type BambuLiveIntegrationEntry,
  type LibrarySyncSettings,
  type PrinterOverviewRow,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { loadSpoolRowsPage } from "./spool_data_source";

export type PrinterSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";

export type PrinterLibrarySyncState = {
  clientReadOnly: boolean;
  clientHostWritePaired: boolean;
  clientHostDeviceName: string | null;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
};

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

function mapBambuLiveIntegrations(
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

export function derivePrinterLibrarySyncState(
  syncSettings: LibrarySyncSettings,
): PrinterLibrarySyncState {
  return {
    clientReadOnly: syncSettings.mode === "CLIENT",
    clientHostWritePaired: syncSettings.client_auth_paired ?? false,
    clientHostDeviceName: syncSettings.host_device_name ?? null,
    clientHostBaseUrl: syncSettings.host_base_url ?? null,
    clientLibraryId: syncSettings.library_id ?? null,
  };
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
  const { clientReadOnly, clientHostBaseUrl, clientLibraryId } = options;
  const canUseHost = clientReadOnly && clientHostBaseUrl && clientLibraryId;

  if (canUseHost) {
    try {
      return {
        printers: await fetchHostOverview(clientHostBaseUrl, clientLibraryId),
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
): Promise<PrinterDataLoadResult> {
  const { clientReadOnly, clientHostBaseUrl, clientLibraryId, supportedPrinterModels } = options;
  const canUseHost = clientReadOnly && clientHostBaseUrl && clientLibraryId;

  if (canUseHost) {
    try {
      const [overview, spoolRows, settingsResult, cachedPrinters] = await Promise.all([
        fetchLibrarySyncPrinterOverview(clientHostBaseUrl, clientLibraryId),
        loadSpoolRowsPage(
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
          1200,
          0,
        ),
        fetchLibrarySyncPrinterSettings(clientHostBaseUrl, clientLibraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchCachedLibrarySyncPrinterOverview().catch(() => null),
      ]);

      if (!settingsResult.ok) {
        console.error(settingsResult.error);
      }

      return {
        printers: overview,
        spools: spoolRows,
        bambuLiveIntegrations: mapBambuLiveIntegrations(
          settingsResult.ok ? settingsResult.value.bambu_live_integrations : [],
        ),
        printerModels: resolvePrinterModels(
          settingsResult.ok ? settingsResult.value.printer_models : [],
          supportedPrinterModels,
        ),
        source: "LIVE",
        updatedAt: cachedPrinters?.captured_at ?? null,
      };
    } catch (loadError) {
      console.error(loadError);
      try {
        const [cachedPrinters, cachedSpools] = await Promise.all([
          fetchCachedLibrarySyncPrinterOverview(),
          fetchCachedLibrarySyncSpools(),
        ]);
        if (cachedPrinters?.rows || cachedSpools?.rows) {
          return {
            printers: cachedPrinters?.rows ?? [],
            spools: cachedSpools?.rows ?? [],
            bambuLiveIntegrations: {},
            printerModels: supportedPrinterModels,
            source: "CACHED",
            updatedAt: cachedPrinters?.captured_at ?? null,
          };
        }
      } catch (cacheError) {
        console.error(cacheError);
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
  }

  const [overview, spoolRows, settings] = await Promise.all([
    listPrinterOverview(),
    loadSpoolRowsPage(
      {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      },
      1200,
      0,
    ),
    getPrinterSettings(),
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
