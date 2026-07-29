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

test("supply-chain workflow is scheduled, manually runnable and least privilege", () => {
  assert.match(workflow, /^name: Scheduled supply-chain audit$/m);
  assert.match(workflow, /^  schedule:\n    - cron: "[^"]+"$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request):/m);
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
    2,
  );
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
    /cargo install --locked cargo-audit --version 0\.22\.1/,
  );
  assert.match(workflow, /^        run: cargo audit$/m);
  assert.doesNotMatch(workflow, /cargo audit[^\n]*(?:--ignore|--stale)/);
  assert.match(
    workflow,
    /cargo install --locked cargo-deny --version 0\.19\.4/,
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
