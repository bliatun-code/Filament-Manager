import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { loadActiveLoanRowsSnapshot } from "./loan_data_source";
import {
  loadInventorySpoolDetail,
  loadInventorySpools,
} from "./inventory_data_source";
import { loadInventoryLocations } from "./inventory_location_data_source";
import { loadLibrarySyncPageState } from "./library_sync_state";
import {
  isClientCompositeSnapshotPartial,
  usePageRefreshState,
  type ClientSnapshotSource,
  type ResolvedClientSnapshotSource,
} from "./page_refresh_state";
import { loadPrinterOverviewData } from "./printer_data_source";
import { sortPrinterSlotsExtLast } from "./printer_profiles";
import { loadWishlistItemsSnapshot } from "./wishlist_data_source";
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

type InventoryReloadResolution =
  | ResolvedClientSnapshotSource
  | "ERROR"
  | "SUPERSEDED";
type InventoryReloadReporter = (
  domain: InventoryDataRequestDomain,
  resolution: InventoryReloadResolution,
) => void;

type InventoryRefreshInput = {
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

const INVENTORY_COMPOSITE_SECONDARY_DOMAINS: readonly InventoryDataRequestDomain[] = [
  "locations",
  "wishlist",
  "loans",
  "printers",
];

function createInventoryDomainSources(): Record<
  InventoryDataRequestDomain,
  ClientSnapshotSource
> {
  return {
    spools: "UNRESOLVED",
    locations: "UNRESOLVED",
    wishlist: "UNRESOLVED",
    loans: "UNRESOLVED",
    printers: "UNRESOLVED",
    detail: "UNRESOLVED",
  };
}

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
  const [clientInventorySource, setClientInventorySource] =
    useState<ClientSnapshotSource>("UNRESOLVED");
  const clientInventorySourceRef = useRef<ClientSnapshotSource>("UNRESOLVED");
  const clientInventoryDomainSourcesRef = useRef(createInventoryDomainSources());
  const [clientInventoryPartial, setClientInventoryPartial] = useState(false);
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

  const refreshClientInventoryPartial = useCallback(() => {
    const secondarySources = INVENTORY_COMPOSITE_SECONDARY_DOMAINS
      .map((domain) => clientInventoryDomainSourcesRef.current[domain])
      .filter(
        (source): source is ResolvedClientSnapshotSource => source !== "UNRESOLVED",
      );
    setClientInventoryPartial(
      clientReadOnly &&
        isClientCompositeSnapshotPartial({
          primarySource: clientInventorySourceRef.current,
          secondarySources,
        }),
    );
  }, [clientReadOnly]);

  const recordClientInventoryDomainSource = useCallback((
    domain: InventoryDataRequestDomain,
    source: ResolvedClientSnapshotSource,
  ) => {
    clientInventoryDomainSourcesRef.current[domain] = source;
    refreshClientInventoryPartial();
  }, [refreshClientInventoryPartial]);

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
    clientInventorySourceRef.current = "UNRESOLVED";
    clientInventoryDomainSourcesRef.current = createInventoryDomainSources();
    setClientInventorySource("UNRESOLVED");
    setClientInventoryPartial(false);
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
      reportResult?.("locations", "ERROR");
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
        reportResult?.("locations", "SUPERSEDED");
        return;
      }
      setLocations(result.rows);
      setLocationMutationsSupported(result.mutationsSupported);
      setLocationSource(result.source);
      const source =
        result.source === "CACHED"
          ? "CACHED"
          : result.source === "OFFLINE"
            ? "OFFLINE"
            : "LIVE";
      recordClientInventoryDomainSource("locations", source);
      reportResult?.(
        "locations",
        source,
      );
    } catch (locationError) {
      if (!dataRequestIsCurrent("locations", requestId)) {
        reportResult?.("locations", "SUPERSEDED");
        return;
      }
      console.error(locationError);
      if (clientReadOnly) {
        if (reportResult) {
          setLocations([]);
        }
        setLocationMutationsSupported(false);
        setLocationSource("OFFLINE");
        recordClientInventoryDomainSource("locations", "OFFLINE");
      }
      reportResult?.("locations", clientReadOnly ? "OFFLINE" : "ERROR");
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
    recordClientInventoryDomainSource,
    tauriAvailable,
  ]);

  const reloadSpools = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.("spools", "ERROR");
      reportResult?.("locations", "ERROR");
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
        reportResult?.("spools", "SUPERSEDED");
        reportResult?.("locations", "SUPERSEDED");
        return;
      }
      if (clientReadOnly) {
        const hasLastGoodSnapshot =
          clientInventorySourceRef.current === "LIVE" ||
          clientInventorySourceRef.current === "CACHED";
        const source =
          result.source === "OFFLINE" && !reportResult && hasLastGoodSnapshot
            ? "CACHED"
            : result.source;
        clientInventorySourceRef.current = source;
        setClientInventorySource(source);
        clientInventoryDomainSourcesRef.current.spools = source;
        if (result.source !== "OFFLINE" || reportResult) {
          setClientInventoryUpdatedAt(result.updatedAt);
        }
        refreshClientInventoryPartial();
      }
      if (clientReadOnly && result.source === "OFFLINE" && !reportResult) {
        // Background and post-mutation refreshes have their own feedback
        // owners. Keep their last-good rows, classify them as stale, and revoke
        // location writes until the Host is reachable again.
        setLocationMutationsSupported(false);
        setLocationSource("OFFLINE");
        recordClientInventoryDomainSource("locations", "OFFLINE");
        return;
      }
      spoolsRef.current = result.rows;
      setSpools(result.rows);
      await reloadLocations(result.rows, reportResult);
      if (!dataRequestIsCurrent("spools", requestId)) {
        reportResult?.("spools", "SUPERSEDED");
        return;
      }
      if (clientReadOnly && result.source === "OFFLINE") {
        reportResult?.("spools", "OFFLINE");
        return;
      }
      const source =
        clientReadOnly && result.source === "CACHED" ? "CACHED" : "LIVE";
      recordClientInventoryDomainSource("spools", source);
      reportResult?.(
        "spools",
        source,
      );
    } catch (loadError) {
      if (!dataRequestIsCurrent("spools", requestId)) {
        reportResult?.("spools", "SUPERSEDED");
        reportResult?.("locations", "SUPERSEDED");
        return;
      }
      console.error(loadError);
      if (reportResult && clientReadOnly) {
        clientInventorySourceRef.current = "UNRESOLVED";
        setClientInventorySource("UNRESOLVED");
        setClientInventoryUpdatedAt(null);
      }
      reportResult?.("spools", "ERROR");
      reportResult?.("locations", "ERROR");
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    recordClientInventoryDomainSource,
    refreshClientInventoryPartial,
    reloadLocations,
    tauriAvailable,
  ]);

  const reloadWishlist = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.("wishlist", "ERROR");
      return;
    }
    const requestId = beginDataRequest("wishlist");
    setWishlistLoading(true);
    try {
      const result = await loadWishlistItemsSnapshot({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (!dataRequestIsCurrent("wishlist", requestId)) {
        reportResult?.("wishlist", "SUPERSEDED");
        return;
      }
      if (result.source === "OFFLINE" && !reportResult) {
        recordClientInventoryDomainSource("wishlist", "OFFLINE");
        return;
      }
      setWishlistItems(result.rows);
      recordClientInventoryDomainSource("wishlist", result.source);
      reportResult?.("wishlist", result.source);
    } catch (wishlistError) {
      if (!dataRequestIsCurrent("wishlist", requestId)) {
        reportResult?.("wishlist", "SUPERSEDED");
        return;
      }
      console.error(wishlistError);
      if (reportResult && clientReadOnly) {
        setWishlistItems([]);
      }
      if (clientReadOnly) {
        recordClientInventoryDomainSource("wishlist", "OFFLINE");
      }
      reportResult?.("wishlist", "ERROR");
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
    recordClientInventoryDomainSource,
    tauriAvailable,
  ]);

  const reloadActiveLoans = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.("loans", "ERROR");
      return;
    }
    const requestId = beginDataRequest("loans");
    try {
      const result = await loadActiveLoanRowsSnapshot({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (!dataRequestIsCurrent("loans", requestId)) {
        reportResult?.("loans", "SUPERSEDED");
        return;
      }
      if (result.source === "OFFLINE" && !reportResult) {
        recordClientInventoryDomainSource("loans", "OFFLINE");
        return;
      }
      setActiveLoans(result.rows);
      recordClientInventoryDomainSource("loans", result.source);
      reportResult?.("loans", result.source);
    } catch (loanError) {
      if (!dataRequestIsCurrent("loans", requestId)) {
        reportResult?.("loans", "SUPERSEDED");
        return;
      }
      console.error(loanError);
      if (reportResult && clientReadOnly) {
        setActiveLoans([]);
      }
      if (clientReadOnly) {
        recordClientInventoryDomainSource("loans", "OFFLINE");
      }
      reportResult?.("loans", "ERROR");
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    recordClientInventoryDomainSource,
    tauriAvailable,
  ]);

  const reloadPrinterOverview = useCallback(async (reportResult?: InventoryReloadReporter) => {
    if (!tauriAvailable) {
      reportResult?.("printers", "ERROR");
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
        reportResult?.("printers", "SUPERSEDED");
        return;
      }
      if (overview.source === "OFFLINE") {
        if (reportResult) {
          setPrinterOverview([]);
          setBambuLiveIntegrations({});
          setRfidCaptureFieldsBySlotId({});
        }
        recordClientInventoryDomainSource("printers", "OFFLINE");
        // A missing printer snapshot is only covered by the page-wide Host
        // warning when the primary inventory source also settled to fallback.
        // With live inventory it must remain a visible, retryable partial load.
        reportResult?.("printers", "OFFLINE");
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
      } else if (reportResult) {
        setBambuLiveIntegrations({});
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
      recordClientInventoryDomainSource("printers", overview.source);
      reportResult?.("printers", overview.source);
    } catch (overviewError) {
      if (!dataRequestIsCurrent("printers", requestId)) {
        reportResult?.("printers", "SUPERSEDED");
        return;
      }
      console.error(overviewError);
      if (clientReadOnly) {
        recordClientInventoryDomainSource("printers", "OFFLINE");
      }
      reportResult?.("printers", "ERROR");
    }
  }, [
    beginDataRequest,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    dataRequestIsCurrent,
    recordClientInventoryDomainSource,
    setRfidCaptureFieldsBySlotId,
    tauriAvailable,
  ]);

  const reloadSpoolDetail = useCallback(async (
    spoolId: string,
    reportResult?: InventoryReloadReporter,
  ) => {
    if (!tauriAvailable) {
      reportResult?.("detail", "ERROR");
      return;
    }
    const requestId = beginDataRequest("detail");
    if (
      clientReadOnly &&
      (!clientHostBaseUrl?.trim() || !clientLibraryId?.trim())
    ) {
      if (reportResult) {
        setHistoryRows([]);
        setUsagePoints([]);
      }
      recordClientInventoryDomainSource("detail", "OFFLINE");
      reportResult?.("detail", "OFFLINE");
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
        reportResult?.("detail", "SUPERSEDED");
        return;
      }
      setHistoryRows(detail.historyRows);
      setUsagePoints(detail.usagePoints);
      recordClientInventoryDomainSource("detail", "LIVE");
      reportResult?.("detail", "LIVE");
    } catch (detailError) {
      if (!dataRequestIsCurrent("detail", requestId)) {
        reportResult?.("detail", "SUPERSEDED");
        return;
      }
      console.error(detailError);
      if (reportResult && clientReadOnly) {
        setHistoryRows([]);
        setUsagePoints([]);
      }
      if (clientReadOnly) {
        recordClientInventoryDomainSource("detail", "OFFLINE");
      }
      reportResult?.("detail", clientReadOnly ? "OFFLINE" : "ERROR");
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
    recordClientInventoryDomainSource,
    tauriAvailable,
  ]);

  const refreshInventoryData = useCallback(async ({
    selectedSpoolId,
  }: InventoryRefreshInput = {}) => {
    if (!tauriAvailable) {
      return;
    }
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    if (clientReadOnly) {
      // A previous fallback must not classify a later exceptional refresh as
      // another expected offline result before the primary spool read settles.
      clientInventorySourceRef.current = "UNRESOLVED";
    }
    beginRefresh();
    const resolutions = new Map<InventoryDataRequestDomain, InventoryReloadResolution>();
    const reportResult: InventoryReloadReporter = (domain, resolution) => {
      resolutions.set(domain, resolution);
    };
    try {
      const expectedDomains: InventoryDataRequestDomain[] = [
        "spools",
        "locations",
        "wishlist",
        "loans",
        "printers",
      ];
      const refreshes = [
        reloadSpools(reportResult),
        reloadWishlist(reportResult),
        reloadActiveLoans(reportResult),
        reloadPrinterOverview(reportResult),
      ];
      if (selectedSpoolId) {
        expectedDomains.push("detail");
        refreshes.push(reloadSpoolDetail(selectedSpoolId, reportResult));
      }
      await Promise.all(refreshes);
      if (refreshRequestRef.current !== requestId) {
        return;
      }
      const missingDomains = expectedDomains.filter(
        (domain) => !resolutions.has(domain),
      );
      const unexpectedFailure = missingDomains.length > 0 || [...resolutions.values()].some(
        (resolution) => resolution === "ERROR",
      );
      const superseded = [...resolutions.values()].some(
        (resolution) => resolution === "SUPERSEDED",
      );
      if (unexpectedFailure) {
        if (
          [...resolutions.values()].some(
            (resolution) => resolution !== "ERROR" && resolution !== "SUPERSEDED",
          )
        ) {
          completeRefresh();
        }
        failRefresh(t("errors.requestFailed", "The request could not be completed."));
        return;
      }
      if (!superseded) {
        refreshClientInventoryPartial();
      }
      completeRefresh();
    } catch (refreshError) {
      console.error(refreshError);
      if (refreshRequestRef.current === requestId) {
        setClientInventoryPartial(false);
        failRefresh(t("errors.requestFailed", "The request could not be completed."));
      }
    }
  }, [
    beginRefresh,
    clientReadOnly,
    completeRefresh,
    failRefresh,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    reloadWishlist,
    refreshClientInventoryPartial,
    t,
    tauriAvailable,
  ]);

  return {
    activeLoans,
    bambuLiveIntegrations,
    clientHostBaseUrl,
    clientHostDeviceName,
    clientHostWritePaired,
    clientInventoryPartial,
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
