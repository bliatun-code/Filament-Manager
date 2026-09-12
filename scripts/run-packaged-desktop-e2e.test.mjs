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
import { inspectDesktopRestoreState, assertDesktopRestorePreserved } from "./packaged-desktop-restore-evidence.mjs";

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
    backup_sha256: phase === "mutate" ? null : "a".repeat(64),
    backup_total_rows: phase === "mutate" ? null : 8,
    batch_evidence: batchEvidence(runId),
    restore_evidence: ["restore", "verify-restored"].includes(phase)
      ? { backup_tables_sha256: "b".repeat(64), perturbed_weight_g: 123 } : null,
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
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      database.exec(readFileSync(new URL("../src/database/schema.sql",import.meta.url),"utf8"));
      const manifest = JSON.parse(readFileSync(new URL("../src/database/migrations/manifest.json",import.meta.url),"utf8"));
      for (const migration of manifest.migrations.filter(entry=>entry.role==="schema-migration")) {
        database.exec(readFileSync(new URL(`../src/database/migrations/${migration.file}`,import.meta.url),"utf8"));
      }
      database.pragma(`user_version = ${currentSchemaVersion()}`);
      database.exec(`
        INSERT INTO filament_master_list(id,material,filament_name,color_name,vendor) VALUES
          ('manual_packaged_e2e_spool','PLA','Packaged desktop E2E','QA blue','Filament Manager QA');
        INSERT INTO settings(key,value) VALUES
          ('library_sync_library_id','local-qa-library'),
          ('theme_mode','light'),
          ('low_stock_policy_json','{"threshold":100}'),
          ('secure_credential_storage_migration_v1','complete'),
          ('library_sync_cache','{"local":true}');
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
    })();
  } finally {
    database.close();
  }
}

function simulateRestore(databasePath) {
  const database = new Database(databasePath);
  try {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM catalog_refresh_jobs WHERE status = 'FAILED'").get().count, 1);
    database.exec(`
      DELETE FROM catalog_refresh_jobs;
      DELETE FROM settings WHERE key IN ('library_sync_cache', 'secure_credential_storage_migration_v1');
      UPDATE library_domain_revisions SET revision = revision + 1;
    `);
  } finally {
    database.close();
  }
}

function simulateRestoredStartup(databasePath) {
  const database = new Database(databasePath);
  try {
    database.prepare("INSERT INTO settings(key,value) VALUES ('secure_credential_storage_migration_v1','complete')").run();
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

test("restore projection also detects seeded catalog timestamp and version changes", () => {
  const root = temporaryRoot("restore-seeded-metadata");
  const databasePath = path.join(root, "qa.db");
  try {
    createMutatedDatabase(databasePath);
    const database = new Database(databasePath);
    try {
      database.exec("UPDATE filament_master_list SET catalog_source = 'seeded', catalog_user_edited = 0");
      for (const sql of [
        "UPDATE filament_master_list SET updated_at = '2099-01-01 00:00:00'",
        "UPDATE filament_master_list SET catalog_seed_version = 'unexpected-version'",
      ]) {
        const before = inspectDesktopRestoreState(databasePath);
        database.exec(sql);
        assert.throws(() => assertDesktopRestorePreserved(before, inspectDesktopRestoreState(databasePath)),
          /changed portable business rows/);
      }
    } finally { database.close(); }
  } finally { rmSync(root, { force: true, recursive: true }); }
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
        if (phase === "restore") simulateRestore(context.databasePath);
        if (phase === "verify-restored") simulateRestoredStartup(context.databasePath);
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
      ["mutate", "verify", "restore", "verify-restored"],
    );
    assert.equal(new Set(observedPhases.map(entry => entry.databasePath)).size, 1);
    assert.equal(new Set(observedPhases.map(entry => entry.runId)).size, 1);
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
    assert.deepEqual(summary.backup_restore, {
      status: "pass",
      post_restart_verified: true,
      portable_state_sha256: summary.backup_restore.portable_state_sha256,
      backup_tables_sha256: "b".repeat(64),
      catalog_jobs_cleared: 1,
      batch_journal_preserved: true,
      credential_migration_reinitialized: true,
    });
    assert.match(summary.backup_restore.portable_state_sha256, /^[0-9a-f]{64}$/);
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
        "restore-result.json",
        "restore-stderr.log",
        "restore-stdout.log",
        "verify-restored-result.json",
        "verify-restored-stderr.log",
        "verify-restored-stdout.log",
        "summary.json",
      ]) {
        assert.equal(statSync(path.join(options.logDirectory, name)).mode & 0o777, 0o600);
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("backup restore completion evidence is phase-specific and exact", () => {
  const runId = "packaged-e2e-contract-run";
  for (const phase of ["mutate", "verify", "restore", "verify-restored"]) {
    assert.deepEqual(validatePackagedDesktopE2ePhaseResult(passingResult(phase, runId), { phase, runId }), completion(phase, runId));
    const missing = passingResult(phase, runId);
    delete missing.completion.restore_evidence;
    assert.throws(() => validatePackagedDesktopE2ePhaseResult(missing, { phase, runId }), /backup restore/);
  }
  for (const phase of ["mutate", "verify"]) {
    const result = passingResult(phase, runId);
    result.completion.restore_evidence = completion("restore", runId).restore_evidence;
    assert.throws(() => validatePackagedDesktopE2ePhaseResult(result, { phase, runId }), /must not claim restore evidence/);
  }
  for (const phase of ["restore", "verify-restored"]) {
    for (const evidence of [null, [], {},
      { backup_tables_sha256: "B".repeat(64), perturbed_weight_g: 123 },
      { backup_tables_sha256: "b".repeat(64), perturbed_weight_g: 760 },
      { backup_tables_sha256: "b".repeat(64), perturbed_weight_g: 123, imported: true },
    ]) {
      const result = passingResult(phase, runId);
      result.completion.restore_evidence = evidence;
      assert.throws(() => validatePackagedDesktopE2ePhaseResult(result, { phase, runId }), /completion evidence is invalid/);
    }
    for (const invalid of [{ backup_sha256: null }, { backup_total_rows: 0 }]) {
      const result = passingResult(phase, runId);
      Object.assign(result.completion, invalid);
      assert.throws(() => validatePackagedDesktopE2ePhaseResult(result, { phase, runId }), /invalid full-backup evidence/);
    }
  }
});

test("backup restore cannot pass without clearing a persisted run-bound catalog job", async () => {
  const root = temporaryRoot("noop-restore");
  const options = optionsFor(root);
  const phases = [];
  try {
    await assert.rejects(() => runPackagedDesktopE2e(options, { async launchPhase({ context, phase }) {
      phases.push(phase);
      if (phase === "mutate") createMutatedDatabase(context.databasePath, context.runId);
      if (phase === "restore") {
        const database = new Database(context.databasePath, { readonly: true });
        try {
          const jobs = database.prepare("SELECT * FROM catalog_refresh_jobs").all();
          assert.equal(jobs.length, 1);
          assert.equal(jobs[0].job_id, `${context.runId}-restore-job`);
          assert.equal(jobs[0].authority_key, `${context.runId}-restore-authority`);
          assert.equal(jobs[0].owner_id, `${context.runId}-restore-owner`);
          assert.equal(jobs[0].status, "FAILED");
          assert.equal(database.pragma("quick_check", { simple: true }), "ok");
        } finally { database.close(); }
      }
      writeFileSync(path.join(context.workDirectory, `${phase}-result.json`), JSON.stringify(passingResult(phase, context.runId)), { flag: "wx", mode: 0o600 });
      return { exitCode: 0, signal: null };
    } }), /did not clear the synthetic catalog job/);
    assert.deepEqual(phases, ["mutate", "verify", "restore"]);
    assert.equal(existsSync(options.workDirectory), false);
  } finally { rmSync(root, { force: true, recursive: true }); }
});

test("restore preserves exact installation journal bytes, identity and original business history", async () => {
  for (const [label, sql, error] of [
    ["missing receipt", "DELETE FROM catalog_spool_batches", /durable journal receipt/],
    ["receipt timestamp", "UPDATE catalog_spool_batches SET created_at = '2099-01-01T00:00:00Z'", /installation batch journal/],
    ["request JSON bytes", "UPDATE catalog_spool_batches SET request_json = ' ' || request_json", /installation batch journal/],
    ["receipt JSON bytes", "UPDATE catalog_spool_batches SET receipt_json = receipt_json || ' '", /installation batch journal/],
    ["library and journal identity", "UPDATE settings SET value = 'other-library' WHERE key = 'library_sync_library_id'; UPDATE catalog_spool_batches SET library_id = 'other-library'", /installation batch journal/],
    ["history timestamp", "UPDATE spool_history_events SET created_at = '2099-01-01 00:00:00' WHERE id = 'created-0'", /portable business rows/],
    ["extra history", "INSERT INTO spool_history_events(id,spool_id,event_type,payload_json) VALUES ('unexpected','packaged_e2e_spool','UPDATED','{}')", /portable business rows/],
    ["uninspected spool metadata", "UPDATE filament_spools SET qr_code = 'altered' WHERE id = 'packaged_e2e_spool'", /portable business rows/],
    ["printer metadata", "UPDATE printers SET updated_at = '2099-01-01 00:00:00'", /portable business rows/],
    ["manual catalog value", "UPDATE filament_master_list SET default_weight = 900", /portable business rows/],
    ["theme preference", "UPDATE settings SET value = 'dark' WHERE key = 'theme_mode'", /portable business rows/],
    ["low-stock policy", "UPDATE settings SET value = '{\"threshold\":1}' WHERE key = 'low_stock_policy_json'", /portable business rows/],
  ]) {
    const root = temporaryRoot("restore-corruption");
    const options = optionsFor(root);
    try {
      await assert.rejects(() => runPackagedDesktopE2e(options, { async launchPhase({ context, phase }) {
        if (phase === "mutate") createMutatedDatabase(context.databasePath, context.runId);
        if (phase === "restore") {
          simulateRestore(context.databasePath);
          const database = new Database(context.databasePath);
          try { database.exec(sql); } finally { database.close(); }
        }
        writeFileSync(path.join(context.workDirectory, `${phase}-result.json`), JSON.stringify(passingResult(phase, context.runId)), { flag: "wx", mode: 0o600 });
        return { exitCode: 0, signal: null };
      } }), error, label);
      assert.equal(JSON.parse(readFileSync(path.join(options.logDirectory, "summary.json"), "utf8")).status, "fail");
      assert.equal(existsSync(options.workDirectory), false);
    } finally { rmSync(root, { force: true, recursive: true }); }
  }
});

test("restored restart retains full snapshot and the original backup evidence", async () => {
  for (const [label, sql, alter, error] of [
    ["revision-only write", "UPDATE library_domain_revisions SET revision = revision + 1", null, /restored state changed across the verified restart/],
    ["new local cache", "INSERT INTO settings(key,value) VALUES ('library_sync_cache','{}')", null, /restored state changed across the verified restart/],
    ["missing credential migration", "DELETE FROM settings WHERE key = 'secure_credential_storage_migration_v1'", null, /exact completed credential migration marker/],
    ["wrong credential migration", "UPDATE settings SET value = 'incomplete' WHERE key = 'secure_credential_storage_migration_v1'", null, /exact completed credential migration marker/],
    ["similarly named setting", "INSERT INTO settings(key,value) VALUES ('secure_credential_storage_migration_v2','complete')", null, /restored state changed across the verified restart/],
    ["printer local credential write", "UPDATE printers SET access_token = 'isolated-qa-token'", null, /restored state changed across the verified restart/],
    ["history corruption", "UPDATE spool_history_events SET created_at = '2099-01-01 00:00:00'", null, /portable business rows/],
    ["changed restore evidence", null, result => { result.completion.restore_evidence.backup_tables_sha256 = "c".repeat(64); }, /restored state or backup evidence changed/],
  ]) {
    const root = temporaryRoot("restored-restart-corruption");
    const options = optionsFor(root);
    try {
      await assert.rejects(() => runPackagedDesktopE2e(options, { async launchPhase({ context, phase }) {
        if (phase === "mutate") createMutatedDatabase(context.databasePath, context.runId);
        if (phase === "restore") simulateRestore(context.databasePath);
        const result = passingResult(phase, context.runId);
        if (phase === "verify-restored") {
          simulateRestoredStartup(context.databasePath);
          if (sql) {
            const database = new Database(context.databasePath);
            try { database.exec(sql); } finally { database.close(); }
          }
          alter?.(result);
        }
        writeFileSync(path.join(context.workDirectory, `${phase}-result.json`), JSON.stringify(result), { flag: "wx", mode: 0o600 });
        return { exitCode: 0, signal: null };
      } }), error, label);
    } finally { rmSync(root, { force: true, recursive: true }); }
  }
});

test("restore must remove the credential migration marker before startup recreates it", async () => {
  for (const marker of ["complete", "incomplete"]) {
    const root = temporaryRoot("restore-retained-credential-marker");
    const options = optionsFor(root);
    try {
      await assert.rejects(() => runPackagedDesktopE2e(options, { async launchPhase({ context, phase }) {
        if (phase === "mutate") createMutatedDatabase(context.databasePath, context.runId);
        if (phase === "restore") {
          simulateRestore(context.databasePath);
          const database = new Database(context.databasePath);
          try {
            database.prepare("INSERT INTO settings(key,value) VALUES ('secure_credential_storage_migration_v1',?)").run(marker);
          } finally { database.close(); }
        }
        if (phase === "verify-restored") {
          const database = new Database(context.databasePath);
          try {
            database.exec("UPDATE settings SET value = 'complete' WHERE key = 'secure_credential_storage_migration_v1'");
          } finally { database.close(); }
        }
        writeFileSync(path.join(context.workDirectory, `${phase}-result.json`), JSON.stringify(passingResult(phase, context.runId)), { flag: "wx", mode: 0o600 });
        return { exitCode: 0, signal: null };
      } }), /must remove the local credential migration marker during import/);
    } finally { rmSync(root, { force: true, recursive: true }); }
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
    ["credential migration removed","DELETE FROM settings WHERE key = 'secure_credential_storage_migration_v1'"],
    ["credential migration changed","UPDATE settings SET value = 'incomplete' WHERE key = 'secure_credential_storage_migration_v1'"],
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
