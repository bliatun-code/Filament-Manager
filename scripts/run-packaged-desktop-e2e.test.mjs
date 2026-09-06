import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { currentSchemaVersion } from "./smoke-release-database-upgrade.mjs";

import {
  inspectPackagedDesktopE2eDatabase,
  packagedDesktopE2eCliOptions,
  preparePackagedDesktopE2eRun,
  runPackagedDesktopE2e,
  validatePackagedDesktopE2eOptions,
  validatePackagedDesktopE2ePhaseResult,
  waitForPackagedDesktopE2eChild,
} from "./run-packaged-desktop-e2e.mjs";

const RESULT_FORMAT = "filament-manager-packaged-desktop-e2e-result-v1";

function batchEvidence(runId) {
  return {
    request:{batch_id:`${runId}-catalog-batch`,master_ids:["manual_packaged_e2e_spool","manual_packaged_e2e_spool"],
      initial_weight_g:640,ownership_type:"BORROWED_IN",owner_name:"Packaged desktop E2E lender",
      owner_contact:"desktop-batch@example.invalid",ownership_note:"Isolated packaged desktop batch fixture",location:"Private packaged desktop QA"},
    receipt:{batch_id:`${runId}-catalog-batch`,spool_ids:[`spool_${"1".repeat(32)}`,`spool_${"2".repeat(32)}`]},
  };
}

function temporaryRoot(label) {
  const directory = mkdtempSync(path.join(tmpdir(), `packaged-e2e-${label}-`));
  if (process.platform !== "win32") {
    chmodSync(directory, 0o700);
  }
  return directory;
}

function optionsFor(root) {
  const workParent = path.join(root, "private-work-parent");
  const logParent = path.join(root, "private-log-parent");
  mkdirSync(workParent, { mode: 0o700 });
  mkdirSync(logParent, { mode: 0o700 });
  return {
    executablePath: process.execPath,
    workDirectory: path.join(workParent, "run"),
    logDirectory: path.join(logParent, "logs"),
    launchTimeoutMs: 30_000,
  };
}

function completion(phase, runId) {
  return {
    phase,
    run_id: runId,
    spool_id: "packaged_e2e_spool",
    printer_id: "packaged_e2e_printer",
    slot_id: "packaged_e2e_printer_ams_1_slot_1",
    loan_id: "packaged-e2e-loan",
    final_weight_g: 760,
    loan_status: "RETURNED",
    backup_sha256: phase === "verify" ? "a".repeat(64) : null,
    backup_total_rows: phase === "verify" ? 8 : null,
    batch_evidence: batchEvidence(runId),
  };
}

function passingResult(phase, runId) {
  return {
    format: RESULT_FORMAT,
    status: "pass",
    phase,
    run_id: runId,
    completion: completion(phase, runId),
  };
}

