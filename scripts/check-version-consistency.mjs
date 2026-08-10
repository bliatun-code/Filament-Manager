#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(".");
const appPackagePath = resolve(repoRoot, "package.json");
const packageLockPath = resolve(repoRoot, "package-lock.json");
const cargoTomlPath = resolve(repoRoot, "src-tauri", "Cargo.toml");
const cargoLockPath = resolve(repoRoot, "Cargo.lock");
const tauriConfigPath = resolve(repoRoot, "src-tauri", "tauri.conf.json");
const readmePath = resolve(repoRoot, "README.md");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function requireMatch(label, source, pattern) {
  const match = source.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not find ${label}`);
  }
  return match[1];
}

const appVersion = readJson(appPackagePath).version;
const releaseTag = `v${appVersion}`;
const releaseNotesFilename = `RELEASE_NOTES_${releaseTag}.md`;
const releaseNotesPath = resolve(repoRoot, releaseNotesFilename);
const packageLock = readJson(packageLockPath);
const cargoToml = readText(cargoTomlPath);
const cargoLock = readText(cargoLockPath);
const tauriConfig = readJson(tauriConfigPath);
const readme = readText(readmePath);

const versions = [
  ["package-lock root version", packageLock.version],
  ["package-lock package version", packageLock.packages?.[""]?.version],
  ["Cargo.toml package version", requireMatch("Cargo.toml package version", cargoToml, /^version = "([^"]+)"$/m)],
  [
    "Cargo.lock package version",
    requireMatch(
      "Cargo.lock bambu-filament-manager package version",
      cargoLock,
      /\[\[package\]\]\r?\nname = "bambu-filament-manager"\r?\nversion = "([^"]+)"/,
    ),
  ],
  ["Tauri config version", tauriConfig.version],
];

const documentationVersions = [
  ["README current version", requireMatch("README current version", readme, /Current version: `([^`]+)`/)],
];
const mismatches = [];
for (const [label, version] of versions) {
  if (version !== appVersion) {
    mismatches.push(`${label} is ${version ?? "missing"}, expected ${appVersion}`);
  }
}
for (const [label, version] of documentationVersions) {
  if (version !== appVersion) {
    mismatches.push(`${label} is ${version}, expected ${appVersion}`);
  }
}

const expectedReleaseNotesLink = `- [${releaseTag}](${releaseNotesFilename})`;
if (!readme.split(/\r?\n/).includes(expectedReleaseNotesLink)) {
  mismatches.push(`README release notes link is missing, expected ${expectedReleaseNotesLink}`);
}

if (!existsSync(releaseNotesPath)) {
  mismatches.push(`release notes file ${releaseNotesFilename} is missing`);
} else {
  const releaseNotesHeading = readText(releaseNotesPath).split(/\r?\n/, 1)[0];
  const expectedReleaseNotesHeading = `# Filament Manager ${releaseTag}`;
  if (releaseNotesHeading !== expectedReleaseNotesHeading) {
    mismatches.push(
      `release notes heading is ${releaseNotesHeading || "missing"}, expected ${expectedReleaseNotesHeading}`,
    );
  }
}

if (mismatches.length > 0) {
  console.error("Version consistency check failed:");
  for (const mismatch of mismatches) {
    console.error(`  - ${mismatch}`);
  }
  process.exit(1);
}

console.log(`Version consistency ok (${releaseTag}).`);
