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

function cachePaths(step) {
  const match = step.match(/^          path: \|\n((?:            .+\n)+)/m);
  assert.ok(match, "cache paths must be an explicit list");
  return match[1].trim().split(/\n\s*/).sort();
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
    const identifyCacheIndex = job.indexOf("- name: Identify Rust cache");
    const cacheIndex = job.indexOf("- name: Restore Rust dependencies");
    const verificationIndex = job.indexOf("- name: Run full verification");
    assert.ok(
      msrvSetupIndex < identifyCacheIndex && reviewedSetupIndex < identifyCacheIndex,
      `${jobName} must install both compilers before computing the cache key`,
    );
    assert.ok(identifyCacheIndex < cacheIndex, `${jobName} must identify its environment before restoring`);
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

test("native Rust caches isolate the environment and dependency graph using approved actions", () => {
  const ciWorkflow = workflows[0][1];
  for (const action of ["restore", "save"]) {
    assert.equal(
      (ciWorkflow.match(new RegExp(`uses: actions/cache/${action}@`, "g")) ?? []).length,
      2,
      `only the two native smoke jobs use the Rust cache ${action} action`,
    );
  }
  assert.doesNotMatch(ciWorkflow, /uses: Swatinem\/rust-cache@/);
  for (const jobName of ["macos-smoke", "windows-smoke"]) {
    const job = workflowJob(ciWorkflow, jobName);
    assert.match(job, /^    env:\n      CARGO_INCREMENTAL: ["']?0["']?$/m);
    const identify = workflowStep(job, "Identify Rust cache");
    assert.match(identify, /^        id: rust-cache-environment$/m);
    assert.match(identify, /^        run: node \.\/scripts\/read-rust-cache-environment\.mjs --github-output$/m);
    assert.doesNotMatch(identify, /^        (?:if|continue-on-error):/m);
    const cache = workflowStep(job, "Restore Rust dependencies");
    assert.match(cache, /^        id: rust-cache$/m);
    assert.match(cache, /uses: actions\/cache\/restore@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
    const key = cache.match(/^          key: (.+)$/m)?.[1];
    assert.equal(
      key,
      "v2-native-smoke-${{ github.job }}-${{ runner.os }}-${{ runner.arch }}-${{ steps.rust-cache-environment.outputs.hash }}-${{ hashFiles('Cargo.lock', '**/Cargo.toml', 'rust-toolchain.toml', '**/.cargo/config', '**/.cargo/config.toml') }}",
      `${jobName} must isolate job, platform, both compilers, native environment and dependency inputs`,
    );
    assert.doesNotMatch(
      cache,
      /^          (?:restore-keys|lookup-only|enableCrossOsArchive):/m,
      `${jobName} must restore only an exact cache for its environment and dependency graph`,
    );
    assert.doesNotMatch(cache, /^        (?:if|continue-on-error):/m);
  }
});

test("native Rust cache paths exclude application bundles, credentials and fixture state", () => {
  const expectedPaths = [
    "~/.cargo/registry/index",
    "~/.cargo/registry/cache",
    "~/.cargo/registry/src",
    "~/.cargo/git/db",
    "~/.cargo/git/checkouts",
    ...["target/debug", "target/release", "target/msrv/debug"].flatMap((profile) =>
      ["deps", "build", ".fingerprint"].map((directory) => `${profile}/${directory}`),
    ),
  ].sort();
  for (const jobName of ["macos-smoke", "windows-smoke"]) {
    const job = workflowJob(workflows[0][1], jobName);
    for (const stepName of ["Restore Rust dependencies", "Save Rust dependencies"]) {
      assert.deepEqual(cachePaths(workflowStep(job, stepName)), expectedPaths, `${jobName} ${stepName}`);
    }
  }
});

test("native cache cleanup prepares valid target markers inside the workflow run block", () => {
  const saveCondition = "${{ success() && github.event_name == 'push' && github.ref == 'refs/heads/main' && steps.rust-cache.outputs.cache-hit != 'true' }}";
  const signature = "Signature: 8a477f597d28d172789f06886806bc55";
  for (const jobName of ["macos-smoke", "windows-smoke"]) {
    const job = workflowJob(workflows[0][1], jobName);
    const markerName = "Prepare cache-clean target markers";
    const marker = workflowStep(job, markerName);
    assert.equal(marker.match(/^        if: (.+)$/m)?.[1], saveCondition, `${jobName} markers must follow the trusted successful-write policy`);
    assert.doesNotMatch(marker, /^        continue-on-error:/m);
    const windows = jobName === "windows-smoke";
    assert.match(marker, windows ? /^        shell: pwsh$/m : /^        shell: bash$/m, `${jobName} must prepare markers using its native supported shell`);

    const runMarker = "        run: |\n";
    const runStart = marker.indexOf(runMarker);
    assert.notEqual(runStart, -1, `${jobName} markers must use an explicit run block`);
    const commands = marker.slice(runStart + runMarker.length);
    for (const line of commands.split("\n").filter((line) => line.trim() !== "")) {
      assert.match(line, /^ {10}/, `${jobName} marker command must stay inside the YAML run block: ${line}`);
    }

    assert.ok(commands.includes(signature), `${jobName} markers must use Cargo's cache-directory signature`);
    for (const path of ["target/CACHEDIR.TAG", "target/msrv/CACHEDIR.TAG"]) {
      assert.ok(commands.includes(path), `${jobName} must prepare ${path} before Cargo clean`);
    }
    const markerIndex = job.indexOf(`- name: ${markerName}`);
    const cleanupIndex = job.indexOf("- name: Clean workspace artifacts for cache");
    const saveIndex = job.indexOf("- name: Save Rust dependencies");
    assert.ok(markerIndex > job.lastIndexOf("- name: Upload "), `${jobName} must complete smoke gates and uploads before preparing cache markers`);
    assert.ok(markerIndex < cleanupIndex && cleanupIndex < saveIndex, `${jobName} must prepare target markers before cleanup and cache saving`);
  }
});

test("native Rust caches save only after successful main gates and workspace cleanup", () => {
  const members = JSON.parse(rootManifest.match(/^members = (\[[^\n]+\])$/m)?.[1]);
  const packages = [rootManifest, ...members.map((member) => repoFile(`${member}/Cargo.toml`))]
    .map((manifest) => manifest.match(/^\[package\]\nname = "([^"]+)"$/m)?.[1]);
  assert.ok(packages.every(Boolean), "every workspace package must be identified for cleanup");
  const packageFlags = packages.map((name) => `--package ${name}`).join(" ");
  const expectedCommands = [
    `cargo clean --locked --offline ${packageFlags} --target-dir target`,
    `cargo clean --locked --offline ${packageFlags} --target-dir target --release`,
    `cargo +1.88.0 clean --locked --offline ${packageFlags} --target-dir target/msrv`,
  ];
  const saveCondition = "${{ success() && github.event_name == 'push' && github.ref == 'refs/heads/main' && steps.rust-cache.outputs.cache-hit != 'true' }}";
  for (const jobName of ["macos-smoke", "windows-smoke"]) {
    const job = workflowJob(workflows[0][1], jobName);
    const cleanup = workflowStep(job, "Clean workspace artifacts for cache");
    const save = workflowStep(job, "Save Rust dependencies");
    for (const [name, step] of [["cleanup", cleanup], ["save", save]]) {
      assert.equal(step.match(/^        if: (.+)$/m)?.[1], saveCondition, `${jobName} ${name} must follow the trusted successful-write policy`);
      assert.doesNotMatch(step, /^        continue-on-error:/m);
    }
    const windows = jobName === "windows-smoke";
    assert.match(cleanup, windows ? /^        shell: pwsh$/m : /^        shell: bash$/m, `${jobName} must use its native supported shell`);
    const commands = cleanup.match(/^        run: \|\n((?:          .+\n)+)/m)?.[1];
    assert.ok(commands, `${jobName} must explicitly clean workspace packages before saving`);
    const expectedRun = windows
      ? expectedCommands.flatMap((command) => [command, "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }"])
      : expectedCommands;
    assert.deepEqual(commands.trim().split(/\n\s*/), expectedRun, `${jobName} must clean every workspace package from both ordinary profiles and the MSRV output, stopping on any failure`);
    const cleanupIndex = job.indexOf("- name: Clean workspace artifacts for cache");
    const saveIndex = job.indexOf("- name: Save Rust dependencies");
    assert.ok(cleanupIndex > job.lastIndexOf("- name: Upload "), `${jobName} must complete every smoke gate and upload before cleanup`);
    assert.ok(cleanupIndex < saveIndex, `${jobName} must not save workspace artifacts before cleaning them`);
    assert.match(save, /uses: actions\/cache\/save@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
    assert.match(save, /^          key: \$\{\{ steps\.rust-cache\.outputs\.cache-primary-key \}\}$/m);
    assert.doesNotMatch(
      save,
      /^          (?:restore-keys|enableCrossOsArchive):/m,
      `${jobName} must save only under the restored primary key`,
    );
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
    assert.doesNotMatch(job, /lookup-only:/);
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
