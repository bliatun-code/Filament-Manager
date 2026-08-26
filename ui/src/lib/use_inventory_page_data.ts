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

type LibrarySyncResolution = "LOADING" | "READY" | "ERROR";
type InventoryDataRequestDomain =
  | "spools"
  | "locations"
  | "wishlist"
  | "loans"
  | "printers"
  | "detail";

const INVENTORY_DATA_REQUEST_DOMAINS: readonly InventoryDataRequestDomain[] = [
  "spools",
  "locations",
  "wishlist",
  "loans",
  "printers",
  "detail",
];

export function useInventoryPageData({
  setRfidCaptureFieldsBySlotId,
  tauriAvailable,
  t,
}: InventoryPageDataInput) {
  const [spools, setSpools] = useState<InventorySpool[]>([]);
  const spoolsRef = useRef<InventorySpool[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationMutationsSupported, setLocationMutationsSupported] = useState(false);
  const [locationSource, setLocationSource] = useState<
    "LIVE" | "CACHED" | "LEGACY_HOST" | "OFFLINE"
  >("OFFLINE");
  const {
    beginRefresh,
    completeRefresh,
    error: loadError,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauriAvailable);
  const refreshRequestRef = useRef(0);
  const dataRequestRef = useRef<Record<InventoryDataRequestDomain, number>>({
    spools: 0,
    locations: 0,
    wishlist: 0,
    loans: 0,
    printers: 0,
    detail: 0,
  });
  const librarySyncRequestRef = useRef(0);
  // A desktop with an unresolved role must behave like a client without a
  // writable Host target. Standalone/local writes are enabled only after the
  // persisted role has been read successfully.
  const [clientReadOnly, setClientReadOnly] = useState(tauriAvailable);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [clientTargetGeneration, setClientTargetGeneration] = useState<number | null>(null);
  const [librarySyncResolution, setLibrarySyncResolution] =
    useState<LibrarySyncResolution>(tauriAvailable ? "LOADING" : "READY");
  const librarySyncReady = librarySyncResolution === "READY";
  const librarySyncResolving = librarySyncResolution === "LOADING";
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

  const beginDataRequest = useCallback((domain: InventoryDataRequestDomain) => {
    const requestId = dataRequestRef.current[domain] + 1;
    dataRequestRef.current[domain] = requestId;
    return requestId;
  }, []);

  const dataRequestIsCurrent = useCallback(
    (domain: InventoryDataRequestDomain, requestId: number) =>
      dataRequestRef.current[domain] === requestId,
    [],
  );

  const invalidateInventoryDataRequests = useCallback(() => {
    for (const domain of INVENTORY_DATA_REQUEST_DOMAINS) {
      dataRequestRef.current[domain] += 1;
    }
    refreshRequestRef.current += 1;
  }, []);

  const clearTargetScopedData = useCallback(() => {
    spoolsRef.current = [];
    setSpools([]);
    setLocations([]);
    setLocationsLoading(false);
    setLocationMutationsSupported(false);
    setLocationSource("OFFLINE");
    setWishlistItems([]);
    setWishlistLoading(false);
    setActiveLoans([]);
    setPrinterOverview([]);
    setBambuLiveIntegrations({});
    setHistoryRows([]);
    setHistoryLoading(false);
    setUsagePoints([]);
    setUsageLoading(false);
    setClientInventorySource("OFFLINE");
    setClientInventoryUpdatedAt(null);
    setRfidCaptureFieldsBySlotId({});
  }, [setRfidCaptureFieldsBySlotId]);

  const resolveLibrarySyncRole = useCallback(async () => {
    if (!tauriAvailable) {
      setLibrarySyncResolution("READY");
      return true;
    }
    const requestId = librarySyncRequestRef.current + 1;
    librarySyncRequestRef.current = requestId;
    invalidateInventoryDataRequests();
    clearTargetScopedData();
    setClientReadOnly(true);
    setClientHostWritePaired(false);
    setClientHostDeviceName(null);
    setClientHostBaseUrl(null);
    setClientLibraryId(null);
    setClientTargetGeneration(null);
    setLibrarySyncResolution("LOADING");
    try {
      const syncState = await loadLibrarySyncPageState();
      if (requestId !== librarySyncRequestRef.current) {
        return false;
      }
      invalidateInventoryDataRequests();
      setClientReadOnly(syncState.clientReadOnly);
      setClientHostWritePaired(syncState.clientHostWritePaired);
      setClientHostDeviceName(syncState.clientHostDeviceName);
      setClientHostBaseUrl(syncState.clientHostBaseUrl);
      setClientLibraryId(syncState.clientLibraryId);
      setClientTargetGeneration(syncState.clientTargetGeneration);
      setLibrarySyncResolution("READY");
      return true;
    } catch (syncError) {
      console.error(syncError);
      if (requestId === librarySyncRequestRef.current) {
        invalidateInventoryDataRequests();
        // Preserve the fail-closed defaults and give the page's existing load
        // error banner a retry path. Never reinterpret an unknown role as local.
        setClientReadOnly(true);
        setClientHostWritePaired(false);
        setClientHostDeviceName(null);
        setClientHostBaseUrl(null);
        setClientLibraryId(null);
        setClientTargetGeneration(null);
        setLibrarySyncResolution("ERROR");
        failRefresh(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
      return false;
    }
  }, [
    clearTargetScopedData,
    failRefresh,
    invalidateInventoryDataRequests,
    t,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (!tauriAvailable) {
      return;
    }
    void resolveLibrarySyncRole();
    return () => {
      librarySyncRequestRef.current += 1;
      invalidateInventoryDataRequests();
    };
  }, [invalidateInventoryDataRequests, resolveLibrarySyncRole, tauriAvailable]);

  const retryLibrarySyncRole = useCallback(() => {
    if (!tauriAvailable || librarySyncResolving) {
      return;
    }
    beginRefresh();
    void resolveLibrarySyncRole();
  }, [beginRefresh, librarySyncResolving, resolveLibrarySyncRole, tauriAvailable]);

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
    const requestId = beginDataRequest("locations");
    setLocationsLoading(true);
    try {
      const result = await loadInventoryLocations(
        {
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
          clientTargetGeneration,
        },
        spoolRows,
      );
      if (!dataRequestIsCurrent("locations", requestId)) {
        return;
      }
      setLocations(result.rows);
      setLocationMutationsSupported(result.mutationsSupported);
      setLocationSource(result.source);
      reportResult?.(true);
    } catch (locationError) {
      console.error(locationError);
      if (dataRequestIsCurrent("locations", requestId)) {
        reportResult?.(false);
      }
    } finally {
      if (dataRequestIsCurrent("locations", requestId)) {
        setLocationsLoading(false);
      }
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    tauriAvailable,
  ]);

  const reloadSpools = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    const requestId = beginDataRequest("spools");
    try {
      const result = await loadInventorySpools({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (!dataRequestIsCurrent("spools", requestId)) {
        return;
      }
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
      if (dataRequestIsCurrent("spools", requestId)) {
        reportResult?.(true);
      }
    } catch (loadError) {
      console.error(loadError);
      if (dataRequestIsCurrent("spools", requestId)) {
        reportResult?.(false);
      }
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    reloadLocations,
    tauriAvailable,
  ]);

  const reloadWishlist = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    const requestId = beginDataRequest("wishlist");
    setWishlistLoading(true);
    try {
      const rows = await loadWishlistItems({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (!dataRequestIsCurrent("wishlist", requestId)) {
        return;
      }
      setWishlistItems(rows);
      reportResult?.(true);
    } catch (wishlistError) {
      console.error(wishlistError);
      if (dataRequestIsCurrent("wishlist", requestId)) {
        reportResult?.(false);
      }
    } finally {
      if (dataRequestIsCurrent("wishlist", requestId)) {
        setWishlistLoading(false);
      }
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    tauriAvailable,
  ]);

  const reloadActiveLoans = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    const requestId = beginDataRequest("loans");
    try {
      const rows = await loadActiveLoanRows({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (!dataRequestIsCurrent("loans", requestId)) {
        return;
      }
      setActiveLoans(rows);
      reportResult?.(true);
    } catch (loanError) {
      console.error(loanError);
      if (dataRequestIsCurrent("loans", requestId)) {
        reportResult?.(false);
      }
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    tauriAvailable,
  ]);

  const reloadPrinterOverview = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    const requestId = beginDataRequest("printers");
    try {
      const overview = await loadPrinterOverviewData({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (!dataRequestIsCurrent("printers", requestId)) {
        return;
      }
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
      if (dataRequestIsCurrent("printers", requestId)) {
        reportResult?.(false);
      }
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
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
    const requestId = beginDataRequest("detail");
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
        clientTargetGeneration,
        spoolId,
      });
      if (!dataRequestIsCurrent("detail", requestId)) {
        return;
      }
      setHistoryRows(detail.historyRows);
      setUsagePoints(detail.usagePoints);
      reportResult?.(true);
    } catch (detailError) {
      console.error(detailError);
      if (dataRequestIsCurrent("detail", requestId)) {
        reportResult?.(false);
      }
    } finally {
      if (dataRequestIsCurrent("detail", requestId)) {
        setHistoryLoading(false);
        setUsageLoading(false);
      }
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    tauriAvailable,
  ]);

  const refreshInventoryData = useCallback(async ({
    reloadCatalog,
    selectedSpoolId,
  }: InventoryRefreshInput) => {
    if (!tauriAvailable) {
      return;
    }
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
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
      if (refreshRequestRef.current !== requestId) {
        return;
      }
      if (failedLoads === 0) {
        completeRefresh();
        return;
      }
      if (successfulLoads > 0) {
        completeRefresh();
      }
      failRefresh(t("errors.requestFailed", "The request could not be completed."));
    } catch (refreshError) {
      console.error(refreshError);
      if (refreshRequestRef.current === requestId) {
        failRefresh(t("errors.requestFailed", "The request could not be completed."));
      }
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
    clientTargetGeneration,
    completeDataLoad: completeRefresh,
    historyLoading,
    historyRows,
    librarySyncReady,
    librarySyncResolving,
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
    retryLibrarySyncRole,
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
