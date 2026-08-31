import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/supply-chain.yml", import.meta.url),
  "utf8",
);
const dependabot = readFileSync(
  new URL("../.github/dependabot.yml", import.meta.url),
  "utf8",
);
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const uiPackageManifest = JSON.parse(
  readFileSync(new URL("../ui/package.json", import.meta.url), "utf8"),
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
const dependencyNameKey =
  String.raw`(?:"dependency-name"|'dependency-name'|dependency-name)\s*:`;
const updateTypesKey =
  String.raw`(?:"update-types"|'update-types'|update-types)\s*:`;
const expectedDependabotIgnoreRules = [
  {
    dependency: "@types/node",
    updateTypes: ["version-update:semver-major"],
  },
  {
    dependency: "typescript",
    updateTypes: ["version-update:semver-major"],
  },
];

function unquoteYamlScalar(value) {
  const quoted = value.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : value;
}

function parseDependabotIgnoreRules(source) {
  const lines = source.split("\n");
  const dependencyNameKeyCount =
    source.match(new RegExp(dependencyNameKey, "g"))?.length ?? 0;
  const rules = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const dependency = lines[lineIndex].match(
      new RegExp(`^(\\s*)-\\s+${dependencyNameKey}\\s*(\\S(?:.*\\S)?)\\s*$`),
    );
    if (!dependency) {
      continue;
    }

    const ruleIndent = dependency[1].length;
    const updateTypes = [];
    let foundUpdateTypes = false;

    for (
      let childIndex = lineIndex + 1;
      childIndex < lines.length;
      childIndex += 1
    ) {
      const childLine = lines[childIndex];
      if (childLine.trim() === "") {
        continue;
      }

      const childIndent = childLine.match(/^\s*/)[0].length;
      if (childIndent <= ruleIndent) {
        break;
      }
      if (new RegExp(`^\\s*${updateTypesKey}\\s*$`).test(childLine)) {
        foundUpdateTypes = true;
        continue;
      }
      if (foundUpdateTypes) {
        const updateType = childLine.match(/^\s*-\s+(\S(?:.*\S)?)\s*$/);
        if (updateType) {
          updateTypes.push(unquoteYamlScalar(updateType[1]));
        }
      }
    }

    assert.ok(
      foundUpdateTypes,
      `Dependabot ignore for ${dependency[2]} must declare update-types`,
    );
    rules.push({
      dependency: unquoteYamlScalar(dependency[2]),
      updateTypes,
    });
  }

  assert.equal(
    rules.length,
    dependencyNameKeyCount,
    "every Dependabot dependency-name rule must use the reviewed block format",
  );
  return rules;
}

function assertDependabotIgnorePolicy(source) {
  assert.deepEqual(
    parseDependabotIgnoreRules(source),
    expectedDependabotIgnoreRules,
  );
}

test("supply-chain workflow audits dependency pull requests and stays least privilege", () => {
  assert.match(workflow, /^name: Scheduled supply-chain audit$/m);
  const pullRequestTrigger = workflow.match(
    /^  pull_request:\n    branches:\n      - main\n    paths:\n(?:      - "[^"]+"\n)+/m,
  )?.[0];
  assert.ok(pullRequestTrigger, "dependency pull request trigger must be explicit");
  for (const path of [
    ".github/dependabot.yml",
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
    "scripts/rust-toolchain-contract.test.mjs",
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
    /anchore\/sbom-action@3ad7283483fc7af8ff2b4ea19663c2d5ca935e26 # v0\.24\.2/,
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

test("Dependabot surfaces majors except for explicit UI compatibility holds", () => {
  assertDependabotIgnorePolicy(dependabot);
  assert.equal(uiPackageManifest.engines.node, ">=24 <25");
  assert.match(uiPackageManifest.devDependencies["@types/node"], /^\^24\./);
  assert.match(uiPackageManifest.devDependencies.typescript, /^\^6\./);
});

test("Dependabot ignore policy parser accepts either YAML quote style", () => {
  const singleQuoted = dependabot
    .replace('dependency-name: "@types/node"', "dependency-name: '@types/node'")
    .replace(
      '- "version-update:semver-major"',
      "- 'version-update:semver-major'",
    );

  assert.deepEqual(
    parseDependabotIgnoreRules(singleQuoted),
    parseDependabotIgnoreRules(dependabot),
  );
});

test("Dependabot ignore policy rejects alternate wildcard key syntax", () => {
  for (const dependencyLine of [
    '      - "dependency-name": "*"',
    '      - dependency-name : "*"',
  ]) {
    const extraRule = [
      dependencyLine,
      '        "update-types" :',
      "          - 'version-update:semver-major'",
    ].join("\n");
    const withWildcard = dependabot.replace(
      "    groups:\n      ui-npm-patches:",
      `${extraRule}\n    groups:\n      ui-npm-patches:`,
    );

    assert.throws(() => assertDependabotIgnorePolicy(withWildcard));
  }
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
