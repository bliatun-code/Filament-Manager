import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV,
  FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV,
  FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV,
  MACOS_DEV_CARGO_RUNNER_COMMAND,
  MACOS_DEV_CARGO_RUNNER_ENV_VARS,
  TAURI_MACOS_SIGNING_IDENTITY_ENV,
  hasAppleSigningEnvironment,
  hasExplicitTauriConfig,
  macosSigningIdentityForBuild,
  validateRequiredMacosSigningEnvironment,
  withMacosDevSigningEnvironment,
  withMacosSigningBuildEnvironment,
  withMacosSigningConfig,
} from "./run-tauri.mjs";
import {
  MACOS_DEV_CODE_SIGNING_IDENTIFIER,
  replaceWithMacosDevExecutable,
  resolveMacosDevExecutable,
  signMacosDevExecutable,
} from "./macos-dev-code-sign-runner.mjs";

function injectedConfig(args) {
  const configIndex = args.indexOf("--config");
  assert.notEqual(configIndex, -1);
  return JSON.parse(args[configIndex + 1]);
}

const runTauriScriptPath = fileURLToPath(new URL("./run-tauri.mjs", import.meta.url));

test("run-tauri resolves its project from the script when launched elsewhere", (context) => {
  const foreignCwd = mkdtempSync(path.join(tmpdir(), "Filament Manager æøå 漢字-"));
  context.after(() => rmSync(foreignCwd, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [runTauriScriptPath, "--version"], {
    cwd: foreignCwd,
    encoding: "utf8",
    shell: false,
    timeout: 20_000,
    windowsHide: true,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.match(`${result.stdout}\n${result.stderr}`, /tauri-cli\s+\d/i);
});

test("run-tauri reports a controlled error when its project is incomplete", (context) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "Filament Manager fixture æøå-"));
  context.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const missingProjectRoot = path.join(fixtureRoot, "missing project root");
  const importUrl = pathToFileURL(runTauriScriptPath).href;
  const source =
    `import { runTauriCli } from ${JSON.stringify(importUrl)};` +
    `runTauriCli({ argv: ["--version"], cwd: ${JSON.stringify(missingProjectRoot)} });`;

  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: fixtureRoot,
    encoding: "utf8",
    shell: false,
    timeout: 20_000,
    windowsHide: true,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /Unable to launch Tauri CLI/);
  assert.doesNotMatch(result.stderr, /Unhandled 'error' event/);
});

test("withMacosSigningConfig injects ad-hoc signing for local macOS builds", () => {
  const args = withMacosSigningConfig(["build", "--bundles", "dmg"], {
    env: {},
    platform: "darwin",
  });

  assert.deepEqual(args.slice(0, 3), ["build", "--bundles", "dmg"]);
  assert.deepEqual(injectedConfig(args), {
    bundle: { macOS: { signingIdentity: "-" } },
  });
});

test("withMacosSigningConfig keeps certificate-based macOS builds untouched", () => {
  const env = { APPLE_CERTIFICATE: "base64-cert" };

  assert.equal(hasAppleSigningEnvironment(env), true);
  assert.equal(macosSigningIdentityForBuild(env, "darwin"), null);
  assert.deepEqual(withMacosSigningConfig(["build"], { env, platform: "darwin" }), [
    "build",
  ]);
});

test("withMacosSigningConfig respects the standard Tauri signing identity", () => {
  const env = { [TAURI_MACOS_SIGNING_IDENTITY_ENV]: "Developer ID Application: Example AS" };

  assert.equal(hasAppleSigningEnvironment(env), true);
  assert.equal(macosSigningIdentityForBuild(env, "darwin"), null);
  assert.deepEqual(withMacosSigningConfig(["build"], { env, platform: "darwin" }), ["build"]);
});

test("withMacosSigningConfig still ad-hoc signs when only notarization env is present", () => {
  const args = withMacosSigningConfig(["build"], {
    env: { APPLE_ID: "developer@example.com", APPLE_TEAM_ID: "TEAM123456" },
    platform: "darwin",
  });

  assert.deepEqual(injectedConfig(args), {
    bundle: { macOS: { signingIdentity: "-" } },
  });
});

