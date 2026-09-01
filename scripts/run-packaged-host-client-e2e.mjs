#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  fsyncSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  preparePrivateQaArtifactDirectory,
  securePrivateQaArtifact,
} from "./qa-artifact-permissions.mjs";

export const PACKAGED_HOST_CLIENT_RESULT_FORMAT =
  "filament-manager-packaged-host-client-e2e-result-v1";
export const PACKAGED_HOST_CLIENT_READY_FORMAT =
  "filament-manager-packaged-host-client-e2e-host-ready-v1";
export const PACKAGED_HOST_CLIENT_SUMMARY_FORMAT =
  "filament-manager-packaged-host-client-e2e-summary-v1";
export const PACKAGED_HOST_CLIENT_CREDENTIAL_CLEANUP_SUMMARY_FORMAT =
  "filament-manager-packaged-host-client-e2e-credential-cleanup-summary-v1";
export const PACKAGED_HOST_CLIENT_STOP_FORMAT =
  "filament-manager-packaged-host-client-e2e-stop-v1";

const MARKER_FILE_NAME = ".filament-manager-packaged-host-client-e2e";
const MARKER_FORMAT = "filament-manager-packaged-host-client-e2e-v1";
const CREDENTIAL_CLEANUP_PENDING_FILE_NAME = "credential-cleanup-pending.json";
const CREDENTIAL_CLEANUP_PENDING_FORMAT =
  "filament-manager-packaged-host-client-e2e-credential-cleanup-pending-v1";
const RUN_IDENTITY_FILE_NAME = "run-identity.json";
const RUN_IDENTITY_FORMAT =
  "filament-manager-packaged-host-client-e2e-run-identity-v1";
const HOST_DATABASE_FILE_NAME = "host.db";
const CLIENT_DATABASE_FILE_NAME = "client.db";
const CREDENTIAL_CLEANUP_SUMMARY_FILE_NAME = "credential-cleanup-summary.json";
const LIBRARY_ID = "packaged_host_client_e2e_library";
const SPOOL_ID = "packaged_host_client_e2e_spool";
const CLIENT_LOCAL_WEIGHT_G = 333;
const PAIRED_WEIGHT_G = 875;
const RECOVERED_WEIGHT_G = 760;
const MINIMUM_TIMEOUT_MS = 10_000;
const MAXIMUM_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const WINDOWS_TREE_KILL_TIMEOUT_MS = 5_000;
const MAXIMUM_JSON_BYTES = 64 * 1024;
const MAXIMUM_SANITIZED_LOG_BYTES = 1024 * 1024;
const POLL_INTERVAL_MS = 50;
const HOST_PORT_START_ATTEMPTS = 3;
const HOST_PORT_RETRY_DELAY_MS = 250;
const WINDOWS_WORK_DIRECTORY_REMOVE_ATTEMPTS = 10;
const WINDOWS_WORK_DIRECTORY_REMOVE_RETRY_BASE_DELAY_MS = 100;
const WINDOWS_WORK_DIRECTORY_RETRAVERSAL_CODES = new Set(["ENOENT", "EPERM"]);
const HARNESS_ENVIRONMENT_VARIABLES = [
  "FILAMENT_MANAGER_DB_PATH",
  "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E",
  "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_ROLE",
  "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PHASE",
  "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_RUN_ID",
  "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_DIR",
  "FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PORT",
  "FILAMENT_MANAGER_VISUAL_QA",
  "WEBVIEW2_USER_DATA_FOLDER",
];
const CLIENT_COMPLETION_KEYS = [
  "library_id",
  "spool_id",
  "local_weight_g",
  "host_weight_g",
  "cache_weight_g",
  "target_generation",
  "live_read_failed",
  "live_write_failed",
  "paired_before_cleanup",
  "auth_cleared",
  "session_renewed",
];
const HOST_COMPLETION_KEYS = [
  "library_id",
  "spool_id",
  "listen_port",
  "pairing_issued",
];
const MAIN_PASS_SUMMARY_KEYS = [
  "format",
  "status",
  "run_id",
  "phases",
  "library_id",
  "spool_id",
  "host_schema_version",
  "client_schema_version",
  "host_weight_g",
  "client_local_weight_g",
  "cache_weight_g",
  "target_generation",
  "host_history_count",
  "client_history_count",
  "cache_setting_count",
  "auth_setting_count",
  "session_renewed",
  "auth_cleared",
  "auth_cleanup",
];
const LEGACY_AUTH_SETTING_KEYS = [
  "library_sync_client_auth_configured",
  "library_sync_client_session_id",
  "library_sync_client_device_token",
  "library_sync_client_csrf_token",
  "library_sync_client_auth_paired_at",
  "library_sync_client_auth_expires_at",
];

export class PackagedHostClientPhaseError extends Error {
  constructor(role, phase, step, message, failureKind = "scenario") {
    super(`Packaged ${role} ${phase} failed at ${step}: ${message}`);
    this.name = "PackagedHostClientPhaseError";
    this.role = role;
    this.phase = phase;
    this.step = step;
    this.failureKind = failureKind;
  }
}

export class PackagedHostClientTerminationError extends Error {
  constructor(label, child = null) {
    super(`${label} termination was not confirmed.`);
    this.name = "PackagedHostClientTerminationError";
    this.child = child;
  }
}

export function windowsTaskkillPath(environment = process.env) {
  const systemRoot = environment.SystemRoot ?? environment.WINDIR;
  if (
    typeof systemRoot !== "string" ||
    !systemRoot.trim() ||
    !path.win32.isAbsolute(systemRoot)
  ) {
    throw new Error("Windows SystemRoot is unavailable or invalid.");
  }
  return path.win32.join(systemRoot, "System32", "taskkill.exe");
}

export function runWindowsTaskkill(
  pid,
  {
    environment = process.env,
    spawnCommand = spawnSync,
    timeoutMs = WINDOWS_TREE_KILL_TIMEOUT_MS,
  } = {},
) {
  return spawnCommand(
    windowsTaskkillPath(environment),
    ["/PID", String(pid), "/T", "/F"],
    {
      shell: false,
      stdio: "ignore",
      timeout: timeoutMs,
      windowsHide: true,
    },
  );
}

function pathIsInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function assertSafeAbsolutePath(candidate, label) {
  if (
    typeof candidate !== "string" ||
    !candidate.trim() ||
    !path.isAbsolute(candidate)
  ) {
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

function inspectPathWithoutFollowing(candidate, inspectPath = lstatSync) {
  try {
    inspectPath(candidate);
    return { exists: true, error: null };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, error: null };
    return { exists: null, error };
  }
}

export async function removePackagedHostClientWorkDirectory(
  workDirectory,
  {
    platform = process.platform,
    removeDirectory = rmSync,
    inspectPath = lstatSync,
    waitBeforeRetry = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  const maximumAttempts =
    platform === "win32" ? WINDOWS_WORK_DIRECTORY_REMOVE_ATTEMPTS : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let removalError = null;
    try {
      removeDirectory(workDirectory, {
        force: true,
        recursive: true,
        maxRetries: platform === "win32" ? 5 : 0,
        retryDelay: 100,
      });
    } catch (error) {
      removalError = error;
    }

    const inspection = inspectPathWithoutFollowing(workDirectory, inspectPath);
    if (inspection.exists === false) return;

    const observedErrors = [removalError, inspection.error].filter(Boolean);
    const nonRetryableError = observedErrors.find(
      (error) =>
        !WINDOWS_WORK_DIRECTORY_RETRAVERSAL_CODES.has(error?.code),
    );
    const retryableError = observedErrors.find((error) =>
      WINDOWS_WORK_DIRECTORY_RETRAVERSAL_CODES.has(error?.code),
    );
    lastError =
      nonRetryableError ??
      retryableError ??
      new Error(
        "Packaged Host-Client E2E private work directory still exists after cleanup.",
      );
    if (
      platform !== "win32" ||
      nonRetryableError ||
      !retryableError ||
      attempt === maximumAttempts
    ) {
      throw lastError;
    }

    // A terminating WebView2 process can remove another profile child or
    // briefly retain a handle while Node traverses the same tree. Give that
    // bounded Windows-only cleanup time to settle before restarting the
    // complete exact-root traversal. A probe error never proves absence.
    await waitBeforeRetry(
      WINDOWS_WORK_DIRECTORY_REMOVE_RETRY_BASE_DELAY_MS * attempt,
    );
  }
  throw lastError;
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

function writePrivateFileAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let descriptor = null;
  let temporaryCreated = false;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (process.platform !== "win32") {
      chmodSync(temporaryPath, 0o600);
    }
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write/fsync/close failure.
      }
    }
    if (temporaryCreated) {
      try {
        rmSync(temporaryPath, { force: true });
      } catch {
        // Preserve the original atomic-write failure.
      }
    }
    throw error;
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unexpected or missing fields.`);
  }
}

function readBoundedJson(filePath, label) {
  assertRealFile(filePath, label);
  const stats = statSync(filePath);
  if (stats.size <= 0 || stats.size > MAXIMUM_JSON_BYTES) {
    throw new Error(`${label} has an invalid size.`);
  }
  assertPrivateUnixMode(filePath, 0o600, label);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function finiteInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function phaseResultPath(context, role, phase) {
  return path.join(context.workDirectory, `${role}-${phase}-result.json`);
}

function hostReadyPath(context, phase) {
  return path.join(context.workDirectory, `host-${phase}-ready.json`);
}

function hostStopPath(context, phase) {
  return path.join(context.workDirectory, `host-${phase}.stop`);
}

function rawLogPaths(context, role, phase, attempt = 1) {
  const attemptSuffix = attempt === 1 ? "" : `-attempt-${attempt}`;
  return {
    stdoutPath: path.join(
      context.workDirectory,
      `${role}-${phase}${attemptSuffix}-stdout.log`,
    ),
    stderrPath: path.join(
      context.workDirectory,
      `${role}-${phase}${attemptSuffix}-stderr.log`,
    ),
  };
}

export function validatePackagedHostClientE2eOptions({
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
  if (work === logs || pathIsInside(work, logs) || pathIsInside(logs, work)) {
    throw new Error("QA work and log directories must be disjoint.");
  }
  assertRealDirectory(path.dirname(work), "QA work parent");
  assertRealDirectory(path.dirname(logs), "QA log parent");
  if (existsSync(work) || existsSync(logs)) {
    throw new Error(
      "QA work and log directories must not exist before the run.",
    );
  }
  return {
    executablePath: executable,
    workDirectory: work,
    logDirectory: logs,
    launchTimeoutMs,
  };
}

function readRetainedRunId(markerPath) {
  assertRealFile(markerPath, "Retained QA marker");
  const markerStats = statSync(markerPath);
  if (markerStats.size <= 0 || markerStats.size > 1_024) {
    throw new Error("Retained QA marker has an invalid size.");
  }
  assertPrivateUnixMode(markerPath, 0o600, "Retained QA marker");
  const marker = readFileSync(markerPath, "utf8");
  const match = marker.match(
    /^filament-manager-packaged-host-client-e2e-v1\n(packaged-host-client-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n$/,
  );
  if (!match?.[1]) {
    throw new Error("Retained QA marker identity is invalid.");
  }
  return match[1];
}

function validateCredentialCleanupPending(pendingPath, runId) {
  const pending = readBoundedJson(
    pendingPath,
    "Retained QA credential-cleanup marker",
  );
  exactKeys(
    pending,
    ["format", "run_id", "listen_port"],
    "Retained QA credential-cleanup marker",
  );
  if (
    pending.format !== CREDENTIAL_CLEANUP_PENDING_FORMAT ||
    pending.run_id !== runId
  ) {
    throw new Error(
      "Retained QA credential-cleanup marker identity is invalid.",
    );
  }
  if (pending.listen_port !== null) {
    validateLoopbackPort(pending.listen_port);
  }
  return pending;
}

function validatePriorRunSummary(logDirectory, runId) {
  const summaryPath = path.join(logDirectory, "summary.json");
  if (!existsSync(summaryPath)) return null;
  const summaryStats = lstatSync(summaryPath);
  if (summaryStats.isDirectory() && !summaryStats.isSymbolicLink()) {
    // A pre-existing directory is the exercised atomic-publish failure mode.
    // The work/log identity markers remain authoritative for cleanup resume;
    // never remove or traverse the blocking directory here.
    return null;
  }
  const summary = readBoundedJson(summaryPath, "Prior QA summary");
  if (summary?.status === "pass") {
    exactKeys(summary, MAIN_PASS_SUMMARY_KEYS, "Prior QA summary");
    const expectedPhases = [
      "host-generation-1",
      "client-pair",
      "client-offline",
      "host-generation-2",
      "client-recover",
      "client-cleanup",
    ];
    if (
      summary.format !== PACKAGED_HOST_CLIENT_SUMMARY_FORMAT ||
      summary.run_id !== runId ||
      JSON.stringify(summary.phases) !== JSON.stringify(expectedPhases) ||
      summary.library_id !== LIBRARY_ID ||
      summary.spool_id !== SPOOL_ID ||
      !Number.isSafeInteger(summary.host_schema_version) ||
      summary.host_schema_version < 1 ||
      !Number.isSafeInteger(summary.client_schema_version) ||
      summary.client_schema_version < 1 ||
      summary.host_weight_g !== RECOVERED_WEIGHT_G ||
      summary.client_local_weight_g !== CLIENT_LOCAL_WEIGHT_G ||
      summary.cache_weight_g !== RECOVERED_WEIGHT_G ||
      !Number.isSafeInteger(summary.target_generation) ||
      summary.target_generation < 1 ||
      summary.host_history_count !== 3 ||
      summary.client_history_count !== 1 ||
      summary.cache_setting_count !== 1 ||
      summary.auth_setting_count !== 0 ||
      summary.session_renewed !== true ||
      summary.auth_cleared !== true ||
      summary.auth_cleanup !== "pass"
    ) {
      throw new Error("Prior QA summary identity is invalid.");
    }
    return summary;
  }
  exactKeys(
    summary,
    ["format", "status", "run_id", "message", "auth_cleanup"],
    "Prior QA summary",
  );
  if (
    summary?.format !== PACKAGED_HOST_CLIENT_SUMMARY_FORMAT ||
    summary.status !== "fail" ||
    summary.run_id !== runId ||
    typeof summary.message !== "string" ||
    !summary.message.trim() ||
    !["pass", "failed", "skipped-unconfirmed-process"].includes(
      summary.auth_cleanup,
    )
  ) {
    throw new Error("Prior QA summary identity is invalid.");
  }
  return summary;
}

function validatePriorCredentialCleanupSummary(summaryPath, runId) {
  if (!existsSync(summaryPath)) return null;
  const summary = readBoundedJson(
    summaryPath,
    "Prior QA credential-cleanup summary",
  );
  const expectedKeys =
    summary?.status === "pass"
      ? [
          "format",
          "status",
          "run_id",
          "auth_cleared",
          "auth_setting_count",
          "client_schema_version",
          "cleanup_launch",
          "process_termination_confirmed",
        ]
      : [
          "format",
          "status",
          "run_id",
          "message",
          "process_termination_confirmed",
        ];
  exactKeys(summary, expectedKeys, "Prior QA credential-cleanup summary");
  const validPass =
    summary.status === "pass" &&
    summary.auth_cleared === true &&
    summary.auth_setting_count === 0 &&
    Number.isSafeInteger(summary.client_schema_version) &&
    summary.client_schema_version >= 1 &&
    typeof summary.cleanup_launch === "string" &&
    /^attempt-[0-9]+$/.test(summary.cleanup_launch) &&
    Number(summary.cleanup_launch.slice("attempt-".length)) >= 2;
  const validFail =
    summary.status === "fail" &&
    typeof summary.message === "string" &&
    Boolean(summary.message.trim());
  if (
    summary?.format !==
      PACKAGED_HOST_CLIENT_CREDENTIAL_CLEANUP_SUMMARY_FORMAT ||
    summary.run_id !== runId ||
    (!validPass && !validFail) ||
    summary.process_termination_confirmed !== true
  ) {
    throw new Error("Prior QA credential-cleanup summary is invalid.");
  }
  return summary;
}

function validateRunIdentity(identityPath, runId) {
  const identity = readBoundedJson(identityPath, "Retained QA run identity");
  exactKeys(identity, ["format", "run_id"], "Retained QA run identity");
  if (identity.format !== RUN_IDENTITY_FORMAT || identity.run_id !== runId) {
    throw new Error("Retained QA log identity is invalid.");
  }
  return identity;
}

export function validateRetainedPackagedHostClientE2eOptions({
  executablePath,
  workDirectory,
  logDirectory,
  launchTimeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const executable = assertSafeAbsolutePath(executablePath, "Executable path");
  const work = assertSafeAbsolutePath(
    workDirectory,
    "Retained QA work directory",
  );
  const logs = assertSafeAbsolutePath(
    logDirectory,
    "Retained QA log directory",
  );
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
  if (work === logs || pathIsInside(work, logs) || pathIsInside(logs, work)) {
    throw new Error("Retained QA work and log directories must be disjoint.");
  }
  assertRealDirectory(work, "Retained QA work directory");
  assertRealDirectory(logs, "Retained QA log directory");
  assertPrivateUnixMode(work, 0o700, "Retained QA work directory");
  assertPrivateUnixMode(logs, 0o700, "Retained QA log directory");

  const markerPath = path.join(work, MARKER_FILE_NAME);
  const hostDatabasePath = path.join(work, HOST_DATABASE_FILE_NAME);
  const clientDatabasePath = path.join(work, CLIENT_DATABASE_FILE_NAME);
  const credentialCleanupSummaryPath = path.join(
    logs,
    CREDENTIAL_CLEANUP_SUMMARY_FILE_NAME,
  );
  const runIdentityPath = path.join(logs, RUN_IDENTITY_FILE_NAME);
  const runId = readRetainedRunId(markerPath);
  validateRunIdentity(runIdentityPath, runId);
  const credentialCleanupPendingPath = path.join(
    work,
    CREDENTIAL_CLEANUP_PENDING_FILE_NAME,
  );
  const credentialCleanupPending = validateCredentialCleanupPending(
    credentialCleanupPendingPath,
    runId,
  );
  for (const [databasePath, label] of [
    [hostDatabasePath, "Retained Host database"],
    [clientDatabasePath, "Retained Client database"],
  ]) {
    assertRealFile(databasePath, label);
    assertPrivateUnixMode(databasePath, 0o600, label);
  }
  const priorCredentialCleanupSummary = validatePriorCredentialCleanupSummary(
    credentialCleanupSummaryPath,
    runId,
  );
  const priorSummary = validatePriorRunSummary(logs, runId);
  return {
    executablePath: executable,
    workDirectory: work,
    logDirectory: logs,
    launchTimeoutMs,
    markerPath,
    hostDatabasePath,
    clientDatabasePath,
    credentialCleanupSummaryPath,
    runIdentityPath,
    credentialCleanupPendingPath,
    credentialCleanupPending,
    priorCredentialCleanupSummary,
    priorSummary,
    runId,
    sensitiveValues: new Set(),
  };
}

export async function preparePackagedHostClientE2eRun(options) {
  const validated = validatePackagedHostClientE2eOptions(options);
  try {
    await preparePrivateQaArtifactDirectory(validated.workDirectory);
    await preparePrivateQaArtifactDirectory(validated.logDirectory);
    assertPrivateUnixMode(validated.workDirectory, 0o700, "QA work directory");
    assertPrivateUnixMode(validated.logDirectory, 0o700, "QA log directory");

    const runId = `packaged-host-client-${randomUUID()}`;
    const markerPath = path.join(validated.workDirectory, MARKER_FILE_NAME);
    const hostDatabasePath = path.join(
      validated.workDirectory,
      HOST_DATABASE_FILE_NAME,
    );
    const clientDatabasePath = path.join(
      validated.workDirectory,
      CLIENT_DATABASE_FILE_NAME,
    );
    const credentialCleanupPendingPath = path.join(
      validated.workDirectory,
      CREDENTIAL_CLEANUP_PENDING_FILE_NAME,
    );
    const runIdentityPath = path.join(
      validated.logDirectory,
      RUN_IDENTITY_FILE_NAME,
    );
    writePrivateFileAtomically(markerPath, `${MARKER_FORMAT}\n${runId}\n`);
    writePrivateFileAtomically(
      credentialCleanupPendingPath,
      `${JSON.stringify({
        format: CREDENTIAL_CLEANUP_PENDING_FORMAT,
        run_id: runId,
        listen_port: null,
      })}\n`,
    );
    writePrivateFileAtomically(
      runIdentityPath,
      `${JSON.stringify({ format: RUN_IDENTITY_FORMAT, run_id: runId })}\n`,
    );
    writePrivateFile(hostDatabasePath, "");
    writePrivateFile(clientDatabasePath, "");
    for (const filePath of [
      markerPath,
      credentialCleanupPendingPath,
      hostDatabasePath,
      clientDatabasePath,
      runIdentityPath,
    ]) {
      await securePrivateQaArtifact(filePath);
      assertPrivateUnixMode(filePath, 0o600, "QA private artifact");
    }
    return {
      ...validated,
      markerPath,
      credentialCleanupPendingPath,
      runIdentityPath,
      hostDatabasePath,
      clientDatabasePath,
      runId,
      sensitiveValues: new Set(),
    };
  } catch (error) {
    for (const directory of [validated.workDirectory, validated.logDirectory]) {
      if (existsSync(directory)) {
        rmSync(directory, { force: true, recursive: true });
      }
    }
    throw error;
  }
}

export async function selectFreeLoopbackPort(serverFactory = createServer) {
  const server = serverFactory();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (!settled) {
        settled = true;
        callback();
      }
    };
    server.once("error", (error) => finish(() => reject(error)));
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (
        !address ||
        typeof address === "string" ||
        address.address !== "127.0.0.1"
      ) {
        server.close(() =>
          finish(() =>
            reject(new Error("Could not reserve a loopback TCP port.")),
          ),
        );
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          finish(() => reject(error));
        } else {
          finish(() => resolve(port));
        }
      });
    });
  });
}

export function packagedHostClientPhaseEnvironment(
  context,
  role,
  phase,
  port,
  platform = process.platform,
) {
  const environment = { ...process.env };
  for (const variable of HARNESS_ENVIRONMENT_VARIABLES) {
    delete environment[variable];
  }
  const harnessEnvironment = {
    ...environment,
    FILAMENT_MANAGER_DB_PATH:
      role === "host" ? context.hostDatabasePath : context.clientDatabasePath,
    FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E: "1",
    FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_ROLE: role,
    FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PHASE: phase,
    FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_RUN_ID: context.runId,
    FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_DIR: context.workDirectory,
    FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PORT: String(port),
    FILAMENT_MANAGER_VISUAL_QA: "1",
  };
  if (platform === "win32") {
    harnessEnvironment.WEBVIEW2_USER_DATA_FOLDER = path.join(
      context.workDirectory,
      `webview2-${role}-${phase}`,
    );
  }
  return harnessEnvironment;
}

function discardRawLogs(logs) {
  if (!logs || logs.closed) return;
  logs.closed = true;
  for (const descriptor of [logs.stdoutDescriptor, logs.stderrDescriptor]) {
    if (descriptor === null || descriptor === undefined) continue;
    try {
      closeSync(descriptor);
    } catch {
      // The original open/spawn failure remains authoritative.
    }
  }
  for (const filePath of [logs.stdoutPath, logs.stderrPath]) {
    if (!filePath) continue;
    try {
      rmSync(filePath, { force: true });
    } catch {
      // The original open/spawn failure remains authoritative.
    }
  }
}

function openRawLogs(context, role, phase, attempt = 1) {
  const paths = rawLogPaths(context, role, phase, attempt);
  const logs = {
    ...paths,
    stdoutDescriptor: null,
    stderrDescriptor: null,
    closed: false,
  };
  try {
    logs.stdoutDescriptor = openSync(paths.stdoutPath, "wx", 0o600);
    logs.stderrDescriptor = openSync(paths.stderrPath, "wx", 0o600);
    return logs;
  } catch (error) {
    // Only remove paths that this call actually created. A pre-existing
    // exclusive-open blocker must never be deleted as part of cleanup.
    const stdoutCreated = logs.stdoutDescriptor !== null;
    const stderrCreated = logs.stderrDescriptor !== null;
    const cleanupLogs = {
      ...logs,
      stdoutPath: stdoutCreated ? logs.stdoutPath : null,
      stderrPath: stderrCreated ? logs.stderrPath : null,
    };
    discardRawLogs(cleanupLogs);
    throw error;
  }
}

function sanitizePhaseLog(content, sensitiveValues) {
  let sanitized = content;
  for (const value of [...sensitiveValues].sort(
    (left, right) => right.length - left.length,
  )) {
    if (value) sanitized = sanitized.replaceAll(value, "[REDACTED]");
  }
  return sanitized
    .replaceAll(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replaceAll(/\b[a-f0-9]{48}\b/g, "[REDACTED_TOKEN]")
    .replaceAll(
      /(["']?(?:pairing|pairing_url|pairing_token|device_token|csrf_token|access_token)["']?\s*[:=]\s*["']?)[^\s,"'<>]+/gi,
      "$1[REDACTED]",
    )
    .replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
}

function publishSanitizedPhaseLog(context, sourcePath) {
  if (!existsSync(sourcePath)) return;
  const sensitiveOverlap = Math.min(
    4_096,
    Math.max(
      48,
      ...[...context.sensitiveValues].map((value) =>
        Buffer.byteLength(value, "utf8"),
      ),
    ),
  );
  const readLimit = MAXIMUM_SANITIZED_LOG_BYTES + sensitiveOverlap;
  const descriptor = openSync(sourcePath, "r");
  const source = Buffer.allocUnsafe(readLimit);
  let bytesRead = 0;
  try {
    while (bytesRead < source.length) {
      const count = readSync(
        descriptor,
        source,
        bytesRead,
        source.length - bytesRead,
        null,
      );
      if (count === 0) break;
      bytesRead += count;
    }
  } finally {
    closeSync(descriptor);
  }
  const truncated = bytesRead > MAXIMUM_SANITIZED_LOG_BYTES;
  const sanitized = sanitizePhaseLog(
    source.subarray(0, bytesRead).toString("utf8"),
    context.sensitiveValues,
  );
  const bounded = Buffer.from(sanitized, "utf8")
    .subarray(0, MAXIMUM_SANITIZED_LOG_BYTES)
    .toString("utf8");
  const suffix = truncated ? "\n[TRUNCATED BY PACKAGED HOST-CLIENT E2E]\n" : "";
  const destinationPath = path.join(
    context.logDirectory,
    path.basename(sourcePath),
  );
  writePrivateFile(destinationPath, `${bounded}${suffix}`);
}

async function closeRawLogs(context, logs) {
  if (logs.closed) return;
  logs.closed = true;
  for (const descriptor of [logs.stdoutDescriptor, logs.stderrDescriptor]) {
    try {
      closeSync(descriptor);
    } catch {
      // A close failure is reported later through the phase/process result.
    }
  }
  for (const filePath of [logs.stdoutPath, logs.stderrPath]) {
    if (existsSync(filePath)) {
      await securePrivateQaArtifact(filePath);
      publishSanitizedPhaseLog(context, filePath);
    }
  }
}

function preservePrimaryFailure(primaryFailure, secondaryFailure) {
  if (primaryFailure instanceof Error) {
    try {
      Object.defineProperty(primaryFailure, "secondaryFailure", {
        value: secondaryFailure,
        configurable: true,
        enumerable: false,
        writable: false,
      });
    } catch {
      // A frozen primary error must still retain its identity and child handle.
    }
    return primaryFailure;
  }
  return new AggregateError(
    [primaryFailure, secondaryFailure],
    "Packaged Host-Client E2E phase and log cleanup both failed.",
  );
}

export async function closeRawLogsPreservingFailure(
  context,
  logs,
  primaryFailure = null,
  logCloser = closeRawLogs,
) {
  try {
    await logCloser(context, logs);
  } catch (logFailure) {
    if (primaryFailure) {
      throw preservePrimaryFailure(primaryFailure, logFailure);
    }
    throw logFailure;
  }
  if (primaryFailure) throw primaryFailure;
}

function spawnPhase(context, role, phase, port, attempt = 1) {
  const logs = openRawLogs(context, role, phase, attempt);
  try {
    const environment = packagedHostClientPhaseEnvironment(
      context,
      role,
      phase,
      port,
    );
    if (process.platform === "win32" && attempt > 1) {
      environment.WEBVIEW2_USER_DATA_FOLDER = path.join(
        context.workDirectory,
        `webview2-${role}-${phase}-attempt-${attempt}`,
      );
    }
    const child = spawn(context.executablePath, [], {
      cwd: path.dirname(context.executablePath),
      env: environment,
      shell: false,
      stdio: ["ignore", logs.stdoutDescriptor, logs.stderrDescriptor],
      windowsHide: false,
    });
    let spawnError = null;
    child.once("error", (error) => {
      spawnError = error;
    });
    return { child, logs, getSpawnError: () => spawnError };
  } catch (error) {
    discardRawLogs(logs);
    throw error;
  }
}

export function requestPackagedChildForcedTermination(
  child,
  label,
  { platform = process.platform, windowsTreeKiller = runWindowsTaskkill } = {},
) {
  if (platform === "win32") {
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
      throw new PackagedHostClientTerminationError(label, child);
    }
    const result = windowsTreeKiller(child.pid);
    if (result?.error || result?.status !== 0) {
      throw new PackagedHostClientTerminationError(label, child);
    }
    return;
  }
  try {
    if (child.kill("SIGKILL") !== true) {
      throw new Error("kill request was not accepted");
    }
  } catch {
    throw new PackagedHostClientTerminationError(label, child);
  }
}

export function waitForPackagedHostClientChild(
  child,
  timeoutMs,
  label,
  terminationConfirmationTimeoutMs = 5_000,
  terminationRequester = requestPackagedChildForcedTermination,
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let killConfirmationTimer = null;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killConfirmationTimer);
      callback();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        terminationRequester(child, label);
      } catch {
        finish(() =>
          reject(new PackagedHostClientTerminationError(label, child)),
        );
        return;
      }
      killConfirmationTimer = setTimeout(
        () =>
          finish(() =>
            reject(new PackagedHostClientTerminationError(label, child)),
          ),
        terminationConfirmationTimeoutMs,
      );
    }, timeoutMs);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (exitCode, signal) =>
      finish(() => {
        if (timedOut) {
          reject(new Error(`${label} exceeded ${timeoutMs} milliseconds.`));
        } else {
          resolve({ exitCode, signal });
        }
      }),
    );
    // `close` may have fired before this waiter was installed. Register the
    // listeners first, then inspect the durable ChildProcess completion state
    // so the check cannot introduce a second missed-event window.
    if (child.exitCode != null || child.signalCode != null) {
      finish(() =>
        resolve({ exitCode: child.exitCode, signal: child.signalCode }),
      );
    }
  });
}

export function waitForPackagedHostClientChildClose(child, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new PackagedHostClientTerminationError(label, child)),
        ),
      timeoutMs,
    );
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (exitCode, signal) =>
      finish(() => resolve({ exitCode, signal })),
    );
    if (child.exitCode != null || child.signalCode != null) {
      finish(() =>
        resolve({ exitCode: child.exitCode, signal: child.signalCode }),
      );
    }
  });
}

async function waitForReadyFile(handle, readyPath, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const spawnError = handle.getSpawnError();
    if (spawnError) throw spawnError;
    if (existsSync(readyPath)) return;
    if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
      throw new Error(`${label} exited before publishing readiness.`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `${label} did not become ready within ${timeoutMs} milliseconds.`,
  );
}

function registerSensitivePairingUrl(context, pairingUrl) {
  if (typeof pairingUrl !== "string" || !pairingUrl) return;
  context.sensitiveValues.add(pairingUrl);
  try {
    const parsed = new URL(pairingUrl);
    for (const value of parsed.searchParams.values()) {
      if (value.length >= 8) context.sensitiveValues.add(value);
    }
    for (const segment of parsed.pathname.split("/")) {
      if (segment.length >= 24) context.sensitiveValues.add(segment);
    }
  } catch {
    // Validation reports malformed URLs without copying their content.
  }
}

export function validatePackagedHostReady(ready, { context, phase, port }) {
  exactKeys(
    ready,
    [
      "format",
      "run_id",
      "role",
      "phase",
      "library_id",
      "spool_id",
      "listen_port",
      "base_url",
      "pairing_url",
    ],
    `Packaged Host ${phase} readiness`,
  );
  if (
    ready.format !== PACKAGED_HOST_CLIENT_READY_FORMAT ||
    ready.run_id !== context.runId ||
    ready.role !== "host" ||
    ready.phase !== phase ||
    ready.library_id !== LIBRARY_ID ||
    ready.spool_id !== SPOOL_ID ||
    ready.listen_port !== port ||
    ready.base_url !== `http://127.0.0.1:${port}`
  ) {
    throw new Error(`Packaged Host ${phase} readiness identity is invalid.`);
  }
  const firstGeneration = phase === "generation-1";
  if (
    (firstGeneration &&
      (typeof ready.pairing_url !== "string" ||
        ready.pairing_url.length < 16 ||
        ready.pairing_url.length > 4_096)) ||
    (!firstGeneration && ready.pairing_url !== null)
  ) {
    throw new Error(`Packaged Host ${phase} pairing readiness is invalid.`);
  }
  if (firstGeneration) {
    let parsed;
    try {
      parsed = new URL(ready.pairing_url);
    } catch {
      throw new Error("Packaged Host pairing URL is invalid.");
    }
    if (
      parsed.protocol !== "http:" ||
      (parsed.hostname !== "127.0.0.1" &&
        !parsed.hostname.endsWith(".local")) ||
      parsed.port !== String(port) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/companion" ||
      parsed.hash !== "" ||
      [...parsed.searchParams.keys()].length !== 1 ||
      !/^[a-f0-9]{48}$/.test(parsed.searchParams.get("pairing") ?? "") ||
      parsed.search !== `?pairing=${parsed.searchParams.get("pairing") ?? ""}`
    ) {
      throw new Error(
        "Packaged Host pairing URL does not match the private pairing contract.",
      );
    }
    registerSensitivePairingUrl(context, ready.pairing_url);
  }
  return ready;
}

