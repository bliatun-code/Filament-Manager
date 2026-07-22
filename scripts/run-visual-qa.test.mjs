import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
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

function createFakeChild() {
  return new EventEmitter();
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

test("visual QA CLI refuses live databases before preparation", async () => {
  let prepareCalls = 0;
  await assert.rejects(
    runVisualQaCli({
      argv: ["--live"],
      log: () => {},
      prepareVisualQaDatabase: async () => {
        prepareCalls += 1;
        return createVisualQaDatabase();
      },
    }),
    /refuses --live/,
  );
  assert.equal(prepareCalls, 0);
});

test("visual QA CLI preserves kept copies when spawn throws", async () => {
  for (const scenario of [
    { argv: ["--keep"], database: createVisualQaDatabase() },
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

test("visual QA CLI waits for close before cleanup and exit propagation", async () => {
  const child = createFakeChild();
  const order = [];
  const run = runVisualQaCli({
    argv: [],
    cleanupVisualQaDatabase: (path) => order.push(`cleanup:${path}`),
    log: () => {},
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    processExit: (code) => order.push(`exit:${code}`),
    processKill: () => order.push("kill"),
    spawnFn: () => child,
  });

  await Promise.resolve();
  child.emit("exit", 7, null);
  assert.deepEqual(order, []);

  child.emit("close", 7, null);
  const result = await run;

  assert.equal(result.child, child);
  assert.deepEqual(order, [
    `cleanup:${testVisualDatabasePath}`,
    "exit:7",
  ]);
});

test("visual QA CLI forwards signals only after close and cleanup", async () => {
  const child = createFakeChild();
  const order = [];
  const run = runVisualQaCli({
    argv: [],
    cleanupVisualQaDatabase: () => order.push("cleanup"),
    log: () => {},
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    processExit: () => order.push("exit"),
    processKill: (pid, signal) => order.push(`kill:${pid}:${signal}`),
    spawnFn: () => child,
  });

  await Promise.resolve();
  child.emit("exit", null, "SIGTERM");
  assert.deepEqual(order, []);
  child.emit("close", null, "SIGTERM");
  await run;

  assert.deepEqual(order, ["cleanup", `kill:${process.pid}:SIGTERM`]);
});

test("visual QA CLI rejects asynchronous spawn errors after close and cleans once", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const processCalls = [];
  const spawnError = Object.assign(new Error("spawn missing command"), {
    code: "ENOENT",
  });
  const run = runVisualQaCli({
    argv: [],
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    log: () => {},
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    processExit: (code) => processCalls.push(["exit", code]),
    processKill: (pid, signal) => processCalls.push(["kill", pid, signal]),
    spawnFn: () => child,
  });

  await Promise.resolve();
  assert.equal(child.listenerCount("error"), 1);
  child.emit("error", spawnError);
  child.emit("close", -2, null);

  await assert.rejects(run, (error) => error === spawnError);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
  assert.deepEqual(processCalls, []);
  assert.equal(child.listenerCount("error"), 0);
  assert.equal(child.listenerCount("close"), 0);
});

test("visual QA CLI preserves kept copies after asynchronous spawn errors", async () => {
  for (const scenario of [
    { argv: ["--keep"], database: createVisualQaDatabase() },
  ]) {
    const child = createFakeChild();
    const cleanup = [];
    const spawnError = Object.assign(new Error("spawn missing command"), {
      code: "ENOENT",
    });
    const run = runVisualQaCli({
      argv: scenario.argv,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      log: () => {},
      prepareVisualQaDatabase: async () => scenario.database,
      spawnFn: () => child,
    });

    await Promise.resolve();
    assert.equal(child.listenerCount("error"), 1);
    child.emit("error", spawnError);
    child.emit("close", -2, null);

    await assert.rejects(run, (error) => error === spawnError);
    assert.deepEqual(cleanup, []);
  }
});

test("visual QA CLI aggregates synchronous spawn and cleanup failures", async () => {
  const cleanupError = new Error("cleanup failed");
  const spawnError = new Error("spawn EACCES");

  await assert.rejects(
    runVisualQaCli({
      argv: [],
      cleanupVisualQaDatabase: () => {
        throw cleanupError;
      },
      log: () => {},
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      spawnFn: () => {
        throw spawnError;
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [spawnError, cleanupError]);
      assert.equal(error.cause, spawnError);
      return true;
    },
  );
});

test("visual QA CLI aggregates asynchronous spawn and cleanup failures", async () => {
  const child = createFakeChild();
  const cleanupError = new Error("cleanup failed");
  const spawnError = Object.assign(new Error("spawn missing command"), {
    code: "ENOENT",
  });
  const run = runVisualQaCli({
    argv: [],
    cleanupVisualQaDatabase: () => {
      throw cleanupError;
    },
    log: () => {},
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    spawnFn: () => child,
  });

  await Promise.resolve();
  assert.equal(child.listenerCount("error"), 1);
  child.emit("error", spawnError);
  child.emit("close", -2, null);

  await assert.rejects(run, (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [spawnError, cleanupError]);
    assert.equal(error.cause, spawnError);
    return true;
  });
});

test("visual QA CLI aggregates termination and cleanup failures before process propagation", async () => {
  for (const scenario of [
    { code: 9, message: /exit code 9/, signal: null },
    { code: null, message: /signal SIGTERM/, signal: "SIGTERM" },
  ]) {
    const child = createFakeChild();
    const cleanupError = new Error("cleanup failed");
    const processCalls = [];
    const run = runVisualQaCli({
      argv: [],
      cleanupVisualQaDatabase: () => {
        throw cleanupError;
      },
      log: () => {},
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      processExit: (code) => processCalls.push(["exit", code]),
      processKill: (pid, signal) => processCalls.push(["kill", pid, signal]),
      spawnFn: () => child,
    });

    await Promise.resolve();
    child.emit("close", scenario.code, scenario.signal);

    await assert.rejects(run, (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, scenario.message);
      assert.equal(error.errors[1], cleanupError);
      assert.equal(error.cause, error.errors[0]);
      return true;
    });
    assert.deepEqual(processCalls, []);
  }
});

test("visual QA CLI handles a real asynchronous ENOENT spawn failure", async () => {
  const cleanup = [];
  const command = "filament-manager-command-that-does-not-exist-async-qa";

  await assert.rejects(
    runVisualQaCli({
      argv: [],
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      log: () => {},
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      spawnFn: () => spawn(command, [], { stdio: "ignore" }),
    }),
    (error) => error?.code === "ENOENT",
  );

  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});
