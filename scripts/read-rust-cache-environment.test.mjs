import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  hashRustCacheEnvironment,
  readRustCacheEnvironment,
  runRustCacheEnvironment,
} from "./read-rust-cache-environment.mjs";

const compiler = (release, { host = "aarch64-apple-darwin", commit = "a".repeat(40) } = {}) =>
  `rustc ${release} (${commit.slice(0, 9)} 2026-01-01)\nbinary: rustc\ncommit-hash: ${commit}\ncommit-date: 2026-01-01\nhost: ${host}\nrelease: ${release}\nLLVM version: 20.1.0\n`;
const base = {
  reviewedVersion: "1.98.1",
  reviewedCompiler: compiler("1.98.1"),
  msrvCompiler: compiler("1.88.0", { commit: "b".repeat(40) }),
  environment: { ImageOS: "macos26", ImageVersion: "20260908.1", RUSTFLAGS: "-D warnings" },
};
const hash = (changes = {}) => hashRustCacheEnvironment({ ...base, ...changes });

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "rust-cache-environment-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "toolchain.toml");
  writeFileSync(file, '[toolchain]\nchannel = "1.123.4"\n');
  const output = join(directory, "github-output");
  const execFile = (_command, args) => compiler(args[1]);
  return { file, output, execFile };
}

test("Rust cache identity is deterministic and ignores unrelated environment variables", () => {
  assert.match(hash(), /^[a-f0-9]{64}$/);
  assert.equal(hash(), hash({ environment: {
    GITHUB_RUN_ID: "another-run", GITHUB_TOKEN: "must-not-affect-cache",
    RUSTFLAGS: "-D warnings", ImageVersion: "20260908.1", ImageOS: "macos26",
  } }));
  assert.equal(hash(), hash({
    reviewedCompiler: base.reviewedCompiler.replaceAll("\n", "\r\n"),
    msrvCompiler: base.msrvCompiler.replaceAll("\n", "\r\n"),
  }));
});

test("Rust cache identity invalidates either compiler release, commit or host", () => {
  assert.notEqual(hash(), hash({ reviewedVersion: "1.99.0", reviewedCompiler: compiler("1.99.0") }));
  for (const field of ["reviewedCompiler", "msrvCompiler"]) {
    const release = field === "reviewedCompiler" ? "1.98.1" : "1.88.0";
    for (const changes of [{ commit: "c".repeat(40) }, { host: "x86_64-pc-windows-msvc" }]) {
      assert.notEqual(hash(), hash({ [field]: compiler(release, changes) }), `${field} must include ${Object.keys(changes)[0]}`);
    }
  }
});

test("Rust cache identity includes native image, SDK and compiler environment prefixes", () => {
  for (const name of [
    "CARGO_BUILD_RUSTFLAGS", "CC", "CFLAGS", "CXX", "CMAKE_GENERATOR", "RUSTFLAGS",
    "ImageOS", "ImageVersion", "MACOSX_DEPLOYMENT_TARGET", "SDKROOT",
  ]) {
    assert.notEqual(hash(), hash({ environment: { ...base.environment, [name]: "changed" } }), name);
  }
  assert.notEqual(
    hash({ environment: { CARGO_A: "bc", CARGO_AB: "c" } }),
    hash({ environment: { CARGO_A: "b", CARGO_AB: "cc" } }),
    "JSON must preserve variable name and value boundaries",
  );
  assert.notEqual(hash({ environment: {} }), hash({ environment: { RUSTFLAGS: "" } }));
});

test("Rust cache identity rejects absent, malformed and mismatched compiler output", () => {
  for (const value of [
    "", null, "rustc 1.98.1", "x".repeat(65_537),
    base.reviewedCompiler.replace("commit-hash: " + "a".repeat(40), "commit-hash: unknown"),
    base.reviewedCompiler.replace("host: aarch64-apple-darwin", "host: unknown"),
    base.reviewedCompiler.replace("release: 1.98.1", "release: 1.98.0"),
    base.reviewedCompiler + "release: 1.98.1\n",
    compiler("1.98.0"),
  ]) assert.throws(() => hash({ reviewedCompiler: value }), /compiler identity/);
  assert.throws(() => hash({ msrvCompiler: compiler("1.89.0") }), /compiler identity/);
});