function expectedClientCompletion(phase, targetGeneration) {
  const shared = {
    library_id: LIBRARY_ID,
    spool_id: SPOOL_ID,
    local_weight_g: CLIENT_LOCAL_WEIGHT_G,
    target_generation: targetGeneration,
    paired_before_cleanup: true,
  };
  if (phase === "pair") {
    return {
      ...shared,
      host_weight_g: PAIRED_WEIGHT_G,
      cache_weight_g: PAIRED_WEIGHT_G,
      live_read_failed: false,
      live_write_failed: false,
      auth_cleared: false,
      session_renewed: false,
    };
  }
  if (phase === "offline") {
    return {
      ...shared,
      host_weight_g: null,
      cache_weight_g: PAIRED_WEIGHT_G,
      live_read_failed: true,
      live_write_failed: true,
      auth_cleared: false,
      session_renewed: false,
    };
  }
  return {
    ...shared,
    host_weight_g: RECOVERED_WEIGHT_G,
    cache_weight_g: RECOVERED_WEIGHT_G,
    live_read_failed: false,
    live_write_failed: false,
    auth_cleared: true,
    session_renewed: true,
  };
}

export function validatePackagedHostClientPhaseResult(
  result,
  { role, phase, runId, port, targetGeneration },
) {
  const envelopeKeys =
    result?.status === "fail"
      ? [
          "format",
          "status",
          "role",
          "phase",
          "run_id",
          "step",
          "message",
          "failure_kind",
        ]
      : ["format", "status", "role", "phase", "run_id", "completion"];
  exactKeys(result, envelopeKeys, `Packaged ${role} ${phase} result`);
  if (
    result.format !== PACKAGED_HOST_CLIENT_RESULT_FORMAT ||
    result.role !== role ||
    result.phase !== phase ||
    result.run_id !== runId
  ) {
    throw new Error(`Packaged ${role} ${phase} result identity is invalid.`);
  }
  if (result.status === "fail") {
    const step = typeof result.step === "string" ? result.step : "unknown";
    const message =
      typeof result.message === "string" ? result.message : "unknown failure";
    const failureKind = result.failure_kind;
    if (
      failureKind !== "scenario" &&
      !(
        failureKind === "port-in-use" &&
        role === "host" &&
        (step === "enable-host-runtime" || step === "wait-host-ready")
      )
    ) {
      throw new Error(`Packaged ${role} ${phase} failure kind is invalid.`);
    }
    throw new PackagedHostClientPhaseError(
      role,
      phase,
      step,
      message,
      failureKind,
    );
  }
  if (result.status !== "pass") {
    throw new Error(
      `Packaged ${role} ${phase} did not record a passing result.`,
    );
  }
  if (role === "host") {
    exactKeys(
      result.completion,
      HOST_COMPLETION_KEYS,
      `Packaged Host ${phase} completion`,
    );
    const expected = {
      library_id: LIBRARY_ID,
      spool_id: SPOOL_ID,
      listen_port: port,
      pairing_issued: phase === "generation-1",
    };
    if (
      HOST_COMPLETION_KEYS.some(
        (key) => result.completion[key] !== expected[key],
      )
    ) {
      throw new Error(`Packaged Host ${phase} completion is invalid.`);
    }
    return result.completion;
  }
  if (phase === "cleanup") {
    exactKeys(
      result.completion,
      ["auth_cleared"],
      "Packaged Client cleanup completion",
    );
    if (result.completion.auth_cleared !== true) {
      throw new Error("Packaged Client cleanup did not clear authentication.");
    }
    return result.completion;
  }
  exactKeys(
    result.completion,
    CLIENT_COMPLETION_KEYS,
    `Packaged Client ${phase} completion`,
  );
  const generation =
    phase === "pair"
      ? finiteInteger(
          result.completion.target_generation,
          "Client target generation",
          {
            minimum: 1,
          },
        )
      : finiteInteger(targetGeneration, "Expected Client target generation", {
          minimum: 1,
        });
  const expected = expectedClientCompletion(phase, generation);
  if (
    CLIENT_COMPLETION_KEYS.some(
      (key) => result.completion[key] !== expected[key],
    )
  ) {
    throw new Error(`Packaged Client ${phase} completion is invalid.`);
  }
  return result.completion;
}

