import assert from "node:assert/strict";
import test from "node:test";

import {
  PackagedDesktopE2eScenarioError,
  runPackagedDesktopE2eScenario,
  type PackagedDesktopE2eCompletion,
  type PackagedDesktopE2eConfiguration,
} from "./packaged_desktop_e2e_scenario";
import type { SpoolLoanRow } from "./tauri_loan_client";

const baseConfiguration: PackagedDesktopE2eConfiguration = {
  phase: "mutate",
  run_id: "packaged-e2e-test-run-0001",
  spool_id: "packaged_e2e_spool",
  printer_id: "packaged_e2e_printer",
  slot_id: "packaged_e2e_printer_ams_1_slot_1",
  initial_weight_g: 1_000,
  updated_weight_g: 875,
  returned_weight_g: 760,
};

function loanRow(overrides: Partial<SpoolLoanRow> = {}): SpoolLoanRow {
  return {
    id: "packaged-e2e-loan",
    spool_id: baseConfiguration.spool_id,
    borrower_name: "Packaged desktop E2E borrower",
    loan_direction: "OUTBOUND",
    loan_status: "ACTIVE",
    counterparty_name: "Packaged desktop E2E borrower",
    grams_out: baseConfiguration.updated_weight_g,
    lent_at: "2026-08-21 10:00:00",
    ...overrides,
  };
}

function spoolRows(currentWeight: number) {
  return [
    {
      spool: {
        id: baseConfiguration.spool_id,
        master_id: "manual_packaged_e2e_spool",
        status: "IN_PRINTER",
        initial_weight_g: baseConfiguration.initial_weight_g,
        current_weight_g: currentWeight,
        remaining_g: currentWeight,
      },
      master: {
        id: "manual_packaged_e2e_spool",
        material: "PLA",
        filament_name: "Packaged desktop E2E",
        color_name: "QA blue",
        default_weight: baseConfiguration.initial_weight_g,
        vendor: "Filament Manager QA",
      },
    },
  ];
}

function printerRows(spoolId = baseConfiguration.spool_id) {
  return [
    {
      printer: {
        id: baseConfiguration.printer_id,
        model: "Generic QA printer",
        name: "Packaged desktop E2E printer",
        created_at: "2026-08-21 10:00:00",
        updated_at: "2026-08-21 10:00:00",
      },
      usage: {
        total_jobs: 0,
        successful_jobs: 0,
        failed_jobs: 0,
        total_used_g: 0,
      },
      slots: [
        {
          slot_id: baseConfiguration.slot_id,
          ams_id: `${baseConfiguration.printer_id}_ams_1`,
          slot_index: 1,
          spool_id: spoolId,
        },
      ],
    },
  ];
}

test("packaged desktop mutation uses the real command-client sequence", async () => {
  const events: string[] = [];
  const completions: PackagedDesktopE2eCompletion[] = [];
  let weight = baseConfiguration.initial_weight_g;
  let created = false;
  let returned = false;
  let printerCreated = false;
  let assigned = false;

  await runPackagedDesktopE2eScenario(baseConfiguration, {
    async createManualSpool(input) {
      events.push("create_manual_spool");
      assert.equal(input.id, baseConfiguration.spool_id);
      created = true;
    },
    async listSpools() {
      events.push("list_spools");
      return created ? spoolRows(weight) : [];
    },
    async updateSpoolWeight(spoolId, grams) {
      events.push("update_spool_weight");
      assert.equal(spoolId, baseConfiguration.spool_id);
      weight = grams;
    },
    async lendSpool(input) {
      events.push("lend_spool");
      assert.equal(input.grams_out, baseConfiguration.updated_weight_g);
      return loanRow();
    },
    async listSpoolLoans() {
      events.push("list_spool_loans");
      return returned
        ? [
            {
              loan: loanRow({
                loan_status: "RETURNED",
                returned_at: "2026-08-21 11:00:00",
                returned_grams: baseConfiguration.returned_weight_g,
              }),
              spool_status: "IN_PRINTER",
              spool_remaining_g: baseConfiguration.returned_weight_g,
            },
          ]
        : [];
    },
    async returnSpoolLoan(input) {
      events.push("return_spool_loan");
      assert.equal(input.loan_id, "packaged-e2e-loan");
      returned = true;
      weight = input.returned_grams;
      return loanRow({
        loan_status: "RETURNED",
        returned_at: "2026-08-21 11:00:00",
        returned_grams: input.returned_grams,
      });
    },
    async createPrinter(input) {
      events.push("create_printer");
      assert.equal(input.id, baseConfiguration.printer_id);
      printerCreated = true;
    },
    async assignPrinterSlot(input) {
      events.push("assign_printer_slot");
      assert.equal(input.slot_id, baseConfiguration.slot_id);
      assert.ok(printerCreated);
      assigned = true;
    },
    async listPrinterOverview() {
      events.push("list_printer_overview");
      return assigned ? printerRows() : [];
    },
    async exportFullBackupJson() {
      throw new Error("mutation must not export a backup");
    },
    async validateFullBackupJson() {
      throw new Error("mutation must not validate a backup");
    },
    async sha256() {
      throw new Error("mutation must not hash a backup");
    },
    async complete(input) {
      events.push("complete");
      completions.push(input);
    },
  });

  assert.deepEqual(events, [
    "create_manual_spool",
    "list_spools",
    "update_spool_weight",
    "list_spools",
    "lend_spool",
    "return_spool_loan",
    "create_printer",
    "assign_printer_slot",
    "list_spools",
    "list_spool_loans",
    "list_printer_overview",
    "complete",
  ]);
  assert.deepEqual(completions, [
    {
      phase: "mutate",
      run_id: baseConfiguration.run_id,
      spool_id: baseConfiguration.spool_id,
      printer_id: baseConfiguration.printer_id,
      slot_id: baseConfiguration.slot_id,
      loan_id: "packaged-e2e-loan",
      final_weight_g: baseConfiguration.returned_weight_g,
      loan_status: "RETURNED",
      backup_sha256: null,
      backup_total_rows: null,
    },
  ]);
});

