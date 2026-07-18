#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const releaseVersionPattern = /^\d+\.\d+\.\d+(?:[-.].*)?$/;
const numberedPrereleasePattern =
  /^(\d+)\.(\d+)\.(\d+)-[A-Za-z0-9.-]*\.([0-9]+)$/;
const prereleasePattern =
  /^(\d+)\.(\d+)\.(\d+)-[A-Za-z0-9.-]+$/;

export function releaseVersionFromRef(refName, packageVersion) {
  const candidate = String(refName ?? "").replace(/^v/, "");
  return releaseVersionPattern.test(candidate) ? candidate : packageVersion;
}

export function normalizeMsiBundleVersion(rawVersion) {
  const version = String(rawVersion ?? "").trim();
  const numberedPrerelease = version.match(numberedPrereleasePattern);
  if (numberedPrerelease) {
    return `${numberedPrerelease[1]}.${numberedPrerelease[2]}.${numberedPrerelease[3]}-${numberedPrerelease[4]}`;
  }

  const prerelease = version.match(prereleasePattern);
  if (prerelease) {
    return `${prerelease[1]}.${prerelease[2]}.${prerelease[3]}-1`;
  }

  return version;
}

export function updateMsiBundleVersion({
  refName = process.env.GITHUB_REF_NAME,
  repoRoot = resolve("."),
} = {}) {
  const packagePath = resolve(repoRoot, "package.json");
  const tauriConfigPath = resolve(repoRoot, "src-tauri", "tauri.conf.json");
  const cargoTomlPath = resolve(repoRoot, "src-tauri", "Cargo.toml");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const rawVersion = releaseVersionFromRef(refName, packageJson.version);
  const msiVersion = normalizeMsiBundleVersion(rawVersion);
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  const cargoToml = readFileSync(cargoTomlPath, "utf8");

  if (!releaseVersionPattern.test(String(rawVersion ?? ""))) {
    throw new Error(`Cannot derive a valid MSI release version from ${rawVersion}.`);
  }
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
  const { msiVersion } = updateMsiBundleVersion();
  console.log(`Using MSI bundle version: ${msiVersion}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
