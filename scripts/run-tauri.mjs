import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV =
  "FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY";
export const FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV =
  "FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING";
export const TAURI_MACOS_SIGNING_IDENTITY_ENV = "APPLE_SIGNING_IDENTITY";

const APPLE_SIGNING_ENV_VARS = [
  "APPLE_CERTIFICATE",
  TAURI_MACOS_SIGNING_IDENTITY_ENV,
];

const APPLE_API_NOTARIZATION_ENV_VARS = [
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_KEY_PATH",
];

const APPLE_ID_NOTARIZATION_ENV_VARS = ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"];

function envValue(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function envFlag(env, name) {
  const value = envValue(env, name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function missingEnvValues(env, names) {
  return names.filter((name) => envValue(env, name) === null);
}

export function hasAppleSigningEnvironment(env = process.env) {
  return APPLE_SIGNING_ENV_VARS.some((name) => envValue(env, name) !== null);
}

export function validateRequiredMacosSigningEnvironment({
  args,
  env = process.env,
  platform = process.platform,
} = {}) {
  if (
    platform !== "darwin" ||
    args?.[0] !== "build" ||
    !envFlag(env, FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV)
  ) {
    return;
  }

  if (args.includes("--no-sign")) {
    throw new Error(
      `${FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV}=1 cannot be combined with --no-sign.`,
    );
  }

  if (hasExplicitTauriConfig(args)) {
    throw new Error(
      `${FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV}=1 cannot be combined with an explicit ` +
        "Tauri --config/-c value because it can override the required Developer ID identity.",
    );
  }

  const signingIdentity =
    envValue(env, FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV) ??
    envValue(env, TAURI_MACOS_SIGNING_IDENTITY_ENV);
  if (!signingIdentity?.startsWith("Developer ID Application:")) {
    throw new Error(
      `A Developer ID Application identity is required. Set ` +
        `${TAURI_MACOS_SIGNING_IDENTITY_ENV} or ` +
        `${FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV} to the certificate's exact identity; ` +
        `ad-hoc and development identities are not accepted.`,
    );
  }

  const missingApiValues = missingEnvValues(env, APPLE_API_NOTARIZATION_ENV_VARS);
  const missingAppleIdValues = missingEnvValues(env, APPLE_ID_NOTARIZATION_ENV_VARS);
  if (missingApiValues.length > 0 && missingAppleIdValues.length > 0) {
    throw new Error(
      "Complete notarization credentials are required. Configure either " +
        `${APPLE_API_NOTARIZATION_ENV_VARS.join(", ")} or ` +
        `${APPLE_ID_NOTARIZATION_ENV_VARS.join(", ")}.`,
    );
  }
}

export function hasExplicitTauriConfig(args) {
  return args.some(
    (arg) =>
      arg === "--config" || arg === "-c" || arg.startsWith("--config=") || arg.startsWith("-c="),
  );
}

export function macosSigningIdentityForBuild(env = process.env, platform = process.platform) {
  if (platform !== "darwin") {
    return null;
  }

  const explicitIdentity = envValue(env, FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV);
  if (explicitIdentity) {
    return explicitIdentity;
  }

  if (hasAppleSigningEnvironment(env)) {
    return null;
  }

  return "-";
}

export function withMacosSigningConfig(args, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  validateRequiredMacosSigningEnvironment({ args, env, platform });

  if (args[0] !== "build" || args.includes("--no-sign") || hasExplicitTauriConfig(args)) {
    return [...args];
  }

  const signingIdentity = macosSigningIdentityForBuild(env, platform);
  if (!signingIdentity) {
    return [...args];
  }

  return [
    ...args,
    "--config",
    JSON.stringify({ bundle: { macOS: { signingIdentity } } }),
  ];
}

export function withMacosSigningBuildEnvironment({
  args,
  env = process.env,
  platform = process.platform,
  temporaryDirectory = tmpdir(),
} = {}) {
  if (
    platform !== "darwin" ||
    args?.[0] !== "build" ||
    !envFlag(env, FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV) ||
    envValue(env, "CARGO_TARGET_DIR") !== null
  ) {
    return env;
  }

  return {
    ...env,
    CARGO_TARGET_DIR: path.join(
      temporaryDirectory,
      "filament-manager-macos-signing-target",
    ),
  };
}

export function runTauriCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
} = {}) {
  const tauriCliPath = path.join(cwd, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const tauriProjectDir = path.join(cwd, "src-tauri");
  const args = withMacosSigningConfig(argv, { env, platform });
  const childEnv = withMacosSigningBuildEnvironment({ args, env, platform });

  if (childEnv !== env) {
    console.log(`Signed macOS bundle output: ${childEnv.CARGO_TARGET_DIR}`);
  }

  const child = spawn(process.execPath, [tauriCliPath, ...args], {
    cwd: tauriProjectDir,
    stdio: "inherit",
    env: childEnv,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runTauriCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
