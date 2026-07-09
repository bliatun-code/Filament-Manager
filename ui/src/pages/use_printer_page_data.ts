import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadPrinterPageData,
  type PrinterSnapshotSource,
} from "../lib/printer_data_source";
import { loadCatalogMasters } from "../lib/catalog_data_source";
import { sortPrinterSlotsExtLast } from "../lib/printer_profiles";
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
  onLoadError: (error: unknown) => void;
  onInteractiveReload: () => void;
};

export type UsePrinterPageDataResult = {
  loading: boolean;
  printers: PrinterOverviewRow[];
  spools: NormalizedSpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  catalogMasters: MasterCatalogRow[];
  clientPrinterSource: PrinterSnapshotSource;
  clientPrinterUpdatedAt: string | null;
  printerModels: string[];
  reloadData: (options?: { silent?: boolean }) => Promise<void>;
};

export function usePrinterPageData({
  tauri,
  librarySyncReady,
  clientReadOnly,
  clientHostBaseUrl,
  clientLibraryId,
  supportedPrinterModels,
  onLoadError,
  onInteractiveReload,
}: UsePrinterPageDataInput): UsePrinterPageDataResult {
  const [loading, setLoading] = useState(tauri);
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
    if (!options?.silent) {
      setLoading(true);
    }
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
          catalogLoadedRef.current = true;
          setCatalogMasters([]);
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
    } catch (loadError) {
      onLoadError(loadError);
    } finally {
      reloadInFlightRef.current = false;
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    onInteractiveReload,
    onLoadError,
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
    printers,
    spools,
    bambuLiveIntegrations,
    catalogMasters,
    clientPrinterSource,
    clientPrinterUpdatedAt,
    printerModels,
    reloadData,
  };
}
