#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveDoctorNativeLaunch,
  resolveDoctorNpmLaunch,
  resolveDoctorTauriLaunch,
  runDoctorCommand,
} from "./doctor-command.mjs";
import { probeBetterSqlite } from "./doctor-database.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const warnings = [];
const errors = [];

function run(cmd, args, cwd = rootDir) {
  return runDoctorCommand(resolveDoctorNativeLaunch(cmd, args), { cwd });
}

function printHeader(title) {
  process.stdout.write(`\n[doctor] ${title}\n`);
}

function printLine(line) {
  process.stdout.write(`${line}\n`);
}

const nodeVersion = process.versions.node;
const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);
const supportedNodeMajor = 24;

printHeader("Runtime");
printLine(`- node: ${nodeVersion}`);
if (Number.isNaN(nodeMajor) || nodeMajor !== supportedNodeMajor) {
  errors.push(
    `Node ${nodeVersion} is unsupported. Use Node ${supportedNodeMajor}.x.`,
  );
}

const npmLaunch = resolveDoctorNpmLaunch();
const npmVersion = npmLaunch
  ? runDoctorCommand(npmLaunch, { cwd: rootDir })
  : {
      error: "npm CLI context is unavailable",
      ok: false,
      status: null,
      stderr: "",
      stdout: "",
    };
printLine(`- npm: ${npmVersion.ok ? npmVersion.stdout : "not available"}`);
if (!npmVersion.ok) {
  errors.push(
    "npm is required but unavailable. Run this check with `npm run doctor`.",
  );
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

const tauriCli = runDoctorCommand(resolveDoctorTauriLaunch(), { cwd: rootDir });
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

const {
  mismatch: nodeModuleMismatch,
  ready: betterSqliteReady,
  reason: betterSqliteReason,
} = await probeBetterSqlite();
printLine(`- better-sqlite3: ${betterSqliteReady ? "ready" : "fallback mode"}`);
if (!betterSqliteReady && betterSqliteReason) {
  const compactReason = betterSqliteReason.replace(/\s+/g, " ").trim();
  printLine(`- better-sqlite3 reason: ${compactReason}`);
  if (nodeModuleMismatch) {
    warnings.push(
      `better-sqlite3 was built for ABI ${nodeModuleMismatch.builtAbi}, but current Node ${nodeVersion} requires ABI ${nodeModuleMismatch.requiredAbi}. Run \`npm rebuild better-sqlite3\`.`,
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
