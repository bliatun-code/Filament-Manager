#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const warnings = [];
const errors = [];
const isWindows = process.platform === "win32";

function run(cmd, args, cwd = rootDir) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: isWindows,
  });
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout,
    stderr,
    error: result.error?.message ?? null,
  };
}

function printHeader(title) {
  process.stdout.write(`\n[doctor] ${title}\n`);
}

function printLine(line) {
  process.stdout.write(`${line}\n`);
}

const nodeVersion = process.versions.node;
const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);

printHeader("Runtime");
printLine(`- node: ${nodeVersion}`);
if (Number.isNaN(nodeMajor) || nodeMajor < 20) {
  errors.push(`Node ${nodeVersion} is unsupported. Use Node 20+.`);
}
if (nodeMajor >= 23) {
  warnings.push(
    `Node ${nodeVersion} is newer than current LTS; native modules may rely on fallbacks.`,
  );
}

const npmVersion = run("npm", ["-v"]);
printLine(`- npm: ${npmVersion.ok ? npmVersion.stdout : "not available"}`);
if (!npmVersion.ok) {
  errors.push("npm is required but unavailable.");
}

printHeader("Toolchain");
const rustc = run("rustc", ["--version"]);
printLine(`- rustc: ${rustc.ok ? rustc.stdout : "not available"}`);
if (!rustc.ok) {
  warnings.push("Rust toolchain missing; desktop build commands will fail.");
}

const cargo = run("cargo", ["--version"]);
printLine(`- cargo: ${cargo.ok ? cargo.stdout : "not available"}`);
if (!cargo.ok) {
  warnings.push("Cargo missing; desktop build commands will fail.");
}

const tauriCli = run("npx", ["tauri", "--version"]);
printLine(`- tauri cli: ${tauriCli.ok ? tauriCli.stdout : "not available"}`);
if (!tauriCli.ok) {
  warnings.push(
    "Local @tauri-apps/cli is unavailable. Run `npm install` in project root.",
  );
}

printHeader("Database");
const sqlite = run("sqlite3", ["--version"]);
printLine(`- sqlite3 cli: ${sqlite.ok ? sqlite.stdout : "not available"}`);
if (!sqlite.ok) {
  warnings.push(
    "sqlite3 CLI is missing. Scraper needs better-sqlite3 to succeed without it.",
  );
}

let betterSqliteReady = false;
let betterSqliteReason = "";
try {
  await import("better-sqlite3");
  betterSqliteReady = true;
} catch (error) {
  betterSqliteReady = false;
  betterSqliteReason = error instanceof Error ? error.message : String(error);
}
printLine(`- better-sqlite3: ${betterSqliteReady ? "ready" : "fallback mode"}`);
if (!betterSqliteReady && betterSqliteReason) {
  const compactReason = betterSqliteReason.replace(/\s+/g, " ").trim();
  printLine(`- better-sqlite3 reason: ${compactReason}`);
  const nodeModuleMismatch = compactReason.match(
    /NODE_MODULE_VERSION\\s+(\\d+).+requires\\s+NODE_MODULE_VERSION\\s+(\\d+)/i,
  );
  if (nodeModuleMismatch) {
    warnings.push(
      `better-sqlite3 was built for ABI ${nodeModuleMismatch[1]}, but current Node ${nodeVersion} requires ABI ${nodeModuleMismatch[2]}. Run \`npm rebuild better-sqlite3\`.`,
    );
  }
}
if (!betterSqliteReady && !sqlite.ok) {
  errors.push(
    "Neither better-sqlite3 nor sqlite3 CLI is available. Scraper cannot write the database.",
  );
}
if (!betterSqliteReady && sqlite.ok) {
  warnings.push(
    "Scraper will use sqlite3 CLI fallback for DB writes. For native mode, run `npm rebuild better-sqlite3`.",
  );
}

const dataDir = path.join(rootDir, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const writeProbe = path.join(dataDir, ".doctor-write-test");
try {
  fs.writeFileSync(writeProbe, "ok\n", "utf8");
  fs.unlinkSync(writeProbe);
  printLine("- data directory: writable");
} catch (error) {
  errors.push(`Cannot write to data directory: ${String(error)}`);
}

if (warnings.length > 0) {
  printHeader("Warnings");
  for (const warning of warnings) {
    printLine(`- ${warning}`);
  }
}

if (errors.length > 0) {
  printHeader("Errors");
  for (const error of errors) {
    printLine(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  printHeader("Status");
  printLine("- ok");
}
