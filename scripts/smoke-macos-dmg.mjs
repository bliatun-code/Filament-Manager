#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { smokeReleaseDatabaseUpgrade } from "./smoke-release-database-upgrade.mjs";
import {
  parseCodesignDetails,
  validateCodesignDetails,
  validateLocalCodesignDetails,
} from "./verify-macos-release.mjs";

const WINDOW_HELPER_PATH = fileURLToPath(
  new URL("./macos-window-info.swift", import.meta.url),
);
const DEFAULT_LAUNCH_TIMEOUT_MS = 90_000;
const MINIMUM_LAUNCH_TIMEOUT_MS = 10_000;
const MAXIMUM_LAUNCH_TIMEOUT_MS = 300_000;
const DEFAULT_SIGNATURE_POLICY = "release";
const SIGNATURE_POLICIES = new Set(["release", "local-adhoc"]);
const STAGING_DIRECTORY_PREFIX = ".filament-manager-release-smoke-";
const RUNTIME_LOG_FILES = Object.freeze({
  appStderrPath: "app-stderr.log",
  appStdoutPath: "app-stdout.log",
  launcherStderrPath: "launchservices-stderr.log",
  launcherStdoutPath: "launchservices-stdout.log",
});
const REQUIRED_DATABASE_TABLES = [
  "filament_master_list",
  "filament_spools",
  "settings",
];

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(
      `${commandText(command, args)} failed with status ${result.status}.` +
        (output ? `\n${output}` : ""),
    );
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function currentSchemaVersion() {
  const source = readFileSync(
    path.resolve("src", "backend", "database_schema.rs"),
    "utf8",
  );
  const match = source.match(
    /CURRENT_SCHEMA_VERSION\s*:\s*i64\s*=\s*(\d+)\s*;/,
  );
  if (!match?.[1]) {
    throw new Error("Could not read CURRENT_SCHEMA_VERSION.");
  }
  return Number.parseInt(match[1], 10);
}

export function validateMacosDmgSmokeOptions({
  dmgPath,
  expectedTeamId,
  launchTimeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
  logDirectory,
  signaturePolicy = DEFAULT_SIGNATURE_POLICY,
  upgradeFixturePath = null,
  upgradeSourceRelease = null,
}) {
  if (typeof dmgPath !== "string" || dmgPath.trim().length === 0) {
    throw new Error("A macOS DMG path is required.");
  }
  if (typeof logDirectory !== "string" || logDirectory.trim().length === 0) {
    throw new Error("A log directory is required.");
  }
  if (
    !Number.isSafeInteger(launchTimeoutMs) ||
    launchTimeoutMs < MINIMUM_LAUNCH_TIMEOUT_MS ||
    launchTimeoutMs > MAXIMUM_LAUNCH_TIMEOUT_MS
  ) {
    throw new Error(
      `Launch timeout must be an integer from ${MINIMUM_LAUNCH_TIMEOUT_MS} ` +
        `to ${MAXIMUM_LAUNCH_TIMEOUT_MS} milliseconds.`,
    );
  }
  if (!SIGNATURE_POLICIES.has(signaturePolicy)) {
    throw new Error(
      `Signature policy must be one of: ${[...SIGNATURE_POLICIES].join(", ")}.`,
    );
  }
  const normalizedExpectedTeamId =
    typeof expectedTeamId === "string" ? expectedTeamId.trim() : "";
  if (signaturePolicy === "release" && !normalizedExpectedTeamId) {
    throw new Error(
      "An expected Apple Team ID is required for the release signature policy.",
    );
  }
  if (signaturePolicy === "local-adhoc" && normalizedExpectedTeamId) {
    throw new Error(
      "An expected Apple Team ID cannot be used with the local ad-hoc signature policy.",
    );
  }
  const normalizedUpgradeFixturePath =
    typeof upgradeFixturePath === "string" ? upgradeFixturePath.trim() : "";
  const normalizedUpgradeSourceRelease =
    typeof upgradeSourceRelease === "string"
      ? upgradeSourceRelease.trim()
      : "";
  if (
    Boolean(normalizedUpgradeFixturePath) !==
    Boolean(normalizedUpgradeSourceRelease)
  ) {
    throw new Error(
      "The upgrade fixture path and source release must be provided together.",
    );
  }
  return {
    dmgPath: path.resolve(dmgPath),
    expectedTeamId: normalizedExpectedTeamId || null,
    launchTimeoutMs,
    logDirectory: path.resolve(logDirectory),
    signaturePolicy,
    upgradeFixturePath: normalizedUpgradeFixturePath
      ? path.resolve(normalizedUpgradeFixturePath)
      : null,
    upgradeSourceRelease: normalizedUpgradeSourceRelease || null,
  };
}

export function macosLaunchServicesArguments({
  appPath,
  databasePath,
  stderrPath,
  stdoutPath,
}) {
  return [
    "-n",
    "-W",
    "--env",
    `FILAMENT_MANAGER_DB_PATH=${databasePath}`,
    "--stdout",
    stdoutPath,
    "--stderr",
    stderrPath,
    appPath,
  ];
}

