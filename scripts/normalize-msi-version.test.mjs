import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  normalizeMsiBundleVersion,
  releaseVersionFromRef,
  updateMsiBundleVersion,
} from "./normalize-msi-version.mjs";

const normalizeMsiVersionScript = fileURLToPath(
  new URL("./normalize-msi-version.mjs", import.meta.url),
);

function createReleaseFixture(t, packageVersion = "0.21.1") {
  const repoRoot = mkdtempSync(join(tmpdir(), "filament manager msi-"));
  const tauriRoot = join(repoRoot, "src-tauri");
  mkdirSync(tauriRoot, { recursive: true });
  writeFileSync(
    join(repoRoot, "package.json"),
    `${JSON.stringify({ version: packageVersion }, null, 2)}\n`,
  );
  writeFileSync(
    join(tauriRoot, "tauri.conf.json"),
    `${JSON.stringify({ productName: "Filament Manager", version: packageVersion }, null, 2)}\n`,
  );
  writeFileSync(
    join(tauriRoot, "Cargo.toml"),
    `[package]\nname = "bambu-filament-manager"\nversion = "${packageVersion}"\nedition = "2021"\n`,
  );
  t.after(() => rmSync(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

test("MSI release source accepts versions only from actual tags", () => {
  assert.equal(
    releaseVersionFromRef("v0.21.1", "9.9.9", "tag"),
    "0.21.1",
  );
  assert.equal(
    releaseVersionFromRef("v0.21.1-beta.7", "9.9.9", "tag"),
    "0.21.1-beta.7",
  );
  assert.equal(
    releaseVersionFromRef("v9.8.7", "0.21.1", "branch"),
    "0.21.1",
  );
  assert.equal(
    releaseVersionFromRef("v9.8.7", "0.21.1", undefined),
    "0.21.1",
  );
  assert.equal(
    releaseVersionFromRef("main", "0.21.1", "branch"),
    "0.21.1",
  );
  assert.equal(
    releaseVersionFromRef(undefined, "0.21.1", "tag"),
    "0.21.1",
  );
});

test("MSI prerelease versions preserve the numeric build identifier", () => {
  assert.equal(normalizeMsiBundleVersion("0.0.0"), "0.0.0");
  assert.equal(normalizeMsiBundleVersion("0.21.1"), "0.21.1");
  assert.equal(normalizeMsiBundleVersion("0.21.1-beta.7"), "0.21.1-7");
  assert.equal(normalizeMsiBundleVersion("0.21.1-beta.0"), "0.21.1-0");
  assert.equal(normalizeMsiBundleVersion("0.21.1-rc.42"), "0.21.1-42");
  assert.equal(normalizeMsiBundleVersion("0.21.1-beta"), "0.21.1-1");
  assert.equal(normalizeMsiBundleVersion("0.21.1-0"), "0.21.1-0");
  assert.equal(normalizeMsiBundleVersion("0.21.1-7"), "0.21.1-7");
  assert.equal(
    normalizeMsiBundleVersion("0.21.1-65535"),
    "0.21.1-65535",
  );
  assert.throws(
    () => normalizeMsiBundleVersion("0.21.1.7"),
    /valid MSI bundle version/i,
  );
});

test("MSI versions accept the Windows Installer numeric limits", () => {
  assert.equal(
    normalizeMsiBundleVersion("255.255.65535"),
    "255.255.65535",
  );
  assert.equal(
    normalizeMsiBundleVersion("255.255.65535-rc.65535"),
    "255.255.65535-65535",
  );
});

test("MSI versions reject numeric fields over Windows Installer limits", () => {
  const invalidVersions = [
    ["256.0.0", /major.*255/i],
    ["1.256.0", /minor.*255/i],
    ["1.2.65536", /patch.*65,?535/i],
    ["1.2.3-beta.65536", /build.*65,?535/i],
    [`${"9".repeat(400)}.0.0`, /major.*255/i],
  ];

  for (const [version, expectedError] of invalidVersions) {
    assert.throws(
      () => normalizeMsiBundleVersion(version),
      expectedError,
      version,
    );
  }
});

test("MSI normalization rejects unsupported release version forms", () => {
  const invalidVersions = [
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-07",
    "1.2.3-beta.0007",
    "1.2.3-beta..7",
    "1.2.3-ß.7",
    "1.2.3-",
    "1.2.3.7",
    "1.2.3+7",
    "1.2.3-beta.7+9",
    " 1.2.3 ",
  ];

  for (const version of invalidVersions) {
    assert.throws(
      () => normalizeMsiBundleVersion(version),
      /valid MSI bundle version/i,
      version,
    );
  }
});

test("MSI normalization updates both Tauri manifests from a directory with spaces", (t) => {
  const repoRoot = createReleaseFixture(t, "0.21.1-beta.4");
  const result = updateMsiBundleVersion({
    refName: "v9.8.7",
    refType: "branch",
    repoRoot,
  });
  const tauriConfig = JSON.parse(
    readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  const cargoToml = readFileSync(
    join(repoRoot, "src-tauri", "Cargo.toml"),
    "utf8",
  );

  assert.deepEqual(result, {
    msiVersion: "0.21.1-4",
    rawVersion: "0.21.1-beta.4",
  });
  assert.equal(tauriConfig.version, "0.21.1-4");
  assert.equal(tauriConfig.productName, "Filament Manager");
  assert.match(cargoToml, /^version = "0\.21\.1-4"$/m);
  assert.match(cargoToml, /^edition = "2021"$/m);
});

test("MSI normalization validates both manifests before writing", (t) => {
  const repoRoot = createReleaseFixture(t);
  const cargoTomlPath = join(repoRoot, "src-tauri", "Cargo.toml");
  const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
  const originalTauriConfig = readFileSync(tauriConfigPath, "utf8");
  writeFileSync(cargoTomlPath, "[package]\nname = \"missing-version\"\n");

  assert.throws(
    () =>
      updateMsiBundleVersion({
        refName: "v0.21.1",
        refType: "tag",
        repoRoot,
      }),
    /Could not find the package version/,
  );
  assert.equal(readFileSync(tauriConfigPath, "utf8"), originalTauriConfig);
});

test("MSI numeric bounds are validated before either manifest is written", (t) => {
  const repoRoot = createReleaseFixture(t);
  const cargoTomlPath = join(repoRoot, "src-tauri", "Cargo.toml");
  const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
  const originalCargoToml = readFileSync(cargoTomlPath, "utf8");
  const originalTauriConfig = readFileSync(tauriConfigPath, "utf8");

  assert.throws(
    () =>
      updateMsiBundleVersion({
        refName: "v256.0.0",
        refType: "tag",
        repoRoot,
      }),
    /major.*255/i,
  );
  assert.equal(readFileSync(cargoTomlPath, "utf8"), originalCargoToml);
  assert.equal(readFileSync(tauriConfigPath, "utf8"), originalTauriConfig);
});

test("MSI --check validates the repository version without writing manifests", (t) => {
  const repoRoot = createReleaseFixture(t, "0.21.1-beta.7");
  const cargoTomlPath = join(repoRoot, "src-tauri", "Cargo.toml");
  const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
  const originalCargoToml = readFileSync(cargoTomlPath, "utf8");
  const originalTauriConfig = readFileSync(tauriConfigPath, "utf8");

  const result = spawnSync(
    process.execPath,
    [normalizeMsiVersionScript, "--check"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REF_NAME: "main",
        GITHUB_REF_TYPE: "branch",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MSI bundle version is valid: 0\.21\.1-7/);
  assert.equal(readFileSync(cargoTomlPath, "utf8"), originalCargoToml);
  assert.equal(readFileSync(tauriConfigPath, "utf8"), originalTauriConfig);
});

test("MSI --check rejects overflow without writing manifests", (t) => {
  const repoRoot = createReleaseFixture(t, "256.0.0");
  const cargoTomlPath = join(repoRoot, "src-tauri", "Cargo.toml");
  const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
  const originalCargoToml = readFileSync(cargoTomlPath, "utf8");
  const originalTauriConfig = readFileSync(tauriConfigPath, "utf8");

  const result = spawnSync(
    process.execPath,
    [normalizeMsiVersionScript, "--check"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REF_NAME: "main",
        GITHUB_REF_TYPE: "branch",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /major.*255/i);
  assert.equal(readFileSync(cargoTomlPath, "utf8"), originalCargoToml);
  assert.equal(readFileSync(tauriConfigPath, "utf8"), originalTauriConfig);
});
