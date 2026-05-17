import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  exportLoansCsv,
  isTauri,
  type SpoolLoanDetailsRow,
} from "../lib/tauri_client";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanOutModal } from "../components/loan_out_modal";
import { ModalHeader } from "../components/modal_chrome";
import { modalPanelClassName } from "../components/modal_panel_class";
import { VendorBadge } from "../components/vendor_badge";
import { neutralChipClass, semanticChipClass } from "../lib/chip_styles";
import { downloadTextFile } from "../lib/download_file";
import { useI18n } from "../lib/i18n";
import {
  compactLoanTimestamp,
  compactLoanTitle,
  filterLoans,
  formatDateTime,
  formatGrams,
  formatLoanReference,
  loanFactLabelClassName,
  loanFactValueClassName,
  loanSwatchPreviewStyle,
  loanSwatchSurfaceStyle,
  normalizeLoanDirection,
  type LoanDirectionFilter,
  type LoanFilter,
  toMeasuredTotalWeight,
  toReturnedFilamentWeight,
} from "../lib/loan_display";
import { isLoanCurrentlyActive } from "../lib/loan_state";
import { loadLoanRowsPage, returnInventoryLoan } from "../lib/loan_data_source";
import { loadLibrarySyncPageState } from "../lib/library_sync_state";
import { useResolvedTheme } from "../lib/theme_mode";

