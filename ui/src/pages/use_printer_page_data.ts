import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadPrinterPageData,
  type PrinterSnapshotSource,
} from "../lib/printer_data_source";
import { sortPrinterSlotsExtLast } from "../lib/printer_profiles";
import type {
  BambuLiveIntegrationEntry,
  PrinterOverviewRow,
  SpoolWithMasterRow,
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
  spools: SpoolWithMasterRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
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
  const [spools, setSpools] = useState<SpoolWithMasterRow[]>([]);
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationEntry["config"]>
  >({});
  const [clientPrinterSource, setClientPrinterSource] =
    useState<PrinterSnapshotSource>("LIVE");
  const [clientPrinterUpdatedAt, setClientPrinterUpdatedAt] = useState<string | null>(null);
  const [printerModels, setPrinterModels] = useState<string[]>([]);
  const reloadInFlightRef = useRef(false);

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
    clientPrinterSource,
    clientPrinterUpdatedAt,
    printerModels,
    reloadData,
  };
}
