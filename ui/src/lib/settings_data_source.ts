import {
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncSpoolSnapshot,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncPrinterSettings,
  getLibrarySyncSettings,
  getPrinterSettings,
  listPrinterOverview,
  type BambuLiveIntegrationEntry,
  type LibrarySyncSettings,
  type LibrarySyncCacheDomain,
  type LibrarySyncRemoteSnapshot,
  type MasterCatalogRow,
  type PrinterOverviewRow,
  type PrinterSettingsSnapshot,
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

type SettingsPageLoadOptions = {
  includeSpoolRows: boolean;
  loadPrinterSettings?: typeof getPrinterSettings;
  loadCatalogRows?: typeof loadCatalogMasters;
  loadSyncSettings?: typeof getLibrarySyncSettings;
  loadSpoolRows?: typeof loadAllSpoolRows;
  fetchHostSpoolSnapshot?: typeof fetchLibrarySyncSpoolSnapshot;
  fetchHostPrinterOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostPrinterSettings?: typeof fetchLibrarySyncPrinterSettings;
  fetchHostSnapshot?: typeof fetchLibrarySyncSnapshot;
  listLocalPrinterOverview?: typeof listPrinterOverview;
  onHostLoadError?: (error: unknown) => void;
};

type LibrarySyncSnapshotRefreshDependencies = {
  fetchHostSnapshot?: typeof fetchLibrarySyncSnapshot;
  loadSyncSettings?: typeof getLibrarySyncSettings;
};

type LibrarySyncSnapshotRefreshResult = { syncSettings: LibrarySyncSettings } & (
  | { ok: true; snapshot: LibrarySyncRemoteSnapshot }
  | { ok: false; snapshot: LibrarySyncRemoteSnapshot | null; error: unknown }
);

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
  dependencies: SettingsPageLoadOptions,
): Promise<SettingsPageData> {
  const loadSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  let settings = await loadSettings([]);
  // A changed target invalidates every reply, even a successful Host read.
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = settings.mode === "CLIENT"
      ? await loadClientSettings(settings, dependencies)
      : await loadLocalSettings(settings, dependencies);
    if (sameSettingsTarget(settings, data.syncSettings)) return data;
    settings = data.syncSettings;
  }
  // If the replacement also changed, show its identity without publishing
  // rows or a summary from either discarded request. The next poll can retry.
  return {
    syncSettings: { ...settings, cached_snapshot: null },
    librarySyncSnapshot: null,
    snapshot: neutralPrinterSettingsSnapshot(),
    overviewRows: [],
    spoolRows: [],
    catalogRows: [],
    catalogRowsAvailable: false,
    bambuLiveIntegrations: {},
    revisionPollComplete: false,
  };
}

function sameSettingsTarget(left: LibrarySyncSettings, right: LibrarySyncSettings) {
  return left.mode === right.mode && left.host_base_url === right.host_base_url &&
    left.library_id === right.library_id && left.target_generation === right.target_generation;
}

function latestSettingsSnapshot(settings: LibrarySyncSettings, fetched: LibrarySyncRemoteSnapshot | null) {
  const saved = settings.cached_snapshot;
  if (saved?.library_id === settings.library_id.trim() && saved.captured_at &&
      (!fetched || saved.captured_at >= fetched.captured_at)) {
    return saved;
  }
  return fetched;
}

// Checking reachability does not fetch a new summary. Keep the displayed
// summary for a successful check and consult its cache only on failure.
export async function settingsAfterHostCheck(
  previous: LibrarySyncSettings | null,
  succeeded: boolean,
  loadSettings = getLibrarySyncSettings,
) {
  const current = await loadSettings(succeeded ? [] : ["snapshot"], previous?.target_generation);
  if (!previous) return current;
  if (!sameSettingsTarget(previous, current)) {
    throw new Error("Host connection changed while validating.");
  }
  return succeeded ? { ...current, cached_snapshot: previous.cached_snapshot } : current;
}

