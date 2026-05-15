import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { loadActiveLoanRows } from "./loan_data_source";
import {
  loadInventorySpoolDetail,
  loadInventorySpools,
} from "./inventory_data_source";
import { loadLibrarySyncPageState } from "./library_sync_state";
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
import type { InventorySpool } from "./inventory_list_model";

type InventoryPageDataInput = {
  setError: Dispatch<SetStateAction<string | null>>;
  setRfidCaptureFieldsBySlotId: Dispatch<SetStateAction<Record<string, RfidCaptureField[]>>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryPageData({
  setError,
  setRfidCaptureFieldsBySlotId,
  tauriAvailable,
  t,
}: InventoryPageDataInput) {
  const [spools, setSpools] = useState<InventorySpool[]>([]);
  const [loading, setLoading] = useState(tauriAvailable);
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

  const reloadSpools = useCallback(async () => {
    if (!tauriAvailable) {
      return;
    }
    setLoading(true);
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
          setError(t("inventory.error.loadSpools", "Could not load inventory spools."));
        }
      }
      setSpools(result.rows);
    } catch (loadError) {
      console.error(loadError);
      setError(t("inventory.error.loadSpools", "Could not load inventory spools."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, setError, t, tauriAvailable]);

  const reloadWishlist = useCallback(async () => {
    if (!tauriAvailable) {
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
    } catch (wishlistError) {
      console.error(wishlistError);
      setWishlistItems([]);
    } finally {
      setWishlistLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauriAvailable]);

  const reloadActiveLoans = useCallback(async () => {
    if (!tauriAvailable) {
      return;
    }
    try {
      const rows = await loadActiveLoanRows({ clientReadOnly });
      setActiveLoans(rows);
    } catch (loanError) {
      console.error(loanError);
      setActiveLoans([]);
    }
  }, [clientReadOnly, tauriAvailable]);

  const reloadPrinterOverview = useCallback(async () => {
    if (!tauriAvailable) {
      return;
    }
    try {
      const overview = await loadPrinterOverviewData({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      const rows = overview.printers;
      setPrinterOverview(
        rows.map((printer) => ({
          ...printer,
          slots: sortPrinterSlotsExtLast(printer.slots),
        })),
      );
      const nextIntegrations = overview.bambuLiveIntegrations;
      setBambuLiveIntegrations(nextIntegrations);
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
    } catch (overviewError) {
      console.error(overviewError);
      setPrinterOverview([]);
      setBambuLiveIntegrations({});
    }
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    setRfidCaptureFieldsBySlotId,
    tauriAvailable,
  ]);

  const reloadSpoolDetail = useCallback(async (spoolId: string) => {
    if (!tauriAvailable) {
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
    } catch (detailError) {
      console.error(detailError);
      setHistoryRows([]);
      setUsagePoints([]);
    } finally {
      setHistoryLoading(false);
      setUsageLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, tauriAvailable]);

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
    historyLoading,
    historyRows,
    librarySyncReady,
    loading,
    printerOverview,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpoolDetail,
    reloadSpools,
    reloadWishlist,
    setActiveLoans,
    setBambuLiveIntegrations,
    setHistoryLoading,
    setHistoryRows,
    setLoading,
    setPrinterOverview,
    setSpools,
    setUsageLoading,
    setUsagePoints,
    spools,
    usageLoading,
    usagePoints,
    wishlistItems,
    wishlistLoading,
  };
}
