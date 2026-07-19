#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const releaseVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
// This is written to Cargo/Tauri SemVer; Tauri maps `-N` to MSI's build field.
const msiBundleVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(0|[1-9]\d*))?$/;
const msiVersionFields = [
  ["major", 255n],
  ["minor", 255n],
  ["patch", 65_535n],
  ["build", 65_535n],
];

function validateMsiBundleVersion(version) {
  const match = version.match(msiBundleVersionPattern);
  if (!match) {
    throw new Error(`Cannot derive a valid MSI bundle version from ${version}.`);
  }

  for (const [index, [fieldName, maximum]] of msiVersionFields.entries()) {
    const value = match[index + 1];
    if (value !== undefined && BigInt(value) > maximum) {
      throw new Error(
        `MSI ${fieldName} version field must not exceed ${maximum.toLocaleString("en-US")}; received ${version}.`,
      );
    }
  }

  return version;
}

function invalidMsiBundleVersion(version) {
  throw new Error(`Cannot derive a valid MSI bundle version from ${version}.`);
}

export function releaseVersionFromRef(refName, packageVersion, refType) {
  if (refType !== "tag") {
    return packageVersion;
  }
  const candidate = String(refName ?? "").replace(/^v/, "");
  return releaseVersionPattern.test(candidate) ? candidate : packageVersion;
}

export function normalizeMsiBundleVersion(rawVersion) {
  const version = String(rawVersion ?? "");
  const releaseVersion = version.match(releaseVersionPattern);
  if (!releaseVersion) {
    return invalidMsiBundleVersion(version);
  }

  const [, major, minor, patch, prerelease] = releaseVersion;
  let build;
  if (prerelease !== undefined) {
    const identifiers = prerelease.split(".");
    if (
      identifiers.some(
        (identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier),
      )
    ) {
      return invalidMsiBundleVersion(version);
    }
    const lastIdentifier = identifiers.at(-1);
    build = /^\d+$/.test(lastIdentifier) ? lastIdentifier : "1";
  }

  return validateMsiBundleVersion(
    `${major}.${minor}.${patch}${build === undefined ? "" : `-${build}`}`,
  );
}

export function resolveMsiBundleVersion({
  refName = process.env.GITHUB_REF_NAME,
  refType = process.env.GITHUB_REF_TYPE,
  repoRoot = resolve("."),
} = {}) {
  const packagePath = resolve(repoRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const rawVersion = releaseVersionFromRef(
    refName,
    packageJson.version,
    refType,
  );
  const msiVersion = normalizeMsiBundleVersion(rawVersion);
  return { msiVersion, rawVersion };
}

export function updateMsiBundleVersion({
  refName = process.env.GITHUB_REF_NAME,
  refType = process.env.GITHUB_REF_TYPE,
  repoRoot = resolve("."),
} = {}) {
  const tauriConfigPath = resolve(repoRoot, "src-tauri", "tauri.conf.json");
  const cargoTomlPath = resolve(repoRoot, "src-tauri", "Cargo.toml");
  const { msiVersion, rawVersion } = resolveMsiBundleVersion({
    refName,
    refType,
    repoRoot,
  });
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  const cargoToml = readFileSync(cargoTomlPath, "utf8");

  if (!/^version = ".*"$/m.test(cargoToml)) {
    throw new Error("Could not find the package version in src-tauri/Cargo.toml.");
  }

  tauriConfig.version = msiVersion;
  const updatedCargoToml = cargoToml.replace(
    /^version = ".*"$/m,
    `version = "${msiVersion}"`,
  );

  writeFileSync(
    tauriConfigPath,
    `${JSON.stringify(tauriConfig, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(cargoTomlPath, updatedCargoToml, "utf8");

  return { msiVersion, rawVersion };
}

function runCli() {
  const checkOnly = process.argv.slice(2).includes("--check");
  const { msiVersion } = checkOnly
    ? resolveMsiBundleVersion()
    : updateMsiBundleVersion();
  console.log(
    checkOnly
      ? `MSI bundle version is valid: ${msiVersion}`
      : `Using MSI bundle version: ${msiVersion}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
