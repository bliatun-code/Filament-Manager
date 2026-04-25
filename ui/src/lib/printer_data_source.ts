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

export type PrinterDataLoadResult = {
  printers: PrinterOverviewRow[];
  spools: SpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  printerModels: string[];
  source: PrinterSnapshotSource;
  updatedAt: string | null;
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