export function resolvePackagedHostClientPhaseCompletion({
  context,
  role,
  phase,
  port,
  targetGeneration,
  exit,
}) {
  const resultPath = phaseResultPath(context, role, phase);
  const exitedCleanly = exit.exitCode === 0 && exit.signal === null;
  if (!existsSync(resultPath) && !exitedCleanly) {
    throw new Error(
      role === "host"
        ? `Packaged Host ${phase} did not stop cleanly.`
        : `Packaged Client ${phase} did not exit cleanly.`,
    );
  }
  const completion = validatePackagedHostClientPhaseResult(
    readBoundedJson(
      resultPath,
      `Packaged ${role === "host" ? "Host" : "Client"} ${phase} result`,
    ),
    {
      role,
      phase,
      runId: context.runId,
      port,
      targetGeneration,
    },
  );
  if (!exitedCleanly) {
    throw new Error(
      role === "host"
        ? `Packaged Host ${phase} did not stop cleanly.`
        : `Packaged Client ${phase} did not exit cleanly.`,
    );
  }
  return completion;
}

export async function startPackagedHost({ context, phase, port, attempt = 1 }) {
  const handle = spawnPhase(context, "host", phase, port, attempt);
  try {
    const readyPath = hostReadyPath(context, phase);
    await waitForReadyFile(
      handle,
      readyPath,
      context.launchTimeoutMs,
      `Packaged Host ${phase}`,
    );
    const ready = validatePackagedHostReady(
      readBoundedJson(readyPath, `Packaged Host ${phase} readiness`),
      { context, phase, port },
    );
    return { ...handle, context, phase, port, ready };
  } catch (error) {
    let failure = error;
    let terminationFailure = null;
    if (handle.child.exitCode === null && handle.child.signalCode === null) {
      const terminationLabel = `Packaged Host ${phase} failed-start cleanup`;
      let terminationRequested = false;
      let terminationRequestFailure = null;
      const trackedTerminationRequester = (child, label) => {
        requestPackagedChildForcedTermination(child, label);
        terminationRequested = true;
      };
      const termination = waitForPackagedHostClientChildClose(
        handle.child,
        Math.min(context.launchTimeoutMs, 5_000),
        terminationLabel,
      );
      try {
        trackedTerminationRequester(handle.child, terminationLabel);
      } catch (requestError) {
        terminationRequestFailure = requestError;
        // The waiter still requires a durable process-exit confirmation.
      }
      try {
        await termination;
      } catch (terminationError) {
        terminationFailure = terminationError;
      }
      if (!terminationFailure && !terminationRequested) {
        terminationFailure =
          terminationRequestFailure ??
          new PackagedHostClientTerminationError(
            terminationLabel,
            handle.child,
          );
      }
      if (
        !terminationFailure &&
        failure instanceof PackagedHostClientTerminationError &&
        failure.child === handle.child
      ) {
        failure = new Error(
          `Packaged Host ${phase} did not become ready within ${context.launchTimeoutMs} milliseconds.`,
        );
      }
    }
    const resultPath = phaseResultPath(context, "host", phase);
    if (!terminationFailure && existsSync(resultPath)) {
      try {
        validatePackagedHostClientPhaseResult(
          readBoundedJson(resultPath, `Packaged Host ${phase} result`),
          {
            role: "host",
            phase,
            runId: context.runId,
            port,
          },
        );
      } catch (resultError) {
        failure = resultError;
      }
    }
    await closeRawLogsPreservingFailure(
      context,
      handle.logs,
      terminationFailure ?? failure,
    );
    throw new Error(
      "Packaged Host failed-start cleanup returned unexpectedly.",
    );
  }
}

