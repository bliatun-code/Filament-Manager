import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";

import {
  analyzeCommandPortability,
  collectCommandPortabilitySourceFiles,
  findCommandPortabilityIssues,
} from "./check-command-portability.mjs";

function writeFixtureFile(repoRoot, file, source = "") {
  const filePath = resolve(repoRoot, file);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, source);
}

function fixtureIssues(source) {
  return findCommandPortabilityIssues(source, "scripts/fixture.mjs").map(({ label, line }) => ({
    label,
    line,
  }));
}

function packageManagerIssue(name, line) {
  return {
    label: `launch ${name} through Node and its JavaScript CLI instead of a platform shell shim`,
    line,
  };
}

function platformShellIssue(name, line) {
  return {
    label: `platform shell ${name} must not be launched directly`,
    line,
  };
}

function implicitShellIssue(method, line) {
  return {
    label: `${method} always launches a platform shell; use execFile or spawn with shell: false`,
    line,
  };
}

test("command portability source collection covers production JavaScript and TypeScript", (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "filament-manager-command-portability-"));
  const repoRoot = join(tempRoot, "tests", "repository");
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));

  const expectedFiles = [
    "scripts/runner.mjs",
    "src/scraper.ts",
    "src-tauri/browser/tool.js",
    "ui/vite.config.ts",
  ];
  const ignoredFiles = [
    "scripts/runner.test.mjs",
    "scripts/__tests__/fixture.js",
    "scripts/tests/fixture.ts",
    "src/scraper.spec.ts",
    "src/spec/fixture.js",
    "src/test/fixture.tsx",
    "src/notes.md",
    "src/worker.rs",
    "ui/dist/app.js",
    "ui/node_modules/tool/index.js",
  ];
  for (const file of [...expectedFiles, ...ignoredFiles]) {
    writeFixtureFile(repoRoot, file);
  }

  const files = collectCommandPortabilitySourceFiles(repoRoot).map((file) =>
    relative(repoRoot, file).split(sep).join("/"),
  );
  assert.deepEqual(files, expectedFiles.sort());
});

test("command portability accepts shell-free native and Node launches", () => {
  assert.deepEqual(
    fixtureIssues(`
import * as childProcess from "node:child_process";
import { spawn, spawn as launch, spawnSync } from "node:child_process";
spawn(process.execPath, ["runner.mjs"], { shell: false });
launch(process.execPath, ["runner.mjs"], { stdio: "inherit", shell: false });
childProcess.execFile(process.execPath, ["runner.mjs"], { shell: false });
spawnSync("sqlite3", ["--version"], { windowsHide: true });
spawnSync(process.execPath, [], { nested: { shell: true }, shell: false });
spawnSync(process.execPath, [], { ...options, shell: false });
const messages = { shell: { title: "Settings" } };
`),
    [],
  );
});

test("command portability rejects dynamic and enabled shells", () => {
  assert.deepEqual(
    fixtureIssues(`
import { spawn } from "node:child_process";
spawn(process.execPath, ["runner.mjs"], { shell: true });
spawn(process.execPath, ["runner.mjs"], {
  shell:
    isWindows,
});
spawn(process.execPath, ["runner.mjs"], { shell: false || isWindows });
spawn(process.execPath, ["runner.mjs"], { "shell": true });
spawn(process.execPath, ["runner.mjs"], { ["shell"]: platform });
spawn(process.execPath, ["runner.mjs"], { ...options });
spawn(process.execPath, ["runner.mjs"], { shell: false, ...options });
spawn(process.execPath, ["runner.mjs"], { ...options, shell: false });
const shell = platform;
spawn(process.execPath, ["runner.mjs"], { shell });
spawn(process.execPath, ["runner.mjs"], ({ shell: true }));
`),
    [
      { label: "child-process shell option must be the literal false", line: 3 },
      { label: "child-process shell option must be the literal false", line: 5 },
      { label: "child-process shell option must be the literal false", line: 8 },
      { label: "child-process shell option must be the literal false", line: 9 },
      { label: "child-process shell option must be the literal false", line: 10 },
      { label: "child-process options spread must be followed by shell: false", line: 11 },
      { label: "child-process options spread must be followed by shell: false", line: 12 },
      { label: "child-process shell option must be the literal false", line: 15 },
      { label: "child-process shell option must be the literal false", line: 16 },
    ],
  );
});

