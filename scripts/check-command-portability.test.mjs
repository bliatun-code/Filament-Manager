import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";

import * as commandPortability from "./check-command-portability.mjs";

const {
  analyzeCommandPortability,
  collectCommandPortabilitySourceFiles,
  findCommandPortabilityIssues,
} = commandPortability;

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

function requiredCommandPortabilityApi(name) {
  const api = commandPortability[name];
  assert.equal(typeof api, "function", `Missing command portability API: ${name}`);
  return api;
}

function workflowFixtureIssues(source) {
  const findWindowsWorkflowCommandPortabilityIssues = requiredCommandPortabilityApi(
    "findWindowsWorkflowCommandPortabilityIssues",
  );
  return findWindowsWorkflowCommandPortabilityIssues(
    source,
    ".github/workflows/fixture.yml",
  ).map(({ label, line }) => ({ label, line }));
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

test("command portability source collection covers JavaScript and TypeScript tests", (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "filament-manager-command-portability-"));
  const repoRoot = join(tempRoot, "tests", "repository");
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));

  const expectedFiles = [
    "scripts/__tests__/fixture.js",
    "scripts/runner.mjs",
    "scripts/runner.test.mjs",
    "scripts/tests/fixture.ts",
    "src/scraper.spec.ts",
    "src/scraper.ts",
    "src/spec/fixture.js",
    "src/test/fixture.tsx",
    "src-tauri/browser/tool.js",
    "ui/vite.config.ts",
  ];
  const ignoredFiles = [
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

test("workflow command portability source collection covers yml and yaml workflows", (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "filament-manager-workflow-portability-"));
  const repoRoot = join(tempRoot, "tests", "repository");
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));

  const expectedFiles = [
    ".github/workflows/ci.yml",
    ".github/workflows/release.yaml",
  ];
  const ignoredFiles = [
    ".github/actions/local/action.yml",
    ".github/workflows/notes.md",
    ".github/workflows/settings.json",
    "scripts/fixture.yml",
  ];
  for (const file of [...expectedFiles, ...ignoredFiles]) {
    writeFixtureFile(repoRoot, file);
  }

  const collectWorkflowCommandPortabilitySourceFiles = requiredCommandPortabilityApi(
    "collectWorkflowCommandPortabilitySourceFiles",
  );
  const files = collectWorkflowCommandPortabilitySourceFiles(repoRoot).map((file) =>
    relative(repoRoot, file).split(sep).join("/"),
  );
  assert.deepEqual(files, expectedFiles);
});

test("command portability CLI fails closed on an unsafe Windows workflow", (t) => {
  const repoRoot = mkdtempSync(
    join(tmpdir(), "filament-manager-workflow-cli-portability-"),
  );
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));

  writeFixtureFile(
    repoRoot,
    ".github/workflows/windows-smoke.yml",
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: bash",
      "        run: npm test",
    ].join("\n"),
  );

  const checkerPath = resolve("scripts/check-command-portability.mjs");
  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const stderr = result.stderr.replaceAll("\\", "/");

  assert.equal(result.status, 1);
  assert.match(stderr, /Command portability contract failed:/);
  assert.match(
    stderr,
    /\.github\/workflows\/windows-smoke\.yml:5: POSIX workflow shell bash must not run in a Windows job/,
  );
});

test("Windows workflow portability rejects explicit POSIX shells", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: bash",
      "        run: npm test",
      "      - shell: sh {0}",
      "        run: npm test",
      '      - shell: "zsh {0}"',
      "        run: npm test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [5, 7, 9],
  );
  assert.match(issues[0].label, /bash/i);
  assert.match(issues[1].label, /\bsh\b/i);
  assert.match(issues[2].label, /zsh/i);
});

