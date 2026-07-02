import {
  normalizeLoanDirection,
  normalizeLoanStatus,
  type LoanDirection,
  type LoanStatus,
} from "./inventory_domain";
import type {
  ActiveSpoolLoanRow,
  SpoolLoanDetailsRow,
  SpoolLoanRow,
} from "./tauri_client";

export type NormalizedSpoolLoanRow = Omit<
  SpoolLoanRow,
  "loan_direction" | "loan_status"
> & {
  loan_direction: LoanDirection;
  loan_status: LoanStatus;
};

export type NormalizedLoanDetailsRow = Omit<SpoolLoanDetailsRow, "loan"> & {
  loan: NormalizedSpoolLoanRow;
};

export type NormalizedActiveLoanRow = Omit<ActiveSpoolLoanRow, "loan"> & {
  loan: NormalizedSpoolLoanRow;
};

export function normalizeSpoolLoanRow(loan: SpoolLoanRow): NormalizedSpoolLoanRow {
  return {
    ...loan,
    loan_direction: normalizeLoanDirection(loan.loan_direction),
    loan_status: normalizeLoanStatus(loan.loan_status, loan.returned_at),
  };
}

export function normalizeLoanDetailsRow(row: SpoolLoanDetailsRow): NormalizedLoanDetailsRow {
  return {
    ...row,
    loan: normalizeSpoolLoanRow(row.loan),
  };
}

export function normalizeActiveLoanRow(row: ActiveSpoolLoanRow): NormalizedActiveLoanRow {
  return {
    ...row,
    loan: normalizeSpoolLoanRow(row.loan),
  };
}
