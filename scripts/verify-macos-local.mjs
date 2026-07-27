#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeExpectedArchitectures,
  verifyLocalMacosDmg,
} from "./verify-macos-release.mjs";

function cliOptions(argv) {
  const dmgPaths = argv.filter((arg) => !arg.startsWith("--"));
  if (dmgPaths.length !== 1) {
    throw new Error(
      "Usage: node scripts/verify-macos-local.mjs <path-to-dmg> " +
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
    expectedAppVersion: process.env.EXPECTED_MACOS_APP_VERSION,
    expectedBundleId: process.env.EXPECTED_MACOS_BUNDLE_ID,
    expectedMinimumSystemVersion: process.env.EXPECTED_MACOS_MINIMUM_SYSTEM_VERSION,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyLocalMacosDmg(cliOptions(process.argv.slice(2)));
    console.log(
      `Local macOS DMG verification passed (${result.bundleId} ${result.appVersion}, ` +
        `ad-hoc Hardened Runtime, macOS ${result.minimumSystemVersion}+, ` +
        `${result.architectures.join(", ")}). This artifact is not distribution-ready.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
