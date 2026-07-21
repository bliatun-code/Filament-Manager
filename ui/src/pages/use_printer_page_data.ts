import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadPrinterPageData,
  type PrinterSnapshotSource,
} from "../lib/printer_data_source";
import { loadCatalogMasters } from "../lib/catalog_data_source";
import { sortPrinterSlotsExtLast } from "../lib/printer_profiles";
import { usePageRefreshState } from "../lib/page_refresh_state";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
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
  supportedPrinterModels: string[];
  loadErrorMessage: string;
  onInteractiveReload: () => void;
};

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
  const reloadInFlightRef = useRef(false);
  const catalogLoadedRef = useRef(false);

  const reloadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!tauri || reloadInFlightRef.current) {
      return;
    }
    reloadInFlightRef.current = true;
    beginRefresh();
    try {
      const loaded = await loadPrinterPageData({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        supportedPrinterModels,
      });
      if (!options?.silent || !catalogLoadedRef.current) {
        try {
          const loadedCatalogMasters = await loadCatalogMasters({
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
            limit: 5000,
          });
          catalogLoadedRef.current = true;
          setCatalogMasters(loadedCatalogMasters);
        } catch (catalogLoadError) {
          console.warn("Failed to load master catalog for printer assistance.", catalogLoadError);
        }
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
    } catch (loadError) {
      console.error(loadError);
      failRefresh(loadErrorMessage);
    } finally {
      reloadInFlightRef.current = false;
    }
  }, [
    beginRefresh,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    completeRefresh,
    failRefresh,
    loadErrorMessage,
    onInteractiveReload,
    supportedPrinterModels,
    tauri,
  ]);

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    void reloadData();
  }, [librarySyncReady, reloadData, tauri]);

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    const timer = window.setInterval(() => {
      void reloadData({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [librarySyncReady, reloadData, tauri]);

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