test("command portability rejects direct package managers and platform shells", () => {
  assert.deepEqual(
    fixtureIssues(`
import { execFile, spawn as launch, spawnSync } from "node:child_process";
import * as childProcess from /* binding comment */ "child_process";
launch(/* command comment */ "npm", ["run", "doctor"]);
spawnSync('npm.cmd', ["run", "doctor"]);
execFile("npx", ["tauri", "dev"]);
childProcess.execFile(\`npx.cmd\`, ["tauri", "dev"]);
spawnFn("npm", ["run", "visual"]);
spawnSyncFn("C:/Program Files/nodejs/npm.bat", ["test"]);
const required = require("node:child_process");
required.spawn("npx", ["--version"]);
const { spawn: requiredLaunch } = require("child_process");
requiredLaunch("npm.cmd", ["--version"]);
require("node:child_process").spawn("npx.cmd", ["--version"]);
launch(("npm"), ["--version"]);
launch?.("npx", ["--version"]);
childProcess?.spawn("npm.cmd", ["--version"]);
childProcess.spawn?.("npx.cmd", ["--version"]);
const trailing = require("node:child_process",);
trailing.spawn("npm", ["--version"]);
childProcess["spawn"]("npm", ["--version"]);
childProcess?.["spawn"]?.("npx.cmd", ["--version"]);
require("node:child_process")["spawn"]?.("npm.cmd", ["--version"]);
const bracketLaunch = require("node:child_process")["spawn"];
bracketLaunch("npx", ["--version"]);
const namespaceLaunch = childProcess["spawn"];
namespaceLaunch("npm.cmd", ["--version"]);
const { ["spawn"]: computedLaunch } = require("node:child_process");
computedLaunch("npx.cmd", ["--version"]);
launch("cmd.exe", ["/d", "/s", "/c", "npm run doctor"]);
execFile("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe", ["-Command", "npm run doctor"]);
launch("C:/Program Files/Git/bin/bash.exe", ["-lc", "npm run doctor"]);
execFile("sh.exe", ["-c", "npm run doctor"]);
const { spawn: namespaceDestructuredLaunch } = childProcess;
namespaceDestructuredLaunch("npm", ["--version"]);
const { ["spawn"]: namespaceComputedLaunch } = childProcess;
namespaceComputedLaunch("npm.cmd", ["--version"]);
`),
    [
      packageManagerIssue("npm", 4),
      packageManagerIssue("npm.cmd", 5),
      packageManagerIssue("npx", 6),
      packageManagerIssue("npx.cmd", 7),
      packageManagerIssue("npm", 8),
      packageManagerIssue("npm.bat", 9),
      packageManagerIssue("npx", 11),
      packageManagerIssue("npm.cmd", 13),
      packageManagerIssue("npx.cmd", 14),
      packageManagerIssue("npm", 15),
      packageManagerIssue("npx", 16),
      packageManagerIssue("npm.cmd", 17),
      packageManagerIssue("npx.cmd", 18),
      packageManagerIssue("npm", 20),
      packageManagerIssue("npm", 21),
      packageManagerIssue("npx.cmd", 22),
      packageManagerIssue("npm.cmd", 23),
      packageManagerIssue("npx", 25),
      packageManagerIssue("npm.cmd", 27),
      packageManagerIssue("npx.cmd", 29),
      platformShellIssue("cmd.exe", 30),
      platformShellIssue("powershell.exe", 31),
      platformShellIssue("bash.exe", 32),
      platformShellIssue("sh.exe", 33),
      packageManagerIssue("npm", 35),
      packageManagerIssue("npm.cmd", 37),
    ],
  );
});

test("command portability rejects APIs that always launch a platform shell", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec, exec as run, execSync } from "node:child_process";
exec("echo ready");
run(\`npm run \${target}\`);
execSync("cmd.exe /d /s /c npm run doctor");
execFn("(npm run doctor)");
execSyncFn("powershell -Command npm run doctor");
exec("echo intentional"); // command-portability-allow: compatibility probe requires a shell builtin
`),
    [
      implicitShellIssue("exec", 3),
      implicitShellIssue("exec", 4),
      implicitShellIssue("execSync", 5),
      implicitShellIssue("exec", 6),
      implicitShellIssue("execSync", 7),
    ],
  );
});

