import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseRustToolchain } from "./read-rust-toolchain.mjs";

const repoFile = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const rootManifest = repoFile("Cargo.toml");
const tauriManifest = repoFile("src-tauri/Cargo.toml");
const toolchain = repoFile("rust-toolchain.toml");
const rustfmt = repoFile("rustfmt.toml");
const dependabot = repoFile(".github/dependabot.yml");
const workflows = [
  ["CI", repoFile(".github/workflows/ci.yml")],
  ["release", repoFile(".github/workflows/release-build.yml")],
  ["supply-chain", repoFile(".github/workflows/supply-chain.yml")],
];

function rustSetupSteps(workflow) {
  return workflow
    .split(/^      - name: Setup Rust$/m)
    .slice(1)
    .map((section) => section.split(/^      - name:/m)[0]);
}

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing ${jobName} workflow job`);
  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return remainder.slice(0, nextJob === -1 ? undefined : nextJob);
}

function workflowStep(job, stepName) {
  const marker = `      - name: ${stepName}\n`;
  const sections = job.split(marker);
  assert.equal(sections.length, 2, `expected exactly one ${stepName} step`);
  return sections[1].split(/^      - name:/m)[0];
}

test("Cargo packages declare the supported Rust 1.88 lower bound", () => {
  for (const manifest of [rootManifest, tauriManifest]) {
    const packageSection = manifest
      .slice(manifest.indexOf("[package]"))
      .split(/^\[(?!package\])/m)[0];
    assert.match(packageSection, /^rust-version = "1\.88"$/m);
  }
});

test("the Rust workspace uses edition 2024 with the MSRV-aware resolver", () => {
  for (const manifest of [rootManifest, tauriManifest]) {
    const packageSection = manifest
      .slice(manifest.indexOf("[package]"))
      .split(/^\[(?!package\])/m)[0];
    assert.match(packageSection, /^edition = "2024"$/m);
  }
  assert.match(rootManifest, /^resolver = "3"$/m);
});

test("the edition migration keeps formatting changes isolated", () => {
  assert.match(rustfmt, /^style_edition = "2021"$/m);
});

test("the repository selects one complete reviewed Rust toolchain", () => {
  assert.match(toolchain, /^\[toolchain\]$/m);
  assert.match(parseRustToolchain(toolchain), /^\d+\.\d+\.\d+$/);
  assert.match(toolchain, /^profile = "minimal"$/m);
  assert.match(toolchain, /^components = \["clippy", "rustfmt"\]$/m);
});

test("Dependabot monitors the pinned Rust toolchain", () => {
  const rustToolchainUpdates = [
    ...dependabot.matchAll(/^  - package-ecosystem: "rust-toolchain"$/gm),
  ];
  assert.equal(rustToolchainUpdates.length, 1);
  const blockStart = rustToolchainUpdates[0].index;
  const nextBlock = dependabot.indexOf("\n  - package-ecosystem:", blockStart + 1);
  const updateBlock = dependabot.slice(
    blockStart,
    nextBlock === -1 ? undefined : nextBlock,
  );
  assert.match(updateBlock, /^    directory: "\/"$/m);
  assert.match(updateBlock, /^      interval: "weekly"$/m);
});

test("every reviewed Rust workflow setup installs the exact toolchain", () => {
  const setupSteps = workflows.flatMap(([name, workflow]) =>
    rustSetupSteps(workflow).map((step) => [name, step]),
  );
  assert.equal(setupSteps.length, 7);

  for (const [name, step] of setupSteps) {
    assert.match(
      step,
      /uses: dtolnay\/rust-toolchain@[0-9a-f]{40} # master/,
      `${name} must keep the Rust setup action immutable`,
    );
    assert.match(
      step,
      /^          toolchain: \$\{\{ steps\.rust-toolchain\.outputs\.toolchain \}\}$/m,
      `${name} must install the release read from rust-toolchain.toml`,
    );
  }
});

test("every Rust setup reads the sole release pin after Node 24 is installed", () => {
  for (const [workflowIndex, jobNames] of [
    [0, ["shared-contracts", "migration-integrity", "macos-smoke", "windows-smoke"]],
    [1, ["build-macos-dmg", "build-windows-msi"]],
    [2, ["cargo-audit"]],
  ]) {
    for (const jobName of jobNames) {
      const job = workflowJob(workflows[workflowIndex][1], jobName);
      const readers = [...job.matchAll(/^      - name: Read Rust toolchain\n        id: rust-toolchain\n        run: node \.\/scripts\/read-rust-toolchain\.mjs --github-output$/gm)];
      assert.equal(readers.length, 1, `${jobName} must run the validated pin reader exactly once`);
      const nodeSetup = job.match(/      - name: Setup Node\n        uses: actions\/setup-node@[0-9a-f]{40}[^\n]*\n        with:\n          node-version: 24\n/);
      assert.ok(nodeSetup, `${jobName} must install Node 24 before reading the pin`);
      assert.ok(nodeSetup.index < readers[0].index, `${jobName} must install Node first`);
      assert.ok(readers[0].index < job.indexOf("      - name: Setup Rust\n"), `${jobName} must read the pin before installing Rust`);
    }
  }
});

test("both required smoke jobs check Rust 1.88 before full verification", () => {
  const ciWorkflow = workflows[0][1];
  for (const jobName of ["macos-smoke", "windows-smoke"]) {
    const job = workflowJob(ciWorkflow, jobName);
    assert.equal(
      (job.match(/^      - name: Setup Rust MSRV$/gm) ?? []).length,
      1,
      `${jobName} must install the MSRV exactly once`,
    );
    assert.match(
      job,
      /- name: Setup Rust MSRV\s+uses: dtolnay\/rust-toolchain@[0-9a-f]{40} # master\s+with:\s+toolchain: 1\.88\.0/,
    );
    assert.match(
      job,
      /- name: Check Rust MSRV\s+env:\s+CARGO_TARGET_DIR: target\/msrv\s+run: cargo \+1\.88\.0 check --workspace --all-targets --all-features --locked/,
    );
    const msrvSetupIndex = job.indexOf("- name: Setup Rust MSRV");
    const msrvCheckIndex = job.indexOf("- name: Check Rust MSRV");
    const reviewedSetupIndex = job.indexOf("- name: Setup Rust\n");
    const cacheIndex = job.indexOf("- name: Restore Rust dependencies");
    const verificationIndex = job.indexOf("- name: Run full verification");
    assert.ok(
      msrvSetupIndex < cacheIndex && reviewedSetupIndex < cacheIndex,
      `${jobName} must install both compilers before computing the cache key`,
    );
    assert.ok(
      cacheIndex < msrvCheckIndex && msrvCheckIndex < verificationIndex,
      `${jobName} must check the lower bound after restoring dependencies and before full verification`,
    );
    assert.equal(
      (job.match(/\bCARGO_TARGET_DIR:/g) ?? []).length,
      1,
      `${jobName} must scope the separate target directory to the MSRV check`,
    );
  }
});

test("native Rust caches save only successful main pushes and exclude workspace outputs", () => {
  const ciWorkflow = workflows[0][1];
  assert.equal(
    (ciWorkflow.match(/uses: Swatinem\/rust-cache@/g) ?? []).length,
    2,
    "only the two native smoke jobs use the Rust dependency cache",
  );
  for (const jobName of ["macos-smoke", "windows-smoke"]) {
    const job = workflowJob(ciWorkflow, jobName);
    const cache = workflowStep(job, "Restore Rust dependencies");
    assert.match(cache, /uses: Swatinem\/rust-cache@[0-9a-f]{40} # v2\.\d+\.\d+/);
    assert.match(cache, /^          prefix-key: v\d+-native-smoke$/m);
    assert.match(cache, /^          workspaces: ["']?\. -> target["']?$/m);
    assert.match(
      cache,
      /^          save-if: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' \}\}$/m,
      `${jobName} must only populate caches from trusted pushes to main`,
    );
    for (const setting of [
      "cache-bin",
      "cache-workspace-crates",
      "cache-all-crates",
      "cache-on-failure",
    ]) {
      assert.match(
        cache,
        new RegExp(`^          ${setting}: ["']?false["']?$`, "m"),
        `${jobName} must explicitly disable ${setting}`,
      );
    }
    assert.doesNotMatch(
      cache,
      /^          (?:cache-directories|shared-key|cmd-format):/m,
      `${jobName} must use dependency paths and the action's compiler/job isolation`,
    );
    assert.doesNotMatch(
      cache,
      /^          (?:add-job-id-key|add-rust-environment-hash-key):\s*["']?false/m,
      `${jobName} must retain compiler, manifest, lockfile and job cache keys`,
    );
    const environment = cache.match(/^          env-vars: (.+)$/m);
    assert.ok(environment, `${jobName} must account for native runner images and SDKs`);
    const prefixes = new Set(environment[1].replace(/["']/g, "").split(/\s+/));
    for (const prefix of [
      "ImageOS",
      "ImageVersion",
      "MACOSX_DEPLOYMENT_TARGET",
      "SDKROOT",
    ]) {
      assert.ok(prefixes.has(prefix), `${jobName} cache key must include ${prefix}`);
    }
  }
});

test("cache hits cannot skip native verification or packaged application gates", () => {
  const ciWorkflow = workflows[0][1];
  const commonGates = ["Check Rust MSRV", "Run full verification"];
  const nativeGates = {
    "macos-smoke": [
      "Run data-backed Companion E2E",
      "Build database upgrade candidate",
      "Prepare sanitized historical database fixture",
      "Exercise database upgrade and restart",
      "Build packaged macOS smoke bundle",
      "Exercise packaged macOS mutating E2E",
    ],
    "windows-smoke": [
      "Run static path portability contract",
      "Run static command portability contract",
      "Run portability checks",
      "Prepare MSI smoke version override",
      "Build MSI smoke bundle",
      "Verify MSI smoke bundle",
      "Exercise clean MSI installation",
    ],
  };
  for (const [jobName, gates] of Object.entries(nativeGates)) {
    const job = workflowJob(ciWorkflow, jobName);
    assert.doesNotMatch(job, /^    (?:if|continue-on-error):/m);
    assert.doesNotMatch(job, /cache-hit|lookup-only:/);
    for (const gate of [...commonGates, ...gates]) {
      const step = workflowStep(job, gate);
      assert.match(step, /^        run:/m, `${gate} must execute its verification`);
      assert.doesNotMatch(
        step,
        /^        (?:if|continue-on-error):/m,
        `${gate} must remain an unconditional, blocking gate`,
      );
    }
  }
});

test("smoke CI installs the components used by the full verification", () => {
  const ciWorkflow = workflows[0][1];
  const ciSteps = ["macos-smoke", "windows-smoke"].flatMap((jobName) =>
    rustSetupSteps(workflowJob(ciWorkflow, jobName)),
  );
  assert.equal(ciSteps.length, 2);
  for (const step of ciSteps) {
    assert.match(step, /^          components: clippy,rustfmt$/m);
  }
});
