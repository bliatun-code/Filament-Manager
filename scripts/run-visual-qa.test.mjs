import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  resolveVisualQaTauriLaunch,
  runVisualQaCli,
} from "./run-visual-qa.mjs";

const testSourceDatabasePath = "C:\\Visual QA\\source.db";
const testVisualDatabasePath = "C:\\Visual QA\\generated.db";

function createVisualQaDatabase(overrides = {}) {
  return {
    assessment: { errors: [], profile: "base", warnings: [] },
    copyMethod: "test-copy",
    inspection: {
      counts: { filament_spools: 1, printers: 1 },
      details: {},
      tables: ["filament_spools", "printers"],
    },
    live: false,
    sourcePath: testSourceDatabasePath,
    sourceType: "argument",
    targetPath: testVisualDatabasePath,
    ...overrides,
  };
}

test("visual QA launches the local Tauri wrapper through Node without a shell", () => {
  const executable = "node-runtime";
  const launch = resolveVisualQaTauriLaunch({ executable });

  assert.deepEqual(launch, {
    args: [fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)), "dev"],
    command: executable,
    shell: false,
  });
});

test("visual QA Tauri launch stays clean when Node deprecations throw", () => {
  const moduleUrl = new URL("./run-visual-qa.mjs", import.meta.url).href;
  const probe = `
    import { spawnSync } from "node:child_process";
    import { resolveVisualQaTauriLaunch } from ${JSON.stringify(moduleUrl)};

    const launch = resolveVisualQaTauriLaunch({ args: ["--version"] });
    const result = spawnSync(launch.command, launch.args, {
      encoding: "utf8",
      shell: launch.shell,
    });

    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  `;
  const result = spawnSync(
    process.execPath,
    ["--throw-deprecation", "--input-type=module", "--eval", probe],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    },
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tauri-cli \d+\./);
  assert.doesNotMatch(result.stderr, /DEP0190/);
});

test("visual QA CLI cleans its generated database when spawn throws synchronously", async () => {
  const cleanup = [];
  const spawnError = new Error("spawn EACCES");

  await assert.rejects(
    runVisualQaCli({
      argv: [],
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      log: () => {},
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      spawnFn: () => {
        throw spawnError;
      },
    }),
    (error) => error === spawnError,
  );

  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("visual QA CLI preserves kept copies and live databases when spawn throws", async () => {
  for (const scenario of [
    { argv: ["--keep"], database: createVisualQaDatabase() },
    {
      argv: ["--live"],
      database: createVisualQaDatabase({
        live: true,
        targetPath: testSourceDatabasePath,
      }),
    },
  ]) {
    const cleanup = [];
    const spawnError = new Error("spawn EACCES");

    await assert.rejects(
      runVisualQaCli({
        argv: scenario.argv,
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        log: () => {},
        prepareVisualQaDatabase: async () => scenario.database,
        spawnFn: () => {
          throw spawnError;
        },
      }),
      (error) => error === spawnError,
    );

    assert.deepEqual(cleanup, []);
  }
});
