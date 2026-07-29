import { VendorBadge } from "./vendor_badge";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import {
  compactLoanTimestamp,
  compactLoanTitle,
  formatGrams,
  formatLoanReference,
} from "../lib/loan_display";
import { isInboundLoan, isLoanCurrentlyActive } from "../lib/loan_state";
import { ModalDetailItem } from "./modal_chrome";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import { LoanSwatchCard, LoanSwatchInsetCard } from "./loan_swatch_card";
import { useResolvedTheme } from "../lib/theme_mode";
import type { NormalizedLoanDetailsRow } from "../lib/loan_data_source";

type LoanHistoryCardProps = {
  busy: boolean;
  loan: NormalizedLoanDetailsRow;
  onReturn: (loan: NormalizedLoanDetailsRow) => void;
};

const loanHistoryReturnButtonClassName =
  "shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm shadow-emerald-200/25 outline-none transition hover:bg-emerald-100 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none dark:hover:bg-emerald-500/25 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

export function LoanHistoryCard({ busy, loan, onReturn }: LoanHistoryCardProps) {
  const { locale, t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const isActive = isLoanCurrentlyActive(loan);
  const isInbound = isInboundLoan(loan);
  const loanTitle = compactLoanTitle(loan, t("common.unknown", "Unknown"));
  const referenceLabel = formatLoanReference(loan.loan.spool_id);

  return (
    <LoanSwatchCard swatchColor={loan.hex_color} resolvedTheme={resolvedTheme}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/60 p-1.5 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
          <InventorySwatchChip className="h-full w-full rounded-lg" swatchColor={loan.hex_color} />
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
                  className={inlineStatusSignalClass(
                    isInbound ? "warning" : "neutral",
                    "text-[10px] whitespace-nowrap",
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
                className={loanHistoryReturnButtonClassName}
              >
                {isInbound
                  ? t("loans.handBackAction", "Hand back")
                  : t("loans.returnAction", "Return")}
              </button>
            ) : (
              <span
                className={inlineStatusSignalClass("neutral", "text-[10px] whitespace-nowrap")}
              >
                {isInbound
                  ? t("loans.handedBack", "Handed back")
                  : t("loans.returned", "Returned")}
              </span>
            )}
          </div>
        </div>
      </div>

      <LoanSwatchInsetCard
        className="mt-3"
        swatchColor={loan.hex_color}
        resolvedTheme={resolvedTheme}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 min-[520px]:grid-cols-3">
          <ModalDetailItem
            label={t("inventory.reference", "Reference")}
            title={`#${loan.loan.spool_id}`}
            valueClassName="break-all font-mono"
          >
            {referenceLabel}
          </ModalDetailItem>
          <ModalDetailItem
            label={isInbound ? t("loans.startWeight", "Start") : t("loans.out", "Out")}
          >
            {formatGrams(loan.loan.grams_out, "zero", locale)}
          </ModalDetailItem>
          <ModalDetailItem
            label={
              isInbound
                ? t("loans.borrowedInAt", "Borrowed in")
                : t("loans.lent", "Lent")
            }
          >
            {compactLoanTimestamp(loan.loan.lent_at)}
          </ModalDetailItem>
          {!isActive ? (
            <>
              <ModalDetailItem
                label={
                  isInbound
                    ? t("loans.handedBackAt", "Handed back")
                    : t("loans.returned", "Returned")
                }
              >
                {compactLoanTimestamp(loan.loan.returned_at)}
              </ModalDetailItem>
              <ModalDetailItem
                label={isInbound ? t("loans.back", "Back") : t("loans.in", "In")}
              >
                {formatGrams(loan.loan.returned_grams, "zero", locale)}
              </ModalDetailItem>
              <ModalDetailItem label={t("loans.consumed", "Consumed")}>
                {formatGrams(loan.loan.consumed_grams, "zero", locale)}
              </ModalDetailItem>
            </>
          ) : null}
        </div>
      </LoanSwatchInsetCard>
    </LoanSwatchCard>
  );
}
