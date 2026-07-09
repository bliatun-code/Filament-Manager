import { useState } from "react";
import type {
  BambuLiveIntegrationEntry,
  CatalogResetStats,
  MasterCatalogRow,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";

export function useSettingsPageDataState(tauri: boolean) {
  const [loading, setLoading] = useState(tauri);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<NormalizedSpoolWithMasterRow[]>([]);
  const [catalogMasters, setCatalogMasters] = useState<MasterCatalogRow[]>([]);
  const [lastCatalogReset, setLastCatalogReset] = useState<CatalogResetStats | null>(
    null,
  );
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationEntry["config"]>
  >({});

  return {
    bambuLiveIntegrations,
    catalogMasters,
    lastCatalogReset,
    loading,
    printerOverview,
    printers,
    setBambuLiveIntegrations,
    setCatalogMasters,
    setLastCatalogReset,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    spoolRows,
  };
}
