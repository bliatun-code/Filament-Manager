import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseRustToolchain, readRustToolchain } from "./read-rust-toolchain.mjs";

const config = (version) => `[toolchain]\nchannel = "${version}"\nprofile = "minimal"\ncomponents = ["clippy", "rustfmt"]\n`;
const script = fileURLToPath(new URL("./read-rust-toolchain.mjs", import.meta.url));

test("Rust toolchain reader accepts future exact releases without a second version pin", () => {
  for (const version of ["1.98.1", "1.98.2", "1.123.45", "2.0.0"]) {
    assert.equal(parseRustToolchain(config(version)), version);
  }
  assert.match(readRustToolchain(), /^\d+\.\d+\.\d+$/);
});

test("Rust toolchain reader supports comments, CRLF and explicit targets", () => {
  assert.equal(parseRustToolchain(
    "# Reviewed release\r\n[toolchain] # configuration\r\nchannel = '1.123.4' # pin\r\n" +
    "profile = 'minimal'\r\ncomponents = ['clippy', 'rustfmt',]\r\n" +
    "targets = ['aarch64-apple-darwin', 'x86_64-apple-darwin']\r\n",
  ), "1.123.4");
});

test("Rust toolchain reader rejects rolling, partial, prerelease and injected channels", () => {
  for (const version of [
    "stable", "nightly", "beta", "1.98", "1", "v1.98.1", "1.98.1-beta.1",
    "1.98.1+build", "01.98.1", "1.098.1", "1.98.01", "1.98.1-x86_64-pc-windows-msvc",
    "${{ github.ref }}", "$(echo 1.98.1)", "../toolchain", "1.98.1\nother=value",
  ]) assert.throws(() => parseRustToolchain(config(version)), undefined, version);
});

test("Rust toolchain reader rejects missing, duplicate and ambiguous pins", () => {
  for (const source of [
    "", "[toolchain]\nprofile='minimal'", "channel='1.98.1'",
    `${config("1.98.1")}channel='1.98.1'`,
    `${config("1.98.1")}channel='1.98.2'`,
    `${config("1.98.1")}[toolchain]\nchannel='1.98.2'`,
    "[other]\nchannel='1.98.1'", "toolchain.channel='1.98.1'",
    `${config("1.98.1")}\"channel\"='stable'`,
    `${config("1.98.1")}path='/custom/toolchain'`,
    "[toolchain]\nprofile=\"\"\"\nchannel='1.98.1'\n\"\"\"",
    `${config("1.98.1")}profile='minimal'`,
  ]) assert.throws(() => parseRustToolchain(source), undefined, source);
});

test("Rust toolchain reader rejects malformed non-channel TOML instead of guessing", () => {
  for (const extra of ["targets=[,]", "targets=['one',,'two']", "targets=[nightly]", "targets=[\n'one'\n]", "extra='value'"]) {
    assert.throws(() => parseRustToolchain(`${config("1.98.1")}${extra}`), undefined, extra);
  }
});

test("Rust toolchain CLI appends only a validated release to GitHub output", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rust-toolchain-output-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "toolchain.toml");
  const output = join(directory, "github-output");
  writeFileSync(file, config("1.123.4"));
  writeFileSync(output, "existing=value\n");
  const child = spawnSync(process.execPath, [script, "--file", file, "--github-output"], {
    env: { ...process.env, GITHUB_OUTPUT: output }, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "1.123.4\n");
  assert.equal(readFileSync(output, "utf8"), "existing=value\ntoolchain=1.123.4\n");

  writeFileSync(file, config("stable"));
  const rejected = spawnSync(process.execPath, [script, "--file", file, "--github-output"], {
    env: { ...process.env, GITHUB_OUTPUT: output }, encoding: "utf8",
  });
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, "");
  assert.equal(readFileSync(output, "utf8"), "existing=value\ntoolchain=1.123.4\n");
});

test("Rust toolchain CLI fails closed without its input or required output path", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rust-toolchain-errors-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "toolchain.toml");
  const environment = { ...process.env };
  delete environment.GITHUB_OUTPUT;
  const missing = spawnSync(process.execPath, [script, "--file", file], { env: environment, encoding: "utf8" });
  assert.equal(missing.status, 1);
  writeFileSync(file, config("1.123.4"));
  const noOutput = spawnSync(process.execPath, [script, "--file", file, "--github-output"], { env: environment, encoding: "utf8" });
  assert.equal(noOutput.status, 1);
  assert.match(noOutput.stderr, /GITHUB_OUTPUT is required/);
  const plain = spawnSync(process.execPath, [script, "--file", file], { env: environment, encoding: "utf8" });
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout, "1.123.4\n");
});