test("packaged desktop verification reads restarted state and validates full backup rows", async () => {
  const config = { ...baseConfiguration, phase: "verify" as const };
  const returnedLoan = loanRow({
    loan_status: "RETURNED",
    returned_at: "2026-08-21 11:00:00",
    returned_grams: config.returned_weight_g,
  });
  const backup = JSON.stringify({
    format: "filament-manager-backup-v1",
    tables: {
      filament_spools: [
        {
          id: config.spool_id,
          current_weight_g: config.returned_weight_g,
          remaining_g: config.returned_weight_g,
        },
      ],
      spool_loans: [returnedLoan],
      printers: [{ id: config.printer_id }],
      ams_slots: [{ id: config.slot_id, spool_id: config.spool_id }],
    },
  });
  let completion: PackagedDesktopE2eCompletion | null = null;

  await runPackagedDesktopE2eScenario(config, {
    async createManualSpool() {
      throw new Error("verification must be read-only");
    },
    async listSpools() {
      return spoolRows(config.returned_weight_g);
    },
    async updateSpoolWeight() {
      throw new Error("verification must be read-only");
    },
    async lendSpool() {
      throw new Error("verification must be read-only");
    },
    async listSpoolLoans() {
      return [{ loan: returnedLoan, spool_status: "IN_PRINTER" }];
    },
    async returnSpoolLoan() {
      throw new Error("verification must be read-only");
    },
    async createPrinter() {
      throw new Error("verification must be read-only");
    },
    async assignPrinterSlot() {
      throw new Error("verification must be read-only");
    },
    async listPrinterOverview() {
      return printerRows();
    },
    async exportFullBackupJson() {
      return { content: backup };
    },
    async validateFullBackupJson(content) {
      assert.equal(content, backup);
      return {
        format: "filament-manager-backup-v1",
        expected_tables: 4,
        present_tables: 4,
        total_rows: 4,
        missing_tables: [],
        extra_tables: [],
      };
    },
    async sha256(content) {
      assert.equal(content, backup);
      return "a".repeat(64);
    },
    async complete(input) {
      completion = input;
    },
  });

  assert.deepEqual(completion, {
    phase: "verify",
    run_id: config.run_id,
    spool_id: config.spool_id,
    printer_id: config.printer_id,
    slot_id: config.slot_id,
    loan_id: returnedLoan.id,
    final_weight_g: config.returned_weight_g,
    loan_status: "RETURNED",
    backup_sha256: "a".repeat(64),
    backup_total_rows: 4,
  });
});

test("packaged desktop verification rejects missing backup preservation", async () => {
  const config = { ...baseConfiguration, phase: "verify" as const };
  const returnedLoan = loanRow({
    loan_status: "RETURNED",
    returned_at: "2026-08-21 11:00:00",
    returned_grams: config.returned_weight_g,
  });
  const dependencies = {
    async createManualSpool() {},
    async listSpools() {
      return spoolRows(config.returned_weight_g);
    },
    async updateSpoolWeight() {},
    async lendSpool() {
      return returnedLoan;
    },
    async listSpoolLoans() {
      return [{ loan: returnedLoan }];
    },
    async returnSpoolLoan() {
      return returnedLoan;
    },
    async createPrinter() {},
    async assignPrinterSlot() {},
    async listPrinterOverview() {
      return printerRows();
    },
    async exportFullBackupJson() {
      return {
        content: JSON.stringify({
          format: "filament-manager-backup-v1",
          tables: {
            filament_spools: [],
            spool_loans: [returnedLoan],
            printers: [{ id: config.printer_id }],
            ams_slots: [{ id: config.slot_id, spool_id: config.spool_id }],
          },
        }),
      };
    },
    async validateFullBackupJson() {
      return {
        format: "filament-manager-backup-v1",
        expected_tables: 4,
        present_tables: 4,
        total_rows: 3,
        missing_tables: [],
        extra_tables: [],
      };
    },
    async sha256() {
      return "a".repeat(64);
    },
    async complete() {},
  };

  await assert.rejects(
    () => runPackagedDesktopE2eScenario(config, dependencies),
    (error: unknown) => {
      assert.ok(error instanceof PackagedDesktopE2eScenarioError);
      assert.equal(error.step, "export-and-validate-full-backup");
      assert.match(error.message, /filament_spools backup row/);
      return true;
    },
  );
});
