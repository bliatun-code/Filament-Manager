import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DOCTOR_COMMAND_TIMEOUT_MS,
  resolveDoctorNativeLaunch,
  resolveDoctorNpmLaunch,
  resolveDoctorTauriLaunch,
  runDoctorCommand,
} from "./doctor-command.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("doctor resolves the Windows npm JavaScript CLI without a shell", () => {
  const nodePath = "C:\\Program Files\\nodejs\\node.exe";
  const npmCliPath =
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  const launch = resolveDoctorNpmLaunch({
    env: {
      npm_execpath: npmCliPath,
    },
    executable: nodePath,
    existsSync: (candidate) => candidate === npmCliPath,
    platform: "win32",
  });

  assert.deepEqual(launch, {
    args: [npmCliPath, "-v"],
    command: nodePath,
    shell: false,
  });
});

test("doctor refuses a Windows npm shell fallback without npm context", () => {
  assert.equal(
    resolveDoctorNpmLaunch({
      env: {},
      existsSync: () => false,
      platform: "win32",
    }),
    null,
  );
});

test("doctor keeps its POSIX npm fallback shell-free", () => {
  assert.deepEqual(
    resolveDoctorNpmLaunch({
      env: {},
      existsSync: () => false,
      platform: "darwin",
    }),
    {
      args: ["-v"],
      command: "npm",
      shell: false,
    },
  );
});

test("doctor resolves the local Tauri wrapper through Node", () => {
  const executable = "node-runtime";

  assert.deepEqual(resolveDoctorTauriLaunch({ executable }), {
    args: [
      fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)),
      "--version",
    ],
    command: executable,
    shell: false,
  });
});

test("doctor runs native tools with bounded shell-free options", () => {
  const calls = [];
  const launch = resolveDoctorNativeLaunch("cargo", ["--version"]);
  const result = runDoctorCommand(launch, {
    cwd: "project root with spaces",
    spawnSyncFn: (command, args, options) => {
      calls.push({ args, command, options });
      return {
        error: undefined,
        status: 0,
        stderr: "",
        stdout: "  cargo 1.95.0  \n",
      };
    },
  });

  assert.deepEqual(calls, [
    {
      args: ["--version"],
      command: "cargo",
      options: {
        cwd: "project root with spaces",
        encoding: "utf8",
        shell: false,
        timeout: DOCTOR_COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
    },
  ]);
  assert.deepEqual(result, {
    error: null,
    ok: true,
    status: 0,
    stderr: "",
    stdout: "cargo 1.95.0",
  });
});

test("doctor rejects any command specification that requests a shell", () => {
  assert.throws(
    () =>
      runDoctorCommand({
        args: ["-v"],
        command: "npm",
        shell: true,
      }),
    /without a shell/,
  );
});

test(
  "doctor stays clean when Node deprecations throw",
  {
    skip:
      process.platform === "win32" && !process.env.npm_execpath
        ? "Direct Windows test runs do not expose npm's JavaScript CLI path"
        : false,
  },
  () => {
    const doctorPath = fileURLToPath(new URL("./doctor.mjs", import.meta.url));
    const result = spawnSync(
      process.execPath,
      ["--throw-deprecation", doctorPath],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /- npm: \d+\./);
    assert.match(result.stdout, /- tauri cli: tauri-cli \d+\./);
    assert.doesNotMatch(result.stderr, /DEP0190/);
  },
);
