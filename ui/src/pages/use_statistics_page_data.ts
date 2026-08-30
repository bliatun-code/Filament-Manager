import { useCallback, useEffect, useRef, useState } from "react";
import type { I18nContextValue } from "../lib/i18n";
import { usePageRefreshState } from "../lib/page_refresh_state";
import { loadStatisticsPageData } from "../lib/statistics_data_source";
import type {
  FilamentConsumptionRow,
  InventoryOverview,
  LoanUsageByPersonRow,
  PrinterOverviewRow,
  StatisticsPeriod,
  StatisticsPeriodReport,
} from "../lib/tauri_client";
import type {
  NormalizedLoanDetailsRow,
  NormalizedSpoolWithMasterRow,
  StatisticsPeriodDataStatus,
  StatisticsSnapshotSource,
} from "../lib/statistics_data_source";

type Translate = I18nContextValue["t"];

export function useStatisticsPageData({
  period,
  tauri,
  t,
}: {
  period: StatisticsPeriod;
  tauri: boolean;
  t: Translate;
}) {
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [printers, setPrinters] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<NormalizedSpoolWithMasterRow[]>([]);
  const [overviewConsumptionRows, setOverviewConsumptionRows] = useState<FilamentConsumptionRow[]>(
    [],
  );
  const [loanUsage, setLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [inboundLoanUsage, setInboundLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [loanDetails, setLoanDetails] = useState<NormalizedLoanDetailsRow[]>([]);
  const {
    beginRefresh,
    completeRefresh,
    error,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauri);
  const loadRequestRef = useRef(0);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [clientStatsSource, setClientStatsSource] =
    useState<StatisticsSnapshotSource>("OFFLINE");
  const [clientStatisticsUpdatedAt, setClientStatisticsUpdatedAt] = useState<string | null>(null);
  const [periodReport, setPeriodReport] = useState<StatisticsPeriodReport | null>(null);
  const [periodStatus, setPeriodStatus] =
    useState<StatisticsPeriodDataStatus>("UNAVAILABLE");

  const loadStatistics = useCallback(
    async () => {
      if (!tauri) {
        return;
      }
      const requestId = loadRequestRef.current + 1;
      loadRequestRef.current = requestId;
      beginRefresh();
      setPeriodReport(null);
      setPeriodStatus("UNAVAILABLE");
      try {
        const result = await loadStatisticsPageData({
          start_at_utc: period.start_at_utc,
          end_at_utc: period.end_at_utc,
        });
        if (requestId !== loadRequestRef.current) {
          return;
        }
        const { syncState } = result;

        setClientReadOnly(syncState.clientReadOnly);
        setClientHostDeviceName(syncState.clientHostDeviceName);
        setClientHostBaseUrl(syncState.clientHostBaseUrl);
        setClientLibraryId(syncState.clientLibraryId);

        setOverview(result.overview ? { ...result.overview } : null);
        setPrinters(result.printers);
        setSpoolRows([...result.spoolRows]);
        setOverviewConsumptionRows([...result.consumptionRows]);
        setLoanDetails(result.loanDetails);
        setLoanUsage(result.loanUsage);
        setInboundLoanUsage(result.inboundLoanUsage);
        setPeriodReport(result.periodReport);
        setPeriodStatus(result.periodStatus);
        setClientStatisticsUpdatedAt(result.updatedAt);
        setClientStatsSource(result.source);
        completeRefresh();
      } catch (loadError) {
        console.error(loadError);
        if (requestId === loadRequestRef.current) {
          failRefresh(t("statistics.error.load", "Failed to load statistics."));
        }
      }
    },
    [
      beginRefresh,
      completeRefresh,
      failRefresh,
      period.end_at_utc,
      period.start_at_utc,
      t,
      tauri,
    ],
  );

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

  return {
    clientHostBaseUrl,
    clientHostDeviceName,
    clientLibraryId,
    clientReadOnly,
    clientStatisticsUpdatedAt,
    clientStatsSource,
    error,
    inboundLoanUsage,
    loading,
    loanDetails,
    loanUsage,
    overview,
    overviewConsumptionRows,
    periodReport,
    periodStatus,
    printers,
    refreshing,
    reloadData: loadStatistics,
    spoolRows,
  };
}
