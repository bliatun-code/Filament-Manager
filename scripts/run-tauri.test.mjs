import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV,
  FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING_ENV,
  TAURI_MACOS_SIGNING_IDENTITY_ENV,
  hasAppleSigningEnvironment,
  hasExplicitTauriConfig,
  macosSigningIdentityForBuild,
  validateRequiredMacosSigningEnvironment,
  withMacosSigningBuildEnvironment,
  withMacosSigningConfig,
} from "./run-tauri.mjs";

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

test("required macOS signing keeps generated bundles outside File Provider folders", () => {
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
    }).CARGO_TARGET_DIR,
    undefined,
  );
});