test("withMacosSigningConfig respects explicit identity override", () => {
  const identity = "Developer ID Application: Example AS";
  const args = withMacosSigningConfig(["build"], {
    env: { [FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV]: identity },
    platform: "darwin",
  });

  assert.deepEqual(injectedConfig(args), {
    bundle: { macOS: { signingIdentity: identity } },
  });
});

test("withMacosSigningConfig does not override explicit Tauri config", () => {
  assert.equal(hasExplicitTauriConfig(["build", "--config", "{}"]), true);
  assert.equal(hasExplicitTauriConfig(["build", "--config={}"]), true);
  assert.equal(hasExplicitTauriConfig(["build", "-c={}"]), true);
  assert.deepEqual(
    withMacosSigningConfig(["build", "--config", "{}"], {
      env: {},
      platform: "darwin",
    }),
    ["build", "--config", "{}"],
  );
});

test("withMacosSigningConfig only touches macOS build commands that sign", () => {
  assert.deepEqual(withMacosSigningConfig(["dev"], { env: {}, platform: "darwin" }), [
    "dev",
  ]);
  assert.deepEqual(withMacosSigningConfig(["build"], { env: {}, platform: "linux" }), [
    "build",
  ]);
  assert.deepEqual(
    withMacosSigningConfig(["build", "--no-sign"], { env: {}, platform: "darwin" }),
    ["build", "--no-sign"],
  );
});

test("macOS development signing injects stable Cargo runners without mutating input", () => {
  const identity = "Apple Development: Example Developer (TEAM123456)";
  const env = {
    PATH: "/usr/local/bin:/usr/bin",
    [FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV]: identity,
  };
  const scriptsDirectory = path.join(tmpdir(), "Filament Manager scripts æøå");
  const childEnv = withMacosDevSigningEnvironment({
    args: ["dev"],
    env,
    platform: "darwin",
    scriptsDirectory,
  });

  assert.notEqual(childEnv, env);
  assert.equal(env[MACOS_DEV_CARGO_RUNNER_ENV_VARS[0]], undefined);
  for (const variable of MACOS_DEV_CARGO_RUNNER_ENV_VARS) {
    assert.equal(childEnv[variable], MACOS_DEV_CARGO_RUNNER_COMMAND);
  }
  assert.equal(
    childEnv.PATH,
    `${scriptsDirectory}${path.delimiter}/usr/local/bin:/usr/bin`,
  );
  assert.equal(childEnv[FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV], identity);
});

test("macOS development signing remains opt-in and local-only", () => {
  const unconfigured = {};
  const configured = {
    [FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV]: "Filament Manager Development",
  };

  assert.equal(
    withMacosDevSigningEnvironment({
      args: ["dev"],
      env: unconfigured,
      platform: "darwin",
    }),
    unconfigured,
  );
  for (const [args, platform] of [
    [["build"], "darwin"],
    [["dev"], "linux"],
    [["dev"], "win32"],
  ]) {
    assert.equal(
      withMacosDevSigningEnvironment({ args, env: configured, platform }),
      configured,
    );
  }
  assert.throws(
    () =>
      withMacosDevSigningEnvironment({
        args: ["dev"],
        env: { ...configured, CI: "true" },
        platform: "darwin",
      }),
    /disabled in CI/,
  );
});

test("macOS development signing rejects release identities and runner overrides", () => {
  assert.throws(
    () =>
      withMacosDevSigningEnvironment({
        args: ["dev"],
        env: { [FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV]: "-" },
        platform: "darwin",
      }),
    /cannot use the ad-hoc identity/,
  );

  for (const identity of [
    "Developer ID Application: Example Developer (TEAM123456)",
    "Apple Distribution: Example Developer (TEAM123456)",
    "A0E58BB05760AD697D37D62D2ABD24F7D44BD094",
    "Arbitrary Local Certificate",
  ]) {
    assert.throws(
      () =>
        withMacosDevSigningEnvironment({
          args: ["dev"],
          env: { [FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV]: identity },
          platform: "darwin",
        }),
      /Developer ID, distribution, hash-only, and arbitrary identities are not permitted/,
    );
  }

  for (const variable of MACOS_DEV_CARGO_RUNNER_ENV_VARS) {
    assert.throws(
      () =>
        withMacosDevSigningEnvironment({
          args: ["dev"],
          env: {
            [FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY_ENV]:
              "Filament Manager Development",
            [variable]: "existing-runner",
          },
          platform: "darwin",
        }),
      new RegExp(`cannot override existing ${variable}`),
    );
  }
});

