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
const roadmapPath = resolve(repoRoot, "docs", "ROADMAP.md");

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
const packageLock = readJson(packageLockPath);
const cargoToml = readText(cargoTomlPath);
const cargoLock = readText(cargoLockPath);
const tauriConfig = readJson(tauriConfigPath);
const readme = readText(readmePath);
const roadmap = existsSync(roadmapPath) ? readText(roadmapPath) : null;

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

const tagReferences = [
  ["README current release target", requireMatch("README current release target", readme, /Current release target: `(v[^`]+)`/)],
];
if (roadmap) {
  tagReferences.push([
    "roadmap current release baseline",
    requireMatch("roadmap current release baseline", roadmap, /Current release baseline: `(v[^`]+)`/),
  ]);
}

const mismatches = [];
for (const [label, version] of versions) {
  if (version !== appVersion) {
    mismatches.push(`${label} is ${version ?? "missing"}, expected ${appVersion}`);
  }
}
for (const [label, tag] of tagReferences) {
  if (tag !== releaseTag) {
    mismatches.push(`${label} is ${tag}, expected ${releaseTag}`);
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
