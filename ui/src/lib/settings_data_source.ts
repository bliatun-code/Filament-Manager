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

  const [snapshot, catalogRows, syncSettings, localSpoolSnapshot] = await Promise.all([
    loadPrinterSettings(),
    loadCatalogRows(5000),
    loadSyncSettings(),
    loadSpoolRows(
      {
        clientReadOnly: false,
      },
      5000,
    ),
  ]);

  let overviewRows: PrinterOverviewRow[];
  let spoolRows = localSpoolSnapshot;
  let bambuLiveIntegrations = mapBambuLiveIntegrations(snapshot.bambu_live_integrations);

  if (syncSettings.mode === "CLIENT") {
    const cachedPrinterRows = syncSettings.cached_printers?.rows ?? [];
    if (syncSettings.host_base_url && syncSettings.library_id) {
      try {
        const [hostOverviewRows, hostPrinterSettings, hostSpoolRows] = await Promise.all([
          fetchHostPrinterOverview(syncSettings.host_base_url, syncSettings.library_id),
          fetchHostPrinterSettings(syncSettings.host_base_url, syncSettings.library_id),
          loadSpoolRows(
            {
              clientReadOnly: true,
              clientHostBaseUrl: syncSettings.host_base_url,
              clientLibraryId: syncSettings.library_id,
            },
            5000,
          ),
        ]);
        overviewRows = hostOverviewRows;
        spoolRows = hostSpoolRows;
        bambuLiveIntegrations = mapBambuLiveIntegrations(
          hostPrinterSettings.bambu_live_integrations,
        );
      } catch (loadError) {
        onHostLoadError(loadError);
        overviewRows = cachedPrinterRows;
      }
    } else {
      overviewRows = cachedPrinterRows;
    }
  } else {
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

  const snapshot = await fetchHostSnapshot(baseUrl, libraryId);
  const syncSettings = await loadSyncSettings();

  return {
    snapshot: syncSettings.cached_snapshot ?? snapshot,
    syncSettings,
  };
}
