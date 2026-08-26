import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  loadPrinterPageData,
  type PrinterSnapshotSource,
} from "../lib/printer_data_source";
import { loadCatalogMasters } from "../lib/catalog_data_source";
import {
  createLibraryRevisionTracker,
  fetchLibraryDomainRevisionsForSource,
  LIBRARY_REVISION_DOMAINS,
  markLibraryRevisionUnavailable,
  observeLibraryDomainRevisions,
  resolveLibraryRevisionSource,
} from "../lib/library_domain_revisions";
import { sortPrinterSlotsExtLast } from "../lib/printer_profiles";
import { usePageRefreshState } from "../lib/page_refresh_state";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import { useDocumentVisiblePolling } from "../lib/use_document_visible_polling";
import type {
  BambuLiveIntegrationEntry,
  MasterCatalogRow,
  PrinterOverviewRow,
} from "../lib/tauri_client";

type UsePrinterPageDataInput = {
  tauri: boolean;
  librarySyncReady: boolean;
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
  supportedPrinterModels: string[];
  loadErrorMessage: string;
  onInteractiveReload: () => void;
};

const PRINTER_REVISION_DOMAINS = [
  LIBRARY_REVISION_DOMAINS.inventory,
  LIBRARY_REVISION_DOMAINS.catalog,
  LIBRARY_REVISION_DOMAINS.printers,
  LIBRARY_REVISION_DOMAINS.jobs,
] as const;

export type UsePrinterPageDataResult = {
  loading: boolean;
  loadError: string | null;
  printers: PrinterOverviewRow[];
  spools: NormalizedSpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  catalogMasters: MasterCatalogRow[];
  clientPrinterSource: PrinterSnapshotSource;
  clientPrinterUpdatedAt: string | null;
  printerModels: string[];
  refreshing: boolean;
  reloadData: (options?: { silent?: boolean }) => Promise<void>;
};

