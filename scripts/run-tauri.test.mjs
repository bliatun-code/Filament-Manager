import assert from "node:assert/strict";
import test from "node:test";

import {
  FILAMENT_MANAGER_MACOS_SIGNING_IDENTITY_ENV,
  hasAppleSigningEnvironment,
  hasExplicitTauriConfig,
  macosSigningIdentityForBuild,
  withMacosSigningConfig,
} from "./run-tauri.mjs";

function injectedConfig(args) {
  const configIndex = args.indexOf("--config");
  assert.notEqual(configIndex, -1);
  return JSON.parse(args[configIndex + 1]);
}

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