export async function stopPackagedHost(handle) {
  const stopPath = hostStopPath(handle.context, handle.phase);
  let exit;
  let phaseFailure = null;
  try {
    if (!existsSync(stopPath)) {
      writePrivateFileAtomically(
        stopPath,
        `${JSON.stringify({
          format: PACKAGED_HOST_CLIENT_STOP_FORMAT,
          role: "host",
          phase: handle.phase,
          run_id: handle.context.runId,
        })}\n`,
      );
    }
    exit = await waitForPackagedHostClientChild(
      handle.child,
      handle.context.launchTimeoutMs,
      `Packaged Host ${handle.phase} graceful stop`,
    );
  } catch (error) {
    phaseFailure = error;
  }
  await closeRawLogsPreservingFailure(
    handle.context,
    handle.logs,
    phaseFailure,
  );
  return resolvePackagedHostClientPhaseCompletion({
    context: handle.context,
    role: "host",
    phase: handle.phase,
    port: handle.port,
    exit,
  });
}

export async function runPackagedClient({
  context,
  phase,
  port,
  targetGeneration,
  attempt = 1,
}) {
  const handle = spawnPhase(context, "client", phase, port, attempt);
  let exit;
  let phaseFailure = null;
  try {
    exit = await waitForPackagedHostClientChild(
      handle.child,
      context.launchTimeoutMs,
      `Packaged Client ${phase}`,
    );
  } catch (error) {
    phaseFailure = error;
  }
  await closeRawLogsPreservingFailure(context, handle.logs, phaseFailure);
  return resolvePackagedHostClientPhaseCompletion({
    context,
    role: "client",
    phase,
    port,
    targetGeneration,
    exit,
  });
}