test("Windows workflow portability covers runner and shell scalar variants", () => {
  const issues = workflowFixtureIssues(
    [
      "defaults:",
      "  run:",
      "    shell: bash",
      "jobs:",
      "# jobs may be separated by a column-zero comment",
      '    "windows-custom": &custom_job',
      "        runs-on: [self-hosted, Windows, X64]",
      "        defaults:",
      "            run:",
      "                shell: /usr/bin/zsh {0}",
      "        steps:",
      "            - shell: 'C:\\Program Files\\Git\\bin\\bash.exe {0}'",
      "              run: npm test",
      "# another separator",
      "    windows-block-list:",
      "        runs-on:",
      "            - self-hosted",
      "            - windows-2025",
      "        steps:",
      "            - shell: sh.exe {0}",
      "              run: npm test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [12, 20],
  );
  assert.match(issues[0].label, /bash\.exe/i);
  assert.match(issues[1].label, /sh\.exe/i);
});

test("Windows workflow portability recognizes self-hosted Windows runner objects", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-self-hosted:",
      "    runs-on:",
      "      group: Default",
      "      labels: [self-hosted, windows]",
      "    steps:",
      "      - shell: bash",
      "        run: npm test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [7],
  );
});

test("Windows workflow portability handles anchored and unusually spaced mappings", () => {
  const issues = workflowFixtureIssues(
    [
      "defaults : &global_defaults",
      "  run : &global_run",
      "    shell : pwsh",
      '"jobs" : &all_jobs',
      "  windows-anchored: &windows_job",
      '    "runs-on" : &windows_runner windows-latest',
      "    defaults : &job_defaults",
      "      run : &job_run_defaults",
      "        shell : &default_shell pwsh",
      "    steps : &windows_steps",
      '      - &unsafe_step shell : &unsafe_shell "bash {0}"',
      '        run : &unsafe_run "export MODE=test"',
      "      -   name: Extra-spaced mapping",
      '          "shell" : pwsh',
      '          "run" : &extra_run "export NEXT_MODE=test"',
      "      - shell : pwsh",
      "        run : &block_script |",
      "          set -euo pipefail",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [11, 15, 18],
  );
});

test("Windows workflow portability rejects unambiguous Bash run syntax", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-2025",
      "    steps:",
      "      - run: |",
      "          set -euo pipefail",
      '          version="$GITHUB_REF_NAME"',
      '          root="${RUNNER_TEMP}"',
      '          if [[ "$version" =~ ^v ]]; then',
      '            echo "${BASH_REMATCH[0]}"',
      "          fi",
      "          node - <<'NODE'",
      '          console.log("verify")',
      "          NODE",
      "      - run: export MODE=test",
      "      - run: MODE=test node script.mjs",
      "      - run: |",
      "          node script.mjs \\",
      "            --verify",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [6, 7, 8, 9, 10, 12, 15, 16, 18],
  );
});

test("Windows workflow portability checks commands after PowerShell statement boundaries", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - run: npm test; export MODE=test",
      "      - run: npm test && MODE=test node script.mjs",
      '      - run: Write-Output "literal; export SAFE=test"',
      "      - run: Write-Output ok;# note; export COMMENTED_MODE=test",
      "      - run: Write-Output (Get-Date)# note; export COMMENTED_MODE=test",
      "      - run: Write-Output foo`; export ESCAPED_MODE=test",
      '      - run: Write-Output `"; export REAL_MODE=test',
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [5, 6, 11],
  );
});

test("Windows workflow portability normalizes quoted and indented run scalars", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      '      - run: "export MODE=test"',
      "      - run: 'set -euo pipefail'",
      "      - run: export MODE=test; echo command-portability-allow: ordinary output",
      "      - run: >2-",
      "          export FOLDED_MODE=test",
      "          node script.mjs",
      "      - run: 'Write-Output \"$GITHUB_REF_NAME\"'",
      "      - run: |",
      "          MODE=test",
      "          node script.mjs",
      '      - run: Write-Output "\\$RUNNER_TEMP"',
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [5, 6, 7, 9, 11, 13, 15],
  );
});

test("Windows workflow portability scopes execution fields outside scalar data", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    env:",
      "      CONFIG: |",
      "        steps:",
      "          - run: export FAKE_MODE=test",
      "    steps:",
      "      - shell: pwsh",
      "        run: |",
      '          Write-Output "@"',
      "          export REAL_MODE=test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [12],
  );
});

