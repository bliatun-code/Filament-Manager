import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  exportLoansCsv,
  isTauri,
  type SpoolLoanDetailsRow,
} from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanHistoryCard } from "../components/loan_history_card";
import { LoanOutModal } from "../components/loan_out_modal";
import { LoanReturnModal } from "../components/loan_return_modal";
import { neutralChipClass } from "../lib/chip_styles";
import { downloadTextFile } from "../lib/download_file";
import { useI18n } from "../lib/i18n";
import {
  filterLoans,
  formatDateTime,
  normalizeLoanDirection,
  type LoanDirectionFilter,
  type LoanFilter,
  toMeasuredTotalWeight,
  toReturnedFilamentWeight,
} from "../lib/loan_display";
import { isLoanCurrentlyActive } from "../lib/loan_state";
import { loadLoanRowsPage, returnInventoryLoan } from "../lib/loan_data_source";
import { useClientWriteGuards } from "../lib/use_client_write_guards";
import { useLibrarySyncState } from "./use_library_sync_state";

export default function LoansPage() {
  const { t, locale } = useI18n();
  const tauri = isTauri();
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    clientReadOnly,
    clientHostWritePaired,
    clientHostDeviceName,
    clientHostBaseUrl,
    clientLibraryId,
    librarySyncReady,
  } = useLibrarySyncState(tauri);
  const [clientLoanSource, setClientLoanSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "LIVE",
  );
  const [clientLoanUpdatedAt, setClientLoanUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<LoanFilter>("ACTIVE");
  const [directionFilter, setDirectionFilter] = useState<LoanDirectionFilter>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loans, setLoans] = useState<SpoolLoanDetailsRow[]>([]);
  const [showLoanOutModal, setShowLoanOutModal] = useState(false);
  const [returnModalLoan, setReturnModalLoan] = useState<SpoolLoanDetailsRow | null>(null);
  const [returnModalGrams, setReturnModalGrams] = useState("");
  const [returnModalNote, setReturnModalNote] = useState("");

  const reload = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    try {
      const result = await loadLoanRowsPage({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        limit: 2000,
      });
      if (clientReadOnly) {
        setClientLoanSource(result.source);
        setClientLoanUpdatedAt(result.updatedAt);
      }
      setLoans(result.rows);
      if (clientReadOnly && result.source === "OFFLINE") {
        setError(t("loans.error.load", "Failed to load loan data."));
      }
    } catch (loadError) {
      console.error(loadError);
      setError(t("loans.error.load", "Failed to load loan data."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, t, tauri]);

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

  async function handleExportCsv() {
    if (!tauri || busy || clientReadOnly) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload = await exportLoansCsv(
        true,
        directionFilter === "ALL" ? "ALL" : directionFilter,
      );
      downloadTextFile(
        payload.content,
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

  function openReturnModal(loan: SpoolLoanDetailsRow) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy || !isLoanCurrentlyActive(loan)) {
      return;
    }
    const loanDirection = normalizeLoanDirection(loan.loan.loan_direction);
    setReturnModalLoan(loan);
    setReturnModalGrams(
      String(
        toMeasuredTotalWeight(
          loan,
          loanDirection === "INBOUND" ? loan.spool_remaining_g ?? loan.loan.grams_out : loan.loan.grams_out,
        ),
      ),
    );
    setReturnModalNote("");
    setError(null);
    setInfo(null);
  }

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
      const loanDirection = normalizeLoanDirection(returnModalLoan.loan.loan_direction);
      const returnedFilamentGrams = toReturnedFilamentWeight(returnModalLoan, measuredTotalGrams);
      await returnInventoryLoan(
        {
          loan_id: returnModalLoan.loan.id,
          returned_grams: returnedFilamentGrams,
          note: returnModalNote.trim() || null,
          inbound: loanDirection === "INBOUND",
        },
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
      await reload();
      setInfo(
        loanDirection === "INBOUND"
          ? `${t("loans.markedHandedBackTo", "Marked borrowed-in spool as handed back to")} ${returnModalLoan.loan.counterparty_name ?? returnModalLoan.loan.borrower_name}.`
          : `${t("loans.markedReturnedFor", "Marked loan as returned for")} ${returnModalLoan.loan.borrower_name}.`,
      );
      closeReturnModal();
    } catch (returnError) {
      console.error(returnError);
      setError(
        normalizeLoanDirection(returnModalLoan.loan.loan_direction) === "INBOUND"
          ? t("loans.error.handBack", "Failed to hand back borrowed-in spool.")
          : t("loans.error.return", "Failed to return loan."),
      );
    } finally {
      setBusy(false);
    }
  }

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
            <button
              type="button"
              onClick={() => {
                if (!clientReadOnly && !ensureLocalWriteAllowed()) {
                  return;
                }
                if (clientReadOnly && !canUseClientHostWrite()) {
                  return;
                }
                setShowLoanOutModal(true);
              }}
              disabled={!tauri || busy || (clientReadOnly && !clientHostWritePaired)}
              className="header-button-primary w-full min-[920px]:w-auto"
            >
              {t("inventory.loanOutRoll", "Loan out roll")}
            </button>
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={!tauri || busy || clientReadOnly}
              className="header-button-secondary w-full min-[920px]:w-auto"
            >
              {t("loans.exportCsv", "Export loans CSV")}
            </button>
          </div>
          <input
            type="search"
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
                <div className="section-eyebrow mb-1.5">
                  {t("loans.direction", "Direction")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["ALL", "OUTBOUND", "INBOUND"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
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
                <div className="section-eyebrow mb-1.5">
                  {t("inventory.status", "Status")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["ALL", "ACTIVE", "RETURNED"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
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
      {clientReadOnly && clientLoanSource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {clientHostDeviceName
            ? `${clientHostDeviceName}. `
            : null}
          {clientLoanSource === "CACHED"
            ? t(
                "loans.clientReadOnlyCached",
                "Host unavailable. Showing the last cached loan snapshot.",
              )
            : t(
                "loans.clientReadOnlyOffline",
                "Host unavailable and no cached loan snapshot is available yet.",
              )}
          {clientLoanUpdatedAt
            ? ` ${t("loans.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientLoanUpdatedAt, locale)}.`
            : null}
        </FeedbackBanner>
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
            <span className="count-pill">
              {filteredLoans.length}
            </span>
          </div>

          {loading ? (
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
