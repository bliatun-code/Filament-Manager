import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";

import {
  buildLocalDevEnvironment,
  FILAMENT_MANAGER_DB_PATH_ENV,
  resolveLocalDevDatabasePath,
  runLocalDev,
} from "./run-local-dev.mjs";

test("local dev database stays inside the ignored workspace tmp directory", () => {
  const repoRoot = path.resolve("workspace", "filament-manager");

  assert.equal(
    resolveLocalDevDatabasePath(repoRoot),
    path.join(repoRoot, "tmp", "dev-local", "filament-manager.db"),
  );
});

test("local dev environment preserves signing configuration and replaces database overrides", () => {
  const repoRoot = path.resolve("workspace", "filament-manager");
  const env = {
    FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY: "Apple Development: Example (TEAM123456)",
    [FILAMENT_MANAGER_DB_PATH_ENV]: "/private/live-library.db",
  };

  const childEnv = buildLocalDevEnvironment({ env, repoRoot });

  assert.equal(
    childEnv.FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY,
    env.FILAMENT_MANAGER_MACOS_DEV_SIGNING_IDENTITY,
  );
  assert.equal(
    childEnv[FILAMENT_MANAGER_DB_PATH_ENV],
    path.join(repoRoot, "tmp", "dev-local", "filament-manager.db"),
  );
  assert.notEqual(childEnv, env);
});

test("local dev prepares its populated copy before launching Tauri", async () => {
  const calls = [];
  const logs = [];
  const repoRoot = path.resolve("workspace", "filament-manager");
  const child = new EventEmitter();
  child.pid = 42;
  let releaseCount = 0;
  const targetPath = path.join(repoRoot, "tmp", "dev-local", "filament-manager.db");

  const result = await runLocalDev({
    argv: ["--no-watch"],
    cwd: repoRoot,
    env: { CUSTOM_VALUE: "kept" },
    log: (message) => logs.push(message),
    platform: "darwin",
    acquireLock: (options) => {
      calls.push({ lock: options });
      return () => {
        releaseCount += 1;
      };
    },
    prepareDatabase: async (options) => {
      calls.push({ prepare: options });
      return {
        reused: false,
        sourcePath: "/private/standalone-recovery.sqlite",
        targetPath,
      };
    },
    runTauri: (options) => {
      calls.push({ run: options });
      return child;
    },
  });

  assert.equal(result, child);
  assert.deepEqual(calls, [
    {
      lock: {
        cwd: repoRoot,
        platform: "darwin",
        targetPath,
      },
    },
    {
      prepare: {
        cwd: repoRoot,
        env: { CUSTOM_VALUE: "kept" },
        platform: "darwin",
        targetPath,
      },
    },
    {
      run: {
        argv: ["dev", "--no-watch"],
        cwd: repoRoot,
        env: {
          CUSTOM_VALUE: "kept",
          [FILAMENT_MANAGER_DB_PATH_ENV]: targetPath,
        },
        platform: "darwin",
      },
    },
  ]);
  assert.deepEqual(logs, [
    "Created local-only development snapshot from: /private/standalone-recovery.sqlite",
    `Writable development database: ${targetPath}`,
  ]);
  assert.equal(releaseCount, 0);
  child.emit("exit", 0, null);
  assert.equal(releaseCount, 1);
});

test("local dev reports when it reuses an existing populated standalone copy", async () => {
  const logs = [];
  const repoRoot = path.resolve("workspace", "filament-manager");
  const targetPath = path.join(repoRoot, "tmp", "dev-local", "filament-manager.db");
  const child = new EventEmitter();
  child.pid = 42;

  await runLocalDev({
    acquireLock: () => () => {},
    cwd: repoRoot,
    log: (message) => logs.push(message),
    prepareDatabase: async () => ({ reused: true, sourcePath: null, targetPath }),
    runTauri: () => child,
  });

  assert.deepEqual(logs, [`Reusing populated local-only development database: ${targetPath}`]);
  child.emit("exit", 0, null);
});

test("local dev releases its process lock when database preparation fails", async () => {
  const repoRoot = path.resolve("workspace", "filament-manager-failure");
  let releaseCount = 0;

  await assert.rejects(
    runLocalDev({
      acquireLock: () => () => {
        releaseCount += 1;
      },
      cwd: repoRoot,
      prepareDatabase: async () => {
        throw new Error("database preparation failed");
      },
      runTauri: () => {
        throw new Error("Tauri must not start");
      },
    }),
    /database preparation failed/,
  );
  assert.equal(releaseCount, 1);
});

test("local dev releases its lock and preserves POSIX signal semantics", async () => {
  const repoRoot = path.resolve("workspace", "filament-manager-signal");
  const child = new EventEmitter();
  child.pid = 42;
  const processControl = new EventEmitter();
  processControl.pid = 101;
  const forwardedSignals = [];
  processControl.kill = (pid, signal) => {
    forwardedSignals.push({ pid, signal });
  };
  let releaseCount = 0;

  await runLocalDev({
    acquireLock: () => () => {
      releaseCount += 1;
    },
    cwd: repoRoot,
    log: () => {},
    platform: "darwin",
    prepareDatabase: async ({ targetPath }) => ({
      reused: true,
      sourcePath: null,
      targetPath,
    }),
    processControl,
    runTauri: () => child,
  });

  assert.equal(processControl.listenerCount("SIGINT"), 1);
  assert.equal(processControl.listenerCount("SIGTERM"), 1);
  assert.equal(processControl.listenerCount("SIGHUP"), 1);
  processControl.emit("SIGINT");
  assert.equal(releaseCount, 1);
  assert.deepEqual(forwardedSignals, [{ pid: 101, signal: "SIGINT" }]);
  assert.equal(processControl.listenerCount("exit"), 0);
  assert.equal(processControl.listenerCount("SIGINT"), 0);
  assert.equal(processControl.listenerCount("SIGTERM"), 0);
  assert.equal(processControl.listenerCount("SIGHUP"), 0);
  child.emit("exit", 0, null);
  assert.equal(releaseCount, 1);
});