test("Windows workflow portability fails closed on reused step aliases", () => {
  const issues = workflowFixtureIssues(
    [
      "defaults: *global_defaults",
      "jobs:",
      "  runner-alias:",
      "    runs-on: *windows_runner",
      "    steps:",
      "      - run: npm test",
      "  windows-sequence-alias:",
      "    runs-on: windows-latest",
      "    steps: *shared_steps",
      "  windows-field-aliases:",
      "    runs-on: windows-latest",
      "    defaults: *bash_defaults",
      "    steps: &windows_steps",
      "      - run: *shared_run",
      "      - shell: *shared_shell",
      "        run: npm test",
      "      - *shared_step",
      "      - *reviewed_step # command-portability-allow: reviewed portable action step",
      "  windows-global-default:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - run: npm test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [1, 4, 9, 12, 14, 15, 17],
  );
  assert.equal(issues.some(({ label }) => /runner aliases/i.test(label)), true);
  assert.equal(issues.some(({ label }) => /defaults aliases/i.test(label)), true);
  assert.equal(issues.some(({ label }) => /step aliases/i.test(label)), true);
});

test("Windows workflow portability fails closed on aliases nested in runner and step collections", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  runner-flow-alias:",
      "    runs-on: [self-hosted, *windows_label]",
      "    steps:",
      "      - run: npm test",
      "  runner-block-alias:",
      "    runs-on:",
      "      - self-hosted",
      "      - *windows_label",
      "    steps:",
      "      - run: npm test",
      "  runner-object-alias:",
      "    runs-on:",
      "      group: Default",
      "      labels: *windows_labels",
      "    steps:",
      "      - run: npm test",
      "  windows-step-flow-alias:",
      "    runs-on: windows-latest",
      "    steps: [*shared_step]",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [3, 9, 15, 20],
  );
});

test("Windows workflow portability inspects interpolating PowerShell here-strings", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: pwsh",
      "        run: |",
      '          $content = @"',
      "          ref=$GITHUB_REF_NAME",
      '          "@',
      '          # documentation mentions @"',
      "          export MODE=test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [8, 11],
  );
});

test("Windows workflow portability applies shells to here-string-only run blocks", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: bash",
      "        run: |",
      "          $literal = @'",
      "          value",
      "          '@",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [5],
  );
});

test("Windows workflow portability distinguishes PowerShell comments, scopes, and here-string data", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: pwsh",
      "        run: |",
      '          $content = @"',
      "          <# this is here-string data, not a block comment",
      "          '$github_ref_name'",
      '          "@',
      "          <# documentation mentions @\"",
      "          #>",
      "          # a line comment may mention <# without opening a block",
      "          export AFTER_COMMENT=test",
      "          <# note #> export INLINE_AFTER=test",
      "          export INLINE_BEFORE=test <# note #>",
      "          Write-Output $GITHUB_REF_NAME <# note #>",
      "          Write-Output $github_ref_name",
      "          Write-Output $global:GITHUB_REF_NAME",
      "          Write-Output ${script:RUNNER_TEMP}",
      "          Write-Output $env:GITHUB_REF_NAME",
      "          Write-Output ${env:RUNNER_TEMP}",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [9, 14, 15, 16, 17, 18, 19, 20],
  );
});

test("Windows workflow portability requires review for ordinary multiline PowerShell strings", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: pwsh",
      "        run: |",
      "          $single = '",
      "          export LITERAL_MODE=test",
      "          $GITHUB_REF_NAME",
      "          '",
      '          $double = "',
      "          export INTERPOLATED_MODE=test",
      "          $GITHUB_REF_NAME",
      '          "',
      "      - shell: pwsh",
      "        run: | # command-portability-allow: reviewed multiline fixture",
      "          $reviewed = ' # command-portability-allow: reviewed multiline fixture",
      "          export REVIEWED_LITERAL=test",
      "          '",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [7, 11],
  );
  assert.equal(issues.every(({ label }) => /multiline PowerShell strings/i.test(label)), true);
});

