import { useI18n } from "../lib/i18n";
import type { NormalizedLoanDetailsRow } from "../lib/loan_data_source";
import { formatGrams } from "../lib/loan_display";
import { resolveLoanReturnSummary } from "../lib/loan_return_summary";
import { isInboundLoan } from "../lib/loan_state";
import {
  ModalDetailGrid,
  ModalDetailItem,
  ModalFactCard,
} from "./modal_chrome";

type LoanReturnSummaryCardProps = {
  grams: string;
  loan: NormalizedLoanDetailsRow;
};

function summaryGrams(value: number | null, locale: string): string {
  return value == null ? "—" : formatGrams(value, "zero", locale);
}

export function LoanReturnSummaryCard({ grams, loan }: LoanReturnSummaryCardProps) {
  const { locale, t } = useI18n();
  const isInbound = isInboundLoan(loan);
  const summary = resolveLoanReturnSummary(loan, grams);

  return (
    <ModalFactCard
      compact
      role="status"
      aria-atomic="true"
      aria-label={t("loans.returnSummaryLabel", "Return summary")}
      aria-live="polite"
    >
      <ModalDetailGrid className="grid-cols-3 gap-3 sm:grid-cols-3">
        <ModalDetailItem
          label={
            isInbound
              ? t("loans.borrowedGrams", "Borrowed")
              : t("loans.loanedGrams", "Loaned")
          }
        >
          {summaryGrams(summary.loanedGrams, locale)}
        </ModalDetailItem>
        <ModalDetailItem
          label={
            isInbound
              ? t("loans.handedBackFilamentGrams", "Handed back")
              : t("loans.returnedFilamentGrams", "Returned")
          }
        >
          {summaryGrams(summary.returnedGrams, locale)}
        </ModalDetailItem>
        <ModalDetailItem label={t("loans.estimatedUsedGrams", "Estimated used")}>
          {summaryGrams(summary.estimatedUsedGrams, locale)}
        </ModalDetailItem>
      </ModalDetailGrid>
    </ModalFactCard>
  );
}
