import type { SpoolLoanDetailsRow } from "./tauri_client";
import type { LoanDirectionFilter } from "./loan_display";
import { normalizeLoanDetailsRow } from "./loan_row_normalization";

const LOAN_CSV_HEADER =
  "loan_id,spool_id,direction,counterparty,grams_out,lent_at,returned_at,returned_grams,consumed_grams,material,filament,color,vendor,status";

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? String(value) : "0";
}

function csvText(value: string | null | undefined) {
  return escapeCsv(value ?? "");
}

export function buildLoansCsv(
  rows: SpoolLoanDetailsRow[],
  directionFilter: LoanDirectionFilter = "ALL",
) {
  const normalizedRows = rows.map(normalizeLoanDetailsRow);
  const selectedRows =
    directionFilter === "ALL"
      ? normalizedRows
      : normalizedRows.filter((row) => row.loan.loan_direction === directionFilter);
  const lines = selectedRows.map((row) =>
    [
      csvText(row.loan.id),
      csvText(row.loan.spool_id),
      csvText(row.loan.loan_direction),
      csvText(row.loan.counterparty_name),
      csvNumber(row.loan.grams_out),
      csvText(row.loan.lent_at),
      csvText(row.loan.returned_at),
      csvNumber(row.loan.returned_grams),
      csvNumber(row.loan.consumed_grams),
      csvText(row.material),
      csvText(row.filament_name),
      csvText(row.color_name),
      csvText(row.vendor),
      csvText(row.spool_status),
    ].join(","),
  );
  return `${LOAN_CSV_HEADER}\n${lines.length > 0 ? `${lines.join("\n")}\n` : ""}`;
}