export function macosDmgInstallCommand(mountedAppPath, installedAppPath) {
  return {
    args: [mountedAppPath, installedAppPath],
    command: "ditto",
  };
}

export function resolveMacosDmgSmokeStagingPaths({
  homeDirectory = homedir(),
} = {}) {
  if (
    typeof homeDirectory !== "string" ||
    homeDirectory.trim().length === 0 ||
    !path.isAbsolute(homeDirectory)
  ) {
    throw new Error("The macOS smoke staging home must be an absolute path.");
  }
  const resolvedHomeDirectory = path.resolve(homeDirectory);
  if (resolvedHomeDirectory === path.parse(resolvedHomeDirectory).root) {
    throw new Error("The macOS smoke staging home cannot be a filesystem root.");
  }
  const applicationsDirectory = path.join(
    resolvedHomeDirectory,
    "Applications",
  );
  return {
    applicationsDirectory,
    homeDirectory: resolvedHomeDirectory,
    stagingPrefix: path.join(
      applicationsDirectory,
      STAGING_DIRECTORY_PREFIX,
    ),
  };
}

function assertRealDirectory(directoryPath, label) {
  const stats = lstatSync(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symbolic link.`);
  }
  return stats;
}

function directoryIdentity(stats) {
  return { device: stats.dev, inode: stats.ino };
}

function assertDirectoryIdentity(stats, expectedIdentity, label) {
  if (
    stats.dev !== expectedIdentity.device ||
    stats.ino !== expectedIdentity.inode
  ) {
    throw new Error(`${label} changed after the smoke staging was created.`);
  }
}

function assertStagingDirectory(context) {
  const expectedPaths = resolveMacosDmgSmokeStagingPaths({
    homeDirectory: context.homeDirectory,
  });
  if (
    context.applicationsDirectory !== expectedPaths.applicationsDirectory ||
    path.dirname(context.stagingDirectory) !==
      expectedPaths.applicationsDirectory ||
    !path.basename(context.stagingDirectory).startsWith(
      STAGING_DIRECTORY_PREFIX,
    )
  ) {
    throw new Error(
      "The macOS smoke staging directory is outside the resolved user Applications directory.",
    );
  }
  const applicationsStats = assertRealDirectory(
    context.applicationsDirectory,
    "The user Applications directory",
  );
  assertDirectoryIdentity(
    applicationsStats,
    context.applicationsIdentity,
    "The user Applications directory",
  );
  const stagingStats = assertRealDirectory(
    context.stagingDirectory,
    "The macOS smoke staging directory",
  );
  assertDirectoryIdentity(
    stagingStats,
    context.stagingIdentity,
    "The macOS smoke staging directory",
  );
  if ((stagingStats.mode & 0o777) !== 0o700) {
    throw new Error("The macOS smoke staging directory must use mode 0700.");
  }
  if (
    path.dirname(realpathSync(context.stagingDirectory)) !==
    realpathSync(context.applicationsDirectory)
  ) {
    throw new Error(
      "The macOS smoke staging directory does not resolve inside the user Applications directory.",
    );
  }
}

export function validateMacosDmgSmokeStaging(context) {
  const homeStats = assertRealDirectory(
    context.homeDirectory,
    "The macOS smoke staging home",
  );
  assertDirectoryIdentity(
    homeStats,
    context.homeIdentity,
    "The macOS smoke staging home",
  );
  assertStagingDirectory(context);
  return context.stagingDirectory;
}

export function createMacosDmgSmokeStaging(options = {}) {
  const paths = resolveMacosDmgSmokeStagingPaths(options);
  const homeStats = assertRealDirectory(
    paths.homeDirectory,
    "The macOS smoke staging home",
  );
  const canonicalHomeDirectory = realpathSync(paths.homeDirectory);
  let applicationsDirectoryCreated = false;
  if (!existsSync(paths.applicationsDirectory)) {
    mkdirSync(paths.applicationsDirectory, { mode: 0o700 });
    applicationsDirectoryCreated = true;
  }
  const applicationsStats = assertRealDirectory(
    paths.applicationsDirectory,
    "The user Applications directory",
  );
  if (
    path.dirname(realpathSync(paths.applicationsDirectory)) !==
    canonicalHomeDirectory
  ) {
    throw new Error(
      "The user Applications directory does not resolve directly inside the staging home.",
    );
  }
  const stagingDirectory = mkdtempSync(paths.stagingPrefix);
  chmodSync(stagingDirectory, 0o700);
  const stagingStats = assertRealDirectory(
    stagingDirectory,
    "The macOS smoke staging directory",
  );
  const context = {
    applicationsDirectory: paths.applicationsDirectory,
    applicationsDirectoryCreated,
    applicationsIdentity: directoryIdentity(applicationsStats),
    homeDirectory: paths.homeDirectory,
    homeIdentity: directoryIdentity(homeStats),
    stagingDirectory,
    stagingIdentity: directoryIdentity(stagingStats),
  };
  validateMacosDmgSmokeStaging(context);
  return context;
}

export function cleanupMacosDmgSmokeStaging(context) {
  validateMacosDmgSmokeStaging(context);
  rmSync(context.stagingDirectory, { recursive: true });
  if (existsSync(context.stagingDirectory)) {
    throw new Error("The macOS smoke staging directory was not removed.");
  }
  if (context.applicationsDirectoryCreated) {
    const applicationsStats = assertRealDirectory(
      context.applicationsDirectory,
      "The user Applications directory",
    );
    assertDirectoryIdentity(
      applicationsStats,
      context.applicationsIdentity,
      "The user Applications directory",
    );
    try {
      rmdirSync(context.applicationsDirectory);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) {
        throw error;
      }
    }
  }
}

function isPathInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..")
  );
}

export function resolveMacosDmgSmokeLogPaths({
  logDirectory,
  runtimeDirectory,
}) {
  for (const [label, directoryPath] of [
    ["requested log", logDirectory],
    ["runtime", runtimeDirectory],
  ]) {
    if (
      typeof directoryPath !== "string" ||
      directoryPath.trim().length === 0 ||
      !path.isAbsolute(directoryPath)
    ) {
      throw new Error(`The macOS smoke ${label} directory must be absolute.`);
    }
  }
  const requestedLogDirectory = path.resolve(logDirectory);
  const resolvedRuntimeDirectory = path.resolve(runtimeDirectory);
  if (
    isPathInside(requestedLogDirectory, resolvedRuntimeDirectory) ||
    isPathInside(resolvedRuntimeDirectory, requestedLogDirectory)
  ) {
    throw new Error(
      "The macOS smoke runtime and requested log directories must be separate trees.",
    );
  }
  const runtimeLogDirectory = path.join(
    resolvedRuntimeDirectory,
    "runtime-logs",
  );
  const runtimePaths = {};
  const requestedPaths = {};
  for (const [key, fileName] of Object.entries(RUNTIME_LOG_FILES)) {
    runtimePaths[key] = path.join(runtimeLogDirectory, fileName);
    requestedPaths[key] = path.join(requestedLogDirectory, fileName);
  }
  return {
    requestedLogDirectory,
    requestedPaths,
    runtimeLogDirectory,
    runtimePaths,
    summaryPath: path.join(requestedLogDirectory, "smoke-summary.txt"),
  };
}

function assertPrivateRegularFile(filePath, label) {
  const stats = lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real regular file.`);
  }
  if ((stats.mode & 0o777) !== 0o600) {
    throw new Error(`${label} must use mode 0600.`);
  }
  return stats;
}

