import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseMacosDeploymentTargets,
  validateExpectedArchitectures,
  validateMacosDeploymentTargets,
} from "./verify-macos-release.mjs";

const DEFAULT_DIRECTORY = fileURLToPath(
  new URL("../src-tauri/target/macos-login-helper/", import.meta.url),
);
export const LOGIN_HELPER_NAME = "filament-manager-login-helper";

export function loginHelperTargets(target) {
  switch (target) {
    case "aarch64-apple-darwin":
      return [{ target, architecture: "arm64" }];
    case "x86_64-apple-darwin":
      return [{ target, architecture: "x86_64" }];
    case "universal-apple-darwin":
      return [
        { target: "aarch64-apple-darwin", architecture: "arm64" },
        { target: "x86_64-apple-darwin", architecture: "x86_64" },
      ];
    default:
      throw new Error("A supported TAURI_ENV_TARGET_TRIPLE is required for the macOS login helper.");
  }
}

function runXcrun(args) {
  const result = spawnSync("/usr/bin/xcrun", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`macOS login helper ${args[0]} failed: ${result.stderr?.trim() ?? ""}`);
  }
  return result.stdout ?? "";
}

function validateHelper(file, architectures, run) {
  const entry = lstatSync(file);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || !(entry.mode & 0o111)) {
    throw new Error("The macOS login helper must be a regular executable, not a link.");
  }
  validateExpectedArchitectures(run(["lipo", "-archs", file]), architectures);
  validateMacosDeploymentTargets(
    parseMacosDeploymentTargets(run(["otool", "-l", file])),
    "11.0",
  );
}

export function prepareMacosLoginHelperBundle({
  target = process.env.TAURI_ENV_TARGET_TRIPLE,
  directory = DEFAULT_DIRECTORY,
  platform = process.platform,
  run = runXcrun,
} = {}) {
  if (platform !== "darwin") throw new Error("The macOS login helper bundle hook requires macOS.");
  const targets = loginHelperTargets(target);
  const entries = targets.map(({ target: thinTarget, architecture }) => {
    const file = path.join(directory, `${LOGIN_HELPER_NAME}-${thinTarget}`);
    validateHelper(file, [architecture], run);
    return file;
  });
  if (targets.length === 1) return entries[0];

  const temporary = mkdtempSync(path.join(directory, ".universal-"));
  try {
    const candidate = path.join(temporary, LOGIN_HELPER_NAME);
    run(["lipo", "-create", ...entries, "-output", candidate]);
    chmodSync(candidate, 0o755);
    validateHelper(candidate, targets.map(({ architecture }) => architecture), run);
    const destination = path.join(directory, `${LOGIN_HELPER_NAME}-${target}`);
    let existing;
    try {
      const entry = lstatSync(destination);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) {
        throw new Error("The universal login helper destination must be a regular file.");
      }
      existing = readFileSync(destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!existing?.equals(readFileSync(candidate))) renameSync(candidate, destination);
    if ((lstatSync(destination).mode & 0o777) !== 0o755) chmodSync(destination, 0o755);
    return destination;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepareMacosLoginHelperBundle();
    console.log("macOS login helper architectures and deployment target verified.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
