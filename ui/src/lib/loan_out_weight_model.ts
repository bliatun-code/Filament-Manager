import type { LoanableSpool } from "./loan_out_data_source";
import type { NumberDisplayLocale } from "./number_display";
import { resolveSpoolTareWeight } from "./spool_weight";
import { formatGrams as formatWeightGrams } from "./weight_display";

export function formatLoanOutGrams(
  value?: number | null,
  locale: NumberDisplayLocale = "en",
): string {
  return formatWeightGrams(value, "zero", locale);
}

export function resolveLoanableSpoolTareWeight(spool: LoanableSpool): number {
  return resolveSpoolTareWeight(spool.spoolTareWeightGrams, spool.vendor);
}

export function toMeasuredTotalWeight(
  spool: LoanableSpool,
  filamentGrams?: number | null,
): number {
  return Math.max(0, filamentGrams ?? 0) + resolveLoanableSpoolTareWeight(spool);
}

export function toLoanedFilamentWeight(
  spool: LoanableSpool,
  measuredTotalGrams: number,
): number {
  return Math.max(0, measuredTotalGrams - resolveLoanableSpoolTareWeight(spool));
}