function singleRow(database, sql, parameters, label) {
  const rows = database.prepare(sql).all(...parameters);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one ${label} row, found ${rows.length}.`);
  }
  return rows[0];
}

function settingMap(database, keys) {
  const placeholders = keys.map(() => "?").join(", ");
  return new Map(
    database
      .prepare(
        `SELECT key, value FROM settings WHERE key IN (${placeholders}) ORDER BY key`,
      )
      .all(...keys)
      .map((row) => [row.key, row.value]),
  );
}

function inspectIntegrity(database, label) {
  const quickCheck = database.pragma("quick_check", { simple: true });
  if (quickCheck !== "ok") {
    throw new Error(
      `${label} SQLite quick_check returned ${String(quickCheck)}.`,
    );
  }
  const foreignKeyFailures = database.pragma("foreign_key_check");
  if (foreignKeyFailures.length !== 0) {
    throw new Error(`${label} SQLite foreign_key_check returned rows.`);
  }
  return finiteInteger(
    database.pragma("user_version", { simple: true }),
    `${label} schema`,
    {
      minimum: 1,
    },
  );
}

function inspectCredentialAbsence(database, label) {
  const placeholders = LEGACY_AUTH_SETTING_KEYS.map(() => "?").join(", ");
  const authSettingCount = database
    .prepare(
      `SELECT COUNT(*) AS count FROM settings WHERE key IN (${placeholders})`,
    )
    .get(...LEGACY_AUTH_SETTING_KEYS).count;
  if (authSettingCount !== 0) {
    throw new Error(
      `${label} retained Client authentication metadata in SQLite.`,
    );
  }
  const legacyPrinterCredentialCount = database
    .prepare(
      "SELECT COUNT(*) AS count FROM printers WHERE access_token IS NOT NULL",
    )
    .get().count;
  if (legacyPrinterCredentialCount !== 0) {
    throw new Error(`${label} retained a legacy printer credential in SQLite.`);
  }
}

export function inspectPackagedClientCredentialAbsence(
  { clientDatabasePath },
  databaseFactory = (databasePath, options) =>
    new Database(databasePath, options),
) {
  let client = null;
  let inspectionFailure = null;
  try {
    client = databaseFactory(clientDatabasePath, {
      fileMustExist: true,
      readonly: true,
    });
    const clientSchemaVersion = inspectIntegrity(client, "Client database");
    inspectCredentialAbsence(client, "Client database");
    return { clientSchemaVersion, authSettingCount: 0 };
  } catch (error) {
    inspectionFailure = error;
    throw error;
  } finally {
    if (client) {
      try {
        client.close();
      } catch (error) {
        if (!inspectionFailure) throw error;
      }
    }
  }
}

export function inspectPackagedHostClientDatabases(
  { hostDatabasePath, clientDatabasePath, sensitiveValues = [] },
  { targetGeneration, port },
  databaseFactory = (databasePath, options) =>
    new Database(databasePath, options),
) {
  for (const databasePath of [hostDatabasePath, clientDatabasePath]) {
    for (const candidatePath of [databasePath, `${databasePath}-wal`]) {
      if (!existsSync(candidatePath)) continue;
      const bytes = readFileSync(candidatePath);
      for (const value of sensitiveValues) {
        if (value && bytes.includes(Buffer.from(value, "utf8"))) {
          throw new Error(
            "A packaged Host-Client database retained credential bytes.",
          );
        }
      }
    }
  }
  let host = null;
  let client = null;
  let inspectionFailure = null;
  try {
    host = databaseFactory(hostDatabasePath, {
      fileMustExist: true,
      readonly: true,
    });
    client = databaseFactory(clientDatabasePath, {
      fileMustExist: true,
      readonly: true,
    });
    const hostSchemaVersion = inspectIntegrity(host, "Host database");
    const clientSchemaVersion = inspectIntegrity(client, "Client database");
    const hostSpool = singleRow(
      host,
      "SELECT id, current_weight_g, remaining_g FROM filament_spools WHERE id = ?",
      [SPOOL_ID],
      "Host shared spool",
    );
    const clientSpool = singleRow(
      client,
      "SELECT id, current_weight_g, remaining_g FROM filament_spools WHERE id = ?",
      [SPOOL_ID],
      "Client shadow spool",
    );
    const hostSpoolCount = host
      .prepare("SELECT COUNT(*) AS count FROM filament_spools")
      .get().count;
    const clientSpoolCount = client
      .prepare("SELECT COUNT(*) AS count FROM filament_spools")
      .get().count;
    const hostHistoryRows = host
      .prepare(
        "SELECT event_type, COUNT(*) AS count FROM spool_history_events " +
          "WHERE spool_id = ? GROUP BY event_type ORDER BY event_type",
      )
      .all(SPOOL_ID);
    const clientHistoryRows = client
      .prepare(
        "SELECT event_type, COUNT(*) AS count FROM spool_history_events " +
          "WHERE spool_id = ? GROUP BY event_type ORDER BY event_type",
      )
      .all(SPOOL_ID);
    const expectedHostHistoryRows = [
      { event_type: "CREATED", count: 1 },
      { event_type: "WEIGHT_UPDATED", count: 2 },
    ];
    const expectedClientHistoryRows = [{ event_type: "CREATED", count: 1 }];
    const hostHistoryCount = hostHistoryRows.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const clientHistoryCount = clientHistoryRows.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    if (
      hostSpoolCount !== 1 ||
      hostSpool.current_weight_g !== RECOVERED_WEIGHT_G ||
      hostSpool.remaining_g !== RECOVERED_WEIGHT_G ||
      hostHistoryCount !== 3 ||
      JSON.stringify(hostHistoryRows) !==
        JSON.stringify(expectedHostHistoryRows)
    ) {
      throw new Error(
        "Host database does not contain the exact authoritative mutation state.",
      );
    }
    if (
      clientSpoolCount !== 1 ||
      clientSpool.current_weight_g !== CLIENT_LOCAL_WEIGHT_G ||
      clientSpool.remaining_g !== CLIENT_LOCAL_WEIGHT_G ||
      clientHistoryCount !== 1 ||
      JSON.stringify(clientHistoryRows) !==
        JSON.stringify(expectedClientHistoryRows)
    ) {
      throw new Error("Client database local shadow state changed.");
    }

    const hostSettings = settingMap(host, [
      "library_sync_mode",
      "library_sync_library_id",
    ]);
    if (
      hostSettings.size !== 2 ||
      hostSettings.get("library_sync_mode") !== "HOST" ||
      hostSettings.get("library_sync_library_id") !== LIBRARY_ID
    ) {
      throw new Error("Host authority settings are invalid.");
    }
    const clientTargetKeys = [
      "library_sync_mode",
      "library_sync_library_id",
      "library_sync_host_base_url",
      "library_sync_target_generation",
    ];
    const clientSettings = settingMap(client, clientTargetKeys);
    if (
      clientSettings.size !== clientTargetKeys.length ||
      clientSettings.get("library_sync_mode") !== "CLIENT" ||
      clientSettings.get("library_sync_library_id") !== LIBRARY_ID ||
      clientSettings.get("library_sync_host_base_url") !==
        `http://127.0.0.1:${port}` ||
      clientSettings.get("library_sync_target_generation") !==
        String(targetGeneration)
    ) {
      throw new Error("Client target settings are invalid.");
    }
    const cacheSettings = client
      .prepare(
        "SELECT key, value FROM settings WHERE key LIKE 'library_sync_cached_%' ORDER BY key",
      )
      .all();
    const spoolCacheSettings = cacheSettings.filter(
      ({ key }) => key === "library_sync_cached_spools_json",
    );
    if (spoolCacheSettings.length !== 1) {
      throw new Error(
        "Client must retain exactly one target-scoped spool cache.",
      );
    }
    let cache;
    try {
      cache = JSON.parse(spoolCacheSettings[0].value);
    } catch {
      throw new Error("Client spool cache is not valid JSON.");
    }
    if (
      !cache ||
      typeof cache.captured_at !== "string" ||
      !cache.captured_at.trim() ||
      !Array.isArray(cache.rows) ||
      cache.rows.length !== 1 ||
      cache.rows[0]?.spool?.id !== SPOOL_ID ||
      cache.rows[0]?.spool?.current_weight_g !== RECOVERED_WEIGHT_G ||
      cache.rows[0]?.spool?.remaining_g !== RECOVERED_WEIGHT_G
    ) {
      throw new Error(
        "Client spool cache does not contain the recovered Host row.",
      );
    }
    inspectCredentialAbsence(host, "Host database");
    inspectCredentialAbsence(client, "Client database");

    return {
      hostSchemaVersion,
      clientSchemaVersion,
      hostWeightG: hostSpool.current_weight_g,
      clientLocalWeightG: clientSpool.current_weight_g,
      cacheWeightG: cache.rows[0].spool.current_weight_g,
      targetGeneration,
      hostHistoryCount,
      clientHistoryCount,
      hostSpoolCount,
      clientSpoolCount,
      cacheSettingCount: spoolCacheSettings.length,
      authSettingCount: 0,
    };
  } catch (error) {
    inspectionFailure = error;
    throw error;
  } finally {
    let closeFailure = null;
    for (const database of [client, host]) {
      if (!database) continue;
      try {
        database.close();
      } catch (error) {
        closeFailure ??= error;
      }
    }
    if (closeFailure && !inspectionFailure) throw closeFailure;
  }
}

function safeFailureMessage(error, sensitiveValues = []) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [...sensitiveValues].sort(
    (left, right) => right.length - left.length,
  )) {
    if (value) message = message.replaceAll(value, "[REDACTED]");
  }
  return (
    message
      .replaceAll(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]")
      .replaceAll(
        /[?&](?:token|pairing_token|device_token)=[^&\s]+/gi,
        "[REDACTED]",
      )
      .replaceAll(/[\u0000-\u001f\u007f]/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 1_000) || "Unknown packaged Host-Client E2E failure"
  );
}

function writeSummary(logDirectory, summary) {
  const summaryPath = path.join(logDirectory, "summary.json");
  writePrivateFileAtomically(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return summaryPath;
}

export async function forceStopHost(
  handle,
  timeoutMs = Math.min(handle?.context?.launchTimeoutMs ?? 10_000, 10_000),
  terminationConfirmationTimeoutMs = 5_000,
  terminationRequester = requestPackagedChildForcedTermination,
) {
  if (!handle) return;
  if (!handle.child) {
    if (handle.logs) await closeRawLogs(handle.context, handle.logs);
    throw new Error("Packaged Host cleanup handle is invalid.");
  }
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
    await closeRawLogs(handle.context, handle.logs);
    return;
  }
  const terminationLabel = `Packaged Host ${handle.phase} forced cleanup`;
  let terminationRequested = false;
  let terminationRequestFailure = null;
  const trackedTerminationRequester = (child, label) => {
    terminationRequester(child, label);
    terminationRequested = true;
  };
  const termination = waitForPackagedHostClientChildClose(
    handle.child,
    Math.min(timeoutMs, terminationConfirmationTimeoutMs),
    terminationLabel,
  );
  try {
    trackedTerminationRequester(handle.child, terminationLabel);
  } catch (requestError) {
    terminationRequestFailure = requestError;
    // The waiter still requires a durable process-exit confirmation.
  }
  let terminationFailure = null;
  try {
    await termination;
  } catch (error) {
    terminationFailure = error;
  }
  if (!terminationFailure && !terminationRequested) {
    terminationFailure =
      terminationRequestFailure ??
      new PackagedHostClientTerminationError(terminationLabel, handle.child);
  }
  let logFailure = null;
  try {
    await closeRawLogs(handle.context, handle.logs);
  } catch (error) {
    logFailure = error;
  }
  if (terminationFailure) {
    throw logFailure
      ? preservePrimaryFailure(terminationFailure, logFailure)
      : terminationFailure;
  }
  if (logFailure) throw logFailure;
}

