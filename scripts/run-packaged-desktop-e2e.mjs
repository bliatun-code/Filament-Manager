#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  preparePrivateQaArtifactDirectory,
  securePrivateQaArtifact,
} from "./qa-artifact-permissions.mjs";

const RESULT_FORMAT = "filament-manager-packaged-desktop-e2e-result-v1";
const SUMMARY_FORMAT = "filament-manager-packaged-desktop-e2e-summary-v1";
const MARKER_FILE_NAME = ".filament-manager-packaged-desktop-e2e";
const MARKER_FORMAT = "filament-manager-packaged-desktop-e2e-v1";
const DATABASE_FILE_NAME = "qa.db";
const SPOOL_ID = "packaged_e2e_spool";
const PRINTER_ID = "packaged_e2e_printer";
const SLOT_ID = "packaged_e2e_printer_ams_1_slot_1";
const UPDATED_WEIGHT_G = 875;
const RETURNED_WEIGHT_G = 760;
const MINIMUM_TIMEOUT_MS = 10_000;
const MAXIMUM_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAXIMUM_RESULT_BYTES = 64 * 1024;
const HARNESS_ENVIRONMENT_VARIABLES = [
  "FILAMENT_MANAGER_DB_PATH",
  "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E",
  "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_PHASE",
  "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_RUN_ID",
  "FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_DIR",
];

function pathIsInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertSafeAbsolutePath(candidate, label) {
  if (typeof candidate !== "string" || !candidate.trim() || !path.isAbsolute(candidate)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) {
    throw new Error(`${label} cannot be a filesystem root.`);
  }
  return resolved;
}

function assertRealFile(filePath, label) {
  const stats = lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real file, not a symbolic link.`);
  }
  return stats;
}

function assertRealDirectory(directoryPath, label) {
  const stats = lstatSync(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symbolic link.`);
  }
  return stats;
}

function assertPrivateUnixMode(filePath, expectedMode, label) {
  if (process.platform === "win32") {
    return;
  }
  const actualMode = statSync(filePath).mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new Error(
      `${label} must use mode ${expectedMode.toString(8)}, found ${actualMode.toString(8)}.`,
    );
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writePrivateFile(filePath, content) {
  const descriptor = openSync(filePath, "wx", 0o600);
  try {
    writeFileSync(descriptor, content);
  } finally {
    closeSync(descriptor);
  }
  if (process.platform !== "win32") {
    chmodSync(filePath, 0o600);
  }
}

function copyPrivateFile(sourcePath, destinationPath) {
  copyFileSync(sourcePath, destinationPath);
  if (process.platform !== "win32") {
    chmodSync(destinationPath, 0o600);
  }
}

export function validatePackagedDesktopE2eOptions({
  executablePath,
  workDirectory,
  logDirectory,
  launchTimeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const executable = assertSafeAbsolutePath(executablePath, "Executable path");
  const work = assertSafeAbsolutePath(workDirectory, "QA work directory");
  const logs = assertSafeAbsolutePath(logDirectory, "QA log directory");
  if (
    !Number.isSafeInteger(launchTimeoutMs) ||
    launchTimeoutMs < MINIMUM_TIMEOUT_MS ||
    launchTimeoutMs > MAXIMUM_TIMEOUT_MS
  ) {
    throw new Error(
      `Launch timeout must be an integer from ${MINIMUM_TIMEOUT_MS} to ` +
        `${MAXIMUM_TIMEOUT_MS} milliseconds.`,
    );
  }
  assertRealFile(executable, "Packaged application executable");
  if (
    work === logs ||
    pathIsInside(work, logs) ||
    pathIsInside(logs, work)
  ) {
    throw new Error("QA work and log directories must be disjoint.");
  }
  const workParent = path.dirname(work);
  assertRealDirectory(workParent, "QA work parent");
  const logParent = path.dirname(logs);
  assertRealDirectory(logParent, "QA log parent");
  if (existsSync(work)) {
    throw new Error("QA work directory must not exist before the run.");
  }
  if (existsSync(logs)) {
    throw new Error("QA log directory must not exist before the run.");
  }
  return {
    executablePath: executable,
    workDirectory: work,
    logDirectory: logs,
    launchTimeoutMs,
  };
}

export async function preparePackagedDesktopE2eRun(options) {
  const validated = validatePackagedDesktopE2eOptions(options);
  try {
    await preparePrivateQaArtifactDirectory(validated.workDirectory);
    await preparePrivateQaArtifactDirectory(validated.logDirectory);
    assertRealDirectory(validated.workDirectory, "QA work directory");
    assertRealDirectory(validated.logDirectory, "QA log directory");
    assertPrivateUnixMode(validated.workDirectory, 0o700, "QA work directory");
    assertPrivateUnixMode(validated.logDirectory, 0o700, "QA log directory");

    const runId = `packaged-e2e-${randomUUID()}`;
    const markerPath = path.join(validated.workDirectory, MARKER_FILE_NAME);
    const databasePath = path.join(validated.workDirectory, DATABASE_FILE_NAME);
    writePrivateFile(markerPath, `${MARKER_FORMAT}\n${runId}\n`);
    const databaseDescriptor = openSync(databasePath, "wx", 0o600);
    closeSync(databaseDescriptor);
    await securePrivateQaArtifact(markerPath);
    await securePrivateQaArtifact(databasePath);
    assertPrivateUnixMode(markerPath, 0o600, "QA marker");
    assertPrivateUnixMode(databasePath, 0o600, "QA database");

    return {
      ...validated,
      databasePath,
      markerPath,
      runId,
    };
  } catch (error) {
    for (const directory of [
      validated.workDirectory,
      validated.logDirectory,
    ]) {
      if (existsSync(directory)) {
        rmSync(directory, { force: true, recursive: true });
      }
    }
    throw error;
  }
}

function phaseEnvironment(context, phase) {
  const environment = { ...process.env };
  for (const variable of HARNESS_ENVIRONMENT_VARIABLES) {
    delete environment[variable];
  }
  return {
    ...environment,
    FILAMENT_MANAGER_DB_PATH: context.databasePath,
    FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E: "1",
    FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_PHASE: phase,
    FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_RUN_ID: context.runId,
    FILAMENT_MANAGER_PACKAGED_DESKTOP_E2E_DIR: context.workDirectory,
  };
}

export function waitForPackagedDesktopE2eChild(child, timeoutMs, phase) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let killConfirmationTimer = null;
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(killConfirmationTimer);
      callback();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      killConfirmationTimer = setTimeout(
        () =>
          finish(() =>
            reject(
              new Error(
                `Packaged application ${phase} phase exceeded ${timeoutMs} milliseconds ` +
                  "and its termination could not be confirmed.",
              ),
            ),
          ),
        5_000,
      );
    }, timeoutMs);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (exitCode, signal) =>
      finish(() => {
        if (timedOut) {
          reject(
            new Error(
              `Packaged application ${phase} phase exceeded ${timeoutMs} milliseconds.`,
            ),
          );
          return;
        }
        resolve({ exitCode, signal });
      }),
    );
  });
}

