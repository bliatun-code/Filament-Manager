#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { accessSync, constants, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV =
  "FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY";
export const MACOS_DEV_CARGO_RUNNER_COMMAND = "macos-dev-code-sign-runner.mjs";

export const MACOS_DEV_CODE_SIGNING_IDENTIFIER =
  "no.bliatun.filamentmanager.dev";
const APP_EXECUTABLE_NAME = "bambu-filament-manager";
const LOCAL_DEVELOPMENT_IDENTITY = "Filament Manager Development";
const DEFAULT_REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_ENTITLEMENTS_PATH = fileURLToPath(
  new URL("../src-tauri/Entitlements.plist", import.meta.url),
);
const CODESIGN_PATH = "/usr/bin/codesign";

export function validateMacosDevSigningIdentity(identity) {
  const normalized = typeof identity === "string" ? identity.trim() : "";
  if (!normalized) {
    throw new Error(
      `${FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV} must name a code-signing identity.`,
    );
  }
  if (normalized === "-") {
    throw new Error(
      `${FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV} cannot use the ad-hoc identity '-'; ` +
        "ad-hoc signatures change identity after every rebuild.",
    );
  }
  if (normalized.length > 512 || [...normalized].some((character) => /\p{Cc}/u.test(character))) {
    throw new Error(
      `${FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV} contains invalid characters.`,
    );
  }
  if (
    !normalized.startsWith("Apple Development: ") &&
    normalized !== LOCAL_DEVELOPMENT_IDENTITY
  ) {
    throw new Error(
      `${FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV} must use an Apple Development ` +
        `identity or the exact local identity '${LOCAL_DEVELOPMENT_IDENTITY}'; ` +
        "Developer ID, distribution, hash-only, and arbitrary identities are not permitted.",
    );
  }
  return normalized;
}

function pathIsWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function existingRealPath(candidate) {
  try {
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

export function resolveMacosDevExecutable(
  executableArgument,
  {
    platform = process.platform,
    cwd = process.cwd(),
    env = process.env,
    repoRoot = DEFAULT_REPO_ROOT,
  } = {},
) {
  if (platform !== "darwin") {
    throw new Error("The macOS development signing runner can only run on macOS.");
  }
  if (typeof executableArgument !== "string" || executableArgument.trim().length === 0) {
    throw new Error("Cargo did not provide a development executable to sign.");
  }

  const candidatePath = path.resolve(cwd, executableArgument);
  let metadata;
  try {
    metadata = lstatSync(candidatePath);
  } catch (error) {
    throw new Error(
      `The Cargo development executable could not be inspected: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("The Cargo development executable must be a regular, non-symlink file.");
  }

  const executablePath = realpathSync(candidatePath);
  try {
    accessSync(executablePath, constants.X_OK);
  } catch {
    throw new Error("The Cargo development executable is not executable.");
  }
  if (path.basename(executablePath) !== APP_EXECUTABLE_NAME) {
    throw new Error(
      `Refusing to sign unexpected Cargo executable '${path.basename(executablePath)}'.`,
    );
  }

  const targetRoots = [path.join(repoRoot, "target"), path.join(repoRoot, "src-tauri", "target")];
  if (typeof env.CARGO_TARGET_DIR === "string" && env.CARGO_TARGET_DIR.trim().length > 0) {
    targetRoots.push(path.resolve(cwd, env.CARGO_TARGET_DIR.trim()));
  }
  const allowed = targetRoots
    .map(existingRealPath)
    .filter((targetRoot) => targetRoot !== null)
    .some((targetRoot) => pathIsWithin(executablePath, targetRoot));
  if (!allowed) {
    throw new Error("Refusing to sign a development executable outside a Cargo target directory.");
  }

  return executablePath;
}

export function macosDevCodesignInvocations({
  executablePath,
  identity,
  entitlementsPath = DEFAULT_ENTITLEMENTS_PATH,
}) {
  const normalizedIdentity = validateMacosDevSigningIdentity(identity);
  return [
    {
      command: CODESIGN_PATH,
      args: [
        "--force",
        "--sign",
        normalizedIdentity,
        "--identifier",
        MACOS_DEV_CODE_SIGNING_IDENTIFIER,
        "--entitlements",
        entitlementsPath,
        "--timestamp=none",
        executablePath,
      ],
    },
    {
      command: CODESIGN_PATH,
      args: ["--verify", "--strict", "--verbose=2", executablePath],
    },
    {
      command: CODESIGN_PATH,
      args: ["--display", "--verbose=4", executablePath],
    },
  ];
}

function checkedResult(invocation, label, spawnSyncImpl, options) {
  const result = spawnSyncImpl(invocation.command, invocation.args, {
    shell: false,
    ...options,
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${label} was terminated by ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
  return result;
}

function runChecked(invocation, label, spawnSyncImpl) {
  checkedResult(invocation, label, spawnSyncImpl, { stdio: "inherit" });
}

export function signMacosDevExecutable({
  executablePath,
  identity,
  entitlementsPath = DEFAULT_ENTITLEMENTS_PATH,
  spawnSyncImpl = spawnSync,
}) {
  const [signInvocation, verifyInvocation, displayInvocation] = macosDevCodesignInvocations({
    executablePath,
    identity,
    entitlementsPath,
  });
  runChecked(signInvocation, "Development code signing", spawnSyncImpl);
  runChecked(verifyInvocation, "Development signature verification", spawnSyncImpl);
  const displayResult = checkedResult(
    displayInvocation,
    "Development signature inspection",
    spawnSyncImpl,
    { encoding: "utf8" },
  );
  const displayOutput = `${displayResult.stdout ?? ""}\n${displayResult.stderr ?? ""}`;
  const identifierPattern = new RegExp(
    `(?:^|\\r?\\n)Identifier=${MACOS_DEV_CODE_SIGNING_IDENTIFIER.replaceAll(".", "\\.")}` +
      "(?:\\r?\\n|$)",
  );
  if (!identifierPattern.test(displayOutput)) {
    throw new Error(
      `Development signature identifier is not ${MACOS_DEV_CODE_SIGNING_IDENTIFIER}.`,
    );
  }
}

export function replaceWithMacosDevExecutable({
  executablePath,
  args = [],
  env = process.env,
  execveImpl = process.execve,
}) {
  if (typeof execveImpl !== "function") {
    throw new Error("Stable macOS development signing requires Node.js process.execve support.");
  }
  execveImpl(executablePath, [executablePath, ...args], env);
  throw new Error("process.execve returned without replacing the development runner.");
}

export function runMacosDevCodeSignRunner({
  argv = process.argv.slice(2),
  env = process.env,
  platform = process.platform,
  cwd = process.cwd(),
  repoRoot = DEFAULT_REPO_ROOT,
  spawnSyncImpl = spawnSync,
  execveImpl = process.execve,
} = {}) {
  const [executableArgument, ...appArgs] = argv;
  const executablePath = resolveMacosDevExecutable(executableArgument, {
    platform,
    cwd,
    env,
    repoRoot,
  });
  const identity = validateMacosDevSigningIdentity(
    env[FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV],
  );
  signMacosDevExecutable({ executablePath, identity, spawnSyncImpl });
  return replaceWithMacosDevExecutable({
    executablePath,
    args: appArgs,
    env,
    execveImpl,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runMacosDevCodeSignRunner();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