function createMutatedDatabase(databasePath, runId = "packaged-e2e-contract-run") {
  const database = new Database(databasePath);
  try {
    database.exec(readFileSync(new URL("../src/database/schema.sql",import.meta.url),"utf8"));
    const manifest = JSON.parse(readFileSync(new URL("../src/database/migrations/manifest.json",import.meta.url),"utf8"));
    for (const migration of manifest.migrations.filter(entry=>entry.role==="schema-migration")) {
      database.exec(readFileSync(new URL(`../src/database/migrations/${migration.file}`,import.meta.url),"utf8"));
    }
    database.pragma(`user_version = ${currentSchemaVersion()}`);
    database.exec(`
      INSERT INTO filament_master_list(id,material,filament_name,color_name,vendor) VALUES
        ('manual_packaged_e2e_spool','PLA','Packaged desktop E2E','QA blue','Filament Manager QA');
      INSERT INTO settings(key,value) VALUES ('library_sync_library_id','local-qa-library');
      INSERT INTO inventory_locations(id,name,type) VALUES ('qa-location','Private packaged desktop QA','GENERIC');
      INSERT INTO filament_spools(id,master_id,initial_weight_g,current_weight_g,remaining_g,status) VALUES (
        'packaged_e2e_spool', 'manual_packaged_e2e_spool', 1000, 760, 760, 'ASSIGNED'
      );
      INSERT INTO spool_loans(id,spool_id,borrower_name,loan_direction,loan_status,grams_out,returned_grams,consumed_grams,returned_at) VALUES (
        'packaged-e2e-loan', 'packaged_e2e_spool', 'Packaged desktop E2E borrower', 'OUTBOUND',
        'RETURNED', 875, 760, 115, '2026-08-21 12:00:00'
      );
      INSERT INTO printers(id,model,name) VALUES (
        'packaged_e2e_printer', 'Generic QA printer',
        'Packaged desktop E2E printer'
      );
      INSERT INTO ams_units(id,printer_id,slot_count) VALUES ('qa-ams','packaged_e2e_printer',1);
      INSERT INTO ams_slots(id,ams_id,slot_index,spool_id) VALUES (
        'packaged_e2e_printer_ams_1_slot_1', 'qa-ams', 1, 'packaged_e2e_spool'
      );
    `);
    const {request,receipt} = batchEvidence(runId);
    for (const [index,id] of receipt.spool_ids.entries()) {
      database.prepare(`INSERT INTO filament_spools(id,master_id,status,ownership_type,owner_name,owner_contact,ownership_note,
        initial_weight_g,current_weight_g,remaining_g,location_id,home_location_id) VALUES (?,?,?,?,?,?,?,640,640,640,'qa-location','qa-location')`)
        .run(id,request.master_ids[index],"IN_STOCK","BORROWED_IN",request.owner_name,request.owner_contact,request.ownership_note);
      const loanId=`batch-loan-${index}`;
      database.prepare(`INSERT INTO spool_loans(id,spool_id,borrower_name,loan_direction,loan_status,counterparty_name,counterparty_contact,counterparty_note,grams_out)
        VALUES (?,?,?,'INBOUND','ACTIVE',?,?,?,640)`)
        .run(loanId,id,request.owner_name,request.owner_name,request.owner_contact,request.ownership_note);
      const insertHistory=database.prepare("INSERT INTO spool_history_events(id,spool_id,event_type,payload_json) VALUES (?,?,?,?)");
      insertHistory.run(`created-${index}`,id,"CREATED",JSON.stringify({status:"IN_STOCK",ownership_type:"BORROWED_IN"}));
      insertHistory.run(`borrowed-${index}`,id,"BORROWED_IN_REGISTERED",JSON.stringify({loan_id:loanId,ownership_type:"BORROWED_IN",
        owner_name:request.owner_name,owner_contact:request.owner_contact,ownership_note:request.ownership_note,
        loan_direction:"INBOUND",counterparty_name:request.owner_name,grams_out:640}));
    }
    database.prepare("INSERT INTO catalog_spool_batches(batch_id,library_id,request_json,receipt_json) VALUES (?,'local-qa-library',?,?)")
      .run(request.batch_id,JSON.stringify(request),JSON.stringify(receipt));
  } finally {
    database.close();
  }
}

