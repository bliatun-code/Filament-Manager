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

test("command portability rejects direct npm and npx child launches", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec, execFile, execSync, spawn as launch, spawnSync } from "node:child_process";
import * as childProcess from /* binding comment */ "child_process";
launch(/* command comment */ "npm", ["run", "doctor"]);
spawnSync('npm.cmd', ["run", "doctor"]);
execFile("npx", ["tauri", "dev"]);
childProcess.execFile(\`npx.cmd\`, ["tauri", "dev"]);
exec("npm run doctor");
execSync(\`"C:/Program Files/nodejs/npx.cmd" --version\`);
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
exec(\`npm run \${target}\`);
exec("echo npm");
exec("echo ready && npm run doctor");
exec(\`\${prefix} npm\`);
exec("echo ready & npm run test");
const trailing = require("node:child_process",);
trailing.spawn("npm", ["--version"]);
`),
    [
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 4,
      },
      {
        label: "launch npm.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 5,
      },
      {
        label: "launch npx through Node and its JavaScript CLI instead of a platform shell shim",
        line: 6,
      },
      {
        label: "launch npx.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 7,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 8,
      },
      {
        label: "launch npx.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 9,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 10,
      },
      {
        label: "launch npm.bat through Node and its JavaScript CLI instead of a platform shell shim",
        line: 11,
      },
      {
        label: "launch npx through Node and its JavaScript CLI instead of a platform shell shim",
        line: 13,
      },
      {
        label: "launch npm.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 15,
      },
      {
        label: "launch npx.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 16,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 17,
      },
      {
        label: "launch npx through Node and its JavaScript CLI instead of a platform shell shim",
        line: 18,
      },
      {
        label: "launch npm.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 19,
      },
      {
        label: "launch npx.cmd through Node and its JavaScript CLI instead of a platform shell shim",
        line: 20,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 21,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 23,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 25,
      },
      {
        label: "launch npm through Node and its JavaScript CLI instead of a platform shell shim",
        line: 27,
      },
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
