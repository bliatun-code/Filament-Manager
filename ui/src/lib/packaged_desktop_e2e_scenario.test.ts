import assert from "node:assert/strict";
import test from "node:test";

import {
  PackagedDesktopE2eScenarioError,
  runPackagedDesktopE2eScenario,
  type PackagedDesktopE2eCompletion,
  type PackagedDesktopE2eConfiguration,
} from "./packaged_desktop_e2e_scenario";
import type { SpoolLoanRow } from "./tauri_loan_client";
import type { PackagedDesktopBatchEvidence } from "./tauri_packaged_desktop_e2e_client";
import { replayPackagedDesktopBatch, validatePackagedDesktopBatchBackup,
  type PackagedDesktopBatchDependencies } from "./packaged_desktop_batch_evidence";

const baseConfiguration: PackagedDesktopE2eConfiguration = {
  phase: "mutate",
  run_id: "packaged-e2e-test-run-0001",
  spool_id: "packaged_e2e_spool",
  printer_id: "packaged_e2e_printer",
  slot_id: "packaged_e2e_printer_ams_1_slot_1",
  initial_weight_g: 1_000,
  updated_weight_g: 875,
  returned_weight_g: 760,
  batch_evidence: null,
};

const batchEvidence: PackagedDesktopBatchEvidence = {
  request: {batch_id:`${baseConfiguration.run_id}-catalog-batch`,master_ids:["manual_packaged_e2e_spool","manual_packaged_e2e_spool"],
    initial_weight_g:640,ownership_type:"BORROWED_IN",owner_name:"Packaged desktop E2E lender",
    owner_contact:"desktop-batch@example.invalid",ownership_note:"Isolated packaged desktop batch fixture",location:"Private packaged desktop QA"},
  receipt: {batch_id:`${baseConfiguration.run_id}-catalog-batch`,spool_ids:[`spool_${"1".repeat(32)}`,`spool_${"2".repeat(32)}`]},
};
const getLibrarySyncSettings = async () => ({mode:"STANDALONE",library_id:"local-qa-library",target_generation:3,device_name:"QA",client_auth_paired:false});
function batchSpoolRows() {
  return batchEvidence.receipt.spool_ids.map(id => ({
    spool:{id,master_id:batchEvidence.request.master_ids[0]!,status:"IN_STOCK",ownership_type:"BORROWED_IN",
      owner_name:batchEvidence.request.owner_name,owner_contact:batchEvidence.request.owner_contact,
      ownership_note:batchEvidence.request.ownership_note,initial_weight_g:640,current_weight_g:640,remaining_g:640,
      location_id:"qa-location",home_location_id:"qa-location"},
    master:spoolRows(760)[0]!.master,location_name:batchEvidence.request.location,home_location_name:batchEvidence.request.location,
  }));
}
function batchLoanRows() {
  return batchEvidence.receipt.spool_ids.map((id,index)=>({loan:loanRow({
    id:`inbound-${index}`,spool_id:id,loan_direction:"INBOUND",loan_status:"ACTIVE",grams_out:640,
    counterparty_name:batchEvidence.request.owner_name,counterparty_contact:batchEvidence.request.owner_contact,
  })}));
}

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
  let batchCreated = false;

  await runPackagedDesktopE2eScenario(baseConfiguration, {
    async getLibrarySyncSettings() { events.push("get_library_sync_settings");return getLibrarySyncSettings(); },
    async createCatalogSpoolBatch(input,target) {
      events.push("create_catalog_spool_batch");
      assert.deepEqual(input,batchEvidence.request);
      assert.equal(target.clientLibraryId,"local-qa-library");
      assert.equal(target.clientTargetGeneration,3);
      batchCreated=true;
      return structuredClone(batchEvidence.receipt);
    },
    async createManualSpool(input) {
      events.push("create_manual_spool");
      assert.equal(input.id, baseConfiguration.spool_id);
      created = true;
    },
    async listSpools() {
      events.push("list_spools");
      return created ? [...spoolRows(weight),...(batchCreated?batchSpoolRows():[])] : [];
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
    async listSpoolLoans(_limit,_includeReturned,direction) {
      events.push("list_spool_loans");
      if(direction==="INBOUND") return batchLoanRows();
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
    "get_library_sync_settings",
    "create_catalog_spool_batch",
    "list_spools",
    "list_spool_loans",
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
      batch_evidence: batchEvidence,
    },
  ]);
});

test("packaged desktop verification reads restarted state and validates full backup rows", async () => {
  const config = { ...baseConfiguration, phase: "verify" as const, batch_evidence:batchEvidence };
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
        ...batchSpoolRows().map(row=>row.spool),
      ],
      spool_loans: [returnedLoan,...batchLoanRows().map(row=>row.loan)],
      printers: [{ id: config.printer_id }],
      ams_slots: [{ id: config.slot_id, spool_id: config.spool_id }],
    },
  });
  let completion: PackagedDesktopE2eCompletion | null = null;

  await runPackagedDesktopE2eScenario(config, {
    getLibrarySyncSettings,
    async createCatalogSpoolBatch(input) {
      assert.deepEqual(input,batchEvidence.request,"restart replays the exact original request");
      return structuredClone(batchEvidence.receipt);
    },
    async createManualSpool() {
      throw new Error("verification must be read-only");
    },
    async listSpools() {
      return [...spoolRows(config.returned_weight_g),...batchSpoolRows()];
    },
    async updateSpoolWeight() {
      throw new Error("verification must be read-only");
    },
    async lendSpool() {
      throw new Error("verification must be read-only");
    },
    async listSpoolLoans(_limit,_includeReturned,direction) {
      if(direction==="INBOUND") return batchLoanRows();
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
        total_rows: 8,
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
    backup_total_rows: 8,
    batch_evidence: batchEvidence,
  });
});