test("command portability follows child-process methods through promisify", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec, exec as execute, execFile } from "node:child_process";
import { promisify, promisify as makeAsync } from "node:util";
import * as util from "node:util";
const run = promisify(exec);
run("npm run smoke");
const runAlias = makeAsync(execute);
runAlias("npm run doctor");
const runNamespace = util.promisify(exec);
runNamespace("npm run verify");
const requiredUtil = require("node:util");
const runRequiredNamespace = requiredUtil.promisify(exec);
runRequiredNamespace("npm run test:portability");
const { promisify: requiredPromisify } = require("util");
const runRequired = requiredPromisify(exec);
runRequired("npm run check:contracts");
const runInline = require("node:util")["promisify"](exec);
runInline("npm run test:scripts");
const safe = promisify(execFile);
safe(process.execPath, ["runner.mjs"], { shell: false });
`),
    [
      implicitShellIssue("exec", 6),
      implicitShellIssue("exec", 8),
      implicitShellIssue("exec", 10),
      implicitShellIssue("exec", 13),
      implicitShellIssue("exec", 16),
      implicitShellIssue("exec", 18),
    ],
  );
});

test("command portability ignores fixtures inside strings, templates, regex literals, and comments", () => {
  assert.deepEqual(
    fixtureIssues(`
import { spawn } from "node:child_process";
const quoted = "spawn('npm', [], { shell: true })";
const template = \`spawn("npx.cmd", [], { shell: isWindows })\`;
const matcher = /spawn\\("npm"\\)/gi;
if (ready) /spawn\\("npm"\\)/.test(text);
if (ready) {}
/spawn\\("npm"\\)/.test(text);
// spawn("npm", [], { shell: true });
/* spawn("npx", [], { shell: platform }); */
spawn(process.execPath, ["runner.mjs"], { shell: false });
`),
    [],
  );
});

test("command portability still checks calls inside template interpolations", () => {
  assert.deepEqual(fixtureIssues(`
import { spawn } from "node:child_process";
const status = \`result: \${spawn("npm", ["--version"])}\`;
`), [
    {
      label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
      line: 3,
    },
  ]);
});

test("command portability permits documented line-level exceptions", () => {
  assert.deepEqual(
    fixtureIssues(`
import { spawn } from "node:child_process";
spawn("npm", ["--version"]); // command-portability-allow: POSIX-only external compatibility probe
spawn(process.execPath, ["runner.mjs"], { shell: platform }); // command-portability-allow: external tool requires its own shell
const fakeAllow = "command-portability-allow: ordinary strings are not exceptions"; spawn("npm.cmd", ["--version"]);
spawn("npx", ["--version"]); // command-portability-allow:
`),
    [
      {
        label: "launch npm.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 5,
      },
      {
        label: "launch npx through Node and its JavaScript CLI instead of a platform shell shim",
        line: 6,
      },
    ],
  );
});

test("command portability analysis scans only files that use child processes", (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), "filament-manager-command-analysis-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));

  writeFixtureFile(
    repoRoot,
    "scripts/safe.mjs",
    'import { spawn } from "node:child_process";\nspawn(process.execPath, [], { shell: false });\n',
  );
  writeFixtureFile(repoRoot, "src/messages.ts", "export const copy = { shell: true };\n");
  writeFixtureFile(
    repoRoot,
    "src/unsafe.ts",
    'import { spawnSync } from "node:child_process";\nspawnSync("npm.cmd", ["test"]);\n',
  );

  const result = analyzeCommandPortability({ repoRoot });
  assert.equal(result.sourceFiles.length, 3);
  assert.equal(result.childProcessFiles.length, 2);
  assert.deepEqual(
    result.issues.map(({ file, label, line }) => ({
      file: relative(repoRoot, file).split(sep).join("/"),
      label,
      line,
    })),
    [
      {
        file: "src/unsafe.ts",
        label: "launch npm.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 2,
      },
    ],
  );
});
