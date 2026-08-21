import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { loadActiveLoanRows } from "./loan_data_source";
import {
  loadInventorySpoolDetail,
  loadInventorySpools,
} from "./inventory_data_source";
import { loadInventoryLocations } from "./inventory_location_data_source";
import { loadLibrarySyncPageState } from "./library_sync_state";
import { usePageRefreshState } from "./page_refresh_state";
import { loadPrinterOverviewData } from "./printer_data_source";
import { sortPrinterSlotsExtLast } from "./printer_profiles";
import { loadWishlistItems } from "./wishlist_data_source";
import {
  buildBaselineCaptureFieldsBySlotId,
  mergeRfidCaptureFields,
  type RfidCaptureField,
} from "./inventory_rfid_capture";
import type { useI18n } from "./i18n";
import type {
  ActiveSpoolLoanRow,
  BambuLiveIntegrationSettings,
  PrinterOverviewRow,
  SpoolHistoryEventRow,
  SpoolUsagePointRow,
  WishlistItemRow,
} from "./tauri_client";
import type { InventoryLocationRow } from "./tauri_location_client";
import type { InventorySpool } from "./inventory_list_model";

type InventoryPageDataInput = {
  setRfidCaptureFieldsBySlotId: Dispatch<SetStateAction<Record<string, RfidCaptureField[]>>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

type InventoryReloadReporter = (successful: boolean) => void;

type InventoryRefreshInput = {
  reloadCatalog: (reportResult?: InventoryReloadReporter) => Promise<void>;
  selectedSpoolId?: string | null;
};

export function useInventoryPageData({
  setRfidCaptureFieldsBySlotId,
  tauriAvailable,
  t,
}: InventoryPageDataInput) {
  const [spools, setSpools] = useState<InventorySpool[]>([]);
  const spoolsRef = useRef<InventorySpool[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationMutationsSupported, setLocationMutationsSupported] = useState(true);
  const [locationSource, setLocationSource] = useState<
    "LIVE" | "CACHED" | "LEGACY_HOST" | "OFFLINE"
  >("LIVE");
  const {
    beginRefresh,
    completeRefresh,
    error: loadError,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauriAvailable);
  const refreshInFlightRef = useRef(false);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [librarySyncReady, setLibrarySyncReady] = useState(!tauriAvailable);
  const [clientInventorySource, setClientInventorySource] = useState<
    "LIVE" | "CACHED" | "OFFLINE"
  >("LIVE");
  const [clientInventoryUpdatedAt, setClientInventoryUpdatedAt] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<SpoolHistoryEventRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usagePoints, setUsagePoints] = useState<SpoolUsagePointRow[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistItems, setWishlistItems] = useState<WishlistItemRow[]>([]);
  const [activeLoans, setActiveLoans] = useState<ActiveSpoolLoanRow[]>([]);
  const [printerOverview, setPrinterOverview] = useState<PrinterOverviewRow[]>([]);
  const [bambuLiveIntegrations, setBambuLiveIntegrations] = useState<
    Record<string, BambuLiveIntegrationSettings>
  >({});

  useEffect(() => {
    if (!tauriAvailable) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const syncState = await loadLibrarySyncPageState();
        if (cancelled) {
          return;
        }
        setClientReadOnly(syncState.clientReadOnly);
        setClientHostWritePaired(syncState.clientHostWritePaired);
        setClientHostDeviceName(syncState.clientHostDeviceName);
        setClientHostBaseUrl(syncState.clientHostBaseUrl);
        setClientLibraryId(syncState.clientLibraryId);
      } catch (syncError) {
        console.error(syncError);
      } finally {
        if (!cancelled) {
          setLibrarySyncReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauriAvailable]);

  useEffect(() => {
    spoolsRef.current = spools;
  }, [spools]);

  const reloadLocations = useCallback(async (
    spoolRows: InventorySpool[] = spoolsRef.current,
    reportResult?: InventoryReloadReporter,
  ) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    setLocationsLoading(true);
    try {
      const result = await loadInventoryLocations(
        {
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
        },
        spoolRows,
      );
      setLocations(result.rows);
      setLocationMutationsSupported(result.mutationsSupported);
      setLocationSource(result.source);
      reportResult?.(true);
    } catch (locationError) {
      console.error(locationError);
      reportResult?.(false);
    } finally {
      setLocationsLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauriAvailable]);

  const reloadSpools = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    try {
      const result = await loadInventorySpools({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      if (clientReadOnly) {
        setClientInventorySource(result.source);
        setClientInventoryUpdatedAt(result.updatedAt);
        if (result.source === "OFFLINE") {
          reportResult?.(false);
          return;
        }
      }
      spoolsRef.current = result.rows;
      setSpools(result.rows);
      await reloadLocations(result.rows, reportResult);
      reportResult?.(true);
    } catch (loadError) {
      console.error(loadError);
      reportResult?.(false);
    }
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    reloadLocations,
    tauriAvailable,
  ]);

  const reloadWishlist = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    setWishlistLoading(true);
    try {
      const rows = await loadWishlistItems({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      setWishlistItems(rows);
      reportResult?.(true);
    } catch (wishlistError) {
      console.error(wishlistError);
      reportResult?.(false);
    } finally {
      setWishlistLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauriAvailable]);

  const reloadActiveLoans = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    try {
      const rows = await loadActiveLoanRows({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      setActiveLoans(rows);
      reportResult?.(true);
    } catch (loanError) {
      console.error(loanError);
      reportResult?.(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauriAvailable]);

  const reloadPrinterOverview = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    try {
      const overview = await loadPrinterOverviewData({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      if (overview.source === "OFFLINE") {
        reportResult?.(false);
        return;
      }
      const rows = overview.printers;
      setPrinterOverview(
        rows.map((printer) => ({
          ...printer,
          slots: sortPrinterSlotsExtLast(printer.slots),
        })),
      );
      const nextIntegrations = overview.bambuLiveIntegrations;
      if (overview.source === "LIVE" || Object.keys(nextIntegrations).length > 0) {
        setBambuLiveIntegrations(nextIntegrations);
      }
      setRfidCaptureFieldsBySlotId((current) => {
        const seeded = buildBaselineCaptureFieldsBySlotId(rows, nextIntegrations);
        if (Object.keys(seeded).length === 0) {
          return current;
        }
        const merged = { ...current };
        for (const [slotId, baselineFields] of Object.entries(seeded)) {
          merged[slotId] = mergeRfidCaptureFields(baselineFields, merged[slotId] ?? []);
        }
        return merged;
      });
      reportResult?.(true);
    } catch (overviewError) {
      console.error(overviewError);
      reportResult?.(false);
    }
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    setRfidCaptureFieldsBySlotId,
    tauriAvailable,
  ]);

  const reloadSpoolDetail = useCallback(async (
    spoolId: string,
    reportResult?: InventoryReloadReporter,
  ) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    if (
      clientReadOnly &&
      (!clientHostBaseUrl?.trim() || !clientLibraryId?.trim())
    ) {
      reportResult?.(false);
      return;
    }
    setHistoryLoading(true);
    setUsageLoading(true);
    try {
      const detail = await loadInventorySpoolDetail({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        spoolId,
      });
      setHistoryRows(detail.historyRows);
      setUsagePoints(detail.usagePoints);
      reportResult?.(true);
    } catch (detailError) {
      console.error(detailError);
      reportResult?.(false);
    } finally {
      setHistoryLoading(false);
      setUsageLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauriAvailable]);

  const refreshInventoryData = useCallback(async ({
    reloadCatalog,
    selectedSpoolId,
  }: InventoryRefreshInput) => {
    if (!tauriAvailable || refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    beginRefresh();
    let successfulLoads = 0;
    let failedLoads = 0;
    const reportResult: InventoryReloadReporter = (successful) => {
      if (successful) {
        successfulLoads += 1;
      } else {
        failedLoads += 1;
      }
    };
    try {
      const refreshes = [
        reloadSpools(reportResult),
        reloadWishlist(reportResult),
        reloadActiveLoans(reportResult),
        reloadPrinterOverview(reportResult),
        reloadCatalog(reportResult),
      ];
      if (selectedSpoolId) {
        refreshes.push(reloadSpoolDetail(selectedSpoolId, reportResult));
      }
      await Promise.all(refreshes);
      if (failedLoads === 0) {
        completeRefresh();
        return;
      }
      if (successfulLoads > 0) {
        completeRefresh();
      }
      failRefresh(t("errors.requestFailed", "The request could not be completed."));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [
    beginRefresh,
    completeRefresh,
    failRefresh,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    reloadWishlist,
    t,
    tauriAvailable,
  ]);

  return {
    activeLoans,
    bambuLiveIntegrations,
    clientHostBaseUrl,
    clientHostDeviceName,
    clientHostWritePaired,
    clientInventorySource,
    clientInventoryUpdatedAt,
    clientLibraryId,
    clientReadOnly,
    completeDataLoad: completeRefresh,
    historyLoading,
    historyRows,
    librarySyncReady,
    loadError,
    loading,
    locations,
    locationsLoading,
    locationMutationsSupported,
    locationSource,
    printerOverview,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadLocations,
    refreshInventoryData,
    reloadSpoolDetail,
    reloadSpools,
    reloadWishlist,
    setActiveLoans,
    setBambuLiveIntegrations,
    setHistoryLoading,
    setHistoryRows,
    setPrinterOverview,
    setSpools,
    setUsageLoading,
    setUsagePoints,
    spools,
    refreshing,
    usageLoading,
    usagePoints,
    wishlistItems,
    wishlistLoading,
  };
}