test("Rust cache identity requires an exact reviewed release even when output lacks a release", () => {
  const malformedCompiler = `not a rustc header\ncommit-hash: ${"a".repeat(40)}\nhost: aarch64-apple-darwin\n`;
  for (const reviewedVersion of [undefined, null, "", "stable", "1.98", "01.98.1", "1.98.1-beta.1", 1981]) {
    assert.throws(() => hash({ reviewedVersion, reviewedCompiler: malformedCompiler }), /compiler identity/);
    assert.throws(() => hash({ reviewedVersion }), /compiler identity/);
  }
  const { reviewedVersion: _omitted, ...withoutReviewedVersion } = base;
  assert.throws(() => hashRustCacheEnvironment({
    ...withoutReviewedVersion, reviewedCompiler: malformedCompiler,
  }), /compiler identity/);
});

test("Rust cache reader selects both exact toolchains with argument arrays and no shell", (t) => {
  const { file } = fixture(t);
  const calls = [];
  const result = readRustCacheEnvironment({
    file, environment: base.environment,
    execFile(command, args, options) {
      calls.push({ command, args });
      assert.equal(options.shell, false);
      assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
      assert.equal(options.env, base.environment);
      return compiler(args[1]);
    },
  });
  assert.match(result, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls, [
    { command: "rustup", args: ["run", "1.123.4", "rustc", "-vV"] },
    { command: "rustup", args: ["run", "1.88.0", "rustc", "-vV"] },
  ]);
});

test("Rust cache GitHub output contains only the digest and preserves previous output", (t) => {
  const { file, output, execFile } = fixture(t);
  writeFileSync(output, "existing=value\n");
  const written = [];
  const result = runRustCacheEnvironment(["--file", file, "--github-output"], {
    environment: { ...base.environment, CARGO_REGISTRY_TOKEN: "private-token", GITHUB_OUTPUT: output },
    execFile, writeOutput: (value) => written.push(value),
  });
  assert.match(result, /^[a-f0-9]{64}$/);
  assert.deepEqual(written, [result]);
  assert.equal(readFileSync(output, "utf8"), `existing=value\nhash=${result}\n`);
});

test("Rust cache output fails before compiler execution without GitHub output or image identity", (t) => {
  const { file, output } = fixture(t);
  writeFileSync(output, "existing=value\n");
  const options = {
    execFile: () => assert.fail("compiler must not execute"),
    writeOutput: () => assert.fail("no digest may be written"),
  };
  for (const environment of [
    {}, { GITHUB_OUTPUT: " " }, { GITHUB_OUTPUT: output },
    { GITHUB_OUTPUT: output, ImageOS: "macos26" },
    { GITHUB_OUTPUT: output, ImageOS: "macos26", ImageVersion: " " },
    { GITHUB_OUTPUT: output, ImageVersion: "20260908.1" },
  ]) {
    assert.throws(() => runRustCacheEnvironment(["--file", file, "--github-output"], {
      ...options, environment,
    }), /GITHUB_OUTPUT|ImageOS and ImageVersion/);
  }
  assert.equal(readFileSync(output, "utf8"), "existing=value\n");
});

test("Rust cache CLI supports digest-only local output without runner image variables", (t) => {
  const { file, execFile } = fixture(t);
  const written = [];
  const result = runRustCacheEnvironment(["--file", file], {
    environment: {}, execFile, writeOutput: (value) => written.push(value),
  });
  assert.match(result, /^[a-f0-9]{64}$/);
  assert.deepEqual(written, [result]);
});

test("Rust cache failures never expose raw child output or environment values", (t) => {
  const { file, output } = fixture(t);
  writeFileSync(output, "existing=value\n");
  assert.throws(() => runRustCacheEnvironment(["--file", file, "--github-output"], {
    environment: { ...base.environment, GITHUB_OUTPUT: output, RUSTFLAGS: "private-value" },
    execFile: () => { throw new Error("private-value from child stderr"); },
    writeOutput: () => assert.fail("failed compiler must not write a digest"),
  }), { message: "Unable to read a required Rust compiler identity." });
  assert.equal(readFileSync(output, "utf8"), "existing=value\n");
  writeFileSync(file, '[toolchain]\nchannel = "stable"\n');
  assert.throws(() => readRustCacheEnvironment({
    file, execFile: () => assert.fail("invalid pin must not execute rustup"),
  }), { message: "Unable to read the reviewed Rust toolchain." });
});