async function loadClientSettings(
  settings: LibrarySyncSettings,
  dependencies: SettingsPageLoadOptions,
): Promise<SettingsPageData> {
  const {
    includeSpoolRows,
    loadSyncSettings = getLibrarySyncSettings,
    loadCatalogRows = loadCatalogMasters,
    fetchHostPrinterOverview = fetchLibrarySyncPrinterOverview,
    fetchHostPrinterSettings = fetchLibrarySyncPrinterSettings,
    fetchHostSpoolSnapshot = fetchLibrarySyncSpoolSnapshot,
    fetchHostSnapshot = fetchLibrarySyncSnapshot,
    onHostLoadError = console.warn,
  } = dependencies;
  const target = resolveClientHostTarget({
    clientHostBaseUrl: settings.host_base_url,
    clientLibraryId: settings.library_id,
  });
  const options = {
    clientReadOnly: true,
    clientHostBaseUrl: target?.baseUrl,
    clientLibraryId: target?.libraryId,
    clientTargetGeneration: settings.target_generation,
  };
  let spoolRequest = null;
  if (target && includeSpoolRows) {
    spoolRequest = settings.target_generation !== undefined
      ? fetchHostSpoolSnapshot(target.baseUrl, target.libraryId, settings.target_generation)
      : Promise.reject(new Error("Missing Host target generation for the spool snapshot."));
  }
  const results = target ? await Promise.allSettled([
    loadCatalogRows({ ...options, limit: 5000 }),
    fetchHostPrinterOverview(target.baseUrl, target.libraryId),
    fetchHostPrinterSettings(target.baseUrl, target.libraryId),
    spoolRequest,
    fetchHostSnapshot(target.baseUrl, target.libraryId),
  ]) : null;
  if (results) notifySettledErrors(results, onHostLoadError);
  const [catalog, printers, printerSettings, spools, snapshot] = results ?? [];
  const fallback: LibrarySyncCacheDomain[] = [];
  if (printers?.status !== "fulfilled") fallback.push("printers");
  if (includeSpoolRows && spools?.status !== "fulfilled") fallback.push("spools");
  if (snapshot?.status !== "fulfilled") fallback.push("snapshot");
  const fetched = snapshot?.status === "fulfilled" ? snapshot.value : null;
  const current = await loadSyncSettings(fallback, settings.target_generation, fetched?.captured_at);
  const librarySyncSnapshot = latestSettingsSnapshot(current, fetched);
  return {
    snapshot: neutralPrinterSettingsSnapshot(),
    catalogRows: catalog?.status === "fulfilled" ? catalog.value : [],
    catalogRowsAvailable: catalog?.status === "fulfilled",
    syncSettings: { ...current, cached_snapshot: librarySyncSnapshot },
    librarySyncSnapshot,
    overviewRows: printers?.status === "fulfilled" ? printers.value : current.cached_printers?.rows ?? [],
    spoolRows: normalizeSpoolWithMasterRows(spools?.status === "fulfilled" ? spools.value?.rows ?? [] : current.cached_spools?.rows ?? []),
    bambuLiveIntegrations: printerSettings?.status === "fulfilled"
      ? mapBambuLiveIntegrations(printerSettings.value.bambu_live_integrations) : {},
    revisionPollComplete: results?.every(result => result.status === "fulfilled") ?? false,
  };
}

async function loadLocalSettings(
  settings: LibrarySyncSettings,
  dependencies: SettingsPageLoadOptions,
): Promise<SettingsPageData> {
  const snapshot = await (dependencies.loadPrinterSettings ?? getPrinterSettings)();
  const catalogRows = await (dependencies.loadCatalogRows ?? loadCatalogMasters)({ clientReadOnly: false, limit: 5000 });
  const spools = dependencies.includeSpoolRows
    ? (dependencies.loadSpoolRows ?? loadAllSpoolRows)({ clientReadOnly: false }, 1000)
    : Promise.resolve([]);
  const spoolRows = await (settings.low_stock_policy_valid === false ? spools.catch(() => []) : spools);
  const overviewRows = await (dependencies.listLocalPrinterOverview ?? listPrinterOverview)();
  const current = await (dependencies.loadSyncSettings ?? getLibrarySyncSettings)([]);
  return {
    snapshot,
    catalogRows,
    catalogRowsAvailable: true,
    overviewRows,
    syncSettings: current,
    librarySyncSnapshot: null,
    spoolRows: normalizeSpoolWithMasterRows(spoolRows),
    bambuLiveIntegrations: mapBambuLiveIntegrations(snapshot.bambu_live_integrations),
    revisionPollComplete: true,
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

  const [read] = await Promise.allSettled([fetchHostSnapshot(hostTarget.baseUrl, hostTarget.libraryId)]);
  const fetched = read.status === "fulfilled" ? read.value : null;
  const syncSettings = await loadSyncSettings(
    fetched ? [] : ["snapshot"], expectedTargetGeneration, fetched?.captured_at,
  );
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
  const latest = latestSettingsSnapshot(syncSettings, fetched);
  const metadata = { ...syncSettings, cached_snapshot: latest };
  if (read.status === "rejected") {
    return { ok: false, snapshot: latest, syncSettings: metadata, error: read.reason };
  }
  return { ok: true, snapshot: latest ?? read.value, syncSettings: metadata };
}