test("packaged desktop verification rejects missing backup preservation", async () => {
  const config = { ...baseConfiguration, phase: "verify" as const, batch_evidence:batchEvidence };
  const returnedLoan = loanRow({
    loan_status: "RETURNED",
    returned_at: "2026-08-21 11:00:00",
    returned_grams: config.returned_weight_g,
  });
  const dependencies = {
    getLibrarySyncSettings,
    async createCatalogSpoolBatch() {return structuredClone(batchEvidence.receipt);},
    async createManualSpool() {},
    async listSpools() {
      return [...spoolRows(config.returned_weight_g),...batchSpoolRows()];
    },
    async updateSpoolWeight() {},
    async lendSpool() {
      return returnedLoan;
    },
    async listSpoolLoans(_limit?:number,_includeReturned?:boolean,direction?:string|null) {
      if(direction==="INBOUND") return batchLoanRows();
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

function replayDependencies(overrides: Partial<PackagedDesktopBatchDependencies> = {}): PackagedDesktopBatchDependencies {
  return {getLibrarySyncSettings,createCatalogSpoolBatch:async()=>structuredClone(batchEvidence.receipt),
    listSpools:async()=>batchSpoolRows(),listSpoolLoans:async()=>batchLoanRows(),...overrides};
}

test("restart never reconstructs missing or invalid original batch evidence",async()=>{
  for(const evidence of [null,undefined,{...batchEvidence,receipt:{...batchEvidence.receipt,spool_ids:[batchEvidence.receipt.spool_ids[0]!,batchEvidence.receipt.spool_ids[0]!]}},
    {...batchEvidence,request:{...batchEvidence.request,batch_id:"another-run"}}]) {
    let writes=0;
    await assert.rejects(()=>replayPackagedDesktopBatch(evidence,baseConfiguration.run_id,
      replayDependencies({createCatalogSpoolBatch:async()=>{writes++;return batchEvidence.receipt;}})),/evidence is missing or invalid/);
    assert.equal(writes,0);
  }
});

test("restart rejects a new or reordered receipt after the explicit original request retry",async()=>{
  for(const spool_ids of [[...batchEvidence.receipt.spool_ids].reverse(),[`spool_${"3".repeat(32)}`,`spool_${"4".repeat(32)}`]]) {
    let writes=0;
    await assert.rejects(()=>replayPackagedDesktopBatch(batchEvidence,baseConfiguration.run_id,
      replayDependencies({createCatalogSpoolBatch:async input=>{
        writes++;assert.deepEqual(input,batchEvidence.request);return {...batchEvidence.receipt,spool_ids};
      }})),/original ordered spool IDs/);
    assert.equal(writes,1);
  }
});

test("restart requires authoritative local identity before replay",async()=>{
  for(const change of [{mode:"CLIENT"},{library_id:""},{target_generation:undefined}]) {
    let writes=0;
    await assert.rejects(()=>replayPackagedDesktopBatch(batchEvidence,baseConfiguration.run_id,
      replayDependencies({getLibrarySyncSettings:async()=>({...await getLibrarySyncSettings(),...change}),
        createCatalogSpoolBatch:async()=>{writes++;return batchEvidence.receipt;}})),/current local library identity/);
    assert.equal(writes,0);
  }
});

test("restart does not accept missing rolls, wrong weights, or missing inbound loans",async()=>{
  const wrongWeight=batchSpoolRows();wrongWeight[0]!.spool.remaining_g=639;
  for(const override of [
    {listSpools:async()=>batchSpoolRows().slice(1)},
    {listSpools:async()=>wrongWeight},
    {listSpoolLoans:async()=>batchLoanRows().slice(1)},
    {listSpoolLoans:async()=>[...batchLoanRows(),batchLoanRows()[0]!]},
  ]) {
    await assert.rejects(()=>replayPackagedDesktopBatch(batchEvidence,baseConfiguration.run_id,
      replayDependencies(override)),/batch spool state is invalid|one active inbound loan/);
  }
});

test("portable backup keeps batch business rows and excludes the operational journal",()=>{
  const tables={filament_spools:batchSpoolRows().map(row=>row.spool),spool_loans:batchLoanRows().map(row=>row.loan)};
  validatePackagedDesktopBatchBackup(tables,batchEvidence);
  assert.throws(()=>validatePackagedDesktopBatchBackup({...tables,catalog_spool_batches:[]},batchEvidence),/installation-local batch journal/);
  assert.throws(()=>validatePackagedDesktopBatchBackup({...tables,spool_loans:[]},batchEvidence),/preserve the borrowed catalog batch/);
});