test("Windows workflow portability accepts PowerShell commands and ignores metadata", () => {
  assert.deepEqual(
    workflowFixtureIssues(
      [
        "jobs:",
        "  windows-smoke:",
        "    runs-on: windows-latest",
        "    steps:",
        '      - name: "BASH_REMATCH export MODE=test <<NODE"',
        "        shell: pwsh",
        "        env:",
        '          BASH_EXAMPLE: "set -euo pipefail; $GITHUB_REF_NAME"',
        "          OUTPUT_PATH: ${{ runner.temp }}/out.json",
        "        run: |",
        "          $version = $env:GITHUB_REF_NAME",
        "          $root = ${env:RUNNER_TEMP}",
        "          $config = Get-Content -LiteralPath $env:OUTPUT_PATH -Raw",
        '          node ./scripts/build.mjs --output "$env:OUTPUT_PATH"',
        "      - shell: powershell",
        "        run: Write-Output $env:GITHUB_REF_NAME",
        "      - run: npm run verify && npm run doctor",
        "      - name: Metadata keys that resemble workflow fields",
        "        env:",
        "          run: export MODE=test",
        "        with:",
        "          shell: bash",
        "        shell: pwsh",
        "        run: |",
        "          Set-Location C:\\",
        "          Write-Output 'literal $GITHUB_REF_NAME and <<NODE'",
        "          Write-Output ok # migration note mentions $RUNNER_TEMP",
        "          Write-Output 'literal ${BASH_REMATCH[0]}'",
        '          $prefix = "C:\\"; $content = @"',
        "          shell: bash",
        "          run: export MODE=test",
        "          export NEXT_MODE=test",
        '          "@',
        "          $literal = @'",
        "          ref=$GITHUB_REF_NAME",
        "          '@",
        '          $path = "C:\\"; Write-Output "<<NODE"',
        '          Write-Output "`$GITHUB_REF_NAME"',
        "      - shell: python",
        "        run: |",
        '          mode="test"',
        "          print(mode)",
        "      - shell: cmd",
        "        run: set MODE=test",
      "      - shell: pwsh",
      "        run: |",
      "          $params = @{",
      '            Path="artifact.zip"',
      "          }",
      "      - shell: pwsh",
      '        run: $config = @{Mode="test";Path="artifact.zip"}',
      ].join("\n"),
    ),
    [],
  );
});

test("Windows workflow portability respects operating-system job boundaries", () => {
  assert.deepEqual(
    workflowFixtureIssues(
      [
        "jobs:",
        "  linux:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - shell: bash",
        "        run: |",
        "          set -euo pipefail",
        '          echo "$GITHUB_REF_NAME"',
        "  windows:",
        "    runs-on: windows-latest",
        "    steps:",
        "      - shell: pwsh",
        "        run: Write-Output $env:GITHUB_REF_NAME",
        "  macos:",
        "    runs-on: macos-15",
        "    steps:",
        "      - shell: zsh {0}",
        "        run: |",
        "          export MODE=test",
        "          node script.mjs \\",
        "            --verify",
        "  matrix:",
        "    strategy:",
        "      matrix:",
        "        os: [ubuntu-latest, windows-latest]",
        "    runs-on: ${{ matrix.os }}",
        "    steps:",
        "      - if: runner.os != 'Windows'",
        "        shell: bash",
        "        run: set -euo pipefail",
      ].join("\n"),
    ),
    [],
  );
});

test("Windows workflow portability permits documented line-level exceptions only", () => {
  const issues = workflowFixtureIssues(
    [
      "jobs:",
      "  windows-smoke:",
      "    runs-on: windows-latest",
      "    steps:",
      "      - shell: bash # command-portability-allow: vendor action requires Git Bash",
      "        run: npm test",
      "      - run: set -euo pipefail # command-portability-allow: upstream probe mirrors Bash",
      '      - name: "command-portability-allow: metadata is not an exception for later lines"',
      "        run: export MODE=test",
      "      - run: MODE=test node script.mjs # command-portability-allow:",
      "      - run: |",
      "          node script.mjs \\ # command-portability-allow: literal fixture continuation",
      "          export NEXT_MODE=test",
    ].join("\n"),
  );

  assert.deepEqual(
    issues.map(({ line }) => line),
    [9, 10, 13],
  );
});

