import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  exportLoansCsv,
  isTauri,
} from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanHistoryTable } from "../components/loan_history_table";
import { LoanOutModal } from "../components/loan_out_modal";
import { LoanReturnModal } from "../components/loan_return_modal";
import { PageDataFallbackBanner } from "../components/page_data_fallback_banner";
import { PageHeaderButton } from "../components/page_header_button";
import { PageLoadErrorBanner } from "../components/page_load_error_banner";
import { neutralChipClass } from "../lib/chip_styles";
import { downloadTextFile } from "../lib/download_file";
import { useI18n } from "../lib/i18n";
import {
  filterLoans,
  formatDateTime,
  type LoanDirectionFilter,
  type LoanFilter,
  toMeasuredTotalWeight,
  toReturnedFilamentWeight,
} from "../lib/loan_display";
import { buildLoansCsv } from "../lib/loan_export";
import { isInboundLoan, isLoanCurrentlyActive, isOutboundLoan } from "../lib/loan_state";
import {
  shouldShowClientSnapshotWarning,
  usePageRefreshState,
} from "../lib/page_refresh_state";
import {
  activeLoanRowsForDisplay,
  loadLoanRowsPage,
  mergeLoanHistoryAndActiveRows,
  returnInventoryLoan,
  type LoanDataLoadResult,
  type NormalizedLoanDetailsRow,
} from "../lib/loan_data_source";
import {
  DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import { useClientWriteGuards } from "../lib/use_client_write_guards";
import { parseNonNegativeWeight } from "../lib/weight_display";
import type { LibrarySyncUiState } from "./use_library_sync_state";
import { getLoanWorkspaceCounts, type LoanWorkspaceCounts } from "../lib/tauri_loan_client";
import { loadLibrarySyncPageState } from "../lib/library_sync_state";

type LoansPageProps = {
  embedded?: boolean;
  library: LibrarySyncUiState;
  onCountsChange: (counts: LoanWorkspaceCounts | null) => void;
  onOpenSpool?: (spoolId: string) => void;
};

export default function LoansPage(props: LoansPageProps) {
  const { library } = props;
  // Return drafts and the loan rows they were opened from belong to one target.
  const key = JSON.stringify([library.clientReadOnly, library.clientHostBaseUrl,
    library.clientLibraryId, library.clientTargetGeneration]);
  return <LoanWorkspace key={key} {...props} />;
}

function LoanWorkspace({ embedded = false, onCountsChange, onOpenSpool, library }: LoansPageProps) {
  const { t, locale } = useI18n();
  const tauri = isTauri();
  const {
    beginRefresh,
    completeRefresh,
    error: loadError,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauri);
  const reloadRequestRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    clientReadOnly,
    clientHostWritePaired,
    clientHostDeviceName,
    clientHostBaseUrl,
    clientLibraryId,
    clientTargetGeneration,
    librarySyncError,
    librarySyncReady,
    librarySyncResolving,
    retryLibrarySyncRole,
  } = library;
  const [loanHistory, setLoanHistory] = useState<LoanDataLoadResult | null>(null);
  const [activeLoanSnapshot, setActiveLoanSnapshot] = useState<LoanDataLoadResult | null>(null);
  const [filter, setFilter] = useState<LoanFilter>("ACTIVE");
  const [directionFilter, setDirectionFilter] = useState<LoanDirectionFilter>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [showLoanOutModal, setShowLoanOutModal] = useState(false);
  const [returnModalLoan, setReturnModalLoan] = useState<NormalizedLoanDetailsRow | null>(
    null,
  );
  const [returnModalGrams, setReturnModalGrams] = useState("");
  const [returnModalNote, setReturnModalNote] = useState("");
  const [returnModalError, setReturnModalError] = useState<string | null>(null);
  const returnSubmittingRef = useRef(false);
  const retryRoleOnClose = useRef(false);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onCountsChange(null); };
  }, [onCountsChange]);
  const desktopVisualQaScenario = useMemo(() => resolveDesktopVisualQaScenario(), []);
  const [desktopVisualQaReturnApplied, setDesktopVisualQaReturnApplied] = useState(
    () =>
      desktopVisualQaScenario !== "return-loan" &&
      desktopVisualQaScenario !== "return-inbound-loan",
  );

  const reload = useCallback(async () => {
    if (!tauri) {
      return;
    }
    const requestId = reloadRequestRef.current + 1;
    reloadRequestRef.current = requestId;
    beginRefresh();
    try {
      const options = {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      };
      const [history, active, counts] = await Promise.all([
        loadLoanRowsPage(options),
        loadLoanRowsPage({ ...options, activeOnly: true, limit: 2500 }),
        clientLibraryId && clientTargetGeneration != null
          ? getLoanWorkspaceCounts({
              base_url: clientReadOnly ? clientHostBaseUrl : null,
              expected_library_id: clientLibraryId,
              target_generation: clientTargetGeneration,
            }).catch(() => null)
          : null,
      ]);
      const current = await loadLibrarySyncPageState();
      if (!mounted.current || requestId !== reloadRequestRef.current) return;
      if (current.clientReadOnly !== clientReadOnly || current.clientLibraryId !== clientLibraryId ||
          current.clientTargetGeneration !== clientTargetGeneration || current.clientHostBaseUrl !== clientHostBaseUrl ||
          current.clientHostWritePaired !== clientHostWritePaired) {
        retryLibrarySyncRole();
        return;
      }
      onCountsChange(counts);
      setLoanHistory(history);
      setActiveLoanSnapshot(active);
      // OFFLINE is a settled client fallback. The dedicated Host warning
      // explains it without layering a generic page error on top.
      completeRefresh();
    } catch (loadError) {
      console.error(loadError);
      if (mounted.current && requestId === reloadRequestRef.current) {
        setLoanHistory(null);
        setActiveLoanSnapshot(null);
        onCountsChange(null);
        failRefresh(t("loans.error.load", "Failed to load loan data."));
      }
    }
  }, [
    beginRefresh,
    clientHostWritePaired,
    onCountsChange,
    retryLibrarySyncRole,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    completeRefresh,
    failRefresh,
    t,
    tauri,
  ]);

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    void reload();
  }, [librarySyncReady, reload, tauri]);

  const { canUseClientHostWrite, ensureLocalWriteAllowed } = useClientWriteGuards({
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    copy: {
      clientReadOnlyAction: t(
        "loans.clientReadOnlyAction",
        "This device is connected as a client. Use the host for loan changes.",
      ),
      clientHostUnavailable: t(
        "loans.clientHostUnavailable",
        "Host connection details are missing for this client device.",
      ),
      clientWriteRequiresPairing: t(
        "loans.clientWriteRequiresPairing",
        "Pair this desktop client with the host before running protected loan actions.",
      ),
    },
    setError: returnModalLoan ? setReturnModalError : setError,
    setInfoMessage: setInfo,
  });

  const activeRows = useMemo(
    () => activeLoanRowsForDisplay(activeLoanSnapshot, loanHistory),
    [activeLoanSnapshot, loanHistory],
  );
  const filteredLoans = useMemo(() => {
    const historyRows = loanHistory?.rows ?? [];
    const rows = filter === "ACTIVE"
      ? activeRows
      : filter === "ALL"
        ? mergeLoanHistoryAndActiveRows(historyRows, activeRows)
        : historyRows;
    return filterLoans(rows, directionFilter, filter, deferredSearch);
  }, [activeRows, deferredSearch, directionFilter, filter, loanHistory]);
  const displayedSnapshot = filter === "ACTIVE" || (
    filter === "ALL" && loanHistory?.source === "LIVE" && activeLoanSnapshot?.source !== "LIVE"
  ) ? activeLoanSnapshot : loanHistory;
  const clientLoanSource = displayedSnapshot?.source ?? "LIVE";
  const clientLoanUpdatedAt = displayedSnapshot?.updatedAt ?? null;
  const clientHostWarningVisible = shouldShowClientSnapshotWarning({
    clientReadOnly,
    initialLoadSettled: librarySyncReady && !loading,
    source: clientLoanSource,
  });

  async function handleExportCsv() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = clientReadOnly
        ? buildLoansCsv(loanHistory?.rows ?? [], directionFilter)
        : (
            await exportLoansCsv(
              true,
              directionFilter === "ALL" ? "ALL" : directionFilter,
            )
          ).content;
      downloadTextFile(
        content,
        `bambu-loans-${Date.now()}.csv`,
        "text/csv;charset=utf-8",
      );
      setInfo(t("loans.csvExported", "Loan CSV exported."));
    } catch (exportError) {
      console.error(exportError);
      setError(t("loans.error.export", "Failed to export loans CSV."));
    } finally {
      setBusy(false);
    }
  }

  const openReturnModal = useCallback((loan: NormalizedLoanDetailsRow) => {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy || returnSubmittingRef.current || !isLoanCurrentlyActive(loan)) {
      return;
    }
    const isInbound = isInboundLoan(loan);
    retryRoleOnClose.current = false;
    setReturnModalLoan(loan);
    setReturnModalGrams(
      String(
        toMeasuredTotalWeight(
          loan,
          isInbound ? loan.spool_remaining_g ?? loan.loan.grams_out : loan.loan.grams_out,
        ),
      ),
    );
    setReturnModalNote("");
    setReturnModalError(null);
    setError(null);
    setInfo(null);
  }, [
    busy,
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    tauri,
  ]);

  useEffect(() => {
    if (
      (desktopVisualQaScenario !== "return-loan" &&
        desktopVisualQaScenario !== "return-inbound-loan") ||
      desktopVisualQaReturnApplied ||
      loading ||
      busy ||
      !tauri
    ) {
      return;
    }
    const activeLoan = desktopVisualQaScenario === "return-inbound-loan"
      ? activeRows.find(
          (loan) =>
            loan.loan.spool_id === DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID &&
            isInboundLoan(loan) &&
            isLoanCurrentlyActive(loan),
        ) ?? activeRows.find((loan) => isInboundLoan(loan) && isLoanCurrentlyActive(loan))
      : activeRows.find((loan) => isOutboundLoan(loan) && isLoanCurrentlyActive(loan)) ??
        activeRows.find(isLoanCurrentlyActive);
    if (!activeLoan) {
      return;
    }
    setFilter("ACTIVE");
    setDirectionFilter("ALL");
    openReturnModal(activeLoan);
    setDesktopVisualQaReturnApplied(true);
  }, [
    busy,
    desktopVisualQaReturnApplied,
    desktopVisualQaScenario,
    loading,
    activeRows,
    openReturnModal,
    tauri,
  ]);

  function closeReturnModal() {
    if (busy || returnSubmittingRef.current) {
      return;
    }
    setReturnModalLoan(null);
    setReturnModalGrams("");
    setReturnModalNote("");
    setReturnModalError(null);
    if (retryRoleOnClose.current) retryLibrarySyncRole();
  }

  async function handleConfirmReturnLoan() {
    if (!mounted.current || !tauri || busy || returnSubmittingRef.current || !returnModalLoan || !isLoanCurrentlyActive(returnModalLoan)) {
      return;
    }
    const measuredTotalGrams = parseNonNegativeWeight(returnModalGrams);
    if (measuredTotalGrams === null) {
      setReturnModalError(
        t("loans.error.invalidReturned", "Returned grams must be zero or greater."),
      );
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }

    returnSubmittingRef.current = true;
    setBusy(true);
    setReturnModalError(null);
    setInfo(null);
    try {
      const isInbound = isInboundLoan(returnModalLoan);
      const returnedFilamentGrams = toReturnedFilamentWeight(returnModalLoan, measuredTotalGrams);
      await returnInventoryLoan(
        {
          loan_id: returnModalLoan.loan.id,
          returned_grams: returnedFilamentGrams,
          note: returnModalNote.trim() || null,
          inbound: isInbound,
        },
        { clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration },
      );
      if (!mounted.current) return;
      // The mutation is complete even if refreshing history fails.
      setReturnModalLoan(null);
      setReturnModalGrams("");
      setReturnModalNote("");
      await reload();
      if (!mounted.current) return;
      setInfo(
        isInbound
          ? `${t("loans.markedHandedBackTo", "Marked borrowed-in spool as handed back to")} ${returnModalLoan.loan.counterparty_name ?? returnModalLoan.loan.borrower_name}.`
          : `${t("loans.markedReturnedFor", "Marked loan as returned for")} ${returnModalLoan.loan.borrower_name}.`,
      );
    } catch (returnError) {
      console.error(returnError);
      if (!mounted.current) return;
      retryRoleOnClose.current = clientReadOnly;
      setReturnModalError(
        isInboundLoan(returnModalLoan)
          ? t("loans.error.handBack", "Failed to hand back borrowed-in spool.")
          : t("loans.error.return", "Failed to return loan."),
      );
    } finally {
      returnSubmittingRef.current = false;
      setBusy(false);
    }
  }

  const loanResultCount = t(
    "loans.resultCount",
    "{count, plural, one {# loan} other {# loans}}",
    { count: filteredLoans.length },
  );

  return (
    <div className={embedded ? "inventory-loans-workspace" : "page-shell inventory-balanced-page"}>
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.loans", "Loans")}</h1>
          <div className="page-subtitle">
            {t(
              "loans.subtitle",
              "Track loaned-out and borrowed-in rolls, returns, hand-backs and per-person material consumption.",
            )}
          </div>
        </div>
        <div className="page-header-actions page-header-action-grid">
          <div className="page-header-tools">
            <PageHeaderButton
              onClick={() => {
                if (!clientReadOnly && !ensureLocalWriteAllowed()) {
                  return;
                }
                if (clientReadOnly && !canUseClientHostWrite()) {
                  return;
                }
                setShowLoanOutModal(true);
              }}
              disabled={
                !tauri ||
                !librarySyncReady ||
                busy ||
                (clientReadOnly && !clientHostWritePaired)
              }
              variant="primary"
            >
              {t("inventory.loanOutRoll", "Loan out roll")}
            </PageHeaderButton>
            <PageHeaderButton
              onClick={() => void handleExportCsv()}
              disabled={!tauri || busy || (clientReadOnly && !loanHistory?.rows.length)}
            >
              {t("loans.exportCsv", "Export loans CSV")}
            </PageHeaderButton>
          </div>
          <input
            type="search"
            aria-label={t(
              "loans.searchPlaceholder",
              "Search person/material/spool id",
            )}
            placeholder={t(
              "loans.searchPlaceholder",
              "Search person/material/spool id",
            )}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="page-header-search"
          />
          <div className="page-header-filter-surface">
            <div className="grid gap-3 min-[720px]:grid-cols-2">
              <div className="min-w-0">
                <div id="loan-direction-filter-label" className="section-eyebrow mb-1.5">
                  {t("loans.direction", "Direction")}
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-labelledby="loan-direction-filter-label"
                >
                  {(["ALL", "OUTBOUND", "INBOUND"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={directionFilter === mode}
                      onClick={() => setDirectionFilter(mode)}
                      className={neutralChipClass(
                        directionFilter === mode,
                        "px-3 py-1.5 text-xs",
                      )}
                    >
                      {mode === "ALL"
                        ? t("common.all", "All")
                        : mode === "OUTBOUND"
                          ? t("loans.directionOutbound", "Loaned out")
                          : t("loans.directionInbound", "Borrowed in")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <div id="loan-status-filter-label" className="section-eyebrow mb-1.5">
                  {t("inventory.status", "Status")}
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-labelledby="loan-status-filter-label"
                >
                  {(["ALL", "ACTIVE", "RETURNED"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={filter === mode}
                      onClick={() => setFilter(mode)}
                      className={neutralChipClass(filter === mode, "px-3 py-1.5 text-xs")}
                    >
                      {mode === "ALL"
                        ? t("common.all", "All")
                        : mode === "ACTIVE"
                          ? t("common.active", "Active")
                          : t("loans.returned", "Returned")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t(
            "loans.desktopOnly",
            "Loan tracking is available in the desktop app build.",
          )}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {librarySyncError ? (
        <PageLoadErrorBanner
          message={t(
            "errors.libraryRoleLoadFailed",
            "Could not determine this device's library role. No local data or changes are available until the role is loaded.",
          )}
          onRetry={retryLibrarySyncRole}
          retryDisabled={!tauri || busy}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={librarySyncResolving}
        />
      ) : loadError ? (
        <PageLoadErrorBanner
          message={loadError}
          onRetry={() => void reload()}
          retryDisabled={!tauri || busy || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}
      {clientHostWarningVisible && !librarySyncError && !loadError ? (
        <PageDataFallbackBanner
          message={`${clientHostDeviceName ? `${clientHostDeviceName}. ` : ""}${
            clientLoanSource === "CACHED"
              ? t(
                  "loans.clientReadOnlyCached",
                  "Host unavailable. Showing the last cached loan snapshot.",
                )
              : t(
                  "loans.clientReadOnlyOffline",
                  "Host unavailable and no cached loan snapshot is available yet.",
                )
          }${
            clientLoanUpdatedAt
              ? ` ${t("loans.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientLoanUpdatedAt, locale)}.`
              : ""
          }`}
          onRetry={() => void reload()}
          retryDisabled={!tauri || busy || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}

      <div className="content-section">
        <section>
          <div className="inventory-loan-summary">
            <p>{t("loans.historyHint", "Open rows can be returned or handed back here, while completed rows stay searchable for reference.")}</p>
            <span className="count-pill tabular-nums" aria-live="polite">{loanResultCount}</span>
          </div>

          {loading && !librarySyncError ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {t("loans.loading", "Loading loans...")}
            </div>
          ) : null}
          {!loading && filteredLoans.length === 0 ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t("loans.noMatch", "No loans match current filter.")}
            </div>
          ) : null}

          {filteredLoans.length > 0 ? <LoanHistoryTable loans={filteredLoans} busy={busy} onReturn={openReturnModal} onOpenSpool={onOpenSpool} /> : null}
        </section>
      </div>

      <LoanOutModal
        open={showLoanOutModal}
        onClose={() => setShowLoanOutModal(false)}
        onRetryLibrarySyncRole={retryLibrarySyncRole}
        clientReadOnly={clientReadOnly}
        clientHostWritePaired={clientHostWritePaired}
        clientHostBaseUrl={clientHostBaseUrl}
        clientLibraryId={clientLibraryId}
        clientTargetGeneration={clientTargetGeneration}
        onLoanCreated={async () => {
          await reload();
          if (!mounted.current) return;
          setInfo(t("inventory.loanCreated", "Loan created."));
        }}
      />

      <LoanReturnModal
        busy={busy}
        error={returnModalError}
        loan={returnModalLoan}
        grams={returnModalGrams}
        note={returnModalNote}
        onClose={closeReturnModal}
        onConfirm={handleConfirmReturnLoan}
        onGramsChange={setReturnModalGrams}
        onNoteChange={setReturnModalNote}
      />
    </div>
  );
}
