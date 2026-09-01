import { useState } from "react";
import type {
  BambuLiveIntegrationEntry,
  CatalogResetStats,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import { createSettingsCatalogDataState } from "./settings_catalog_data_state";

export function useSettingsPageDataState(tauri: boolean) {
  const [loading, setLoading] = useState(tauri);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<NormalizedSpoolWithMasterRow[]>([]);
  const [catalogData, setCatalogData] = useState(createSettingsCatalogDataState);
  const [lastCatalogReset, setLastCatalogReset] = useState<CatalogResetStats | null>(
    null,
  );
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationEntry["config"]>
  >({});

  return {
    bambuLiveIntegrations,
    catalogDataSourceIdentity: catalogData.dataSourceIdentity,
    catalogLoadStatus: catalogData.loadStatus,
    catalogMasters: catalogData.rows,
    catalogRowsAvailable: catalogData.loadStatus === "available",
    catalogRowsUnavailable: catalogData.loadStatus === "unavailable",
    lastCatalogReset,
    loading,
    printerOverview,
    printers,
    setBambuLiveIntegrations,
    setCatalogData,
    setLastCatalogReset,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    spoolRows,
  };
}
