import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV =
  "FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY";

const APPLE_SIGNING_ENV_VARS = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PATH",
  "APPLE_CERTIFICATE_IDENTITY",
];

function envValue(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function hasAppleSigningEnvironment(env = process.env) {
  return APPLE_SIGNING_ENV_VARS.some((name) => envValue(env, name) !== null);
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

export function runTauriCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
} = {}) {
  const tauriCliPath = path.join(cwd, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const tauriProjectDir = path.join(cwd, "src-tauri");
  const args = withMacosSigningConfig(argv, { env, platform });

  const child = spawn(process.execPath, [tauriCliPath, ...args], {
    cwd: tauriProjectDir,
    stdio: "inherit",
    env,
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
  runTauriCli();
}