export function initializeMacosDmgSmokeRuntimeLogs(logPaths) {
  mkdirSync(logPaths.runtimeLogDirectory, { mode: 0o700 });
  const runtimeLogDirectoryStats = assertRealDirectory(
    logPaths.runtimeLogDirectory,
    "The macOS smoke runtime log directory",
  );
  if ((runtimeLogDirectoryStats.mode & 0o777) !== 0o700) {
    throw new Error("The macOS smoke runtime log directory must use mode 0700.");
  }
  for (const runtimePath of Object.values(logPaths.runtimePaths)) {
    const descriptor = openSync(runtimePath, "wx", 0o600);
    closeSync(descriptor);
    assertPrivateRegularFile(runtimePath, "A macOS smoke runtime log");
  }
}

function assertSafeRequestedLogDirectory(logDirectory) {
  const stats = assertRealDirectory(
    logDirectory,
    "The requested macOS smoke log directory",
  );
  return directoryIdentity(stats);
}

function assertSafeLogDestination(destinationPath) {
  if (!Object.values(RUNTIME_LOG_FILES).includes(path.basename(destinationPath))) {
    throw new Error("The macOS smoke log destination has an unexpected filename.");
  }
  if (existsSync(destinationPath)) {
    const stats = lstatSync(destinationPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(
        `Refusing to replace a non-regular macOS smoke log: ${destinationPath}`,
      );
    }
  }
}

export function publishMacosDmgSmokeLogFile({
  destinationPath,
  sourcePath,
}) {
  assertPrivateRegularFile(sourcePath, "The macOS smoke runtime log");
  const destinationDirectory = path.dirname(destinationPath);
  const destinationDirectoryIdentity = assertSafeRequestedLogDirectory(
    destinationDirectory,
  );
  assertSafeLogDestination(destinationPath);
  const temporaryPath = path.join(
    destinationDirectory,
    `.${path.basename(destinationPath)}.${randomUUID()}.tmp`,
  );
  try {
    copyFileSync(sourcePath, temporaryPath, fsConstants.COPYFILE_EXCL);
    chmodSync(temporaryPath, 0o600);
    assertPrivateRegularFile(temporaryPath, "The temporary macOS smoke log");
    assertDirectoryIdentity(
      assertRealDirectory(
        destinationDirectory,
        "The requested macOS smoke log directory",
      ),
      destinationDirectoryIdentity,
      "The requested macOS smoke log directory",
    );
    assertSafeLogDestination(destinationPath);
    renameSync(temporaryPath, destinationPath);
    assertPrivateRegularFile(destinationPath, "The published macOS smoke log");
  } finally {
    if (existsSync(temporaryPath)) {
      rmSync(temporaryPath, { force: true });
    }
  }
}