function validateLoopbackPort(port) {
  finiteInteger(port, "Loopback port", { minimum: 1_024 });
  if (port > 65_535) {
    throw new Error("Loopback port is outside the TCP range.");
  }
  return port;
}

function clearHostPhaseCoordination(context, phase) {
  for (const filePath of [
    hostReadyPath(context, phase),
    hostStopPath(context, phase),
    phaseResultPath(context, "host", phase),
  ]) {
    rmSync(filePath, { force: true, recursive: true });
  }
}

async function resetGenerationOneHostDatabase(context) {
  for (const filePath of [
    context.hostDatabasePath,
    `${context.hostDatabasePath}-wal`,
    `${context.hostDatabasePath}-shm`,
    `${context.hostDatabasePath}-journal`,
  ]) {
    rmSync(filePath, { force: true, recursive: true });
  }
  writePrivateFile(context.hostDatabasePath, "");
  await securePrivateQaArtifact(context.hostDatabasePath);
  assertPrivateUnixMode(
    context.hostDatabasePath,
    0o600,
    "QA private Host database",
  );
}

function retryableHostPortStep(error, phase) {
  return (
    error instanceof PackagedHostClientPhaseError &&
    error.role === "host" &&
    error.phase === phase &&
    error.failureKind === "port-in-use" &&
    (error.step === "enable-host-runtime" || error.step === "wait-host-ready")
  );
}