export async function launchPackagedDesktopE2ePhase({
  context,
  phase,
  stderrDescriptor,
  stdoutDescriptor,
}) {
  const child = spawn(context.executablePath, [], {
    cwd: path.dirname(context.executablePath),
    env: phaseEnvironment(context, phase),
    shell: false,
    stdio: ["ignore", stdoutDescriptor, stderrDescriptor],
    windowsHide: false,
  });
  return waitForPackagedDesktopE2eChild(child, context.launchTimeoutMs, phase);
}

function readBoundedJson(filePath, label) {
  assertRealFile(filePath, label);
  const stats = statSync(filePath);
  if (stats.size <= 0 || stats.size > MAXIMUM_RESULT_BYTES) {
    throw new Error(`${label} has an invalid size.`);
  }
  assertPrivateUnixMode(filePath, 0o600, label);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

export function validatePackagedDesktopE2ePhaseResult(result, { phase, runId }) {
  if (
    !result ||
    typeof result !== "object" ||
    result.format !== RESULT_FORMAT ||
    result.phase !== phase ||
    result.run_id !== runId
  ) {
    throw new Error(`Packaged desktop E2E ${phase} result identity is invalid.`);
  }
  if (result.status === "fail") {
    const step = typeof result.step === "string" ? result.step : "unknown";
    const message =
      typeof result.message === "string" ? result.message : "unknown failure";
    throw new Error(`Packaged desktop E2E ${phase} failed at ${step}: ${message}`);
  }
  if (result.status !== "pass" || !result.completion) {
    throw new Error(`Packaged desktop E2E ${phase} did not record a passing result.`);
  }
  const completion = result.completion;
  if (
    completion.phase !== phase ||
    completion.run_id !== runId ||
    completion.spool_id !== SPOOL_ID ||
    completion.printer_id !== PRINTER_ID ||
    completion.slot_id !== SLOT_ID ||
    typeof completion.loan_id !== "string" ||
    !completion.loan_id ||
    completion.final_weight_g !== RETURNED_WEIGHT_G ||
    completion.loan_status !== "RETURNED"
  ) {
    throw new Error(`Packaged desktop E2E ${phase} completion is invalid.`);
  }
  if (phase === "mutate") {
    if (
      completion.backup_sha256 !== null ||
      completion.backup_total_rows !== null
    ) {
      throw new Error("Mutation phase must not claim full-backup evidence.");
    }
  } else if (
    typeof completion.backup_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(completion.backup_sha256) ||
    !Number.isSafeInteger(completion.backup_total_rows) ||
    completion.backup_total_rows <= 0
  ) {
    throw new Error("Verification phase has invalid full-backup evidence.");
  }
  return completion;
}

function requireSingleRow(database, sql, parameters, label) {
  const rows = database.prepare(sql).all(...parameters);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one ${label} row, found ${rows.length}.`);
  }
  return rows[0];
}

export function inspectPackagedDesktopE2eDatabase(databasePath) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    const quickCheck = database.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") {
      throw new Error(`SQLite quick_check returned ${String(quickCheck)}.`);
    }
    const foreignKeyFailures = database.pragma("foreign_key_check");
    if (foreignKeyFailures.length !== 0) {
      throw new Error(
        `SQLite foreign_key_check returned ${foreignKeyFailures.length} row(s).`,
      );
    }
    const schemaVersion = database.pragma("user_version", { simple: true });
    if (!Number.isSafeInteger(schemaVersion) || schemaVersion <= 0) {
      throw new Error(`Packaged QA database schema is invalid: ${schemaVersion}.`);
    }
    const spool = requireSingleRow(
      database,
      `SELECT id, initial_weight_g, current_weight_g, remaining_g, status
       FROM filament_spools WHERE id = ?`,
      [SPOOL_ID],
      "QA spool",
    );
    if (
      spool.initial_weight_g !== 1_000 ||
      spool.current_weight_g !== RETURNED_WEIGHT_G ||
      spool.remaining_g !== RETURNED_WEIGHT_G ||
      spool.status !== "ASSIGNED"
    ) {
      throw new Error("The packaged QA spool state is invalid.");
    }
    const loan = requireSingleRow(
      database,
      `SELECT id, spool_id, loan_direction, loan_status, grams_out,
              returned_grams, consumed_grams, returned_at
       FROM spool_loans WHERE spool_id = ?`,
      [SPOOL_ID],
      "QA loan",
    );
    if (
      loan.spool_id !== SPOOL_ID ||
      loan.loan_direction !== "OUTBOUND" ||
      loan.loan_status !== "RETURNED" ||
      loan.grams_out !== UPDATED_WEIGHT_G ||
      loan.returned_grams !== RETURNED_WEIGHT_G ||
      loan.consumed_grams !== UPDATED_WEIGHT_G - RETURNED_WEIGHT_G ||
      typeof loan.returned_at !== "string" ||
      !loan.returned_at
    ) {
      throw new Error("The packaged QA loan state is invalid.");
    }
    const printer = requireSingleRow(
      database,
      "SELECT id, model, name FROM printers WHERE id = ?",
      [PRINTER_ID],
      "QA printer",
    );
    if (
      printer.model !== "Generic QA printer" ||
      printer.name !== "Packaged desktop E2E printer"
    ) {
      throw new Error("The packaged QA printer state is invalid.");
    }
    const slot = requireSingleRow(
      database,
      "SELECT id, spool_id FROM ams_slots WHERE id = ?",
      [SLOT_ID],
      "QA printer slot",
    );
    if (slot.spool_id !== SPOOL_ID) {
      throw new Error("The packaged QA printer slot assignment is invalid.");
    }
    const normalized = {
      schemaVersion,
      spool,
      loan,
      printer,
      slot,
    };
    return {
      ...normalized,
      snapshotSha256: sha256(JSON.stringify(normalized)),
    };
  } finally {
    database.close();
  }
}

function phaseLogPaths(logDirectory, phase) {
  return {
    resultPath: path.join(logDirectory, `${phase}-result.json`),
    stderrPath: path.join(logDirectory, `${phase}-stderr.log`),
    stdoutPath: path.join(logDirectory, `${phase}-stdout.log`),
  };
}

async function executePhase(context, phase, launchPhase) {
  const logs = phaseLogPaths(context.logDirectory, phase);
  const stdoutDescriptor = openSync(logs.stdoutPath, "wx", 0o600);
  const stderrDescriptor = openSync(logs.stderrPath, "wx", 0o600);
  let launchResult;
  try {
    launchResult = await launchPhase({
      context,
      phase,
      stdoutDescriptor,
      stderrDescriptor,
    });
  } finally {
    closeSync(stdoutDescriptor);
    closeSync(stderrDescriptor);
    await securePrivateQaArtifact(logs.stdoutPath);
    await securePrivateQaArtifact(logs.stderrPath);
  }

  const privateResultPath = path.join(context.workDirectory, `${phase}-result.json`);
  const rawResult = readBoundedJson(
    privateResultPath,
    `Packaged desktop E2E ${phase} result`,
  );
  copyPrivateFile(privateResultPath, logs.resultPath);
  const completion = validatePackagedDesktopE2ePhaseResult(rawResult, {
    phase,
    runId: context.runId,
  });
  if (launchResult.exitCode !== 0 || launchResult.signal !== null) {
    throw new Error(
      `Packaged application ${phase} phase exited with code ` +
        `${String(launchResult.exitCode)} and signal ${String(launchResult.signal)}.`,
    );
  }
  return completion;
}

function safeFailureMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message
    .replaceAll(/[\u0000-\u001f\u007f]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
  return normalized || "Unknown packaged desktop E2E failure";
}

function writeSummary(logDirectory, summary) {
  const summaryPath = path.join(logDirectory, "summary.json");
  writePrivateFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summaryPath;
}

export async function runPackagedDesktopE2e(
  options,
  dependencies = {},
) {
  const launchPhase = dependencies.launchPhase ?? launchPackagedDesktopE2ePhase;
  let context = null;
  let failure = null;
  try {
    context = await preparePackagedDesktopE2eRun(options);
    const mutation = await executePhase(context, "mutate", launchPhase);
    const afterMutation = inspectPackagedDesktopE2eDatabase(context.databasePath);
    if (mutation.loan_id !== afterMutation.loan.id) {
      throw new Error("Mutation result loan identity does not match SQLite state.");
    }

    const verification = await executePhase(context, "verify", launchPhase);
    const afterRestart = inspectPackagedDesktopE2eDatabase(context.databasePath);
    if (
      verification.loan_id !== afterRestart.loan.id ||
      afterRestart.snapshotSha256 !== afterMutation.snapshotSha256 ||
      afterRestart.schemaVersion !== afterMutation.schemaVersion
    ) {
      throw new Error("Packaged desktop state changed across the verified restart.");
    }
    const summary = {
      format: SUMMARY_FORMAT,
      status: "pass",
      phases: ["mutate", "verify"],
      schema_version: afterRestart.schemaVersion,
      state_snapshot_sha256: afterRestart.snapshotSha256,
      backup_sha256: verification.backup_sha256,
      backup_total_rows: verification.backup_total_rows,
    };
    writeSummary(context.logDirectory, summary);
    return summary;
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    if (context?.logDirectory && existsSync(context.logDirectory)) {
      const summaryPath = path.join(context.logDirectory, "summary.json");
      if (!existsSync(summaryPath)) {
        writeSummary(context.logDirectory, {
          format: SUMMARY_FORMAT,
          status: "fail",
          message: safeFailureMessage(failure),
        });
      }
    }
    throw failure;
  } finally {
    if (context?.workDirectory && existsSync(context.workDirectory)) {
      rmSync(context.workDirectory, { force: true, recursive: true });
    }
  }
}

export function packagedDesktopE2eCliOptions(argv) {
  const allowedPrefixes = [
    "--executable=",
    "--work-dir=",
    "--log-dir=",
    "--launch-timeout-ms=",
  ];
  if (
    argv.some(
      (argument) =>
        !allowedPrefixes.some((prefix) => argument.startsWith(prefix)),
    )
  ) {
    throw new Error(
      "Usage: node scripts/run-packaged-desktop-e2e.mjs " +
        "--executable=<installed-app-executable> --work-dir=<private-directory> " +
        "--log-dir=<private-log-directory> [--launch-timeout-ms=120000]",
    );
  }
  const value = (prefix) =>
    argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const timeout = value("--launch-timeout-ms=");
  let launchTimeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeout !== undefined) {
    launchTimeoutMs = /^\d+$/.test(timeout) ? Number(timeout) : Number.NaN;
  }
  return {
    executablePath: value("--executable="),
    workDirectory: value("--work-dir="),
    logDirectory: value("--log-dir="),
    launchTimeoutMs,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runPackagedDesktopE2e(
      packagedDesktopE2eCliOptions(process.argv.slice(2)),
    );
    console.log(
      `Packaged desktop mutating E2E passed (schema ${result.schema_version}, ` +
        `backup rows ${result.backup_total_rows}).`,
    );
  } catch (error) {
    console.error(safeFailureMessage(error));
    process.exitCode = 1;
  }
}
