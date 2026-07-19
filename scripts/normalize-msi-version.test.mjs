import assert from "node:assert/strict";
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

import {
  normalizeMsiBundleVersion,
  releaseVersionFromRef,
  updateMsiBundleVersion,
} from "./normalize-msi-version.mjs";

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
  assert.equal(normalizeMsiBundleVersion("0.21.1"), "0.21.1");
  assert.equal(normalizeMsiBundleVersion("0.21.1-beta.7"), "0.21.1-7");
  assert.equal(normalizeMsiBundleVersion("0.21.1-rc.42"), "0.21.1-42");
  assert.equal(normalizeMsiBundleVersion("0.21.1-beta"), "0.21.1-1");
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
