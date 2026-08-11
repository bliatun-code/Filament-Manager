import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.match(toolchain, /^channel = "1\.97\.1"$/m);
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

test("every Rust workflow setup installs the exact reviewed toolchain", () => {
  const setupSteps = workflows.flatMap(([name, workflow]) =>
    rustSetupSteps(workflow).map((step) => [name, step]),
  );
  assert.equal(setupSteps.length, 5);

  for (const [name, step] of setupSteps) {
    assert.match(
      step,
      /uses: dtolnay\/rust-toolchain@[0-9a-f]{40} # master/,
      `${name} must keep the Rust setup action immutable`,
    );
    assert.match(
      step,
      /^          toolchain: 1\.97\.1$/m,
      `${name} must install the reviewed Rust release explicitly`,
    );
  }
});

test("smoke CI installs the components used by the full verification", () => {
  const ciSteps = rustSetupSteps(workflows[0][1]);
  assert.equal(ciSteps.length, 2);
  for (const step of ciSteps) {
    assert.match(step, /^          components: clippy,rustfmt$/m);
  }
});
