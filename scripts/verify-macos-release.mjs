#!/usr/bin/env node

import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_BUNDLE_ID = "no.bliatun.filamentmanager";
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

export function validateReleaseMetadata({
  entitlements,
  expectedBundleId = DEFAULT_BUNDLE_ID,
  infoPlist,
}) {
  const bundleId = infoPlist?.CFBundleIdentifier;
  if (bundleId !== expectedBundleId) {
    throw new Error(`Expected bundle identifier ${expectedBundleId}, found ${bundleId}.`);
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
  const executableName = infoPlist?.CFBundleExecutable;
  if (typeof executableName !== "string" || executableName.trim().length === 0) {
    throw new Error("Expected a non-empty CFBundleExecutable in Info.plist.");
  }
  return { bundleId, executableName };
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

function findAppBundle(mountPoint) {
  const appNames = readdirSync(mountPoint).filter((name) => name.endsWith(".app"));
  if (appNames.length !== 1) {
    throw new Error(`Expected one app bundle in the DMG, found ${appNames.length}.`);
  }
  return path.join(mountPoint, appNames[0]);
}

function verifyExpectedArchitectures(executablePath, expectedArchitectures) {
  return validateExpectedArchitectures(
    runCommand("lipo", ["-archs", executablePath]).stdout,
    expectedArchitectures,
  );
}

export function verifyMacosRelease({
  dmgPath,
  expectedArchitectures = [],
  expectedBundleId = DEFAULT_BUNDLE_ID,
  expectedTeamId,
} = {}) {
  if (process.platform !== "darwin") {
    throw new Error("macOS release verification must run on macOS.");
  }
  if (!dmgPath) {
    throw new Error("Usage: node scripts/verify-macos-release.mjs <path-to-dmg>");
  }
  const requiredArchitectures = normalizeExpectedArchitectures(expectedArchitectures);
  if (requiredArchitectures.length === 0) {
    throw new Error(
      "Expected macOS architectures are required. Pass --architectures=arm64, " +
        "--architectures=x86_64, or an explicit comma-separated universal set.",
    );
  }
  const requiredTeamId = typeof expectedTeamId === "string" ? expectedTeamId.trim() : "";
  if (!requiredTeamId) {
    throw new Error("EXPECTED_APPLE_TEAM_ID is required for macOS release verification.");
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
    validateCodesignDetails(codesignDetails, {
      expectedBundleId,
      expectedTeamId: requiredTeamId,
    });

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
    const { bundleId, executableName } = validateReleaseMetadata({
      entitlements,
      expectedBundleId,
      infoPlist,
    });

    const executablePath = path.join(appPath, "Contents", "MacOS", executableName);
    const actualArchitectures = verifyExpectedArchitectures(
      executablePath,
      requiredArchitectures,
    );

    runCommand("spctl", [
      "--assess",
      "--type",
      "execute",
      "--verbose=4",
      mountedAppPath,
    ]);
    verificationResult = {
      appName: path.basename(appPath),
      architectures: actualArchitectures,
      bundleId,
      teamId: codesignDetails.teamIdentifier,
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
    expectedTeamId: process.env.EXPECTED_APPLE_TEAM_ID,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyMacosRelease(cliOptions(process.argv.slice(2)));
    console.log(
      `macOS release verification passed (${result.bundleId}, ${result.teamId}, ${result.architectures.join(", ")}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
