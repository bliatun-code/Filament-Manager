import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
import { isLoanCurrentlyActive } from "./loan_state";

export type LoanDueState = "NONE" | "UPCOMING" | "DUE_TODAY" | "OVERDUE";

type LoanDueRow = Pick<NormalizedLoanDetailsRow, "loan" | "spool_status">;

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeLoanExpectedReturnDate(raw?: string | null): string | null {
  const value = (raw ?? "").trim();
  return isValidCalendarDate(value) ? value : null;
}

export function localCalendarDate(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateLoanExpectedReturnDate(
  raw: string,
  today: string,
): { error: "INVALID" | "PAST" | null; value: string | null } {
  if (!raw.trim()) {
    return { error: null, value: null };
  }
  const value = normalizeLoanExpectedReturnDate(raw);
  const normalizedToday = normalizeLoanExpectedReturnDate(today);
  if (!value || !normalizedToday) {
    return { error: "INVALID", value: null };
  }
  if (value < normalizedToday) {
    return { error: "PAST", value: null };
  }
  return { error: null, value };
}

export function loanDueState(row: LoanDueRow, today: string): LoanDueState {
  if (!isLoanCurrentlyActive(row)) {
    return "NONE";
  }
  const expected = normalizeLoanExpectedReturnDate(row.loan.expected_return_at);
  const normalizedToday = normalizeLoanExpectedReturnDate(today);
  if (!expected || !normalizedToday) {
    return "NONE";
  }
  if (expected < normalizedToday) {
    return "OVERDUE";
  }
  return expected === normalizedToday ? "DUE_TODAY" : "UPCOMING";
}

export function isLoanOverdue(row: LoanDueRow, today: string): boolean {
  return loanDueState(row, today) === "OVERDUE";
}

export function selectOverdueLoans<T extends LoanDueRow>(rows: T[], today: string): T[] {
  return rows.filter((row) => isLoanOverdue(row, today));
}

export function formatLoanExpectedReturnDate(raw: string, locale: string): string {
  const value = normalizeLoanExpectedReturnDate(raw);
  if (!value) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
