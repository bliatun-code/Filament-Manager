import { invoke } from "./tauri_invoke";

export type PackagedDesktopE2eConfiguration = {
  phase: "mutate" | "verify";
  run_id: string;
  spool_id: string;
  printer_id: string;
  slot_id: string;
  initial_weight_g: number;
  updated_weight_g: number;
  returned_weight_g: number;
};

export type PackagedDesktopE2eCompletion = {
  phase: "mutate" | "verify";
  run_id: string;
  spool_id: string;
  printer_id: string;
  slot_id: string;
  loan_id: string;
  final_weight_g: number;
  loan_status: "RETURNED";
  backup_sha256: string | null;
  backup_total_rows: number | null;
};

export type PackagedDesktopE2eFailure = {
  phase: string;
  run_id: string;
  step: string;
  message: string;
};

export function getPackagedDesktopE2eConfiguration() {
  return invoke<PackagedDesktopE2eConfiguration | null>(
    "get_packaged_desktop_e2e_configuration",
  );
}

export function completePackagedDesktopE2e(
  input: PackagedDesktopE2eCompletion,
) {
  return invoke<void>("complete_packaged_desktop_e2e", { input });
}

export function failPackagedDesktopE2e(input: PackagedDesktopE2eFailure) {
  return invoke<void>("fail_packaged_desktop_e2e", { input });
}
