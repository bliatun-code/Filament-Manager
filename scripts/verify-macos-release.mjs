#!/usr/bin/env node

import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_BUNDLE_ID = "no.bliatun.filamentmanager";
const TAURI_CONFIG_PATH = fileURLToPath(
  new URL("../src-tauri/tauri.conf.json", import.meta.url),
);
const PACKAGE_JSON_PATH = fileURLToPath(new URL("../package.json", import.meta.url));
const DEFAULT_APP_VERSION = (() => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
  const value = manifest?.version;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("package.json must declare a non-empty version.");
  }
  return value.trim();
})();
const DEFAULT_MINIMUM_SYSTEM_VERSION = (() => {
  const config = JSON.parse(readFileSync(TAURI_CONFIG_PATH, "utf8"));
  const value = config?.bundle?.macOS?.minimumSystemVersion;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Tauri must declare bundle.macOS.minimumSystemVersion explicitly.");
  }
  return value.trim();
})();
const EXPECTED_ENTITLEMENTS = [
  "com.apple.security.device.camera",
  "com.apple.security.network.client",
  "com.apple.security.network.server",
];
const FORBIDDEN_TRUE_ENTITLEMENTS = [
  "com.apple.security.app-sandbox",
  "com.apple.security.get-task-allow",
];
const EXPECTED_PRIVACY_KEYS = ["NSCameraUsageDescription", "NSLocalNetworkUsageDescription"];

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
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
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function readPlistObject(plistPath) {
  const output = runCommand("plutil", ["-convert", "json", "-o", "-", plistPath]).stdout;
  return JSON.parse(output);
}

export function normalizeExpectedArchitectures(value) {
  const rawValue = Array.isArray(value) ? value.join(" ") : value;
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return [];
  }
  return [
    ...new Set(rawValue.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)),
  ].sort();
}

export function normalizeMacosVersion(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d+(?:\.\d+){0,2}$/.test(text)) {
    throw new Error(`Invalid macOS version ${text || "none"}.`);
  }
  return text
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .concat([0, 0])
    .slice(0, 3)
    .join(".");
}

export function parseMacosDeploymentTargets(output) {
  const targets = [];
  let loadCommand = null;

  for (const rawLine of String(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("cmd ")) {
      loadCommand = line.slice("cmd ".length);
      continue;
    }
    if (loadCommand === "LC_BUILD_VERSION" && line.startsWith("minos ")) {
      targets.push(line.slice("minos ".length).trim());
      continue;
    }
    if (loadCommand === "LC_VERSION_MIN_MACOSX" && line.startsWith("version ")) {
      targets.push(line.slice("version ".length).trim());
    }
  }

  return [...new Set(targets)];
}

export function validateMacosDeploymentTargets(actualValues, expectedValue) {
  const expected = normalizeMacosVersion(expectedValue);
  const actual = Array.isArray(actualValues) ? actualValues : [];
  if (actual.length === 0) {
    throw new Error("The executable does not declare a macOS deployment target.");
  }
  for (const value of actual) {
    if (normalizeMacosVersion(value) !== expected) {
      throw new Error(
        `Expected macOS deployment target ${expectedValue}, found ${value}.`,
      );
    }
  }
  return actual;
}

export function parseCodesignDetails(output) {
  const details = { authorities: [], runtime: false };
  for (const rawLine of String(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("Authority=")) {
      details.authorities.push(line.slice("Authority=".length));
    } else if (line.startsWith("Identifier=")) {
      details.identifier = line.slice("Identifier=".length);
    } else if (line.startsWith("TeamIdentifier=")) {
      details.teamIdentifier = line.slice("TeamIdentifier=".length);
    } else if (line.startsWith("Signature=")) {
      details.signature = line.slice("Signature=".length);
    } else if (line.startsWith("Timestamp=")) {
      details.timestamp = line.slice("Timestamp=".length);
    }
    if (/\bflags=.*\bruntime\b/i.test(line) || line.startsWith("Runtime Version=")) {
      details.runtime = true;
    }
  }
  return details;
}