async function startHostWithPortRetry({
  context,
  phase,
  port,
  startHost,
  selectPort,
  retryDelay,
}) {
  let selectedPort = validateLoopbackPort(port);
  for (let attempt = 1; attempt <= HOST_PORT_START_ATTEMPTS; attempt += 1) {
    try {
      return {
        handle: await startHost({
          context,
          phase,
          port: selectedPort,
          attempt,
        }),
        port: selectedPort,
      };
    } catch (error) {
      if (
        !retryableHostPortStep(error, phase) ||
        attempt === HOST_PORT_START_ATTEMPTS
      ) {
        throw error;
      }
      clearHostPhaseCoordination(context, phase);
      if (phase === "generation-1") {
        await resetGenerationOneHostDatabase(context);
        selectedPort = validateLoopbackPort(await selectPort());
      } else {
        await retryDelay(HOST_PORT_RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(`Packaged Host ${phase} exhausted its startup attempts.`);
}

function existingCleanupCompletion(context, port) {
  const resultPath = phaseResultPath(context, "client", "cleanup");
  if (!existsSync(resultPath)) return null;
  try {
    return validatePackagedHostClientPhaseResult(
      readBoundedJson(resultPath, "Retained Client cleanup result"),
      {
        role: "client",
        phase: "cleanup",
        runId: context.runId,
        port,
      },
    );
  } catch (error) {
    if (error instanceof PackagedHostClientPhaseError) return null;
    throw error;
  }
}

function nextCleanupAttempt(context) {
  for (let attempt = 2; attempt <= 100; attempt += 1) {
    const rawPaths = rawLogPaths(context, "client", "cleanup", attempt);
    const publishedPaths = Object.values(rawPaths).map((filePath) =>
      path.join(context.logDirectory, path.basename(filePath)),
    );
    if (
      [...Object.values(rawPaths), ...publishedPaths].every(
        (filePath) => !existsSync(filePath),
      )
    ) {
      return attempt;
    }
  }
  throw new Error("No private Client credential-cleanup attempt slot is free.");
}

function writeCredentialCleanupSummary(context, summary) {
  writePrivateFileAtomically(
    context.credentialCleanupSummaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

function writeCredentialCleanupPendingPort(context, port) {
  const listenPort = validateLoopbackPort(port);
  writePrivateFileAtomically(
    context.credentialCleanupPendingPath,
    `${JSON.stringify({
      format: CREDENTIAL_CLEANUP_PENDING_FORMAT,
      run_id: context.runId,
      listen_port: listenPort,
    })}\n`,
  );
  context.credentialCleanupPending = {
    format: CREDENTIAL_CLEANUP_PENDING_FORMAT,
    run_id: context.runId,
    listen_port: listenPort,
  };
  return listenPort;
}

export async function resumePackagedHostClientCredentialCleanup(
  options,
  dependencies = {},
) {
  if (options?.processTerminationConfirmed !== true) {
    throw new Error(
      "Credential cleanup resume requires confirmed exact-process termination.",
    );
  }
  const selectPort = dependencies.selectPort ?? selectFreeLoopbackPort;
  const runClient = dependencies.runClient ?? runPackagedClient;
  const inspectCredentials =
    dependencies.inspectCredentials ?? inspectPackagedClientCredentialAbsence;
  const removeWork =
    dependencies.removeWork ?? removePackagedHostClientWorkDirectory;
  let context = null;
  let failure = null;
  try {
    context = validateRetainedPackagedHostClientE2eOptions(options);
    if (context.priorCredentialCleanupSummary) {
      rmSync(context.credentialCleanupSummaryPath, { force: true });
    }
    const retainedPort = context.credentialCleanupPending.listen_port;
    const port =
      retainedPort === null
        ? writeCredentialCleanupPendingPort(
            context,
            validateLoopbackPort(await selectPort()),
          )
        : validateLoopbackPort(retainedPort);
    const staleResultPath = phaseResultPath(context, "client", "cleanup");
    if (existsSync(staleResultPath)) {
      // Validate the exact run/role/phase identity before removing either a
      // prior pass or fail result. A fresh Client must always re-check the
      // secure store after the outer wrapper confirms every old process died.
      existingCleanupCompletion(context, port);
      rmSync(staleResultPath, { force: true });
    }
    const attempt = nextCleanupAttempt(context);
    const cleanup = await runClient({
      context,
      phase: "cleanup",
      port,
      attempt,
    });
    const cleanupLaunch = `attempt-${attempt}`;
    if (cleanup?.auth_cleared !== true) {
      throw new Error("Resumed Client cleanup did not clear authentication.");
    }
    const inspection = inspectCredentials(context);
    const summary = {
      format: PACKAGED_HOST_CLIENT_CREDENTIAL_CLEANUP_SUMMARY_FORMAT,
      status: "pass",
      run_id: context.runId,
      auth_cleared: true,
      auth_setting_count: inspection.authSettingCount,
      client_schema_version: inspection.clientSchemaVersion,
      cleanup_launch: cleanupLaunch,
      process_termination_confirmed: true,
    };
    writeCredentialCleanupSummary(context, summary);
    await removeWork(context.workDirectory);
    return summary;
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    if (
      context?.credentialCleanupSummaryPath &&
      !existsSync(context.credentialCleanupSummaryPath)
    ) {
      try {
        writeCredentialCleanupSummary(context, {
          format: PACKAGED_HOST_CLIENT_CREDENTIAL_CLEANUP_SUMMARY_FORMAT,
          status: "fail",
          run_id: context.runId,
          message: safeFailureMessage(failure, context.sensitiveValues),
          process_termination_confirmed: true,
        });
      } catch {
        // The original cleanup failure remains authoritative and the retained
        // private work directory remains available for controlled inspection.
      }
    }
  }
  throw new Error(safeFailureMessage(failure, context?.sensitiveValues));
}

export async function runPackagedHostClientE2e(options, dependencies = {}) {
  const selectPort = dependencies.selectPort ?? selectFreeLoopbackPort;
  const retryDelay =
    dependencies.retryDelay ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const startHost = dependencies.startHost ?? startPackagedHost;
  const stopHost = dependencies.stopHost ?? stopPackagedHost;
  const forceStop = dependencies.forceStopHost ?? forceStopHost;
  const runClient = dependencies.runClient ?? runPackagedClient;
  const inspectDatabases =
    dependencies.inspectDatabases ?? inspectPackagedHostClientDatabases;
  const removeWork =
    dependencies.removeWork ?? removePackagedHostClientWorkDirectory;
  let context = null;
  let activeHost = null;
  let activeHostStopAttempted = false;
  let activeHostStopFailure = null;
  let selectedPort = null;
  let cleanupStatus = "not-run";
  let failure = null;
  let summary = null;
  const unconfirmedChildren = new Set();
  let hasUnidentifiedUnconfirmedChild = false;
  let hasUnconfirmedClientProcess = false;
  const rememberUnconfirmedChild = (error) => {
    if (!(error instanceof PackagedHostClientTerminationError)) return;
    if (error.child) unconfirmedChildren.add(error.child);
    else hasUnidentifiedUnconfirmedChild = true;
  };
  const forgetConfirmedChild = (child) => {
    if (child) unconfirmedChildren.delete(child);
  };
  const runTrackedClient = async (clientOptions) => {
    try {
      return await runClient(clientOptions);
    } catch (error) {
      if (error instanceof PackagedHostClientTerminationError) {
        hasUnconfirmedClientProcess = true;
        rememberUnconfirmedChild(error);
      }
      throw error;
    }
  };
  const stopActiveHost = async () => {
    const host = activeHost;
    activeHostStopAttempted = true;
    activeHostStopFailure = null;
    try {
      await stopHost(host);
      activeHost = null;
      activeHostStopAttempted = false;
    } catch (error) {
      activeHostStopFailure = error;
      rememberUnconfirmedChild(error);
      throw error;
    }
  };
  try {
    context = await preparePackagedHostClientE2eRun(options);
    selectedPort = validateLoopbackPort(await selectPort());
    writeCredentialCleanupPendingPort(context, selectedPort);
    const firstHost = await startHostWithPortRetry({
      context,
      phase: "generation-1",
      port: selectedPort,
      startHost,
      selectPort,
      retryDelay,
    });
    activeHost = firstHost.handle;
    selectedPort = firstHost.port;
    writeCredentialCleanupPendingPort(context, selectedPort);
    const pair = await runTrackedClient({
      context,
      phase: "pair",
      port: selectedPort,
    });
    const targetGeneration = pair.target_generation;
    await stopActiveHost();

    await runTrackedClient({
      context,
      phase: "offline",
      port: selectedPort,
      targetGeneration,
    });

    const restartedHost = await startHostWithPortRetry({
      context,
      phase: "generation-2",
      port: selectedPort,
      startHost,
      selectPort,
      retryDelay,
    });
    activeHost = restartedHost.handle;
    const recover = await runTrackedClient({
      context,
      phase: "recover",
      port: selectedPort,
      targetGeneration,
    });
    await stopActiveHost();

    const databaseState = inspectDatabases(context, {
      targetGeneration,
      port: selectedPort,
    });
    summary = {
      format: PACKAGED_HOST_CLIENT_SUMMARY_FORMAT,
      status: "pass",
      run_id: context.runId,
      phases: [
        "host-generation-1",
        "client-pair",
        "client-offline",
        "host-generation-2",
        "client-recover",
      ],
      library_id: LIBRARY_ID,
      spool_id: SPOOL_ID,
      host_schema_version: databaseState.hostSchemaVersion,
      client_schema_version: databaseState.clientSchemaVersion,
      host_weight_g: databaseState.hostWeightG,
      client_local_weight_g: databaseState.clientLocalWeightG,
      cache_weight_g: databaseState.cacheWeightG,
      target_generation: databaseState.targetGeneration,
      host_history_count: databaseState.hostHistoryCount,
      client_history_count: databaseState.clientHistoryCount,
      cache_setting_count: databaseState.cacheSettingCount,
      auth_setting_count: databaseState.authSettingCount,
      session_renewed: recover.session_renewed,
      auth_cleared: recover.auth_cleared,
      auth_cleanup: cleanupStatus,
    };
  } catch (error) {
    rememberUnconfirmedChild(error);
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (activeHost) {
      let stopError = activeHostStopFailure;
      if (!activeHostStopAttempted) {
        try {
          await stopHost(activeHost);
          forgetConfirmedChild(activeHost.child);
        } catch (error) {
          stopError = error;
          rememberUnconfirmedChild(error);
        }
      }
      if (stopError) {
        if (stopError instanceof PackagedHostClientTerminationError) {
          // The ordinary stop waiter already requested forced termination. A
          // second signal could target a recycled numeric PID after the first
          // process exited without delivering its close event.
          failure = new Error("Packaged Host-Client E2E Host cleanup failed.");
        } else {
          try {
            await forceStop(activeHost);
            forgetConfirmedChild(activeHost.child);
          } catch (forceStopError) {
            rememberUnconfirmedChild(forceStopError);
            failure = new Error(
              "Packaged Host-Client E2E Host cleanup failed.",
            );
          }
        }
      }
      activeHost = null;
    }
    const canLaunchCredentialCleanup = !hasUnconfirmedClientProcess;
    if (
      canLaunchCredentialCleanup &&
      context?.clientDatabasePath &&
      existsSync(context.clientDatabasePath)
    ) {
      try {
        const cleanupPort = selectedPort ?? (await selectPort());
        const cleanup = await runTrackedClient({
          context,
          phase: "cleanup",
          port: cleanupPort,
        });
        cleanupStatus = cleanup.auth_cleared ? "pass" : "failed";
      } catch (cleanupError) {
        cleanupStatus = "failed";
        rememberUnconfirmedChild(cleanupError);
        if (!failure) {
          failure =
            cleanupError instanceof Error
              ? cleanupError
              : new Error(String(cleanupError));
        }
      }
    } else if (!canLaunchCredentialCleanup) {
      // Starting another Client against the same database and credential scope
      // is unsafe while an earlier process may still be alive. Preserve the
      // private work directory for inspection and leave cleanup fail-closed.
      cleanupStatus = "skipped-unconfirmed-process";
    }
    if (cleanupStatus !== "pass" && !failure) {
      failure = new Error(
        "Packaged Host-Client E2E credential cleanup did not pass.",
      );
    }
    let summaryWriteFailed = false;
    try {
      if (context?.logDirectory && existsSync(context.logDirectory)) {
        if (failure) {
          summary = {
            format: PACKAGED_HOST_CLIENT_SUMMARY_FORMAT,
            status: "fail",
            run_id: context.runId,
            message: safeFailureMessage(failure, context.sensitiveValues),
            auth_cleanup: cleanupStatus,
          };
        } else if (summary) {
          summary.phases.push("client-cleanup");
          summary.auth_cleanup = cleanupStatus;
        }
        if (summary) writeSummary(context.logDirectory, summary);
      }
    } catch {
      summaryWriteFailed = true;
    }
    if (summaryWriteFailed && !failure) {
      failure = new Error(
        "Packaged Host-Client E2E summary could not be written.",
      );
    }
    if (!summaryWriteFailed) {
      try {
        if (
          !hasUnidentifiedUnconfirmedChild &&
          unconfirmedChildren.size === 0 &&
          cleanupStatus === "pass" &&
          context?.workDirectory &&
          existsSync(context.workDirectory)
        ) {
          await removeWork(context.workDirectory);
        }
      } catch (cleanupError) {
        const cleanupCode =
          typeof cleanupError?.code === "string"
            ? cleanupError.code
            : "unclassified";
        const cleanupReason =
          WINDOWS_WORK_DIRECTORY_RETRAVERSAL_CODES.has(cleanupCode)
            ? `${cleanupCode} after bounded retries`
            : cleanupCode;
        failure ??= new Error(
          `Packaged Host-Client E2E private work cleanup failed (${cleanupReason}).`,
        );
      }
    }
  }
  if (failure) {
    throw new Error(safeFailureMessage(failure, context?.sensitiveValues));
  }
  return summary;
}

export function packagedHostClientE2eCliOptions(argv) {
  const allowedPrefixes = [
    "--executable=",
    "--work-dir=",
    "--log-dir=",
    "--launch-timeout-ms=",
  ];
  if (
    argv.some(
      (argument) =>
        argument !== "--resume-credential-cleanup" &&
        !allowedPrefixes.some((prefix) => argument.startsWith(prefix)),
    )
  ) {
    throw new Error(
      "Usage: node scripts/run-packaged-host-client-e2e.mjs " +
        "--executable=<installed-app-executable> --work-dir=<private-directory> " +
        "--log-dir=<private-log-directory> [--launch-timeout-ms=120000] " +
        "[--resume-credential-cleanup]",
    );
  }
  const value = (prefix) =>
    argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const timeout = value("--launch-timeout-ms=");
  return {
    executablePath: value("--executable="),
    workDirectory: value("--work-dir="),
    logDirectory: value("--log-dir="),
    launchTimeoutMs:
      timeout === undefined
        ? DEFAULT_TIMEOUT_MS
        : /^\d+$/.test(timeout)
          ? Number(timeout)
          : Number.NaN,
    resumeCredentialCleanup: argv.includes("--resume-credential-cleanup"),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = packagedHostClientE2eCliOptions(process.argv.slice(2));
    if (options.resumeCredentialCleanup) {
      const result = await resumePackagedHostClientCredentialCleanup({
        ...options,
        processTerminationConfirmed: true,
      });
      console.log(
        `Packaged Host-Client credential cleanup resumed successfully ` +
          `(schema ${result.client_schema_version}).`,
      );
    } else {
      const result = await runPackagedHostClientE2e(options);
      console.log(
        `Packaged Host-Client E2E passed (Host ${result.host_weight_g} g, ` +
          `Client shadow ${result.client_local_weight_g} g).`,
      );
    }
  } catch (error) {
    const failureMessage = `${safeFailureMessage(error)}\n`;
    const forcedExit = setTimeout(() => process.exit(1), 1_000);
    forcedExit.unref();
    process.stderr.write(failureMessage, () => {
      clearTimeout(forcedExit);
      process.exit(1);
    });
  }
}