test("macOS development runner signs and verifies with shell-free argument arrays", () => {
  const calls = [];
  const executablePath = path.join(
    tmpdir(),
    "target with spaces",
    "debug",
    "bambu-filament-manager",
  );
  const entitlementsPath = path.join(tmpdir(), "Entitlements with spaces.plist");
  const identity = "Apple Development: Example; identity is one argv value";

  signMacosDevExecutable({
    executablePath,
    identity,
    entitlementsPath,
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return {
        error: undefined,
        signal: null,
        status: 0,
        stdout: "",
        stderr:
          args[0] === "--display"
            ? `Executable=${executablePath}\nIdentifier=${MACOS_DEV_CODE_SIGNING_IDENTIFIER}\n`
            : "",
      };
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].command, "/usr/bin/codesign");
  assert.deepEqual(calls[0].args.slice(0, 4), ["--force", "--sign", identity, "--identifier"]);
  assert.equal(
    calls[0].args[calls[0].args.indexOf("--identifier") + 1],
    MACOS_DEV_CODE_SIGNING_IDENTIFIER,
  );
  assert.equal(calls[0].args.at(-1), executablePath);
  assert.equal(calls[0].args[calls[0].args.indexOf("--entitlements") + 1], entitlementsPath);
  assert.deepEqual(calls[1].args, ["--verify", "--strict", "--verbose=2", executablePath]);
  assert.deepEqual(calls[2].args, ["--display", "--verbose=4", executablePath]);
  assert.ok(calls.every((call) => call.options.shell === false));
});

test("macOS development runner rejects a mismatched signature identifier", () => {
  assert.throws(
    () =>
      signMacosDevExecutable({
        executablePath: path.join(tmpdir(), "target", "debug", "bambu-filament-manager"),
        identity: "Filament Manager Development",
        spawnSyncImpl(_command, args) {
          return {
            error: undefined,
            signal: null,
            status: 0,
            stdout: "",
            stderr: args[0] === "--display" ? "Identifier=no.bliatun.filamentmanager\n" : "",
          };
        },
      }),
    /Development signature identifier is not no\.bliatun\.filamentmanager\.dev/,
  );
});

test("macOS development runner fails closed before verification when signing fails", () => {
  let calls = 0;
  assert.throws(
    () =>
      signMacosDevExecutable({
        executablePath: path.join(tmpdir(), "target", "debug", "bambu-filament-manager"),
        identity: "Filament Manager Development",
        spawnSyncImpl() {
          calls += 1;
          return { error: undefined, signal: null, status: 1 };
        },
      }),
    /Development code signing failed with exit code 1/,
  );
  assert.equal(calls, 1);
});

test("macOS development runner only accepts the app binary inside a Cargo target", (context) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "Filament Manager signing fixture æøå-"));
  context.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const targetDirectory = path.join(fixtureRoot, "target", "debug");
  mkdirSync(targetDirectory, { recursive: true });
  const executablePath = path.join(targetDirectory, "bambu-filament-manager");
  writeFileSync(executablePath, "fixture", "utf8");
  chmodSync(executablePath, 0o755);

  assert.equal(
    resolveMacosDevExecutable(executablePath, {
      platform: "darwin",
      cwd: fixtureRoot,
      repoRoot: fixtureRoot,
      env: {},
    }),
    realpathSync(executablePath),
  );

  const outsideDirectory = path.join(fixtureRoot, "outside");
  mkdirSync(outsideDirectory);
  const outsideExecutable = path.join(outsideDirectory, "bambu-filament-manager");
  writeFileSync(outsideExecutable, "fixture", "utf8");
  chmodSync(outsideExecutable, 0o755);
  assert.throws(
    () =>
      resolveMacosDevExecutable(outsideExecutable, {
        platform: "darwin",
        cwd: fixtureRoot,
        repoRoot: fixtureRoot,
        env: {},
      }),
    /outside a Cargo target directory/,
  );
});

