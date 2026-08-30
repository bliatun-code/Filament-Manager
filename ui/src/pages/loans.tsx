import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  exportLoansCsv,
  isTauri,
} from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanHistoryCard } from "../components/loan_history_card";
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
  loadLoanRowsPage,
  returnInventoryLoan,
  type NormalizedLoanDetailsRow,
} from "../lib/loan_data_source";
import {
  DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import { useClientWriteGuards } from "../lib/use_client_write_guards";
import { useLibrarySyncState } from "./use_library_sync_state";

export default function LoansPage() {
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
  } = useLibrarySyncState(tauri);
  const [clientLoanSource, setClientLoanSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "LIVE",
  );
  const [clientLoanUpdatedAt, setClientLoanUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<LoanFilter>("ACTIVE");
  const [directionFilter, setDirectionFilter] = useState<LoanDirectionFilter>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loans, setLoans] = useState<NormalizedLoanDetailsRow[]>([]);
  const [showLoanOutModal, setShowLoanOutModal] = useState(false);
  const [returnModalLoan, setReturnModalLoan] = useState<NormalizedLoanDetailsRow | null>(
    null,
  );
  const [returnModalGrams, setReturnModalGrams] = useState("");
  const [returnModalNote, setReturnModalNote] = useState("");
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
      const result = await loadLoanRowsPage({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
        limit: 2000,
      });
      if (requestId !== reloadRequestRef.current) {
        return;
      }
      if (clientReadOnly) {
        setClientLoanSource(result.source);
        setClientLoanUpdatedAt(result.updatedAt);
      }
      setLoans(result.rows);
      // OFFLINE is a settled client fallback. The dedicated Host warning
      // explains it without layering a generic page error on top.
      completeRefresh();
    } catch (loadError) {
      console.error(loadError);
      if (requestId === reloadRequestRef.current) {
        failRefresh(t("loans.error.load", "Failed to load loan data."));
      }
    }
  }, [
    beginRefresh,
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
    setError,
    setInfoMessage: setInfo,
  });

  const filteredLoans = useMemo(
    () => filterLoans(loans, directionFilter, filter, deferredSearch),
    [deferredSearch, directionFilter, filter, loans],
  );
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
        ? buildLoansCsv(loans, directionFilter)
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
    if (!tauri || busy || !isLoanCurrentlyActive(loan)) {
      return;
    }
    const isInbound = isInboundLoan(loan);
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
      ? loans.find(
          (loan) =>
            loan.loan.spool_id === DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID &&
            isInboundLoan(loan) &&
            isLoanCurrentlyActive(loan),
        ) ?? loans.find((loan) => isInboundLoan(loan) && isLoanCurrentlyActive(loan))
      : loans.find((loan) => isOutboundLoan(loan) && isLoanCurrentlyActive(loan)) ??
        loans.find(isLoanCurrentlyActive);
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
    loans,
    openReturnModal,
    tauri,
  ]);

  function closeReturnModal() {
    if (busy) {
      return;
    }
    setReturnModalLoan(null);
    setReturnModalGrams("");
    setReturnModalNote("");
  }

  async function handleConfirmReturnLoan() {
    if (!tauri || busy || !returnModalLoan || !isLoanCurrentlyActive(returnModalLoan)) {
      return;
    }
    const measuredTotalGrams = Number.parseInt(returnModalGrams, 10);
    if (!Number.isFinite(measuredTotalGrams) || measuredTotalGrams < 0) {
      setError(
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

    setBusy(true);
    setError(null);
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
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
      await reload();
      setInfo(
        isInbound
          ? `${t("loans.markedHandedBackTo", "Marked borrowed-in spool as handed back to")} ${returnModalLoan.loan.counterparty_name ?? returnModalLoan.loan.borrower_name}.`
          : `${t("loans.markedReturnedFor", "Marked loan as returned for")} ${returnModalLoan.loan.borrower_name}.`,
      );
      closeReturnModal();
    } catch (returnError) {
      console.error(returnError);
      setError(
        isInboundLoan(returnModalLoan)
          ? t("loans.error.handBack", "Failed to hand back borrowed-in spool.")
          : t("loans.error.return", "Failed to return loan."),
      );
    } finally {
      setBusy(false);
    }
  }

  const loanResultCount = t(
    "loans.resultCount",
    "{count, plural, one {# loan} other {# loans}}",
    { count: filteredLoans.length },
  );

  return (
    <div className="page-shell">
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
              disabled={!tauri || busy || (clientReadOnly && loans.length === 0)}
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
        <section className="surface-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t("loans.history", "Loan history")}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t(
                  "loans.historyHint",
                  "Open rows can be returned or handed back here, while completed rows stay searchable for reference.",
                )}
              </div>
            </div>
            <span className="count-pill tabular-nums" aria-live="polite">
              {loanResultCount}
            </span>
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

          <div className="grid grid-cols-1 items-start gap-3 min-[760px]:grid-cols-2 xl:grid-cols-4">
            {filteredLoans.map((loan) => (
              <LoanHistoryCard
                key={loan.loan.id}
                busy={busy}
                loan={loan}
                onReturn={openReturnModal}
              />
            ))}
          </div>
        </section>
      </div>

      <LoanOutModal
        open={showLoanOutModal}
        onClose={() => setShowLoanOutModal(false)}
        clientReadOnly={clientReadOnly}
        clientHostWritePaired={clientHostWritePaired}
        clientHostBaseUrl={clientHostBaseUrl}
        clientLibraryId={clientLibraryId}
        clientTargetGeneration={clientTargetGeneration}
        onLoanCreated={async () => {
          await reload();
          setInfo(t("inventory.loanCreated", "Loan created."));
        }}
      />

      <LoanReturnModal
        busy={busy}
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
