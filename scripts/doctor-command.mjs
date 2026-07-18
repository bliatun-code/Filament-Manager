import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DOCTOR_COMMAND_TIMEOUT_MS = 15_000;

export function resolveDoctorNpmLaunch({
  env = process.env,
  executable = process.execPath,
  existsSync = fs.existsSync,
  platform = process.platform,
} = {}) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const npmExecPath = String(env.npm_execpath ?? "").trim();
  const hasNpmCli =
    npmExecPath.length > 0 &&
    pathApi.isAbsolute(npmExecPath) &&
    existsSync(npmExecPath);

  if (hasNpmCli) {
    return {
      args: [npmExecPath, "-v"],
      command: executable,
      shell: false,
    };
  }

  if (platform === "win32") {
    return null;
  }

  return {
    args: ["-v"],
    command: "npm",
    shell: false,
  };
}

export function resolveDoctorTauriLaunch({
  executable = process.execPath,
} = {}) {
  return {
    args: [
      fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)),
      "--version",
    ],
    command: executable,
    shell: false,
  };
}

export function resolveDoctorNativeLaunch(command, args) {
  return {
    args: [...args],
    command,
    shell: false,
  };
}

export function runDoctorCommand(
  launch,
  {
    cwd,
    spawnSyncFn = spawnSync,
    timeoutMs = DOCTOR_COMMAND_TIMEOUT_MS,
  } = {},
) {
  if (!launch?.command || launch.shell !== false) {
    throw new Error("Doctor commands must use an explicit executable without a shell.");
  }

  const result = spawnSyncFn(launch.command, launch.args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout,
    stderr,
    error: result.error?.message ?? null,
  };
}
