import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/supply-chain.yml", import.meta.url),
  "utf8",
);
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const npmLicensePolicy = JSON.parse(
  readFileSync(
    new URL("../config/dependency-license-policy.json", import.meta.url),
    "utf8",
  ),
);
const cargoDenyPolicy = readFileSync(
  new URL("../deny.toml", import.meta.url),
  "utf8",
);

test("supply-chain workflow audits dependency pull requests and stays least privilege", () => {
  assert.match(workflow, /^name: Scheduled supply-chain audit$/m);
  const pullRequestTrigger = workflow.match(
    /^  pull_request:\n    branches:\n      - main\n    paths:\n(?:      - "[^"]+"\n)+/m,
  )?.[0];
  assert.ok(pullRequestTrigger, "dependency pull request trigger must be explicit");
  for (const path of [
    ".github/workflows/release-build.yml",
    ".github/workflows/supply-chain.yml",
    ".nvmrc",
    "Cargo.lock",
    "Cargo.toml",
    "config/dependency-license-policy.json",
    "deny.toml",
    "package-lock.json",
    "package.json",
    "rust-toolchain.toml",
    "scripts/check-npm-licenses.mjs",
    "scripts/release-workflow-contract.test.mjs",
    "scripts/supply-chain-workflow-contract.test.mjs",
    "src-tauri/Cargo.toml",
    "ui/package-lock.json",
    "ui/package.json",
  ]) {
    assert.match(
      pullRequestTrigger,
      new RegExp(`      - "${path.replaceAll(".", "\\.")}"`),
    );
  }
  assert.match(workflow, /^  schedule:\n    - cron: "[^"]+"$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.equal(
    [...workflow.matchAll(/^\s*permissions:/gm)].length,
    1,
    "jobs must not override the workflow's read-only permissions",
  );
  assert.doesNotMatch(workflow, /^\s+\S+:\s*write\s*$/m);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.equal(
    workflow.split("persist-credentials: false").length - 1,
    3,
  );
});

test("SBOM smoke uses the same pinned fail-closed generator as release", () => {
  assert.match(workflow, /^  sbom-smoke:\n    name: SBOM generation$/m);
  assert.match(
    workflow,
    /anchore\/sbom-action@e22c389904149dbc22b58101806040fa8d37a610 # v0\.24\.0/,
  );
  assert.match(workflow, /syft-version: v1\.51\.0/);
  assert.match(workflow, /dependency-snapshot: false/);
  assert.match(workflow, /upload-artifact: false/);
  assert.match(workflow, /upload-release-assets: false/);
  assert.match(workflow, /node \.\/scripts\/verify-release-sbom\.mjs/);
  assert.match(workflow, /--expected-package=bambu-filament-manager/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test("npm audit covers both lockfiles at a fail-closed severity threshold", () => {
  assert.match(
    workflow,
    /npm audit --audit-level=moderate --package-lock-only/,
  );
  assert.match(
    workflow,
    /npm --prefix \.\/ui audit --audit-level=moderate --package-lock-only/,
  );
  assert.match(workflow, /npm run check:npm-licenses/);
  assert.equal(
    packageManifest.scripts["check:npm-licenses"],
    "node ./scripts/check-npm-licenses.mjs",
  );
});

test("Cargo audit and license tools are exact, locked and fail closed", () => {
  assert.match(
    workflow,
    /cargo install --locked cargo-audit --version 0\.22\.2/,
  );
  assert.match(workflow, /^        run: cargo audit$/m);
  assert.doesNotMatch(workflow, /cargo audit[^\n]*(?:--ignore|--stale)/);
  assert.match(
    workflow,
    /cargo install --locked cargo-deny --version 0\.20\.2/,
  );
  assert.match(workflow, /cargo deny --all-features check licenses/);
  assert.match(cargoDenyPolicy, /^include-dev = true$/m);
  assert.match(cargoDenyPolicy, /^confidence-threshold = 0\.93$/m);
});

test("license policies are explicit and have no blanket package exceptions", () => {
  assert.equal(npmLicensePolicy.schemaVersion, 1);
  assert.ok(npmLicensePolicy.allowedLicenses.includes("AGPL-3.0-or-later"));
  assert.ok(npmLicensePolicy.allowedLicenses.includes("MPL-2.0"));
  assert.deepEqual(npmLicensePolicy.packageExceptions, []);
  assert.doesNotMatch(cargoDenyPolicy, /^\[\[licenses\.exceptions\]\]/m);
});