export default function LoansPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [librarySyncReady, setLibrarySyncReady] = useState(!tauri);
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

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const nextState = await loadLibrarySyncPageState();
        if (cancelled) {
          return;
        }
        setClientReadOnly(nextState.clientReadOnly);
        setClientHostWritePaired(nextState.clientHostWritePaired);
        setClientHostDeviceName(nextState.clientHostDeviceName);
        setClientHostBaseUrl(nextState.clientHostBaseUrl);
        setClientLibraryId(nextState.clientLibraryId);
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
  }, [tauri]);

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

  const ensureLocalWriteAllowed = useCallback(() => {
    if (!clientReadOnly) {
      return true;
    }
    setInfo(
      t(
        "loans.clientReadOnlyAction",
        "This device is connected as a client. Use the host for loan changes.",
      ),
    );
    return false;
  }, [clientReadOnly, t]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(
        t(
          "loans.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return false;
    }
    if (!clientHostWritePaired) {
      setError(
        t(
          "loans.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected loan actions.",
        ),
      );
      return false;
    }
    return true;
  }, [clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly, t]);

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

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const loanDirection = normalizeLoanDirection(returnModalLoan.loan.loan_direction);
      const returnedFilamentGrams = toReturnedFilamentWeight(returnModalLoan, measuredTotalGrams);
      if (clientReadOnly && !canUseClientHostWrite()) {
        return;
      }
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

  const returnModalDirection = returnModalLoan
    ? normalizeLoanDirection(returnModalLoan.loan.loan_direction)
    : "OUTBOUND";
  const returnModalInbound = returnModalDirection === "INBOUND";

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
            {filteredLoans.map((loan) => {
              const isActive = isLoanCurrentlyActive(loan);
              const loanDirection = normalizeLoanDirection(loan.loan.loan_direction);
              const isInbound = loanDirection === "INBOUND";
              const loanTitle = compactLoanTitle(
                loan,
                t("common.unknown", "Unknown"),
              );
              const referenceLabel = formatLoanReference(loan.loan.spool_id);
              return (
                <div
                  key={loan.loan.id}
                  className="rounded-xl border border-slate-300/80 p-3.5 shadow-sm shadow-slate-300/25 dark:border-slate-700/80 dark:shadow-none"
                  style={loanSwatchSurfaceStyle(loan.hex_color, "card", resolvedTheme)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/60 p-1.5 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                      <span
                        className="h-full w-full rounded-lg border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                        style={loanSwatchPreviewStyle(loan.hex_color)}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className="overflow-hidden break-words text-[14px] font-semibold leading-tight text-slate-950 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                            title={loanTitle}
                          >
                            {loanTitle}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                            <VendorBadge
                              vendor={loan.vendor?.trim() || t("common.unknown", "Unknown")}
                              compact
                            />
                            <span
                              className={semanticChipClass(
                                isInbound ? "warning" : "info",
                                "px-2.5 py-0.5 text-[10px] whitespace-nowrap",
                              )}
                            >
                              {isInbound
                                ? t("loans.directionInbound", "Borrowed in")
                                : t("loans.directionOutbound", "Loaned out")}
                            </span>
                            <span className="break-words">
                              {isInbound
                                ? t("inventory.borrowedFrom", "Borrowed from")
                                : t("loans.borrower", "Borrower")}
                              : {loan.loan.counterparty_name ?? loan.loan.borrower_name}
                            </span>
                          </div>
                        </div>
                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => openReturnModal(loan)}
                            disabled={busy}
                            className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm shadow-emerald-200/25 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none dark:hover:bg-emerald-500/25"
                          >
                            {isInbound
                              ? t("loans.handBackAction", "Hand back")
                              : t("loans.returnAction", "Return")}
                          </button>
                        ) : (
                          <span
                            className={semanticChipClass(
                              "success",
                              "px-2.5 py-0.5 text-[10px] whitespace-nowrap",
                            )}
                          >
                            {isInbound
                              ? t("loans.handedBack", "Handed back")
                              : t("loans.returned", "Returned")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-3 rounded-xl border px-3 py-2.5"
                    style={loanSwatchSurfaceStyle(
                      loan.hex_color,
                      "inset",
                      resolvedTheme,
                    )}
                  >
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 min-[520px]:grid-cols-3">
                      <div className="min-w-0">
                        <div className={loanFactLabelClassName}>
                          {t("inventory.reference", "Reference")}
                        </div>
                        <div
                          className={`${loanFactValueClassName} break-all font-mono`}
                          title={`#${loan.loan.spool_id}`}
                        >
                          {referenceLabel}
                        </div>
                      </div>
                      <div>
                        <div className={loanFactLabelClassName}>
                          {isInbound
                            ? t("loans.startWeight", "Start")
                            : t("loans.out", "Out")}
                        </div>
                        <div className={loanFactValueClassName}>
                          {formatGrams(loan.loan.grams_out)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={loanFactLabelClassName}>
                          {isInbound
                            ? t("loans.borrowedInAt", "Borrowed in")
                            : t("loans.lent", "Lent")}
                        </div>
                        <div className={loanFactValueClassName}>
                          {compactLoanTimestamp(loan.loan.lent_at)}
                        </div>
                      </div>
                      {!isActive ? (
                        <>
                          <div>
                            <div className={loanFactLabelClassName}>
                              {isInbound
                                ? t("loans.handedBackAt", "Handed back")
                                : t("loans.returned", "Returned")}
                            </div>
                            <div className={loanFactValueClassName}>
                              {compactLoanTimestamp(loan.loan.returned_at)}
                            </div>
                          </div>
                          <div>
                            <div className={loanFactLabelClassName}>
                              {isInbound
                                ? t("loans.back", "Back")
                                : t("loans.in", "In")}
                            </div>
                            <div className={loanFactValueClassName}>
                              {formatGrams(loan.loan.returned_grams)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className={loanFactLabelClassName}>
                              {t("loans.consumed", "Consumed")}
                            </div>
                            <div className={loanFactValueClassName}>
                              {formatGrams(loan.loan.consumed_grams)}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
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

      {returnModalLoan ? (
        <AppModal
          closeOnBackdrop
          onBackdropClose={closeReturnModal}
          panelClassName={modalPanelClassName("lg")}
        >
          <div className="space-y-4">
            <ModalHeader
              eyebrow={t("nav.loans", "Loans")}
              title={
                returnModalInbound
                  ? t("loans.handBackDialogTitle", "Hand back borrowed-in spool")
                  : t("loans.returnDialogTitle", "Return loaned roll")
              }
              subtitle={
                returnModalInbound
                  ? t(
                      "loans.handBackDialogSubtitle",
                      "Weigh it back in, add a note if needed, then remove it from active inventory.",
                    )
                  : t(
                      "loans.returnDialogSubtitle",
                      "Weigh it back in and add a note if needed.",
                    )
              }
              onClose={closeReturnModal}
              closeLabel={t("common.close", "Close")}
              className="-mx-5 -mt-5"
            />

            <div
              className="rounded-2xl border border-slate-300/80 px-3.5 py-3 text-xs text-slate-700 shadow-sm shadow-slate-300/20 dark:border-slate-700/80 dark:text-slate-300 dark:shadow-none"
              style={loanSwatchSurfaceStyle(returnModalLoan.hex_color, "inset", resolvedTheme)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/60 p-2 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                  <span
                    className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                    style={loanSwatchPreviewStyle(returnModalLoan.hex_color)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {compactLoanTitle(returnModalLoan, t("common.unknown", "Unknown"))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    <VendorBadge
                      vendor={returnModalLoan.vendor?.trim() || t("common.unknown", "Unknown")}
                      compact
                    />
                    <span>
                      {returnModalInbound
                        ? t("inventory.borrowedFrom", "Borrowed from")
                      : t("loans.borrower", "Borrower")}
                      : {returnModalLoan.loan.counterparty_name ?? returnModalLoan.loan.borrower_name}
                    </span>
                  </div>
                  <div
                    className="mt-3 rounded-[1.05rem] border px-3.5 py-3"
                    style={loanSwatchSurfaceStyle(
                      returnModalLoan.hex_color,
                      "inset",
                      resolvedTheme,
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(108px,0.9fr)] gap-x-4 gap-y-3">
                      <div className="min-w-0">
                        <div className={loanFactLabelClassName}>
                          {t("inventory.reference", "Reference")}
                        </div>
                        <div
                          className={`${loanFactValueClassName} break-all font-mono`}
                          title={`#${returnModalLoan.loan.spool_id}`}
                        >
                          {formatLoanReference(returnModalLoan.loan.spool_id)}
                        </div>
                      </div>
                      <div>
                        <div className={loanFactLabelClassName}>
                          {returnModalInbound
                            ? t("loans.startWeight", "Start")
                            : t("loans.out", "Out")}
                        </div>
                        <div className={loanFactValueClassName}>
                          {formatGrams(
                            toMeasuredTotalWeight(returnModalLoan, returnModalLoan.loan.grams_out),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {returnModalInbound ? (
              <FeedbackBanner tone="warning" compact>
                {t(
                  "loans.handBackDialogHint",
                  "Handing this back will remove the borrowed-in spool from active inventory but keep its loan history.",
                )}
              </FeedbackBanner>
            ) : null}

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {returnModalInbound
                  ? t(
                      "loans.handBackDialogWeightLabel",
                      "Weigh-in handed-back total weight incl. spool (g)",
                    )
                  : t(
                      "loans.returnDialogWeightLabel",
                      "Weigh-in returned total weight incl. spool (g)",
                    )}
              </label>
              <input
                type="number"
                min={0}
                value={returnModalGrams}
                onChange={(event) => setReturnModalGrams(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("loans.returnNoteOptional", "Return note (optional)")}
              </label>
              <input
                type="text"
                value={returnModalNote}
                onChange={(event) => setReturnModalNote(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                placeholder={t("loans.returnNoteOptional", "Return note (optional)")}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeReturnModal}
                disabled={busy}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-300/25 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none"
              >
                {t("common.close", "Close")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReturnLoan()}
                disabled={busy}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 shadow-sm shadow-emerald-200/25 disabled:opacity-50 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none"
              >
                {returnModalInbound
                  ? t("loans.confirmHandBackAction", "Confirm hand-back")
                  : t("loans.confirmReturnAction", "Confirm return")}
              </button>
            </div>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