export function validateCodesignDetails(
  details,
  { expectedBundleId = DEFAULT_BUNDLE_ID, expectedTeamId } = {},
) {
  if (details.identifier !== expectedBundleId) {
    throw new Error(
      `Expected bundle identifier ${expectedBundleId}, found ${details.identifier ?? "none"}.`,
    );
  }
  if (!details.authorities.some((authority) => authority.startsWith("Developer ID Application:"))) {
    throw new Error("The app is not signed by a Developer ID Application certificate.");
  }
  if (!details.teamIdentifier || details.teamIdentifier === "not set") {
    throw new Error("The Developer ID signature does not contain a TeamIdentifier.");
  }
  if (expectedTeamId && details.teamIdentifier !== expectedTeamId) {
    throw new Error(
      `Expected Apple Team ID ${expectedTeamId}, found ${details.teamIdentifier}.`,
    );
  }
  if (details.signature?.toLowerCase() === "adhoc") {
    throw new Error("The app is ad-hoc signed instead of Developer ID signed.");
  }
  if (!details.timestamp) {
    throw new Error("The Developer ID signature does not contain a secure timestamp.");
  }
  if (!details.runtime) {
    throw new Error("The app signature does not enable Hardened Runtime.");
  }
}

export function validateLocalCodesignDetails(
  details,
  { expectedBundleId = DEFAULT_BUNDLE_ID } = {},
) {
  if (details.identifier !== expectedBundleId) {
    throw new Error(
      `Expected bundle identifier ${expectedBundleId}, found ${details.identifier ?? "none"}.`,
    );
  }
  if (details.signature?.toLowerCase() !== "adhoc") {
    throw new Error("The local app is not ad-hoc signed.");
  }
  if (details.authorities.length > 0) {
    throw new Error("The local ad-hoc app unexpectedly contains signing authorities.");
  }
  if (details.teamIdentifier && details.teamIdentifier !== "not set") {
    throw new Error("The local ad-hoc app unexpectedly contains a TeamIdentifier.");
  }
  if (details.timestamp) {
    throw new Error("The local ad-hoc app unexpectedly contains a secure timestamp.");
  }
  if (!details.runtime) {
    throw new Error("The local app signature does not enable Hardened Runtime.");
  }
}

export function validateBundleExecutableName(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected a non-empty CFBundleExecutable in Info.plist.");
  }
  if (
    value !== value.trim() ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error("Expected CFBundleExecutable to be a single safe filename.");
  }
  return value;
}

export function validateBundleExecutableEntry({ isFile, isSymbolicLink }) {
  if (!isFile || isSymbolicLink) {
    throw new Error("Expected the main app executable to be a real file, not a link.");
  }
}