test("macOS development runner replaces itself so hot reload keeps one process", () => {
  const executablePath = path.join(
    tmpdir(),
    "target with spaces",
    "debug",
    "bambu-filament-manager",
  );
  const env = { TEST_MARKER: "preserved" };
  const sentinel = new Error("execve sentinel");
  let invocation;

  assert.throws(
    () =>
      replaceWithMacosDevExecutable({
        executablePath,
        args: ["--example", "value with spaces"],
        env,
        execveImpl(file, args, childEnv) {
          invocation = { file, args, childEnv };
          throw sentinel;
        },
      }),
    (error) => error === sentinel,
  );
  assert.deepEqual(invocation, {
    file: executablePath,
    args: [executablePath, "--example", "value with spaces"],
    childEnv: env,
  });
  assert.throws(
    () =>
      replaceWithMacosDevExecutable({
        executablePath,
        execveImpl: null,
      }),
    /requires Node\.js process\.execve support/,
  );
  assert.throws(
    () =>
      replaceWithMacosDevExecutable({
        executablePath,
        execveImpl() {},
      }),
    /process\.execve returned without replacing the development runner/,
  );
});

test(
  "the supported Node runtime preserves the runner PID through execve",
  { skip: process.platform === "win32" },
  () => {
    const execveProbe = [
      "const expectedPid = String(process.pid);",
      "const env = { ...process.env, FILAMENT_MANAGER_EXPECTED_PID: expectedPid };",
      "const assertion = 'process.exit(String(process.pid) === process.env.FILAMENT_MANAGER_EXPECTED_PID ? 0 : 1)';",
      "process.execve(process.execPath, [process.execPath, '-e', assertion], env);",
    ].join("\n");
    const result = spawnSync(process.execPath, ["-e", execveProbe], {
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  },
);

test("required macOS signing fails closed without a Developer ID identity", () => {
  assert.throws(
    () =>
      validateRequiredMacosSigningEnvironment({
        args: ["build", "--bundles", "dmg"],
        env: { [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "1" },
        platform: "darwin",
      }),
    /Developer ID Application identity is required/,
  );
});

test("required macOS signing rejects development and arbitrary identities", () => {
  for (const signingIdentity of ["Apple Development: Example", "invalid", "-"]) {
    assert.throws(
      () =>
        validateRequiredMacosSigningEnvironment({
          args: ["build"],
          env: {
            [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "1",
            [TAURI_MACOS_SIGNING_IDENTITY_ENV]: signingIdentity,
          },
          platform: "darwin",
        }),
      /Developer ID Application identity is required/,
    );
  }
});

test("required macOS signing fails closed without complete notarization credentials", () => {
  assert.throws(
    () =>
      validateRequiredMacosSigningEnvironment({
        args: ["build"],
        env: {
          [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "true",
          [TAURI_MACOS_SIGNING_IDENTITY_ENV]: "Developer ID Application: Example AS",
          APPLE_API_KEY: "KEY123",
        },
        platform: "darwin",
      }),
    /Complete notarization credentials are required/,
  );
});

test("required macOS signing accepts complete App Store Connect API credentials", () => {
  assert.doesNotThrow(() =>
    validateRequiredMacosSigningEnvironment({
      args: ["build", "--bundles", "dmg"],
      env: {
        [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "yes",
        [TAURI_MACOS_SIGNING_IDENTITY_ENV]: "Developer ID Application: Example AS",
        APPLE_API_ISSUER: "issuer",
        APPLE_API_KEY: "KEY123",
        APPLE_API_KEY_PATH: path.join(tmpdir(), "AuthKey_KEY123.p8"),
      },
      platform: "darwin",
    }),
  );
});

test("required macOS signing accepts complete Apple ID credentials", () => {
  assert.doesNotThrow(() =>
    validateRequiredMacosSigningEnvironment({
      args: ["build"],
      env: {
        [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "1",
        [FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV]:
          "Developer ID Application: Example AS",
        APPLE_ID: "developer@example.com",
        APPLE_PASSWORD: "app-specific-password",
        APPLE_TEAM_ID: "TEAM123456",
      },
      platform: "darwin",
    }),
  );
});

test("required macOS signing rejects --no-sign", () => {
  assert.throws(
    () =>
      validateRequiredMacosSigningEnvironment({
        args: ["build", "--no-sign"],
        env: { [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "1" },
        platform: "darwin",
      }),
    /cannot be combined with --no-sign/,
  );
});

test("required macOS signing rejects explicit Tauri config overrides", () => {
  const env = {
    [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "1",
    [TAURI_MACOS_SIGNING_IDENTITY_ENV]: "Developer ID Application: Example AS",
    APPLE_API_ISSUER: "issuer",
    APPLE_API_KEY: "KEY123",
    APPLE_API_KEY_PATH: path.join(tmpdir(), "AuthKey_KEY123.p8"),
  };

  for (const args of [
    ["build", "--config", '{"bundle":{"macOS":{"signingIdentity":"-"}}}'],
    ["build", "--config={}"],
    ["build", "-c={}"],
  ]) {
    assert.throws(
      () => validateRequiredMacosSigningEnvironment({ args, env, platform: "darwin" }),
      /cannot be combined with an explicit Tauri --config\/\-c value/,
    );
  }
});

test("signed macOS builds keep generated bundles outside File Provider folders", () => {
  const env = {
    [FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV]: "1",
    [TAURI_MACOS_SIGNING_IDENTITY_ENV]: "Developer ID Application: Example AS",
  };
  const temporaryDirectory = tmpdir();
  const signedBuildEnv = withMacosSigningBuildEnvironment({
    args: ["build", "--bundles", "dmg"],
    env,
    platform: "darwin",
    temporaryDirectory,
  });

  assert.notEqual(signedBuildEnv, env);
  assert.equal(
    signedBuildEnv.CARGO_TARGET_DIR,
    path.join(temporaryDirectory, "filament-manager-macos-signing-target"),
  );
  assert.equal(env.CARGO_TARGET_DIR, undefined);
  assert.equal(
    withMacosSigningBuildEnvironment({
      args: ["build"],
      env: { ...env, CARGO_TARGET_DIR: "/custom/target" },
      platform: "darwin",
    }).CARGO_TARGET_DIR,
    "/custom/target",
  );
  assert.equal(
    withMacosSigningBuildEnvironment({
      args: ["build"],
      env: {},
      platform: "darwin",
      temporaryDirectory,
    }).CARGO_TARGET_DIR,
    path.join(temporaryDirectory, "filament-manager-macos-signing-target"),
  );
  assert.equal(
    withMacosSigningBuildEnvironment({
      args: ["build", "--no-sign"],
      env: {},
      platform: "darwin",
      temporaryDirectory,
    }).CARGO_TARGET_DIR,
    undefined,
  );
  assert.equal(
    withMacosSigningBuildEnvironment({
      args: ["build", "--no-bundle"],
      env: {},
      platform: "darwin",
      temporaryDirectory,
    }).CARGO_TARGET_DIR,
    undefined,
  );
  assert.equal(
    withMacosSigningBuildEnvironment({
      args: ["build", "--bundles", "app"],
      env: { CI: "true" },
      platform: "darwin",
      temporaryDirectory,
    }).CARGO_TARGET_DIR,
    undefined,
  );
  assert.equal(
    withMacosSigningBuildEnvironment({
      args: ["dev"],
      env: {},
      platform: "darwin",
      temporaryDirectory,
    }).CARGO_TARGET_DIR,
    undefined,
  );
  for (const platform of ["linux", "win32"]) {
    assert.equal(
      withMacosSigningBuildEnvironment({
        args: ["build"],
        env: {},
        platform,
        temporaryDirectory,
      }).CARGO_TARGET_DIR,
      undefined,
    );
  }
});
