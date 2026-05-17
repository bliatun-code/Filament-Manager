import {
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  getLibrarySyncSettings,
  getPrinterSettings,
  listMasterCatalog,
  listPrinterOverview,
  type BambuLiveIntegrationEntry,
  type LibrarySyncSettings,
  type LibrarySyncRemoteSnapshot,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type PrinterSettingsSnapshot,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { mapBambuLiveIntegrations } from "./printer_data_source";
import { loadAllSpoolRows } from "./spool_data_source";
import { requireClientHostWriteTarget, resolveClientHostTarget } from "./host_write_target";

export type SettingsPageData = {
  snapshot: PrinterSettingsSnapshot;
  catalogRows: MasterCatalogRow[];
  syncSettings: LibrarySyncSettings;
  overviewRows: PrinterOverviewRow[];
  spoolRows: SpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
};

type SettingsPageDataDependencies = {
  loadPrinterSettings?: typeof getPrinterSettings;
  loadCatalogRows?: typeof listMasterCatalog;
  loadSyncSettings?: typeof getLibrarySyncSettings;
  loadSpoolRows?: typeof loadAllSpoolRows;
  fetchHostPrinterOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostPrinterSettings?: typeof fetchLibrarySyncPrinterSettings;
  listLocalPrinterOverview?: typeof listPrinterOverview;
  onHostLoadError?: (error: unknown) => void;
};

type LibrarySyncSnapshotRefreshDependencies = {
  fetchHostSnapshot?: typeof fetchLibrarySyncSnapshot;
  loadSyncSettings?: typeof getLibrarySyncSettings;
};

export type LibrarySyncSnapshotRefreshResult = {
  snapshot: LibrarySyncRemoteSnapshot;
  syncSettings: LibrarySyncSettings;
};

function notifySettledErrors(
  results: PromiseSettledResult<unknown>[],
  onHostLoadError: (error: unknown) => void,
) {
  for (const result of results) {
    if (result.status === "rejected") {
      onHostLoadError(result.reason);
    }
  }
}

export async function loadSettingsPageData(
  dependencies: SettingsPageDataDependencies = {},
): Promise<SettingsPageData> {
  const loadPrinterSettings = dependencies.loadPrinterSettings ?? getPrinterSettings;
  const loadCatalogRows = dependencies.loadCatalogRows ?? listMasterCatalog;
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const loadSpoolRows = dependencies.loadSpoolRows ?? loadAllSpoolRows;
  const fetchHostPrinterOverview =
    dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
  const fetchHostPrinterSettings =
    dependencies.fetchHostPrinterSettings ?? fetchLibrarySyncPrinterSettings;
  const listLocalPrinterOverview = dependencies.listLocalPrinterOverview ?? listPrinterOverview;
  const onHostLoadError = dependencies.onHostLoadError ?? console.warn;

  const [snapshot, catalogRows, syncSettings] = await Promise.all([
    loadPrinterSettings(),
    loadCatalogRows(5000),
    loadSyncSettings(),
  ]);

  let overviewRows: PrinterOverviewRow[];
  let spoolRows: SpoolWithMasterRow[];
  let bambuLiveIntegrations = mapBambuLiveIntegrations(snapshot.bambu_live_integrations);

  if (syncSettings.mode === "CLIENT") {
    const cachedPrinterRows = syncSettings.cached_printers?.rows ?? [];
    const cachedSpoolRows = syncSettings.cached_spools?.rows ?? [];
    spoolRows = cachedSpoolRows;
    const hostTarget = resolveClientHostTarget({
      clientHostBaseUrl: syncSettings.host_base_url,
      clientLibraryId: syncSettings.library_id,
    });
    if (hostTarget) {
      const [hostOverviewResult, hostPrinterSettingsResult, hostSpoolRowsResult] =
        await Promise.allSettled([
          fetchHostPrinterOverview(hostTarget.baseUrl, hostTarget.libraryId),
          fetchHostPrinterSettings(hostTarget.baseUrl, hostTarget.libraryId),
          loadSpoolRows(
            {
              clientReadOnly: true,
              clientHostBaseUrl: hostTarget.baseUrl,
              clientLibraryId: hostTarget.libraryId,
            },
            5000,
          ),
        ]);

      notifySettledErrors(
        [hostOverviewResult, hostPrinterSettingsResult, hostSpoolRowsResult],
        onHostLoadError,
      );

      if (hostOverviewResult.status === "fulfilled") {
        overviewRows = hostOverviewResult.value;
      } else {
        overviewRows = cachedPrinterRows;
      }

      if (hostSpoolRowsResult.status === "fulfilled") {
        spoolRows = hostSpoolRowsResult.value;
      }

      if (hostPrinterSettingsResult.status === "fulfilled") {
        bambuLiveIntegrations = mapBambuLiveIntegrations(
          hostPrinterSettingsResult.value.bambu_live_integrations,
        );
      }
    } else {
      overviewRows = cachedPrinterRows;
    }
  } else {
    spoolRows = await loadSpoolRows(
      {
        clientReadOnly: false,
      },
      5000,
    );
    overviewRows = await listLocalPrinterOverview();
  }

  return {
    snapshot,
    catalogRows,
    syncSettings,
    overviewRows,
    spoolRows,
    bambuLiveIntegrations,
  };
}

export async function refreshLibrarySyncSnapshot(
  baseUrl: string,
  libraryId: string,
  dependencies: LibrarySyncSnapshotRefreshDependencies = {},
): Promise<LibrarySyncSnapshotRefreshResult> {
  const fetchHostSnapshot = dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const hostTarget = requireClientHostWriteTarget(
    { clientHostBaseUrl: baseUrl, clientLibraryId: libraryId },
    "Host snapshot requires a configured host and library id.",
  );

  const snapshot = await fetchHostSnapshot(hostTarget.baseUrl, hostTarget.libraryId);
  const syncSettings = await loadSyncSettings();

  return {
    snapshot: syncSettings.cached_snapshot ?? snapshot,
    syncSettings,
  };
}
