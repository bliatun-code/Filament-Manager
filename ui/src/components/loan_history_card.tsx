import { VendorBadge } from "./vendor_badge";
import { semanticChipClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import {
  compactLoanTimestamp,
  compactLoanTitle,
  formatGrams,
  formatLoanReference,
  loanFactLabelClassName,
  loanFactValueClassName,
  loanSwatchPreviewStyle,
  loanSwatchSurfaceStyle,
  normalizeLoanDirection,
} from "../lib/loan_display";
import { isLoanCurrentlyActive } from "../lib/loan_state";
import { useResolvedTheme } from "../lib/theme_mode";
import type { SpoolLoanDetailsRow } from "../lib/tauri_client";

type LoanHistoryCardProps = {
  busy: boolean;
  loan: SpoolLoanDetailsRow;
  onReturn: (loan: SpoolLoanDetailsRow) => void;
};

export function LoanHistoryCard({ busy, loan, onReturn }: LoanHistoryCardProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const isActive = isLoanCurrentlyActive(loan);
  const loanDirection = normalizeLoanDirection(loan.loan.loan_direction);
  const isInbound = loanDirection === "INBOUND";
  const loanTitle = compactLoanTitle(loan, t("common.unknown", "Unknown"));
  const referenceLabel = formatLoanReference(loan.loan.spool_id);

  return (
    <div
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
                onClick={() => onReturn(loan)}
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
        style={loanSwatchSurfaceStyle(loan.hex_color, "inset", resolvedTheme)}
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
                  {isInbound ? t("loans.back", "Back") : t("loans.in", "In")}
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
}