export function validateReleaseMetadata({
  entitlements,
  expectedAppVersion = DEFAULT_APP_VERSION,
  expectedBundleId = DEFAULT_BUNDLE_ID,
  expectedMinimumSystemVersion = DEFAULT_MINIMUM_SYSTEM_VERSION,
  infoPlist,
}) {
  const bundleId = infoPlist?.CFBundleIdentifier;
  if (bundleId !== expectedBundleId) {
    throw new Error(`Expected bundle identifier ${expectedBundleId}, found ${bundleId}.`);
  }
  const minimumSystemVersion = infoPlist?.LSMinimumSystemVersion;
  if (
    normalizeMacosVersion(minimumSystemVersion) !==
    normalizeMacosVersion(expectedMinimumSystemVersion)
  ) {
    throw new Error(
      `Expected LSMinimumSystemVersion ${expectedMinimumSystemVersion}, ` +
        `found ${minimumSystemVersion ?? "none"}.`,
    );
  }
  for (const versionKey of ["CFBundleShortVersionString", "CFBundleVersion"]) {
    const value = infoPlist?.[versionKey];
    if (value !== expectedAppVersion) {
      throw new Error(
        `Expected ${versionKey} ${expectedAppVersion}, found ${value ?? "none"}.`,
      );
    }
  }
  for (const entitlement of EXPECTED_ENTITLEMENTS) {
    if (entitlements?.[entitlement] !== true) {
      throw new Error(`Expected signed entitlement ${entitlement}=true.`);
    }
  }
  for (const entitlement of FORBIDDEN_TRUE_ENTITLEMENTS) {
    if (entitlements?.[entitlement] === true) {
      throw new Error(`Release must not contain signed entitlement ${entitlement}=true.`);
    }
  }
  for (const privacyKey of EXPECTED_PRIVACY_KEYS) {
    const value = infoPlist?.[privacyKey];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Expected non-empty Info.plist privacy key ${privacyKey}.`);
    }
  }
  const executableName = validateBundleExecutableName(infoPlist?.CFBundleExecutable);
  return {
    appVersion: expectedAppVersion,
    bundleId,
    executableName,
    minimumSystemVersion,
  };
}

export function validateExpectedArchitectures(actualValue, expectedValue) {
  const actual = normalizeExpectedArchitectures(actualValue);
  const expected = normalizeExpectedArchitectures(expectedValue);
  if (expected.length === 0) {
    throw new Error(
      "Expected macOS architectures are required. Use --architectures=arm64, " +
        "--architectures=x86_64, or an explicit comma-separated universal set.",
    );
  }
  if (
    actual.length !== expected.length ||
    actual.some((architecture, index) => architecture !== expected[index])
  ) {
    throw new Error(
      `Expected architectures ${expected.join(", ")}; executable contains ${actual.join(", ")}.`,
    );
  }
  return actual;
}

export function validateDmgLayout({ appNames, applicationsTarget }) {
  if (appNames.length !== 1) {
    throw new Error(`Expected one app bundle in the DMG, found ${appNames.length}.`);
  }
  if (applicationsTarget !== "/Applications") {
    throw new Error(
      "Expected the DMG Applications link to target /Applications, " +
        `found ${applicationsTarget ?? "none"}.`,
    );
  }
  return appNames[0];
}

export function validateDmgAppEntry({ isDirectory, isSymbolicLink }) {
  if (!isDirectory || isSymbolicLink) {
    throw new Error("Expected the DMG app bundle to be a real directory, not a link.");
  }
}

function findAppBundle(mountPoint) {
  const appNames = readdirSync(mountPoint).filter((name) => name.endsWith(".app"));
  let applicationsTarget;
  try {
    applicationsTarget = readlinkSync(path.join(mountPoint, "Applications"));
  } catch {
    applicationsTarget = undefined;
  }
  const appPath = path.join(
    mountPoint,
    validateDmgLayout({ appNames, applicationsTarget }),
  );
  const appStats = lstatSync(appPath);
  validateDmgAppEntry({
    isDirectory: appStats.isDirectory(),
    isSymbolicLink: appStats.isSymbolicLink(),
  });
  return appPath;
}

function verifyExpectedArchitectures(executablePath, expectedArchitectures) {
  return validateExpectedArchitectures(
    runCommand("lipo", ["-archs", executablePath]).stdout,
    expectedArchitectures,
  );
}

function verifyMacosDmg({
  dmgPath,
  expectedArchitectures = [],
  expectedAppVersion = DEFAULT_APP_VERSION,
  expectedBundleId = DEFAULT_BUNDLE_ID,
  expectedMinimumSystemVersion = DEFAULT_MINIMUM_SYSTEM_VERSION,
  expectedTeamId,
  signatureMode,
} = {}) {
  if (process.platform !== "darwin") {
    throw new Error("macOS DMG verification must run on macOS.");
  }
  if (!dmgPath) {
    throw new Error("A macOS DMG path is required.");
  }
  const requiredArchitectures = normalizeExpectedArchitectures(expectedArchitectures);
  if (requiredArchitectures.length === 0) {
    throw new Error(
      "Expected macOS architectures are required. Pass --architectures=arm64, " +
        "--architectures=x86_64, or an explicit comma-separated universal set.",
    );
  }
  const requiredTeamId = typeof expectedTeamId === "string" ? expectedTeamId.trim() : "";
  if (signatureMode === "release" && !requiredTeamId) {
    throw new Error("EXPECTED_APPLE_TEAM_ID is required for macOS release verification.");
  }
  if (!new Set(["local", "release"]).has(signatureMode)) {
    throw new Error(`Unsupported macOS signature verification mode ${signatureMode ?? "none"}.`);
  }

  const absoluteDmgPath = path.resolve(dmgPath);
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "filament-manager-macos-release-"));
  const mountPoint = path.join(temporaryDirectory, "mounted-dmg");
  mkdirSync(mountPoint);
  let mounted = false;
  let verificationError;
  let verificationResult;

  try {
    runCommand("hdiutil", ["verify", absoluteDmgPath]);
    if (signatureMode === "release") {
      runCommand("xcrun", ["stapler", "validate", absoluteDmgPath]);
      runCommand("spctl", [
        "--assess",
        "--type",
        "open",
        "--context",
        "context:primary-signature",
        "--verbose=4",
        absoluteDmgPath,
      ]);
    }
    runCommand("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountPoint,
      absoluteDmgPath,
    ]);
    mounted = true;

    const mountedAppPath = findAppBundle(mountPoint);
    const appPath = path.join(temporaryDirectory, path.basename(mountedAppPath));
    runCommand("ditto", ["--noextattr", "--noqtn", mountedAppPath, appPath]);
    runCommand("xattr", ["-cr", appPath]);

    const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
    const infoPlist = readPlistObject(infoPlistPath);

    runCommand("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    const codesignOutput = runCommand("codesign", ["-d", "--verbose=4", appPath]).combined;
    const codesignDetails = parseCodesignDetails(codesignOutput);
    if (signatureMode === "release") {
      validateCodesignDetails(codesignDetails, {
        expectedBundleId,
        expectedTeamId: requiredTeamId,
      });
    } else {
      validateLocalCodesignDetails(codesignDetails, { expectedBundleId });
    }

    const entitlementsResult = runCommand("codesign", [
      "-d",
      "--entitlements",
      "-",
      "--xml",
      appPath,
    ]);
    const entitlementsPath = path.join(temporaryDirectory, "Entitlements.plist");
    writeFileSync(entitlementsPath, entitlementsResult.stdout);
    runCommand("plutil", ["-lint", entitlementsPath]);
    const entitlements = readPlistObject(entitlementsPath);
    const { appVersion, bundleId, executableName, minimumSystemVersion } =
      validateReleaseMetadata({
        entitlements,
        expectedAppVersion,
        expectedBundleId,
        expectedMinimumSystemVersion,
        infoPlist,
      });

    const executablePath = path.join(appPath, "Contents", "MacOS", executableName);
    const executableStats = lstatSync(executablePath);
    validateBundleExecutableEntry({
      isFile: executableStats.isFile(),
      isSymbolicLink: executableStats.isSymbolicLink(),
    });
    const deploymentTargets = validateMacosDeploymentTargets(
      parseMacosDeploymentTargets(runCommand("otool", ["-l", executablePath]).stdout),
      expectedMinimumSystemVersion,
    );
    const actualArchitectures = verifyExpectedArchitectures(
      executablePath,
      requiredArchitectures,
    );

    if (signatureMode === "release") {
      runCommand("spctl", [
        "--assess",
        "--type",
        "execute",
        "--verbose=4",
        mountedAppPath,
      ]);
    }
    verificationResult = {
      appName: path.basename(appPath),
      appVersion,
      architectures: actualArchitectures,
      bundleId,
      deploymentTargets,
      minimumSystemVersion,
      signatureMode,
      teamId: codesignDetails.teamIdentifier ?? null,
    };
  } catch (error) {
    verificationError = error instanceof Error ? error : new Error(String(error));
  }

  const cleanupErrors = [];
  if (mounted) {
    try {
      runCommand("hdiutil", ["detach", mountPoint]);
      mounted = false;
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (!mounted) {
    try {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (verificationError) {
    if (cleanupErrors.length > 0) {
      verificationError.message += `\nCleanup warning: ${cleanupErrors
        .map((error) => error.message)
        .join("; ")}`;
    }
    throw verificationError;
  }
  if (cleanupErrors.length > 0) {
    throw cleanupErrors[0];
  }
  return verificationResult;
}

export function verifyMacosRelease(options = {}) {
  return verifyMacosDmg({ ...options, signatureMode: "release" });
}

export function verifyLocalMacosDmg(options = {}) {
  return verifyMacosDmg({ ...options, signatureMode: "local" });
}

function cliOptions(argv) {
  const dmgPaths = argv.filter((arg) => !arg.startsWith("--"));
  if (dmgPaths.length !== 1) {
    throw new Error(
      "Usage: node scripts/verify-macos-release.mjs <path-to-dmg> " +
        "--architectures=arm64",
    );
  }
  const architectureArgument = argv.find((arg) => arg.startsWith("--architectures="));
  return {
    dmgPath: dmgPaths[0],
    expectedArchitectures: normalizeExpectedArchitectures(
      architectureArgument?.slice("--architectures=".length) ??
        process.env.EXPECTED_MACOS_ARCHITECTURES,
    ),
    expectedBundleId: process.env.EXPECTED_MACOS_BUNDLE_ID ?? DEFAULT_BUNDLE_ID,
    expectedAppVersion: process.env.EXPECTED_MACOS_APP_VERSION ?? DEFAULT_APP_VERSION,
    expectedMinimumSystemVersion:
      process.env.EXPECTED_MACOS_MINIMUM_SYSTEM_VERSION ??
      DEFAULT_MINIMUM_SYSTEM_VERSION,
    expectedTeamId: process.env.EXPECTED_APPLE_TEAM_ID,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyMacosRelease(cliOptions(process.argv.slice(2)));
    console.log(
      `macOS release verification passed (${result.bundleId}, ${result.teamId}, ` +
        `version ${result.appVersion}, macOS ${result.minimumSystemVersion}+, ` +
        `${result.architectures.join(", ")}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
