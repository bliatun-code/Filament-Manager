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

function createMutatedDatabase(databasePath) {
  const database = new Database(databasePath);
  try {
    database.exec(`
      PRAGMA user_version = 17;
      CREATE TABLE filament_spools (
        id TEXT PRIMARY KEY,
        initial_weight_g INTEGER,
        current_weight_g INTEGER,
        remaining_g INTEGER,
        status TEXT
      );
      CREATE TABLE spool_loans (
        id TEXT PRIMARY KEY,
        spool_id TEXT,
        loan_direction TEXT,
        loan_status TEXT,
        grams_out INTEGER,
        returned_grams INTEGER,
        consumed_grams INTEGER,
        returned_at TEXT
      );
      CREATE TABLE printers (
        id TEXT PRIMARY KEY,
        model TEXT,
        name TEXT
      );
      CREATE TABLE ams_slots (
        id TEXT PRIMARY KEY,
        spool_id TEXT
      );
      INSERT INTO filament_spools VALUES (
        'packaged_e2e_spool', 1000, 760, 760, 'ASSIGNED'
      );
      INSERT INTO spool_loans VALUES (
        'packaged-e2e-loan', 'packaged_e2e_spool', 'OUTBOUND',
        'RETURNED', 875, 760, 115, '2026-08-21 12:00:00'
      );
      INSERT INTO printers VALUES (
        'packaged_e2e_printer', 'Generic QA printer',
        'Packaged desktop E2E printer'
      );
      INSERT INTO ams_slots VALUES (
        'packaged_e2e_printer_ams_1_slot_1', 'packaged_e2e_spool'
      );
    `);
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
    const snapshot = inspectPackagedDesktopE2eDatabase(databasePath);
    assert.equal(snapshot.schemaVersion, 17);
    assert.equal(snapshot.spool.status, "ASSIGNED");
    assert.equal(snapshot.spool.remaining_g, 760);
    assert.equal(snapshot.loan.loan_status, "RETURNED");
    assert.equal(snapshot.loan.consumed_grams, 115);
    assert.equal(snapshot.slot.spool_id, "packaged_e2e_spool");
    assert.match(snapshot.snapshotSha256, /^[0-9a-f]{64}$/);
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
          createMutatedDatabase(context.databasePath);
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
    assert.equal(summary.schema_version, 17);
    assert.equal(summary.backup_total_rows, 8);
    assert.match(summary.backup_sha256, /^[0-9a-f]{64}$/);
    assert.match(summary.state_snapshot_sha256, /^[0-9a-f]{64}$/);
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
