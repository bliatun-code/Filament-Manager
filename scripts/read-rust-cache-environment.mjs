import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readRustToolchain } from "./read-rust-toolchain.mjs";

const msrv = "1.88.0";
const environmentPrefixes = [
  "CARGO", "CC", "CFLAGS", "CXX", "CMAKE", "RUST",
  "ImageOS", "ImageVersion", "MACOSX_DEPLOYMENT_TARGET", "SDKROOT",
];

function compilerIdentity(source, expectedRelease) {
  if (typeof expectedRelease !== "string" ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(expectedRelease) ||
      typeof source !== "string" || source.length > 65_536) {
    throw new Error("Invalid Rust compiler identity.");
  }
  const lines = source.trim().split(/\r?\n/);
  const headerRelease = lines.shift()?.match(/^rustc (\d+\.\d+\.\d+) \([a-f0-9]{7,40} \d{4}-\d{2}-\d{2}\)$/)?.[1];
  const fields = new Map();
  for (const line of lines) {
    const match = line.match(/^([^:]+): (.+)$/);
    if (!match || fields.has(match[1])) {
      throw new Error("Invalid Rust compiler identity.");
    }
    fields.set(match[1], match[2]);
  }
  const release = fields.get("release");
  const host = fields.get("host");
  const commitHash = fields.get("commit-hash");
  if (headerRelease !== expectedRelease || release !== expectedRelease ||
      !/^[a-f0-9]{40}$/.test(commitHash ?? "") ||
      !/^[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+){2,}$/.test(host ?? "")) {
    throw new Error("Rust compiler identity does not match the requested release.");
  }
  return { release, host, commitHash };
}

function requireImageIdentity(environment) {
  if (!environment.ImageOS?.trim() || !environment.ImageVersion?.trim()) {
    throw new Error("ImageOS and ImageVersion are required for GitHub output mode.");
  }
}

export function hashRustCacheEnvironment({
  reviewedVersion,
  reviewedCompiler,
  msrvCompiler,
  environment = {},
  requireRunnerImage = false,
}) {
  if (requireRunnerImage) requireImageIdentity(environment);
  const variables = Object.entries(environment)
    .filter(([name, value]) => typeof value === "string" &&
      environmentPrefixes.some((prefix) => name.startsWith(prefix)))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const identity = {
    format: 1,
    reviewed: compilerIdentity(reviewedCompiler, reviewedVersion),
    msrv: compilerIdentity(msrvCompiler, msrv),
    environment: variables,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function readRustCacheEnvironment({
  file,
  environment = process.env,
  requireRunnerImage = false,
  execFile = execFileSync,
} = {}) {
  if (requireRunnerImage) requireImageIdentity(environment);
  let reviewedVersion;
  try {
    reviewedVersion = readRustToolchain(file);
  } catch {
    throw new Error("Unable to read the reviewed Rust toolchain.");
  }
  const compiler = (version) => {
    try {
      return execFile("rustup", ["run", version, "rustc", "-vV"], {
        encoding: "utf8",
        env: environment,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        maxBuffer: 65_536,
      });
    } catch {
      // Child-process errors can contain environment values printed by rustup.
      throw new Error("Unable to read a required Rust compiler identity.");
    }
  };
  return hashRustCacheEnvironment({
    reviewedVersion,
    reviewedCompiler: compiler(reviewedVersion),
    msrvCompiler: compiler(msrv),
    environment,
    requireRunnerImage,
  });
}

export function runRustCacheEnvironment(args, {
  environment = process.env,
  execFile = execFileSync,
  writeOutput = console.log,
} = {}) {
  const { values } = parseArgs({
    args,
    options: { file: { type: "string" }, "github-output": { type: "boolean" } },
    allowPositionals: false,
  });
  if (values["github-output"] && !environment.GITHUB_OUTPUT?.trim()) {
    throw new Error("GITHUB_OUTPUT is required for GitHub output mode.");
  }
  const hash = readRustCacheEnvironment({
    file: values.file,
    environment,
    requireRunnerImage: values["github-output"],
    execFile,
  });
  if (values["github-output"]) {
    try {
      appendFileSync(environment.GITHUB_OUTPUT, `hash=${hash}\n`, "utf8");
    } catch {
      throw new Error("Unable to write the GitHub cache hash output.");
    }
  }
  writeOutput(hash);
  return hash;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runRustCacheEnvironment(process.argv.slice(2));
  } catch (error) {
    console.error(`Rust cache environment selection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