test("command portability analyzes executable calls in test files", (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), "filament-manager-command-test-analysis-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));

  writeFixtureFile(
    repoRoot,
    "scripts/windows-smoke.test.mjs",
    'import { spawnSync } from "node:child_process";\nspawnSync("bash", ["-lc", "node --test"]);\n',
  );

  const result = analyzeCommandPortability({ repoRoot });
  assert.equal(result.sourceFiles.length, 1);
  assert.equal(result.childProcessFiles.length, 1);
  assert.deepEqual(
    result.issues.map(({ file, label, line }) => ({
      file: relative(repoRoot, file).split(sep).join("/"),
      label,
      line,
    })),
    [
      {
        file: "scripts/windows-smoke.test.mjs",
        label: "platform shell bash must not be launched directly",
        line: 2,
      },
    ],
  );
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

test("command portability follows immutable local child-process aliases", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec, execFile, spawn } from "node:child_process";
import * as childProcess from "node:child_process";
import { promisify } from "node:util";
const importedAlias = spawn;
importedAlias("npm", ["run", "verify"]);
const importedChain = importedAlias;
const importedChainAgain = importedChain;
importedChainAgain?.("npx.cmd", ["--version"]);
const requiredMethod = require("node:child_process").spawn;
const requiredAlias = requiredMethod;
requiredAlias?.("npm.cmd", ["--version"]);
const namespaceMethod = childProcess.execFile;
const namespaceAlias = namespaceMethod;
namespaceAlias("bash", ["-lc", "node --test"]);
const execute = exec;
const asyncExec = promisify(execute);
const promisedAlias = asyncExec;
promisedAlias("npm run verify");
const unsafeFile = execFile;
unsafeFile(process.execPath, ["runner.mjs"], { shell: true });
const safeFile = execFile;
safeFile(process.execPath, ["runner.mjs"], { shell: false });
`),
    [
      packageManagerIssue("npm", 6),
      packageManagerIssue("npx.cmd", 9),
      packageManagerIssue("npm.cmd", 12),
      platformShellIssue("bash", 15),
      implicitShellIssue("exec", 19),
      { label: "child-process shell option must be the literal false", line: 21 },
    ],
  );
});

test("command portability follows alternating alias and promisify chains", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec } from "node:child_process";
import { promisify } from "node:util";
const first = promisify(exec);
const firstAlias = first;
const second = promisify(firstAlias);
const secondAlias = second;
secondAlias("npm run verify");
`),
    [implicitShellIssue("exec", 8)],
  );
});

test("command portability follows semicolonless aliases at ASI boundaries", () => {
  assert.deepEqual(
    fixtureIssues(`
import { spawn } from "node:child_process";
const launch = spawn
launch("npm.cmd", ["--version"])
`),
    [packageManagerIssue("npm.cmd", 4)],
  );
});

test("command portability leaves mutable and computed local aliases untracked", () => {
  assert.deepEqual(
    fixtureIssues(`
import { spawn } from "node:child_process";
let mutableAlias = spawn;
mutableAlias("npm", ["--version"]);
const boundAlias = spawn.bind(null);
boundAlias("npm.cmd", ["--version"]);
const conditionalAlias = useNative ? spawn : fallback;
conditionalAlias("npx", ["--version"]);
const wrapper = (...args) => spawn(...args);
wrapper("npx.cmd", ["--version"]);
const holder = { launch: spawn };
holder.launch("npm", ["--version"]);
const propertyAlias = helper.spawn;
propertyAlias("npm.cmd", ["--version"]);
const shadowedAlias = spawn;
function nested(shadowedAlias) {
  shadowedAlias("npx.cmd", ["--version"]);
}
function aliasesParameter(spawn) {
  const parameterAlias = spawn;
  parameterAlias("npm", ["--version"]);
}
function aliasesLocal() {
  const spawn = fallback;
  const localAlias = spawn;
  localAlias("npx", ["--version"]);
}
`),
    [],
  );
});