export function usePrinterPageData({
  tauri,
  librarySyncReady,
  clientReadOnly,
  clientHostBaseUrl,
  clientLibraryId,
  clientTargetGeneration,
  supportedPrinterModels,
  loadErrorMessage,
  onInteractiveReload,
}: UsePrinterPageDataInput): UsePrinterPageDataResult {
  const {
    beginRefresh,
    completeRefresh,
    error: loadError,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauri);
  const [printers, setPrinters] = useState<PrinterOverviewRow[]>([]);
  const [spools, setSpools] = useState<NormalizedSpoolWithMasterRow[]>([]);
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationEntry["config"]>
  >({});
  const [catalogMasters, setCatalogMasters] = useState<MasterCatalogRow[]>([]);
  const [clientPrinterSource, setClientPrinterSource] =
    useState<PrinterSnapshotSource>("LIVE");
  const [clientPrinterUpdatedAt, setClientPrinterUpdatedAt] = useState<string | null>(null);
  const [printerModels, setPrinterModels] = useState<string[]>([]);
  const reloadRequestRef = useRef(0);
  const catalogLoadedRef = useRef(false);
  const revisionTrackerRef = useRef(createLibraryRevisionTracker());
  const dataSourceIdentity = [
    librarySyncReady ? "ready" : "unresolved",
    clientReadOnly ? "client" : "local",
    clientHostBaseUrl?.trim() ?? "",
    clientLibraryId?.trim() ?? "",
    Number.isSafeInteger(clientTargetGeneration)
      ? String(clientTargetGeneration)
      : "unresolved-generation",
  ].join(":");
  const dataSourceIdentityRef = useRef(dataSourceIdentity);

  useLayoutEffect(() => {
    dataSourceIdentityRef.current = dataSourceIdentity;
    reloadRequestRef.current += 1;
  }, [dataSourceIdentity]);

  const performReload = useCallback(async (options?: {
    silent?: boolean;
    refreshCatalog?: boolean;
  }): Promise<{ succeeded: boolean; revisionPollComplete: boolean }> => {
    if (!tauri) {
      return { succeeded: false, revisionPollComplete: false };
    }
    const requestId = reloadRequestRef.current + 1;
    reloadRequestRef.current = requestId;
    const requestDataSourceIdentity = dataSourceIdentity;
    const requestIsCurrent = () =>
      reloadRequestRef.current === requestId &&
      dataSourceIdentityRef.current === requestDataSourceIdentity;
    beginRefresh();
    try {
      const loaded = await loadPrinterPageData({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
        supportedPrinterModels,
      });
      let catalogRefreshComplete = true;
      let loadedCatalogMasters: MasterCatalogRow[] | null = null;
      if (options?.refreshCatalog || !options?.silent || !catalogLoadedRef.current) {
        try {
          loadedCatalogMasters = await loadCatalogMasters({
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
            limit: 5000,
          });
        } catch (catalogLoadError) {
          catalogRefreshComplete = false;
          console.warn("Failed to load master catalog for printer assistance.", catalogLoadError);
        }
      }
      if (!requestIsCurrent()) {
        return { succeeded: false, revisionPollComplete: false };
      }
      if (loadedCatalogMasters) {
        catalogLoadedRef.current = true;
        setCatalogMasters(loadedCatalogMasters);
      }
      setClientPrinterSource(loaded.source);
      setClientPrinterUpdatedAt(loaded.updatedAt);
      setPrinters(
        loaded.printers.map((printer) => ({
          ...printer,
          slots: sortPrinterSlotsExtLast(printer.slots),
        })),
      );
      setSpools(loaded.spools);
      setBambuLiveIntegrations(loaded.bambuLiveIntegrations);
      setPrinterModels(loaded.printerModels);
      if (!options?.silent) {
        onInteractiveReload();
      }
      completeRefresh();
      return {
        succeeded: true,
        revisionPollComplete: loaded.revisionPollComplete && catalogRefreshComplete,
      };
    } catch (loadError) {
      console.error(loadError);
      if (requestIsCurrent()) {
        failRefresh(loadErrorMessage);
      }
      return { succeeded: false, revisionPollComplete: false };
    }
  }, [
    beginRefresh,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    completeRefresh,
    dataSourceIdentity,
    failRefresh,
    loadErrorMessage,
    onInteractiveReload,
    supportedPrinterModels,
    tauri,
  ]);

  const reloadData = useCallback(async (options?: { silent?: boolean }) => {
    await performReload({
      silent: options?.silent,
      refreshCatalog: !options?.silent,
    });
  }, [performReload]);

  const pollPrinterData = useCallback(async () => {
    const pollDataSourceIdentity = dataSourceIdentity;
    const pollIsCurrent = () =>
      dataSourceIdentityRef.current === pollDataSourceIdentity;
    const source = resolveLibraryRevisionSource({
      clientReadOnly,
      clientHostBaseUrl,
      clientLibraryId,
    });
    const revisions = await fetchLibraryDomainRevisionsForSource(source).catch(
      () => null,
    );
    if (!pollIsCurrent()) {
      return true;
    }

    if (!source || !revisions) {
      revisionTrackerRef.current = markLibraryRevisionUnavailable(
        revisionTrackerRef.current,
        source,
      );
      // Repeated failures are already bounded by the visibility-aware polling
      // backoff. Retain periodic full reads for older hosts without revisions.
      await performReload({ silent: true, refreshCatalog: true });
      return false;
    }

    const previousTracker = revisionTrackerRef.current;
    const observation = observeLibraryDomainRevisions(
      previousTracker,
      source,
      revisions,
      PRINTER_REVISION_DOMAINS,
    );
    if (!observation.shouldReload) {
      revisionTrackerRef.current = observation.tracker;
      return true;
    }

    const refreshCatalog =
      observation.sourceChanged ||
      observation.wasUnavailable ||
      previousTracker.revisions === null ||
      previousTracker.revisions.catalog !== revisions.catalog;
    const outcome = await performReload({ silent: true, refreshCatalog });
    if (!pollIsCurrent()) {
      return true;
    }
    if (outcome.succeeded && outcome.revisionPollComplete) {
      revisionTrackerRef.current = observation.tracker;
      return true;
    }

    revisionTrackerRef.current = markLibraryRevisionUnavailable(
      previousTracker,
      source,
    );
    return false;
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    dataSourceIdentity,
    performReload,
  ]);

  useEffect(() => {
    reloadRequestRef.current += 1;
    revisionTrackerRef.current = createLibraryRevisionTracker();
    catalogLoadedRef.current = false;
    setPrinters([]);
    setSpools([]);
    setBambuLiveIntegrations({});
    setCatalogMasters([]);
    setClientPrinterSource("LIVE");
    setClientPrinterUpdatedAt(null);
    setPrinterModels([]);
    if (!tauri || !librarySyncReady) {
      return;
    }
    void reloadData();
    return () => {
      reloadRequestRef.current += 1;
    };
  }, [dataSourceIdentity, librarySyncReady, reloadData, tauri]);

  useDocumentVisiblePolling({
    enabled: tauri && librarySyncReady,
    intervalMs: 15_000,
    poll: pollPrinterData,
  });

  return {
    loading,
    loadError,
    printers,
    spools,
    bambuLiveIntegrations,
    catalogMasters,
    clientPrinterSource,
    clientPrinterUpdatedAt,
    printerModels,
    refreshing,
    reloadData,
  };
}