test("packaged desktop E2E options require fresh disjoint absolute directories", () => {
  const root = temporaryRoot("options");
  try {
    const options = optionsFor(root);
    assert.deepEqual(validatePackagedDesktopE2eOptions(options), options);
    assert.throws(
      () =>
        validatePackagedDesktopE2eOptions({
          ...options,
          launchTimeoutMs: 9_999,
        }),
      /Launch timeout must be an integer/,
    );
    assert.throws(
      () =>
        validatePackagedDesktopE2eOptions({
          ...options,
          workDirectory: path.join(options.logDirectory, "database"),
        }),
      /log directories must be disjoint/,
    );

    const linkedExecutable = path.join(root, "linked-executable");
    symlinkSync(process.execPath, linkedExecutable);
    assert.throws(
      () =>
        validatePackagedDesktopE2eOptions({
          ...options,
          executablePath: linkedExecutable,
        }),
      /real file, not a symbolic link/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("packaged desktop E2E CLI rejects partial timeout values", () => {
  const options = packagedDesktopE2eCliOptions([
    `--executable=${process.execPath}`,
    `--work-dir=${path.resolve("private-work")}`,
    `--log-dir=${path.resolve("private-logs")}`,
    "--launch-timeout-ms=120000junk",
  ]);
  assert.equal(Number.isNaN(options.launchTimeoutMs), true);
  assert.throws(
    () => validatePackagedDesktopE2eOptions(options),
    /Launch timeout must be an integer/,
  );
});

test("packaged desktop E2E timeout confirms the child has stopped", async () => {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1_000)"],
    { shell: false, stdio: "ignore" },
  );
  await assert.rejects(
    waitForPackagedDesktopE2eChild(child, 50, "mutate"),
    /mutate phase exceeded 50 milliseconds/,
  );
  assert.equal(child.exitCode !== null || child.signalCode !== null, true);
});

test("packaged desktop E2E preparation creates an exact private gate", async () => {
  const root = temporaryRoot("private-gate");
  try {
    const context = await preparePackagedDesktopE2eRun(optionsFor(root));
    assert.match(context.runId, /^packaged-e2e-[0-9a-f-]{36}$/);
    assert.equal(
      readFileSync(context.markerPath, "utf8"),
      `filament-manager-packaged-desktop-e2e-v1\n${context.runId}\n`,
    );
    assert.equal(statSync(context.databasePath).size, 0);
    assert.equal(lstatSync(context.databasePath).isSymbolicLink(), false);
    if (process.platform !== "win32") {
      assert.equal(statSync(context.workDirectory).mode & 0o777, 0o700);
      assert.equal(statSync(context.logDirectory).mode & 0o777, 0o700);
      assert.equal(statSync(context.markerPath).mode & 0o777, 0o600);
      assert.equal(statSync(context.databasePath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("packaged desktop phase result validation fails closed", () => {
  const runId = "packaged-e2e-contract-run";
  assert.deepEqual(
    validatePackagedDesktopE2ePhaseResult(passingResult("mutate", runId), {
      phase: "mutate",
      runId,
    }),
    completion("mutate", runId),
  );
  assert.throws(
    () =>
      validatePackagedDesktopE2ePhaseResult(
        {
          ...passingResult("verify", runId),
          completion: {
            ...completion("verify", runId),
            backup_sha256: "NOT-A-HASH",
          },
        },
        { phase: "verify", runId },
      ),
    /invalid full-backup evidence/,
  );
  assert.throws(
    () =>
      validatePackagedDesktopE2ePhaseResult(
        {
          format: RESULT_FORMAT,
          status: "fail",
          phase: "mutate",
          run_id: runId,
          step: "lend-spool",
          message: "command rejected",
        },
        { phase: "mutate", runId },
      ),
    /failed at lend-spool: command rejected/,
  );
});

test("packaged desktop database inspection covers every mutating workflow state", () => {
  const root = temporaryRoot("database-inspection");
  const databasePath = path.join(root, "qa.db");
  try {
    createMutatedDatabase(databasePath);
    const snapshot = inspectPackagedDesktopE2eDatabase(databasePath,batchEvidence("packaged-e2e-contract-run"),"packaged-e2e-contract-run");
    assert.equal(snapshot.schemaVersion, currentSchemaVersion());
    assert.equal(snapshot.spool.status, "ASSIGNED");
    assert.equal(snapshot.spool.remaining_g, 760);
    assert.equal(snapshot.loan.loan_status, "RETURNED");
    assert.equal(snapshot.loan.consumed_grams, 115);
    assert.equal(snapshot.slot.spool_id, "packaged_e2e_spool");
    assert.match(snapshot.snapshotSha256, /^[0-9a-f]{64}$/);
    assert.equal(snapshot.catalogBatch.spools,2);
    assert.equal(snapshot.catalogBatch.loans,2);
    assert.match(snapshot.catalogBatch.state_snapshot_sha256,/^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("packaged desktop orchestration restarts against one DB and removes the private fixture", async () => {
  const root = temporaryRoot("orchestration");
  const options = optionsFor(root);
  const observedPhases = [];
  try {
    const summary = await runPackagedDesktopE2e(options, {
      async launchPhase({ context, phase }) {
        observedPhases.push({
          databasePath: context.databasePath,
          phase,
          runId: context.runId,
        });
        if (phase === "mutate") {
          createMutatedDatabase(context.databasePath,context.runId);
        }
        const resultPath = path.join(context.workDirectory, `${phase}-result.json`);
        writeFileSync(
          resultPath,
          `${JSON.stringify(passingResult(phase, context.runId), null, 2)}\n`,
          { flag: "wx", mode: 0o600 },
        );
        return { exitCode: 0, signal: null };
      },
    });

    assert.deepEqual(
      observedPhases.map(({ phase }) => phase),
      ["mutate", "verify"],
    );
    assert.equal(observedPhases[0].databasePath, observedPhases[1].databasePath);
    assert.equal(observedPhases[0].runId, observedPhases[1].runId);
    assert.equal(existsSync(options.workDirectory), false);
    assert.equal(summary.status, "pass");
    assert.equal(summary.schema_version, currentSchemaVersion());
    assert.equal(summary.backup_total_rows, 8);
    assert.match(summary.backup_sha256, /^[0-9a-f]{64}$/);
    assert.match(summary.state_snapshot_sha256, /^[0-9a-f]{64}$/);
    assert.equal(summary.catalog_batch.spools,2);
    assert.equal(summary.catalog_batch.loans,2);
    assert.equal(summary.catalog_batch.replayed,true);
    assert.match(summary.catalog_batch.state_snapshot_sha256,/^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(summary).includes("batch_evidence"),false);
    assert.equal(existsSync(path.join(options.logDirectory, "mutate-result.json")), true);
    assert.equal(existsSync(path.join(options.logDirectory, "verify-result.json")), true);
    const persistedSummary = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.deepEqual(persistedSummary, summary);
    assert.equal(JSON.stringify(persistedSummary).includes(options.workDirectory), false);
    if (process.platform !== "win32") {
      for (const name of [
        "mutate-result.json",
        "mutate-stderr.log",
        "mutate-stdout.log",
        "verify-result.json",
        "verify-stderr.log",
        "verify-stdout.log",
        "summary.json",
      ]) {
        assert.equal(statSync(path.join(options.logDirectory, name)).mode & 0o777, 0o600);
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("old phase results and malformed batch evidence cannot claim a pass",()=>{
  const runId="packaged-e2e-contract-run";
  for(const alter of [
    value=>{delete value.completion.batch_evidence;},
    value=>{delete value.completion.batch_evidence.request;},
    value=>{value.completion.batch_evidence.request.ownership_type="OWNED";},
    value=>{value.completion.batch_evidence.request.master_ids.reverse();value.completion.batch_evidence.request.master_ids[1]="different-master";},
    value=>{value.completion.batch_evidence.receipt.spool_ids[1]=value.completion.batch_evidence.receipt.spool_ids[0];},
    value=>{value.completion.batch_evidence.request.batch_id="another-run-catalog-batch";},
  ]) {
    const value=passingResult("mutate",runId);alter(value);
    assert.throws(()=>validatePackagedDesktopE2ePhaseResult(value,{phase:"mutate",runId}),/catalog batch/);
  }
});

test("current schema and exact durable journal contents are mandatory",()=>{
  const runId="packaged-e2e-contract-run";
  for(const [label,sql] of [
    ["old schema",`PRAGMA user_version = ${currentSchemaVersion()-1}`],
    ["missing journal","DROP TABLE catalog_spool_batches"],
    ["empty journal","DELETE FROM catalog_spool_batches"],
    ["wrong library","UPDATE catalog_spool_batches SET library_id = 'other-library'"],
    ["wrong receipt","UPDATE catalog_spool_batches SET receipt_json = json_set(receipt_json, '$.spool_ids[0]', 'spool_wrong')"],
    ["wrong request","UPDATE catalog_spool_batches SET request_json = json_set(request_json, '$.initial_weight_g', 641)"],
    ["wrong ownership","UPDATE filament_spools SET ownership_type = 'OWNED' WHERE id <> 'packaged_e2e_spool'"],
    ["missing loan","DELETE FROM spool_loans WHERE loan_direction = 'INBOUND'"],
    ["missing history","DELETE FROM spool_history_events WHERE event_type = 'BORROWED_IN_REGISTERED'"],
  ]) {
    const root=temporaryRoot("invalid-batch");const databasePath=path.join(root,"qa.db");
    try {
      createMutatedDatabase(databasePath,runId);
      const database=new Database(databasePath);try {database.exec(sql);}finally {database.close();}
      assert.throws(()=>inspectPackagedDesktopE2eDatabase(databasePath,batchEvidence(runId),runId),undefined,label);
    } finally {rmSync(root,{force:true,recursive:true});}
  }
});

test("replay cannot hide history, revision, or other business-row writes",async()=>{
  for(const [label,sql] of [
    ["history timestamp","UPDATE spool_history_events SET created_at = '2099-01-01 00:00:00' WHERE id = 'created-0'"],
    ["same-value spool update","UPDATE filament_spools SET remaining_g = remaining_g WHERE id <> 'packaged_e2e_spool'"],
    ["printer metadata","UPDATE printers SET updated_at = '2099-01-01 00:00:00'"],
    ["extra history","INSERT INTO spool_history_events(id,spool_id,event_type,payload_json) VALUES ('unexpected','packaged_e2e_spool','UPDATED','{}')"],
    ["theme setting","INSERT INTO settings(key,value) VALUES ('theme_mode','dark') ON CONFLICT(key) DO UPDATE SET value = excluded.value"],
    ["low-stock policy","INSERT INTO settings(key,value) VALUES ('low_stock_policy_json','{\"threshold\":1}') ON CONFLICT(key) DO UPDATE SET value = excluded.value"],
  ]) {
    const root=temporaryRoot("replay-writes");const options=optionsFor(root);
    try {
      await assert.rejects(()=>runPackagedDesktopE2e(options,{async launchPhase({context,phase}) {
        if(phase==="mutate") createMutatedDatabase(context.databasePath,context.runId);
        else {
          const database=new Database(context.databasePath);try {database.exec(sql);}finally {database.close();}
        }
        writeFileSync(path.join(context.workDirectory,`${phase}-result.json`),JSON.stringify(passingResult(phase,context.runId)),{flag:"wx",mode:0o600});
        return {exitCode:0,signal:null};
      }}),/state changed across the verified restart/,label);
      const summary=JSON.parse(readFileSync(path.join(options.logDirectory,"summary.json"),"utf8"));
      assert.equal(summary.status,"fail");
      assert.equal(existsSync(options.workDirectory),false);
    } finally {rmSync(root,{force:true,recursive:true});}
  }
});

test("a stale binary completion without batch evidence stops before restart and cleans private data",async()=>{
  const root=temporaryRoot("old-binary");const options=optionsFor(root);const phases=[];
  try {
    await assert.rejects(()=>runPackagedDesktopE2e(options,{async launchPhase({context,phase}) {
      phases.push(phase);createMutatedDatabase(context.databasePath,context.runId);
      const result=passingResult(phase,context.runId);delete result.completion.batch_evidence;
      writeFileSync(path.join(context.workDirectory,`${phase}-result.json`),JSON.stringify(result),{flag:"wx",mode:0o600});
      return {exitCode:0,signal:null};
    }}),/catalog batch evidence is missing/);
    assert.deepEqual(phases,["mutate"]);
    assert.equal(existsSync(options.workDirectory),false);
    assert.equal(JSON.parse(readFileSync(path.join(options.logDirectory,"summary.json"),"utf8")).status,"fail");
  } finally {rmSync(root,{force:true,recursive:true});}
});
