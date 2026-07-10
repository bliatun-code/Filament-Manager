import type { NormalizedLoanDetailsRow } from "./loan_data_source";
import { toReturnedFilamentWeight } from "./loan_display";

export type LoanReturnSummary = {
  estimatedUsedGrams: number | null;
  loanedGrams: number;
  returnedGrams: number | null;
};

export function resolveLoanReturnSummary(
  loan: NormalizedLoanDetailsRow,
  measuredTotalGramsRaw: string,
): LoanReturnSummary {
  const loanedGrams = Number.isFinite(loan.loan.grams_out)
    ? Math.max(0, loan.loan.grams_out)
    : 0;
  const measuredTotalGrams = Number.parseInt(measuredTotalGramsRaw, 10);

  if (!Number.isFinite(measuredTotalGrams) || measuredTotalGrams < 0) {
    return {
      estimatedUsedGrams: null,
      loanedGrams,
      returnedGrams: null,
    };
  }

  const returnedGrams = toReturnedFilamentWeight(loan, measuredTotalGrams);
  return {
    estimatedUsedGrams: Math.max(0, loanedGrams - returnedGrams),
    loanedGrams,
    returnedGrams,
  };
}
