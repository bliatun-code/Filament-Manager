import {
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  getLibrarySyncSettings,
  getPrinterSettings,
  listPrinterOverview,
  type BambuLiveIntegrationEntry,
  type LibrarySyncSettings,
  type LibrarySyncRemoteSnapshot,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type PrinterSettingsSnapshot,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { loadCatalogMasters } from "./catalog_data_source";
import { mapBambuLiveIntegrations } from "./printer_data_source";
import { loadAllSpoolRows } from "./spool_data_source";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import { requireClientHostWriteTarget, resolveClientHostTarget } from "./host_write_target";

export type SettingsPageData = {
  snapshot: PrinterSettingsSnapshot;
  catalogRows: MasterCatalogRow[];
  catalogRowsAvailable: boolean;
  syncSettings: LibrarySyncSettings;
  librarySyncSnapshot: LibrarySyncRemoteSnapshot | null;
  overviewRows: PrinterOverviewRow[];
  spoolRows: NormalizedSpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  revisionPollComplete: boolean;
};

type SettingsPageDataDependencies = {
  loadPrinterSettings?: typeof getPrinterSettings;
  loadCatalogRows?: typeof loadCatalogMasters;
  loadSyncSettings?: typeof getLibrarySyncSettings;
  loadSpoolRows?: typeof loadAllSpoolRows;
  fetchHostPrinterOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostPrinterSettings?: typeof fetchLibrarySyncPrinterSettings;
  refreshHostSnapshot?: typeof refreshLibrarySyncSnapshot;
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

function neutralPrinterSettingsSnapshot(): PrinterSettingsSnapshot {
  return {
    active_printer_id: null,
    printers: [],
    printer_models: [],
    bambu_live_integrations: [],
  };
}

export async function loadSettingsPageData(
  dependencies: SettingsPageDataDependencies = {},
): Promise<SettingsPageData> {
  const loadPrinterSettings = dependencies.loadPrinterSettings ?? getPrinterSettings;
  const loadCatalogRows = dependencies.loadCatalogRows ?? loadCatalogMasters;
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const loadSpoolRows = dependencies.loadSpoolRows ?? loadAllSpoolRows;
  const fetchHostPrinterOverview =
    dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
  const fetchHostPrinterSettings =
    dependencies.fetchHostPrinterSettings ?? fetchLibrarySyncPrinterSettings;
  const listLocalPrinterOverview = dependencies.listLocalPrinterOverview ?? listPrinterOverview;
  const refreshHostSnapshot = dependencies.refreshHostSnapshot ?? refreshLibrarySyncSnapshot;
  const onHostLoadError = dependencies.onHostLoadError ?? console.warn;

  // The persisted library role is authoritative. Resolve it before touching
  // local printer settings so a Client never reads its local shadow while the
  // role is still unknown. Client data below comes from the Host or its
  // target-bound cache, so a neutral local snapshot is sufficient.
  const loadedSyncSettings = await loadSyncSettings();
  const snapshot =
    loadedSyncSettings.mode === "CLIENT"
      ? neutralPrinterSettingsSnapshot()
      : await loadPrinterSettings();
  let syncSettings = loadedSyncSettings;
  let librarySyncSnapshot = syncSettings.cached_snapshot ?? null;

  let catalogRows: MasterCatalogRow[] = [];
  let catalogRowsAvailable = false;
  let overviewRows: PrinterOverviewRow[];
  let spoolRows: SpoolWithMasterRow[];
  // A client must never associate this device's local Bambu Live settings with
  // printers loaded from the Host (or its cache). Host settings are not cached
  // today, so fail closed until the target-bound Host endpoint succeeds.
  let bambuLiveIntegrations =
    syncSettings.mode === "CLIENT"
      ? {}
      : mapBambuLiveIntegrations(snapshot.bambu_live_integrations);
  let revisionPollComplete = true;

  if (syncSettings.mode === "CLIENT") {
    revisionPollComplete = false;
    const cachedPrinterRows = syncSettings.cached_printers?.rows ?? [];
    const cachedSpoolRows = syncSettings.cached_spools?.rows ?? [];
    spoolRows = cachedSpoolRows;
    const hostTarget = resolveClientHostTarget({
      clientHostBaseUrl: syncSettings.host_base_url,
      clientLibraryId: syncSettings.library_id,
    });
    if (hostTarget) {
      const [
        hostCatalogRowsResult,
        hostOverviewResult,
        hostPrinterSettingsResult,
        hostSpoolRowsResult,
        hostSnapshotResult,
      ] = await Promise.allSettled([
        loadCatalogRows({
          clientReadOnly: true,
          clientHostBaseUrl: hostTarget.baseUrl,
          clientLibraryId: hostTarget.libraryId,
          limit: 5000,
        }),
        fetchHostPrinterOverview(hostTarget.baseUrl, hostTarget.libraryId),
        fetchHostPrinterSettings(hostTarget.baseUrl, hostTarget.libraryId),
        loadSpoolRows(
          {
            clientReadOnly: true,
            clientHostBaseUrl: hostTarget.baseUrl,
            clientLibraryId: hostTarget.libraryId,
            clientTargetGeneration: syncSettings.target_generation ?? null,
          },
          1000,
        ),
        refreshHostSnapshot(
          hostTarget.baseUrl,
          hostTarget.libraryId,
          syncSettings.target_generation,
        ),
      ]);

      notifySettledErrors(
        [
          hostCatalogRowsResult,
          hostOverviewResult,
          hostPrinterSettingsResult,
          hostSpoolRowsResult,
          hostSnapshotResult,
        ],
        onHostLoadError,
      );

      if (hostCatalogRowsResult.status === "fulfilled") {
        catalogRows = hostCatalogRowsResult.value;
        catalogRowsAvailable = true;
      }

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
      if (hostSnapshotResult.status === "fulfilled") {
        syncSettings = hostSnapshotResult.value.syncSettings;
        librarySyncSnapshot = hostSnapshotResult.value.snapshot;
      }
      revisionPollComplete = [
        hostCatalogRowsResult,
        hostOverviewResult,
        hostPrinterSettingsResult,
        hostSpoolRowsResult,
        hostSnapshotResult,
      ].every((result) => result.status === "fulfilled");
    } else {
      overviewRows = cachedPrinterRows;
    }
  } else {
    catalogRows = await loadCatalogRows({
      clientReadOnly: false,
      limit: 5000,
    });
    catalogRowsAvailable = true;
    spoolRows =
      syncSettings.low_stock_policy_valid === false
        ? await loadSpoolRows(
            {
              clientReadOnly: false,
            },
            1000,
          ).catch(() => [])
        : await loadSpoolRows(
            {
              clientReadOnly: false,
            },
            1000,
          );
    overviewRows = await listLocalPrinterOverview();
  }

  return {
    snapshot,
    catalogRows,
    catalogRowsAvailable,
    syncSettings,
    librarySyncSnapshot,
    overviewRows,
    spoolRows: normalizeSpoolWithMasterRows(spoolRows),
    bambuLiveIntegrations,
    revisionPollComplete,
  };
}

export async function refreshLibrarySyncSnapshot(
  baseUrl: string,
  libraryId: string,
  expectedTargetGeneration?: number,
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
  const refreshedTarget =
    syncSettings.mode === "CLIENT"
      ? resolveClientHostTarget({
          clientHostBaseUrl: syncSettings.host_base_url,
          clientLibraryId: syncSettings.library_id,
        })
      : null;
  if (
    refreshedTarget?.baseUrl !== hostTarget.baseUrl ||
    refreshedTarget.libraryId !== hostTarget.libraryId ||
    (expectedTargetGeneration !== undefined &&
      syncSettings.target_generation !== expectedTargetGeneration)
  ) {
    throw new Error("Host connection changed while the snapshot was refreshing.");
  }
  const cachedSnapshot = syncSettings.cached_snapshot ?? null;
  const resolvedSnapshot =
    cachedSnapshot?.library_id === hostTarget.libraryId &&
    cachedSnapshot.captured_at &&
    cachedSnapshot.captured_at >= snapshot.captured_at
      ? cachedSnapshot
      : snapshot;

  return {
    snapshot: resolvedSnapshot,
    syncSettings,
  };
}