test("command portability preserves source order and leaves alias cycles unresolved", () => {
  assert.deepEqual(
    fixtureIssues(`
import { spawn } from "node:child_process";
const early = later;
const later = spawn;
early("npm", ["--version"]);
later("npx.cmd", ["--version"]);
const cycleA = cycleB;
const cycleB = cycleA;
cycleA("npm.cmd", ["--version"]);
`),
    [packageManagerIssue("npx.cmd", 6)],
  );
});

test("command portability preserves alias source order across promisify", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec } from "node:child_process";
import { promisify } from "node:util";
const early = later;
const later = promisify(exec);
early("npm run smoke");
later("npm run verify");
`),
    [implicitShellIssue("exec", 7)],
  );
});

test("command portability preserves alias source order across local bindings", () => {
  assert.deepEqual(
    fixtureIssues(`
import * as childProcess from "node:child_process";
const earlyRequired = laterRequired;
const laterRequired = require("node:child_process").spawn;
earlyRequired("npm", ["--version"]);
laterRequired("npx.cmd", ["--version"]);
const earlyNamespace = laterNamespace;
const laterNamespace = childProcess.spawn;
earlyNamespace("npm.cmd", ["--version"]);
laterNamespace("npx", ["--version"]);
`),
    [
      packageManagerIssue("npx.cmd", 6),
      packageManagerIssue("npx", 10),
    ],
  );
});

test("command portability does not leak nested bindings into top-level aliases", () => {
  assert.deepEqual(
    fixtureIssues(`
import * as childProcess from "node:child_process";
import { promisify } from "node:util";
const spawn = fallback;
function nested() {
  const spawn = childProcess.spawn;
  return spawn;
}
const launch = spawn;
launch("npm", ["--version"]);
const execute = fallback;
function nestedExecute() {
  const execute = childProcess.exec;
  return execute;
}
const asyncRun = promisify(execute);
const asyncAlias = asyncRun;
asyncAlias("npm run verify");
`),
    [],
  );
});

test("command portability preserves existing file-wide binding behavior", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec, spawn as launch } from "node:child_process";
import { promisify } from "node:util";
launch("npm", ["--version"]);
function nestedLaunch() {
  const launch = require("node:child_process").spawn;
  launch("npx.cmd", ["--version"]);
}
function invokeRequired() {
  requiredLaunch("npm.cmd", ["--version"]);
}
const requiredLaunch = require("node:child_process").spawn;
function invokeAsync() {
  asyncExec("npm run verify");
}
const asyncExec = promisify(exec);
`),
    [
      packageManagerIssue("npm", 4),
      packageManagerIssue("npx.cmd", 7),
      packageManagerIssue("npm.cmd", 10),
      implicitShellIssue("exec", 14),
    ],
  );
});

test("command portability preserves existing promisify binding behavior", () => {
  assert.deepEqual(
    fixtureIssues(`
import { exec, spawn as importedRun } from "node:child_process";
import { promisify } from "node:util";
let mutableExecute = require("node:child_process").exec;
const mutableRun = promisify(mutableExecute);
mutableRun("npm run mutable");
function nestedSource() {
  const nestedExecute = require("node:child_process").exec;
  const nestedRun = promisify(nestedExecute);
  nestedRun("npm run nested");
}
function importedShadow() {
  const importedRun = promisify(exec);
  importedRun("npm run imported-shadow");
}
const overwrittenRun = promisify(exec);
function laterShadow() {
  const overwrittenRun = require("node:child_process").spawn;
  return overwrittenRun;
}
overwrittenRun("npm run overwritten");
`),
    [
      implicitShellIssue("exec", 6),
      implicitShellIssue("exec", 10),
      implicitShellIssue("exec", 14),
      implicitShellIssue("exec", 21),
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
