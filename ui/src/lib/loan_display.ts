import { normalizeDisplayToken } from "./display_format";
import {
  isLoanDirection,
  normalizeLoanDirection,
  type LoanDirection,
} from "./inventory_domain";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
import type { NumberDisplayLocale } from "./number_display";
import { isLoanCurrentlyActive, isLoanReturned } from "./loan_state";
import { resolveSpoolTareWeight } from "./spool_weight";
import {
  formatGrams as formatWeightGrams,
  type EmptyWeightDisplay,
} from "./weight_display";
export { formatDateTime } from "./date_time";
export { normalizeLoanDirection, type LoanDirection };

export type LoanFilter = "ALL" | "ACTIVE" | "RETURNED";
export type LoanDirectionFilter = "ALL" | LoanDirection;
export type LoanDisplayRow = NormalizedLoanDetailsRow;

export function formatGrams(
  value?: number | null,
  empty: EmptyWeightDisplay = "zero",
  locale: NumberDisplayLocale = "en",
): string {
  return formatWeightGrams(value, empty, locale);
}

function resolveLoanTareWeight(loan: LoanDisplayRow): number {
  return resolveSpoolTareWeight(loan.spool_tare_weight_g, loan.vendor);
}

export function toMeasuredTotalWeight(
  loan: LoanDisplayRow,
  filamentGrams?: number | null,
): number {
  return Math.max(0, filamentGrams ?? 0) + resolveLoanTareWeight(loan);
}

export function toReturnedFilamentWeight(
  loan: LoanDisplayRow,
  measuredTotalGrams: number,
): number {
  return Math.max(0, measuredTotalGrams - resolveLoanTareWeight(loan));
}

function normalizeLoanToken(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function compactLoanTitle(loan: LoanDisplayRow, unknownLabel: string): string {
  const material = normalizeLoanToken(loan.material);
  const filament = normalizeLoanToken(loan.filament_name);
  const color = normalizeLoanToken(loan.color_name);

  if (color) {
    if (filament) {
      const filamentLower = filament.toLowerCase();
      const colorLower = color.toLowerCase();
      const materialLower = material?.toLowerCase() ?? null;
      if (
        colorLower === filamentLower ||
        colorLower.startsWith(`${filamentLower} `) ||
        colorLower.startsWith(`${filamentLower}·`) ||
        (materialLower != null &&
          (colorLower === materialLower ||
            colorLower.startsWith(`${materialLower} `) ||
            colorLower.startsWith(`${materialLower}·`)))
      ) {
        return color;
      }
      if (filamentLower === materialLower) {
        return color;
      }
      return `${filament} · ${color}`;
    }
    return color;
  }

  if (filament) {
    return filament;
  }

  if (material) {
    return material;
  }

  return unknownLabel;
}

export function compactLoanTimestamp(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "—";
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) {
    return value;
  }
  const [, , month, day, hour, minute] = match;
  return `${day}.${month} ${hour}:${minute}`;
}

export function formatLoanReference(spoolIdRaw?: string | null): string {
  const spoolId = normalizeDisplayToken(spoolIdRaw);
  if (!spoolId) {
    return "—";
  }
  const normalizedId = spoolId.replace(/^spool_/, "");
  return `#${normalizedId.slice(-6)}`;
}

export function filterLoans(
  loans: LoanDisplayRow[],
  directionFilter: LoanDirectionFilter,
  filter: LoanFilter,
  search: string,
): LoanDisplayRow[] {
  const directionScopedLoans = loans.filter((loan) =>
    directionFilter === "ALL"
      ? true
      : isLoanDirection(loan.loan.loan_direction, directionFilter),
  );

  const term = search.trim().toLowerCase();
  return directionScopedLoans.filter((loan) => {
    const statusMatch =
      filter === "ALL"
        ? true
        : filter === "ACTIVE"
          ? isLoanCurrentlyActive(loan)
          : isLoanReturned(loan);
    const searchMatch =
      term.length === 0
        ? true
        : `${loan.loan.borrower_name} ${loan.loan.counterparty_name ?? ""} ${loan.material ?? ""} ${
            loan.filament_name ?? ""
          } ${loan.color_name ?? ""} ${loan.loan.spool_id}`
            .toLowerCase()
            .includes(term);
    return statusMatch && searchMatch;
  });
}