export function publishMacosDmgSmokeRuntimeLogs(logPaths) {
  const publishedPaths = [];
  const publishErrors = [];
  for (const key of Object.keys(RUNTIME_LOG_FILES)) {
    try {
      publishMacosDmgSmokeLogFile({
        destinationPath: logPaths.requestedPaths[key],
        sourcePath: logPaths.runtimePaths[key],
      });
      publishedPaths.push(logPaths.requestedPaths[key]);
    } catch (error) {
      publishErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  if (publishErrors.length > 0) {
    throw new AggregateError(
      publishErrors,
      "One or more macOS smoke runtime logs could not be published.",
    );
  }
  return publishedPaths;
}

function writeAtomicPrivateTextFile(destinationPath, contents) {
  const destinationDirectory = path.dirname(destinationPath);
  const directoryIdentityBeforeWrite = assertSafeRequestedLogDirectory(
    destinationDirectory,
  );
  if (existsSync(destinationPath)) {
    const stats = lstatSync(destinationPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(
        `Refusing to replace a non-regular macOS smoke summary: ${destinationPath}`,
      );
    }
  }
  const temporaryPath = path.join(
    destinationDirectory,
    `.${path.basename(destinationPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(temporaryPath, 0o600);
    assertPrivateRegularFile(temporaryPath, "The temporary macOS smoke summary");
    assertDirectoryIdentity(
      assertRealDirectory(
        destinationDirectory,
        "The requested macOS smoke log directory",
      ),
      directoryIdentityBeforeWrite,
      "The requested macOS smoke log directory",
    );
    renameSync(temporaryPath, destinationPath);
    assertPrivateRegularFile(
      destinationPath,
      "The published macOS smoke summary",
    );
  } finally {
    if (existsSync(temporaryPath)) {
      rmSync(temporaryPath, { force: true });
    }
  }
}

function findMountedApp(mountPoint) {
  const appNames = readdirSync(mountPoint).filter((name) => name.endsWith(".app"));
  if (appNames.length !== 1) {
    throw new Error(`Expected exactly one app in the DMG; found ${appNames.length}.`);
  }
  const applicationsLink = path.join(mountPoint, "Applications");
  if (readlinkSync(applicationsLink) !== "/Applications") {
    throw new Error("The DMG Applications link does not target /Applications.");
  }
  const appPath = path.join(mountPoint, appNames[0]);
  const appStat = lstatSync(appPath);
  if (!appStat.isDirectory() || appStat.isSymbolicLink()) {
    throw new Error("The DMG app must be a real application directory.");
  }
  return appPath;
}

export function parseMacosWindowRows(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [processName, title, x, y, width, height, processId] =
        line.split("\t");
      return {
        height: Number.parseInt(height, 10),
        processId: Number.parseInt(processId, 10),
        processName,
        signature: line,
        title,
        width: Number.parseInt(width, 10),
        x: Number.parseInt(x, 10),
        y: Number.parseInt(y, 10),
      };
    })
    .filter(
      (row) =>
        row.processName &&
        Number.isSafeInteger(row.processId) &&
        row.processId > 0 &&
        Number.isFinite(row.width) &&
        Number.isFinite(row.height),
    );
}

function nativeHelperEnvironment(moduleCachePath) {
  return {
    ...process.env,
    CLANG_MODULE_CACHE_PATH: path.join(moduleCachePath, "clang"),
    DEVELOPER_DIR:
      process.env.DEVELOPER_DIR ??
      "/Applications/Xcode.app/Contents/Developer",
    SWIFT_MODULECACHE_PATH: path.join(moduleCachePath, "swift"),
  };
}

function listApplicationWindows(
  expectedProcessName,
  expectedProcessId,
  moduleCachePath,
) {
  mkdirSync(moduleCachePath, { mode: 0o700, recursive: true });
  return parseMacosWindowRows(
    runCommand("swift", [WINDOW_HELPER_PATH, "list"], {
      env: nativeHelperEnvironment(moduleCachePath),
    }).stdout,
  ).filter(
    (row) =>
      row.processId === expectedProcessId &&
      row.processName === expectedProcessName &&
      row.width >= 320 &&
      row.height >= 240,
  );
}

export function parseMacosRunningApplicationRows(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        processId,
        bundleIdentifier,
        bundlePath,
        executablePath,
        processName,
      ] = line.split("\t");
      return {
        bundleIdentifier,
        bundlePath,
        executablePath,
        processId: Number.parseInt(processId, 10),
        processName,
      };
    })
    .filter(
      (row) =>
        Number.isSafeInteger(row.processId) &&
        row.processId > 0 &&
        row.bundleIdentifier &&
        row.bundlePath &&
        row.executablePath,
    );
}

function canonicalPathCandidates(filePath) {
  const candidates = new Set([path.resolve(filePath)]);
  try {
    candidates.add(realpathSync(filePath));
  } catch {
    // The resolved spelling remains useful for fail-closed diagnostics.
  }
  return candidates;
}

export function macosRunningApplicationMatches(
  application,
  { bundleIdentifier, bundlePaths, executablePaths },
) {
  return (
    application.bundleIdentifier === bundleIdentifier &&
    bundlePaths.has(path.resolve(application.bundlePath)) &&
    executablePaths.has(path.resolve(application.executablePath))
  );
}

function listExactApplicationProcesses({
  bundlePaths,
  bundleIdentifier,
  executablePaths,
  moduleCachePath,
}) {
  mkdirSync(moduleCachePath, { mode: 0o700, recursive: true });
  return parseMacosRunningApplicationRows(
    runCommand("swift", [WINDOW_HELPER_PATH, "running-apps"], {
      env: nativeHelperEnvironment(moduleCachePath),
    }).stdout,
  ).filter((application) =>
    macosRunningApplicationMatches(application, {
      bundleIdentifier,
      bundlePaths,
      executablePaths,
    }),
  );
}

function readBundleExecutable(appPath) {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  const executableName = runCommand("plutil", [
    "-extract",
    "CFBundleExecutable",
    "raw",
    infoPlistPath,
  ]).stdout.trim();
  if (
    !executableName ||
    executableName === "." ||
    executableName === ".." ||
    executableName.includes("/") ||
    executableName.includes("\\")
  ) {
    throw new Error("The installed app has an invalid CFBundleExecutable.");
  }
  return path.join(appPath, "Contents", "MacOS", executableName);
}

function verifySmokeDatabase(databasePath, expectedSchemaVersion) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    const quickCheck = database.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") {
      throw new Error(`SQLite quick_check returned ${String(quickCheck)}.`);
    }
    const schemaVersion = database.pragma("user_version", { simple: true });
    if (schemaVersion !== expectedSchemaVersion) {
      throw new Error(
        `Expected database schema ${expectedSchemaVersion}, found ${schemaVersion}.`,
      );
    }
    const availableTables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    const missingTables = REQUIRED_DATABASE_TABLES.filter(
      (table) => !availableTables.has(table),
    );
    if (missingTables.length > 0) {
      throw new Error(
        `Installed app database is missing ${missingTables.join(", ")}.`,
      );
    }
    const foreignKeyFailures = database.pragma("foreign_key_check");
    if (foreignKeyFailures.length > 0) {
      throw new Error(
        `Installed app database has ${foreignKeyFailures.length} ` +
          "foreign-key failure(s).",
      );
    }
    return {
      schemaVersion,
      tableCount: availableTables.size,
    };
  } finally {
    database.close();
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function signalProcess(processId, signal) {
  try {
    process.kill(processId, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

function newlyLaunchedApplicationProcesses({
  bundlePaths,
  bundleIdentifier,
  executablePaths,
  moduleCachePath,
  preexistingProcessIds,
}) {
  return listExactApplicationProcesses({
    bundlePaths,
    bundleIdentifier,
    executablePaths,
    moduleCachePath,
  }).filter((application) => !preexistingProcessIds.has(application.processId));
}

async function stopLaunchedApplicationProcesses(options) {
  let applications = newlyLaunchedApplicationProcesses(options);
  for (const application of applications) {
    signalProcess(application.processId, "SIGTERM");
  }

  let deadline = Date.now() + 10_000;
  while (applications.length > 0 && Date.now() < deadline) {
    await delay(100);
    applications = newlyLaunchedApplicationProcesses(options);
  }
  for (const application of applications) {
    signalProcess(application.processId, "SIGKILL");
  }

  deadline = Date.now() + 5_000;
  while (applications.length > 0 && Date.now() < deadline) {
    await delay(100);
    applications = newlyLaunchedApplicationProcesses(options);
  }
  if (applications.length > 0) {
    throw new Error(
      `Could not stop installed application process(es): ` +
        `${applications.map(({ processId }) => processId).join(", ")}.`,
    );
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const deadline = Date.now() + 10_000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await delay(100);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    const killDeadline = Date.now() + 5_000;
    while (
      child.exitCode === null &&
      child.signalCode === null &&
      Date.now() < killDeadline
    ) {
      await delay(100);
    }
  }
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error("Could not stop the LaunchServices open process.");
  }
}

export async function smokeMacosDmg(options) {
  if (process.platform !== "darwin") {
    throw new Error("The macOS DMG smoke test must run on macOS.");
  }
  const {
    dmgPath,
    expectedTeamId,
    launchTimeoutMs,
    logDirectory,
    signaturePolicy,
    upgradeFixturePath,
    upgradeSourceRelease,
  } = validateMacosDmgSmokeOptions(options);
  if (!existsSync(dmgPath) || statSync(dmgPath).size <= 0) {
    throw new Error(`DMG is missing or empty: ${dmgPath}`);
  }

  mkdirSync(logDirectory, { mode: 0o700, recursive: true });
  assertSafeRequestedLogDirectory(logDirectory);
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "filament-manager-dmg-smoke-runtime-"),
  );
  const mountPoint = path.join(temporaryDirectory, "mounted-dmg");
  const databaseDirectory = path.join(temporaryDirectory, "app-data");
  const databasePath = path.join(databaseDirectory, "filament-manager.db");
  const moduleCachePath = path.join(temporaryDirectory, "swift-module-cache");
  const logPaths = resolveMacosDmgSmokeLogPaths({
    logDirectory,
    runtimeDirectory: temporaryDirectory,
  });
  const {
    appStderrPath: stderrPath,
    appStdoutPath: stdoutPath,
    launcherStderrPath,
    launcherStdoutPath,
  } = logPaths.runtimePaths;
  const { summaryPath } = logPaths;
  mkdirSync(mountPoint);
  mkdirSync(databaseDirectory);
  initializeMacosDmgSmokeRuntimeLogs(logPaths);

  let mounted = false;
  let stagingContext = null;
  let launcherChild = null;
  let launcherError = null;
  let launcherStdoutFile = null;
  let launcherStderrFile = null;
  let launchCleanupOptions = null;
  let smokeError = null;
  let result;

  try {
    writeAtomicPrivateTextFile(
      summaryPath,
      [
        "Installed macOS DMG LaunchServices smoke is in progress.",
        "No passing result has been recorded for this run.",
        "",
      ].join("\n"),
    );
    stagingContext = createMacosDmgSmokeStaging();
    runCommand("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountPoint,
      dmgPath,
    ]);
    mounted = true;
    const mountedAppPath = findMountedApp(mountPoint);
    validateMacosDmgSmokeStaging(stagingContext);
    const installedAppPath = path.join(
      stagingContext.stagingDirectory,
      path.basename(mountedAppPath),
    );
    const installCommand = macosDmgInstallCommand(
      mountedAppPath,
      installedAppPath,
    );
    runCommand(installCommand.command, installCommand.args);
    validateMacosDmgSmokeStaging(stagingContext);
    const installedAppStat = lstatSync(installedAppPath);
    if (!installedAppStat.isDirectory() || installedAppStat.isSymbolicLink()) {
      throw new Error(
        "The installed DMG app must be a real application directory.",
      );
    }
    runCommand("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      installedAppPath,
    ]);
    const codesignResult = runCommand("codesign", [
      "-d",
      "--verbose=4",
      installedAppPath,
    ]);
    const codesignDetails = parseCodesignDetails(
      `${codesignResult.stdout}\n${codesignResult.stderr}`,
    );
    if (signaturePolicy === "release") {
      validateCodesignDetails(codesignDetails, { expectedTeamId });
      runCommand("spctl", [
        "--assess",
        "--type",
        "execute",
        "--verbose=4",
        installedAppPath,
      ]);
    } else {
      validateLocalCodesignDetails(codesignDetails);
    }

    const executablePath = readBundleExecutable(installedAppPath);
    let databaseCompatibilityResult = null;
    if (upgradeFixturePath) {
      databaseCompatibilityResult = await smokeReleaseDatabaseUpgrade({
        allowCurrentSchema: true,
        databasePath: upgradeFixturePath,
        executablePath,
        launchTimeoutMs,
        logDirectory: path.join(logDirectory, "database-compatibility"),
        requireVisibleWindow: false,
        sourceRelease: upgradeSourceRelease,
      });
    }
    const bundlePaths = canonicalPathCandidates(installedAppPath);
    const executablePaths = canonicalPathCandidates(executablePath);
    const expectedProcessName = runCommand("plutil", [
      "-extract",
      "CFBundleName",
      "raw",
      path.join(installedAppPath, "Contents", "Info.plist"),
    ]).stdout.trim();
    if (!expectedProcessName) {
      throw new Error("The installed app has no CFBundleName.");
    }
    const bundleIdentifier = codesignDetails.identifier;
    const preexistingProcesses = listExactApplicationProcesses({
      bundlePaths,
      bundleIdentifier,
      executablePaths,
      moduleCachePath,
    });
    const preexistingProcessIds = new Set(
      preexistingProcesses.map(({ processId }) => processId),
    );
    if (preexistingProcessIds.size > 0) {
      throw new Error(
        "The installed release application is already running before launch.",
      );
    }
    launchCleanupOptions = {
      bundlePaths,
      bundleIdentifier,
      executablePaths,
      moduleCachePath,
      preexistingProcessIds,
    };

    launcherStdoutFile = openSync(launcherStdoutPath, "w", 0o600);
    launcherStderrFile = openSync(launcherStderrPath, "w", 0o600);
    validateMacosDmgSmokeStaging(stagingContext);
    launcherChild = spawn(
      "/usr/bin/open",
      macosLaunchServicesArguments({
        appPath: installedAppPath,
        databasePath,
        stderrPath,
        stdoutPath,
      }),
      {
        shell: false,
        stdio: ["ignore", launcherStdoutFile, launcherStderrFile],
      },
    );
    launcherChild.once("error", (error) => {
      launcherError = error instanceof Error ? error : new Error(String(error));
    });

    const deadline = Date.now() + launchTimeoutMs;
    let applicationProcess = null;
    let databaseResult = null;
    let applicationWindow = null;
    let lastDatabaseError = null;
    const expectedSchemaVersion = currentSchemaVersion();
    while (Date.now() < deadline) {
      if (launcherError) {
        throw new Error(
          `LaunchServices could not open the installed application: ` +
            `${launcherError.message}`,
        );
      }
      if (
        launcherChild.exitCode !== null ||
        launcherChild.signalCode !== null
      ) {
        throw new Error(
          `LaunchServices stopped waiting for the installed application before ` +
            `it became ready (code ${String(launcherChild.exitCode)}, ` +
            `signal ${String(launcherChild.signalCode)}).`,
        );
      }

      const runningApplications =
        newlyLaunchedApplicationProcesses(launchCleanupOptions);
      if (runningApplications.length > 1) {
        throw new Error(
          `LaunchServices opened ${runningApplications.length} matching ` +
            `application processes instead of exactly one.`,
        );
      }
      if (!applicationProcess && runningApplications.length === 1) {
        [applicationProcess] = runningApplications;
      } else if (
        applicationProcess &&
        !runningApplications.some(
          ({ processId }) => processId === applicationProcess.processId,
        )
      ) {
        throw new Error(
          `Installed application process ${applicationProcess.processId} ` +
            `exited before becoming ready.`,
        );
      }

      if (!databaseResult && existsSync(databasePath)) {
        try {
          databaseResult = verifySmokeDatabase(
            databasePath,
            expectedSchemaVersion,
          );
          lastDatabaseError = null;
        } catch (error) {
          lastDatabaseError =
            error instanceof Error ? error : new Error(String(error));
        }
      }
      if (!applicationWindow && applicationProcess) {
        applicationWindow = listApplicationWindows(
          expectedProcessName,
          applicationProcess.processId,
          moduleCachePath,
        )[0];
      }
      if (applicationProcess && databaseResult && applicationWindow) {
        break;
      }
      await delay(500);
    }

    if (!databaseResult) {
      throw new Error(
        `Installed application did not create a healthy database within ` +
          `${launchTimeoutMs} ms.` +
          (lastDatabaseError ? ` Last check: ${lastDatabaseError.message}` : ""),
      );
    }
    if (!applicationProcess) {
      throw new Error(
        `LaunchServices did not expose the exact installed application process ` +
          `within ${launchTimeoutMs} ms.`,
      );
    }
    if (!applicationWindow) {
      throw new Error(
        `Installed application did not expose a visible desktop window within ` +
          `${launchTimeoutMs} ms.`,
      );
    }
    if (
      launcherChild.exitCode !== null ||
      launcherChild.signalCode !== null ||
      !newlyLaunchedApplicationProcesses(launchCleanupOptions).some(
        ({ processId }) => processId === applicationProcess.processId,
      )
    ) {
      throw new Error(
        "Installed application exited during its LaunchServices readiness check.",
      );
    }

    result = {
      appName: path.basename(installedAppPath),
      databaseCompatibility: databaseCompatibilityResult
        ? {
            fromSchema: databaseCompatibilityResult.before.schemaVersion,
            gateMode: databaseCompatibilityResult.gateMode,
            launches: databaseCompatibilityResult.launchCount,
            sourceRelease: databaseCompatibilityResult.sourceRelease,
            toSchema: databaseCompatibilityResult.after.schemaVersion,
          }
        : null,
      processId: applicationProcess.processId,
      schemaVersion: databaseResult.schemaVersion,
      signaturePolicy,
      tableCount: databaseResult.tableCount,
      teamId: codesignDetails.teamIdentifier ?? null,
      windowHeight: applicationWindow.height,
      windowTitle: applicationWindow.title,
      windowWidth: applicationWindow.width,
    };
  } catch (error) {
    smokeError = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    const cleanupErrors = [];
    if (launchCleanupOptions) {
      try {
        await stopLaunchedApplicationProcesses(launchCleanupOptions);
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (launcherChild) {
      try {
        await stopChild(launcherChild);
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (launchCleanupOptions) {
      try {
        await stopLaunchedApplicationProcesses(launchCleanupOptions);
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (launcherStdoutFile !== null) {
      try {
        closeSync(launcherStdoutFile);
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (launcherStderrFile !== null) {
      try {
        closeSync(launcherStderrFile);
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (stagingContext) {
      try {
        cleanupMacosDmgSmokeStaging(stagingContext);
        stagingContext = null;
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (mounted) {
      try {
        runCommand("hdiutil", ["detach", mountPoint]);
        mounted = false;
      } catch (error) {
        try {
          runCommand("hdiutil", ["detach", "-force", mountPoint]);
          mounted = false;
        } catch (forceError) {
          cleanupErrors.push(
            forceError instanceof Error
              ? forceError
              : new Error(String(forceError)),
          );
          cleanupErrors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }
    try {
      publishMacosDmgSmokeRuntimeLogs(logPaths);
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    if (smokeError || cleanupErrors.length > 0) {
      try {
        writeAtomicPrivateTextFile(
          summaryPath,
          [
            "Installed macOS DMG LaunchServices smoke failed.",
            `Primary error: ${smokeError?.message ?? "none"}`,
            ...cleanupErrors.map(
              (error, index) =>
                `Cleanup/publish error ${index + 1}: ${error.message}`,
            ),
            "",
          ].join("\n"),
        );
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (!mounted) {
      try {
        rmSync(temporaryDirectory, { force: true, recursive: true });
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "macOS DMG smoke cleanup failed.",
      );
    }
  }
  writeAtomicPrivateTextFile(
    summaryPath,
    [
      "Installed macOS DMG LaunchServices smoke passed.",
      `App: ${result.appName}`,
      "Launch method: /usr/bin/open",
      `Signature policy: ${result.signaturePolicy}`,
      `Apple Team ID: ${result.teamId ?? "not set"}`,
      `Process ID: ${result.processId}`,
      `Database schema: ${result.schemaVersion}`,
      `Database tables: ${result.tableCount}`,
      `Previous-release database gate: ${
        result.databaseCompatibility
          ? `${result.databaseCompatibility.sourceRelease}, ` +
            `${result.databaseCompatibility.fromSchema} -> ` +
            `${result.databaseCompatibility.toSchema}, ` +
            `${result.databaseCompatibility.launches} launches`
          : "not requested"
      }`,
      `Window: ${result.windowTitle || "(untitled)"} ${result.windowWidth}x${result.windowHeight}`,
      "",
    ].join("\n"),
  );
  return result;
}

function cliOptions(argv) {
  const dmgPaths = argv.filter((argument) => !argument.startsWith("--"));
  const allowedOptionPrefixes = [
    "--expected-team-id=",
    "--launch-timeout-ms=",
    "--log-dir=",
    "--signature-policy=",
    "--upgrade-fixture=",
    "--upgrade-source-release=",
  ];
  if (
    dmgPaths.length !== 1 ||
    argv.some(
      (argument) =>
        argument.startsWith("--") &&
        !allowedOptionPrefixes.some((prefix) => argument.startsWith(prefix)),
    )
  ) {
    throw new Error(
      "Usage: node scripts/smoke-macos-dmg.mjs <path-to-dmg> " +
        "--log-dir=<directory> [--expected-team-id=<team-id>] " +
        "[--launch-timeout-ms=90000] " +
        "[--signature-policy=release|local-adhoc] " +
        "[--upgrade-fixture=<sanitized-db> " +
        "--upgrade-source-release=v0.27.0]",
    );
  }
  const expectedTeamId = argv
    .find((argument) => argument.startsWith("--expected-team-id="))
    ?.slice("--expected-team-id=".length);
  const logDirectory = argv
    .find((argument) => argument.startsWith("--log-dir="))
    ?.slice("--log-dir=".length);
  const timeoutValue = argv
    .find((argument) => argument.startsWith("--launch-timeout-ms="))
    ?.slice("--launch-timeout-ms=".length);
  const signaturePolicy = argv
    .find((argument) => argument.startsWith("--signature-policy="))
    ?.slice("--signature-policy=".length);
  const upgradeFixturePath = argv
    .find((argument) => argument.startsWith("--upgrade-fixture="))
    ?.slice("--upgrade-fixture=".length);
  const upgradeSourceRelease = argv
    .find((argument) => argument.startsWith("--upgrade-source-release="))
    ?.slice("--upgrade-source-release=".length);
  return {
    dmgPath: dmgPaths[0],
    expectedTeamId,
    launchTimeoutMs:
      timeoutValue === undefined
        ? DEFAULT_LAUNCH_TIMEOUT_MS
        : Number.parseInt(timeoutValue, 10),
    logDirectory,
    signaturePolicy,
    upgradeFixturePath,
    upgradeSourceRelease,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await smokeMacosDmg(cliOptions(process.argv.slice(2)));
    console.log(
      `Installed macOS DMG LaunchServices smoke passed (${result.appName}, schema ` +
        `${result.schemaVersion}, ${result.windowWidth}x${result.windowHeight} window, ` +
        `${result.signaturePolicy} signature policy, Team ID ` +
        `${result.teamId ?? "not set"}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
