import { invoke } from "./tauri_invoke";

export type LendSpoolInput = {
  spool_id: string;
  borrower_name: string;
  counterparty_contact?: string | null;
  grams_out?: number | null;
  note?: string | null;
  expected_return_at?: string | null;
};

export type ReturnSpoolLoanInput = {
  loan_id: string;
  returned_grams: number;
  note?: string | null;
};

export type SpoolLoanRow = {
  id: string;
  spool_id: string;
  borrower_name: string;
  loan_direction?: string | null;
  loan_status?: string | null;
  counterparty_name?: string | null;
  counterparty_contact?: string | null;
  counterparty_note?: string | null;
  grams_out: number;
  lent_note?: string | null;
  lent_at: string;
  expected_return_at?: string | null;
  returned_at?: string | null;
  returned_grams?: number | null;
  consumed_grams?: number | null;
  return_note?: string | null;
};

export type ActiveSpoolLoanRow = {
  loan: SpoolLoanRow;
  spool_status: string;
  spool_remaining_g?: number | null;
  material: string;
  filament_name: string;
  color_name: string;
  vendor: string;
  hex_color?: string | null;
};

export type LoanUsageByPersonRow = {
  loan_direction: string;
  borrower_name: string;
  total_consumed_g: number;
  completed_loans: number;
  active_loans: number;
};

export type SpoolLoanDetailsRow = {
  loan: SpoolLoanRow;
  spool_status?: string | null;
  spool_remaining_g?: number | null;
  spool_tare_weight_g?: number | null;
  material?: string | null;
  filament_name?: string | null;
  color_name?: string | null;
  vendor?: string | null;
  hex_color?: string | null;
};

export async function listActiveSpoolLoans() {
  return invoke<ActiveSpoolLoanRow[]>("list_active_spool_loans");
}

export async function listLoanUsageByPerson(limit = 30, direction?: string | null) {
  return invoke<LoanUsageByPersonRow[]>("list_loan_usage_by_person", {
    limit,
    direction: direction ?? null,
  });
}

export async function listSpoolLoans(
  limit = 500,
  includeReturned = true,
  direction?: string | null,
) {
  return invoke<SpoolLoanDetailsRow[]>("list_spool_loans", {
    limit,
    includeReturned,
    direction: direction ?? null,
  });
}

export async function lendSpool(input: LendSpoolInput) {
  return invoke<SpoolLoanRow>("lend_spool", { input });
}

export async function lendLibrarySyncHostSpool(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: LendSpoolInput,
) {
  return invoke<void>("lend_library_sync_host_spool", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      spool_id: input.spool_id,
      borrower_name: input.borrower_name,
      counterparty_contact: input.counterparty_contact ?? null,
      grams_out: input.grams_out,
      note: input.note ?? null,
      expected_return_at: input.expected_return_at ?? null,
    },
  });
}

export async function returnSpoolLoan(input: ReturnSpoolLoanInput) {
  return invoke<SpoolLoanRow>("return_spool_loan", { input });
}

export async function returnInboundSpoolLoan(input: ReturnSpoolLoanInput) {
  return invoke<SpoolLoanRow>("return_inbound_spool_loan", { input });
}

export async function returnLibrarySyncHostLoan(
  baseUrl: string,
  expectedLibraryId: string | null | undefined,
  input: ReturnSpoolLoanInput & { inbound?: boolean },
) {
  return invoke<void>("return_library_sync_host_loan", {
    input: {
      base_url: baseUrl,
      expected_library_id: expectedLibraryId ?? null,
      loan_id: input.loan_id,
      returned_grams: input.returned_grams,
      note: input.note ?? null,
      inbound: input.inbound ?? false,
    },
  });
}

export async function exportLoansCsv(includeReturned = true, direction?: string | null) {
  return invoke<{ content: string }>("export_loans_csv", {
    includeReturned,
    direction: direction ?? null,
  });
}
