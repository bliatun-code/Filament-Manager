import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activateDesktopWindow,
  assertDesktopScreenshotPlatform,
  buildDesktopVisualQaLaunchEnv,
  buildDesktopWindowActivateScript,
  buildDesktopWindowListScript,
  buildDesktopWindowLookupScript,
  buildDesktopWindowResizeScript,
  captureDesktopWindowScreenshot,
  DESKTOP_DARK_THEME_MAX_LUMA_MEAN,
  DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN,
  DESKTOP_VISUAL_QA_READINESS_PREFIX,
  DESKTOP_VISUAL_QA_STATIC_SETTLE_MS,
  DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
  DEFAULT_NATIVE_WINDOW_COMMAND_TIMEOUT_MS,
  desktopScreenshotScale,
  desktopScreenshotNameForScenario,
  desktopWindowsForProcess,
  desktopWindowMatchesRequestedSize,
  desktopVisualQaExpectedWindowTitles,
  desktopVisualQaOutputHasReadinessToken,
  desktopVisualQaReadinessMarker,
  desktopVisualQaScenarioDefinition,
  desktopVisualQaScenarioReadiness,
  desktopVisualQaScenarioRequiresDatabaseFixture,
  desktopVisualQaWindowMatchesScenario,
  defaultDesktopVisualQaCaptureDelayMs,
  execFileWithTimeout,
  findDesktopWindow,
  findDesktopWindowWithNativeHelper,
  formatDesktopScreenshotGateReport,
  normalizeDesktopVisualQaScenario,
  normalizeDesktopVisualQaTheme,
  normalizeDesktopVisualQaWindowSize,
  normalizeNativeDesktopWindowFrame,
  normalizeVisualQaLocale,
  parseDesktopVisualQaScenarios,
  parseDesktopWindowList,
  parseDesktopWindowInfo,
  resolveMacosWindowInfoHelperLaunch,
  resolveDesktopVisualQaTheme,
  resolveDesktopVisualQaWindowSize,
  resizeDesktopWindow,
  resolveDesktopScreenshotTauriLaunch,
  selectDesktopWindowForProcess,
  runDesktopScreenshotGate,
  runDesktopScreenshotGateWithLaunchRetry,
  runDesktopScreenshotScenariosWithLaunch,
  runLaunchedDesktopScreenshotGate,
  shouldRetryDesktopLaunch,
  spawnDesktopTauriDev,
  terminateChild,
  validateDesktopScreenshotMetrics,
  validateDesktopScreenshotTheme,
  validateDesktopWindowSize,
  waitForDesktopWindow,
  waitForDesktopVisualQaReadiness,
} from "./run-desktop-screenshot-gate.mjs";

const testOutputDir = path.join(tmpdir(), "visual-qa");
const testSourceDatabasePath = path.join(tmpdir(), "visual-qa-source.db");
const testVisualDatabasePath = path.join(tmpdir(), "visual-qa.db");

function createFakeChild(overrides = {}) {
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.unrefCalls = 0;
  child.unref = () => {
    child.unrefCalls += 1;
  };
  return Object.assign(child, overrides);
}

function createFakeClock() {
  let now = 0;
  return {
    now: () => now,
    wait: async (intervalMs) => {
      now += intervalMs;
    },
  };
}

function createMetric(overrides = {}) {
  return {
    screenshot: path.join(tmpdir(), "desktop-window.png"),
    screenshotPixels: {
      colorBuckets: 80,
      edgeDeltaMean: 7,
      height: 900,
      lumaMean: 42,
      lumaStdDev: 18,
      saturatedPixelRatio: 0.08,
      samples: 120000,
      swatchSamples: {
        averageSaturation: 0,
        colorful: 0,
        total: 0,
        visible: 0,
      },
      width: 1300,
      ...overrides.screenshotPixels,
    },
    window: {
      height: 900,
      processName: "Filament Manager",
      title: "Filament Manager",
      width: 1300,
      x: 20,
      y: 40,
      ...overrides.window,
    },
    ...overrides,
  };
}

test("desktop screenshot gate keeps its macOS-only platform contract injectable", () => {
  assert.doesNotThrow(() =>
    assertDesktopScreenshotPlatform({ platform: "darwin" }),
  );
  assert.throws(
    () => assertDesktopScreenshotPlatform({ platform: "win32" }),
    /currently supports macOS only/,
  );
  assert.throws(
    () => assertDesktopScreenshotPlatform({ platform: "linux" }),
    /currently supports macOS only/,
  );
  assert.doesNotThrow(() =>
    assertDesktopScreenshotPlatform({
      allowNonDarwin: true,
      platform: "win32",
    }),
  );
});

test("desktop screenshot runners reject unsupported platforms before side effects", async () => {
  await assert.rejects(
    runDesktopScreenshotGate({ platform: "win32" }),
    /currently supports macOS only/,
  );

  let preparedDatabase = false;
  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      platform: "win32",
      prepareVisualQaDatabase: async () => {
        preparedDatabase = true;
        throw new Error("database preparation should not run");
      },
    }),
    /currently supports macOS only/,
  );
  assert.equal(preparedDatabase, false);
});

test("desktop screenshot launch uses the local Tauri wrapper without a shell", () => {
  const executable = "node-runtime";
  const launch = resolveDesktopScreenshotTauriLaunch({ executable });

  assert.deepEqual(launch, {
    args: [
      fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)),
      "dev",
    ],
    command: executable,
    shell: false,
  });
});

test("desktop screenshot spawn keeps launch options and visual QA context", () => {
  const calls = [];
  const child = { pid: 42 };
  const database = { targetPath: testVisualDatabasePath };
  const result = spawnDesktopTauriDev(
    (command, args, options) => {
      calls.push({ args, command, options });
      return child;
    },
    {
      cwd: "project root with spaces",
      locale: "de",
      scenario: "printer-board",
      themeMode: "dark",
    },
    database,
  );

  assert.equal(result, child);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args, [
    fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)),
    "dev",
  ]);
  assert.equal(calls[0].options.cwd, "project root with spaces");
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(calls[0].options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(
    calls[0].options.env.FILAMENT_MANAGER_DB_PATH,
    testVisualDatabasePath,
  );
  assert.equal(calls[0].options.env.FILAMENT_MANAGER_VISUAL_QA, "1");
  assert.equal(calls[0].options.env.FILAMENT_MANAGER_VISUAL_QA_LOCALE, "de");
  assert.equal(
    calls[0].options.env.FILAMENT_MANAGER_VISUAL_QA_SCENARIO,
    "printer-board",
  );
  assert.equal(
    calls[0].options.env.FILAMENT_MANAGER_VISUAL_QA_THEME,
    "dark",
  );
});

test("launched desktop gate refuses live databases before preparation", async () => {
  const calls = { prepare: 0, spawn: 0 };

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      live: true,
      platform: "win32",
      prepareVisualQaDatabase: async () => {
        calls.prepare += 1;
        return { live: false, targetPath: testVisualDatabasePath };
      },
      spawnFn: () => {
        calls.spawn += 1;
        return createFakeChild();
      },
    }),
    /refuses --live/,
  );

  assert.equal(calls.prepare, 0);
  assert.equal(calls.spawn, 0);
});

test("launched desktop gate refuses a preexisting Filament Manager window", async () => {
  const calls = { prepare: 0, spawn: 0 };

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      listPreexistingWindowsFn: async () => [
        ...parseDesktopWindowList(
          "bambu-filament-manager\t\t0\t0\t1200\t900\n",
        ),
      ],
      platform: "darwin",
      prepareVisualQaDatabase: async () => {
        calls.prepare += 1;
        return { live: false, targetPath: testVisualDatabasePath };
      },
      spawnFn: () => {
        calls.spawn += 1;
        return createFakeChild();
      },
    }),
    /requires every existing Filament Manager window to be closed/,
  );

  assert.equal(calls.prepare, 0);
  assert.equal(calls.spawn, 0);
});

test("launched desktop gate preserves synchronous spawn and cleanup failures", async () => {
  const spawnError = new Error("spawn EACCES");
  const cleanupError = new Error("cleanup denied");

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: () => {
        throw cleanupError;
      },
      platform: "win32",
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      spawnFn: () => {
        throw spawnError;
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [spawnError, cleanupError]);
      assert.equal(error.cause, spawnError);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /cleanup failed or may be incomplete/i);
      return true;
    },
  );
});

test("launched desktop gate reports a kept temporary database when spawn throws", async () => {
  const cleanup = [];
  const spawnError = new Error("spawn EACCES");

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      keep: true,
      platform: "win32",
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      spawnFn: () => {
        throw spawnError;
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [spawnError]);
      assert.equal(error.cause, spawnError);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /temporary database retained/i);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched desktop gate preserves kept copies and live databases when spawn throws", async () => {
  for (const scenario of [
    { database: { live: false, targetPath: testVisualDatabasePath }, keep: true },
    { database: { live: true, targetPath: testVisualDatabasePath }, keep: false },
  ]) {
    const cleanup = [];
    const spawnError = new Error("spawn EACCES");

    await assert.rejects(
      runLaunchedDesktopScreenshotGate({
        allowNonDarwin: true,
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        keep: scenario.keep,
        platform: "win32",
        prepareVisualQaDatabase: async () => scenario.database,
        spawnFn: () => {
          throw spawnError;
        },
      }),
      (error) => {
        if (scenario.database.live) {
          return error === spawnError;
        }
        assert.ok(error instanceof AggregateError);
        assert.equal(error.cause, spawnError);
        assert.ok(error.message.includes(scenario.database.targetPath));
        return true;
      },
    );

    assert.deepEqual(cleanup, []);
  }
});

test("launched desktop gate reports asynchronous spawn errors and cleans a dead temporary-copy app", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const prepare = [];
  const spawnError = Object.assign(new Error("spawn missing command"), {
    code: "ENOENT",
  });

  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => ({ stdout: "" }),
    findWindowFn: async () => {
      child.pid = undefined;
      child.exitCode = -2;
      child.emit("error", spawnError);
      child.emit("close", -2, null);
      return null;
    },
    keepAppOnFail: true,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async (options) => {
      prepare.push(options);
      return { live: false, targetPath: testVisualDatabasePath };
    },
    scenario: "order-queue",
    spawnFn: () => child,
    startupTimeoutMs: 0,
    windowPollMs: 0,
  });

  assert.equal(prepare[0]?.live, false);
  assert.match(result.errors[0], /ENOENT: spawn missing command/);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
  assert.equal(child.unrefCalls, 0);
});

test("launched desktop gate observes close without exit and does not keep a dead app", async () => {
  const child = createFakeChild();
  const cleanup = [];

  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => ({ stdout: "" }),
    findWindowFn: async () => {
      child.exitCode = 17;
      child.emit("close", 17, null);
      return null;
    },
    keepAppOnFail: true,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    spawnFn: () => child,
    startupTimeoutMs: 0,
    windowPollMs: 0,
  });

  assert.match(result.errors[0], /exited early \(17\)/);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
  assert.equal(child.unrefCalls, 0);
});

test("launched desktop gate preserves keep and live ownership after asynchronous spawn errors", async () => {
  for (const scenario of [
    {
      database: { live: false, targetPath: testVisualDatabasePath },
      keep: true,
    },
    {
      database: { live: true, targetPath: testSourceDatabasePath },
      keep: false,
    },
  ]) {
    const child = createFakeChild();
    const cleanup = [];
    const spawnError = Object.assign(new Error("spawn missing command"), {
      code: "ENOENT",
    });
    const result = await runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      execFileFn: async () => ({ stdout: "" }),
      findWindowFn: async () => {
        child.pid = undefined;
        child.exitCode = -2;
        child.emit("error", spawnError);
        child.emit("close", -2, null);
        return null;
      },
      keep: scenario.keep,
      keepAppOnFail: true,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => scenario.database,
      spawnFn: () => child,
      startupTimeoutMs: 0,
      windowPollMs: 0,
    });

    assert.match(result.errors[0], /ENOENT: spawn missing command/);
    assert.deepEqual(cleanup, []);
    assert.equal(child.unrefCalls, 0);
  }
});

test("launched desktop gate rechecks keep-app ownership after window diagnostics", async () => {
  const child = createFakeChild();
  const cleanup = [];

  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => {
      child.exitCode = 1;
      child.emit("close", 1, null);
      return { stdout: "" };
    },
    findWindowFn: async () => null,
    keepAppOnFail: true,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    spawnFn: () => child,
    startupTimeoutMs: 0,
    windowPollMs: 0,
  });

  assert.match(result.errors[0], /exited early \(1\)/);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
  assert.equal(child.unrefCalls, 0);
});

test("launched desktop gate reports permanent window lookup failures without retry", async () => {
  const cleanup = [];
  const lookupError = Object.assign(new Error("Accessibility denied"), {
    code: "EACCES",
  });
  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => ({ stdout: "" }),
    findWindowFn: async () => {
      throw lookupError;
    },
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    spawnFn: () => createFakeChild(),
    startupTimeoutMs: 0,
    terminateChildFn: async () => true,
    windowPollMs: 0,
  });

  assert.match(result.errors[0], /EACCES: Accessibility denied/);
  assert.equal(result.retryableLaunchFailure, false);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate can retry when only visible-window diagnostics fail", async () => {
  const cleanup = [];
  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => {
      throw new Error("visible window diagnostics unavailable");
    },
    findWindowFn: async () => null,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    spawnFn: () => createFakeChild(),
    startupTimeoutMs: 0,
    terminateChildFn: async () => true,
    windowPollMs: 0,
  });

  assert.match(result.errors[0], /visible window diagnostics unavailable/);
  assert.equal(result.launchFailed, true);
  assert.equal(result.retryableLaunchFailure, true);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate preserves a resize lookup failure after safe cleanup", async () => {
  const clock = createFakeClock();
  const cleanup = [];
  const lookupError = new Error("resize lookup denied");
  let lookupCalls = 0;

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      execFileFn: async () => ({ stdout: "" }),
      findWindowFn: async () => {
        lookupCalls += 1;
        if (lookupCalls === 1) {
          return createMetric().window;
        }
        throw lookupError;
      },
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      nowFn: clock.now,
      resizeWindowPollMs: 1,
      resizeWindowTimeoutMs: 0,
      spawnFn: () => createFakeChild(),
      terminateChildFn: async () => true,
      waitFn: clock.wait,
      windowSize: { height: 700, width: 900 },
    }),
    (error) => error === lookupError,
  );

  assert.equal(lookupCalls, 2);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate reports an intentional keep-app ownership transfer", async () => {
  const child = createFakeChild();
  const cleanup = [];

  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => ({ stdout: "" }),
    findWindowFn: async () => null,
    keepAppOnFail: true,
    platform: "win32",
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    spawnFn: () => child,
    startupTimeoutMs: 0,
    windowPollMs: 0,
  });

  assert.equal(result.appKept, true);
  assert.equal(result.retryableLaunchFailure, false);
  assert.equal(result.temporaryDatabaseRetained, true);
  assert.equal(result.terminationConfirmed, null);
  assert.deepEqual(cleanup, []);
  assert.equal(child.unrefCalls, 1);
});

test("launched desktop gate reports a failed keep-app ownership transfer", async () => {
  const releaseError = new Error("unref failed");
  const cleanup = [];

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      execFileFn: async () => ({ stdout: "" }),
      findWindowFn: async () => null,
      keepAppOnFail: true,
      platform: "win32",
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      releaseChildFn: async () => {
        throw releaseError;
      },
      spawnFn: () => createFakeChild(),
      startupTimeoutMs: 0,
      windowPollMs: 0,
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.at(-1), releaseError);
      assert.match(error.message, /ownership transfer failed/i);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched desktop gate reclaims ownership when the app stops during async transfer", async () => {
  const child = createFakeChild();
  const cleanup = [];
  let terminationCalls = 0;
  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => ({ stdout: "" }),
    findWindowFn: async () => null,
    keepAppOnFail: true,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    releaseChildFn: async () => {
      child.exitCode = 17;
      child.emit("close", 17, null);
    },
    spawnFn: () => child,
    startupTimeoutMs: 0,
    terminateChildFn: async () => {
      terminationCalls += 1;
      return true;
    },
    windowPollMs: 0,
  });

  assert.equal(result.appKept, false);
  assert.equal(result.launchOwnershipUnresolved, false);
  assert.equal(result.retryableLaunchFailure, true);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.equal(result.terminationConfirmed, true);
  assert.equal(terminationCalls, 1);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate retries only after safe no-window teardown", async () => {
  const cases = [
    {
      database: { live: false, targetPath: testVisualDatabasePath },
      expectedCleanup: [testVisualDatabasePath],
      expectedRetained: false,
      expectedRetryable: true,
      keep: false,
      terminationConfirmed: true,
    },
    {
      database: { live: false, targetPath: testVisualDatabasePath },
      expectedCleanup: [],
      expectedRetained: true,
      expectedRetryable: false,
      keep: true,
      terminationConfirmed: true,
    },
    {
      database: { live: true, targetPath: testSourceDatabasePath },
      expectedCleanup: [],
      expectedRetained: false,
      expectedRetryable: true,
      keep: false,
      terminationConfirmed: true,
    },
    {
      database: { live: false, targetPath: testVisualDatabasePath },
      expectedCleanup: [],
      expectedRetained: true,
      expectedRetryable: false,
      keep: false,
      terminationConfirmed: false,
    },
  ];

  for (const scenario of cases) {
    const child = createFakeChild();
    const cleanup = [];
    const result = await runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      execFileFn: async () => ({ stdout: "" }),
      findWindowFn: async () => null,
      keep: scenario.keep,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => scenario.database,
      spawnFn: () => child,
      startupTimeoutMs: 0,
      terminateChildFn: async () => scenario.terminationConfirmed,
      windowPollMs: 0,
    });

    assert.equal(
      result.retryableLaunchFailure,
      scenario.expectedRetryable,
    );
    assert.equal(
      result.temporaryDatabaseRetained,
      scenario.expectedRetained,
    );
    assert.equal(
      result.terminationConfirmed,
      scenario.terminationConfirmed,
    );
    assert.deepEqual(cleanup, scenario.expectedCleanup);
    if (!scenario.terminationConfirmed) {
      assert.equal(result.launchOwnershipUnresolved, true);
      assert.match(result.errors.at(-1), /no retry is safe/);
    }
  }
});

test("launched desktop temporary-copy failure cleans before retrying", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const prepare = [];
  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    execFileFn: async () => ({ stdout: "" }),
    findWindowFn: async () => null,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async (options) => {
      prepare.push(options);
      return { live: false, targetPath: testVisualDatabasePath };
    },
    scenario: "order-queue",
    spawnFn: () => child,
    startupTimeoutMs: 0,
    terminateChildFn: async () => true,
    windowPollMs: 0,
  });

  assert.equal(prepare[0]?.live, false);
  assert.equal(result.retryableLaunchFailure, true);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate treats non-true termination results as unresolved", async () => {
  for (const database of [
    { live: false, targetPath: testVisualDatabasePath },
    { live: true, targetPath: testSourceDatabasePath },
  ]) {
    const cleanup = [];
    const result = await runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      execFileFn: async () => ({ stdout: "" }),
      findWindowFn: async () => null,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => database,
      spawnFn: () => createFakeChild(),
      startupTimeoutMs: 0,
      terminateChildFn: async () => undefined,
      windowPollMs: 0,
    });

    assert.equal(result.terminationConfirmed, false);
    assert.equal(result.launchOwnershipUnresolved, true);
    assert.equal(result.retryableLaunchFailure, false);
    assert.deepEqual(cleanup, []);
  }
});

test("successful launched desktop capture reports teardown and cleanup ownership", async () => {
  for (const terminationConfirmed of [true, false]) {
    const cleanup = [];
    const window = createMetric().window;
    const result = await runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      findWindowFn: async () => window,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      runDesktopScreenshotGateFn: async (options) => ({
        errors: [],
        metric: { window: options.window },
        outputDir: testOutputDir,
      }),
      spawnFn: () => createFakeChild(),
      startupTimeoutMs: 0,
      terminateChildFn: async () => terminationConfirmed,
      windowPollMs: 0,
    });

    assert.equal(result.terminationConfirmed, terminationConfirmed);
    assert.equal(
      result.launchOwnershipUnresolved,
      !terminationConfirmed,
    );
    assert.equal(
      result.temporaryDatabaseRetained,
      !terminationConfirmed,
    );
    assert.deepEqual(
      cleanup,
      terminationConfirmed ? [testVisualDatabasePath] : [],
    );
    assert.equal(result.retryableLaunchFailure, false);
    assert.equal(result.errors.length, terminationConfirmed ? 0 : 1);
  }
});

test("launched printer-board capture waits for the live telemetry token", async () => {
  const child = createFakeChild();
  const clock = createFakeClock();
  const cleanup = [];
  let captureCalls = 0;
  let readinessWaits = 0;
  const window = createMetric({ window: { title: "Printers" } }).window;

  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    captureDelayMs: 0,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    findWindowFn: async () => window,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    readinessNowFn: clock.now,
    readinessPollMs: 10,
    readinessWaitFn: async (intervalMs) => {
      readinessWaits += 1;
      await clock.wait(intervalMs);
      child.stderr.write(
        "FILAMENT_MANAGER_VISUAL_QA_READY:printer-live-telemetry\n",
      );
    },
    runDesktopScreenshotGateFn: async (options) => {
      captureCalls += 1;
      return {
        errors: [],
        metric: { window: options.window },
        outputDir: testOutputDir,
      };
    },
    scenario: "printer-board",
    spawnFn: () => child,
    terminateChildFn: async () => true,
  });

  assert.equal(result.errors.length, 0);
  assert.equal(readinessWaits, 1);
  assert.equal(captureCalls, 1);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched printer-board capture fails closed when live telemetry never arrives", async () => {
  const clock = createFakeClock();
  const cleanup = [];
  let captureCalls = 0;

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      captureDelayMs: 0,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      findWindowFn: async () =>
        createMetric({ window: { title: "Printers" } }).window,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      readinessNowFn: clock.now,
      readinessPollMs: 10,
      readinessTimeoutMs: 25,
      readinessWaitFn: clock.wait,
      runDesktopScreenshotGateFn: async () => {
        captureCalls += 1;
        return { errors: [], metric: createMetric(), outputDir: testOutputDir };
      },
      scenario: "printer-board",
      spawnFn: () => createFakeChild(),
      terminateChildFn: async () => true,
    }),
    /did not signal required readiness token printer-live-telemetry within 25ms/,
  );

  assert.equal(captureCalls, 0);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate preserves capture failures across finalization", async () => {
  const cases = [
    {
      cleanupThrows: false,
      expectedErrors: 1,
      expectedRetained: false,
      terminate: async () => true,
    },
    {
      cleanupThrows: false,
      expectedErrors: 2,
      expectedRetained: true,
      terminate: async () => false,
    },
    {
      cleanupThrows: false,
      expectedErrors: 2,
      expectedRetained: true,
      terminate: async () => {
        throw new Error("termination exploded");
      },
    },
    {
      cleanupThrows: true,
      expectedErrors: 2,
      expectedRetained: true,
      terminate: async () => true,
    },
  ];

  for (const scenario of cases) {
    const captureError = new Error("capture failed");
    const cleanupError = new Error("cleanup failed");
    const cleanup = [];

    await assert.rejects(
      runLaunchedDesktopScreenshotGate({
        allowNonDarwin: true,
        cleanupVisualQaDatabase: (path) => {
          cleanup.push(path);
          if (scenario.cleanupThrows) {
            throw cleanupError;
          }
        },
        findWindowFn: async () => createMetric().window,
        platform: "win32",
        postTerminateDelayMs: 0,
        prepareVisualQaDatabase: async () => ({
          live: false,
          targetPath: testVisualDatabasePath,
        }),
        runDesktopScreenshotGateFn: async () => {
          throw captureError;
        },
        spawnFn: () => createFakeChild(),
        terminateChildFn: scenario.terminate,
      }),
      (error) => {
        if (scenario.expectedRetained) {
          assert.ok(error instanceof AggregateError);
          assert.equal(error.errors[0], captureError);
          assert.equal(error.errors.length, scenario.expectedErrors);
          assert.equal(error.cause, captureError);
          assert.equal(error.temporaryDatabaseRetained, true);
          assert.ok(error.message.includes(testVisualDatabasePath));
        } else {
          assert.equal(error, captureError);
        }
        if (scenario.cleanupThrows) {
          assert.equal(error.errors[1], cleanupError);
          assert.match(error.message, /cleanup failed or may be incomplete/i);
        }
        return true;
      },
    );

    assert.deepEqual(
      cleanup,
      scenario.cleanupThrows || scenario.expectedRetained === false
        ? [testVisualDatabasePath]
        : [],
    );
  }
});

test("launched desktop gate never treats a live database as temporary on capture failure", async () => {
  const captureError = new Error("capture failed");
  const cleanup = [];

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      findWindowFn: async () => createMetric().window,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => ({
        live: true,
        targetPath: testSourceDatabasePath,
      }),
      runDesktopScreenshotGateFn: async () => {
        throw captureError;
      },
      spawnFn: () => createFakeChild(),
      terminateChildFn: async () => false,
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], captureError);
      assert.equal(error.cause, captureError);
      assert.equal(error.temporaryDatabaseRetained, false);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.ok(error.message.includes(testSourceDatabasePath));
      assert.match(error.message, /live database/i);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched desktop gate reports retained database when termination throws without a primary exception", async () => {
  const terminationError = new Error("termination exploded");
  const cleanup = [];

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      execFileFn: async () => ({ stdout: "" }),
      findWindowFn: async () => null,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      spawnFn: () => createFakeChild(),
      startupTimeoutMs: 0,
      terminateChildFn: async () => {
        throw terminationError;
      },
      windowPollMs: 0,
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /No Filament Manager desktop window/);
      assert.match(error.message, /termination exploded/);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.equal(error.errors.at(-1), terminationError);
      assert.equal(error.temporaryDatabaseRetained, true);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched desktop gate reports incomplete cleanup after an otherwise successful capture", async () => {
  const cleanupError = new Error("cleanup denied");

  await assert.rejects(
    runLaunchedDesktopScreenshotGate({
      allowNonDarwin: true,
      cleanupVisualQaDatabase: () => {
        throw cleanupError;
      },
      findWindowFn: async () => createMetric().window,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => ({
        live: false,
        targetPath: testVisualDatabasePath,
      }),
      runDesktopScreenshotGateFn: async (options) => ({
        errors: [],
        metric: { window: options.window },
        outputDir: testOutputDir,
      }),
      spawnFn: () => createFakeChild(),
      terminateChildFn: async () => true,
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [cleanupError]);
      assert.equal(error.cause, cleanupError);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /cleanup failed or may be incomplete/i);
      return true;
    },
  );
});

test("launched desktop gate cannot return green after the app dies during capture", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const result = await runLaunchedDesktopScreenshotGate({
    allowNonDarwin: true,
    cleanupVisualQaDatabase: (path) => cleanup.push(path),
    findWindowFn: async () => createMetric().window,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => ({
      live: false,
      targetPath: testVisualDatabasePath,
    }),
    runDesktopScreenshotGateFn: async (options) => {
      child.exitCode = 17;
      child.emit("close", 17, null);
      return {
        errors: [],
        metric: { window: options.window },
        outputDir: testOutputDir,
      };
    },
    spawnFn: () => child,
    terminateChildFn: async () => true,
  });

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /exited during desktop screenshot capture \(17\)/i);
  assert.equal(result.retryableLaunchFailure, true);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched desktop gate composes capture and concurrent child failures", async () => {
  for (const childFailure of ["error", "exit"]) {
    const child = createFakeChild();
    const captureError = new Error("capture failed");
    const childError = Object.assign(new Error("child pipe failed"), {
      code: "EPIPE",
    });
    const cleanup = [];

    await assert.rejects(
      runLaunchedDesktopScreenshotGate({
        allowNonDarwin: true,
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        findWindowFn: async () => createMetric().window,
        platform: "win32",
        postTerminateDelayMs: 0,
        prepareVisualQaDatabase: async () => ({
          live: false,
          targetPath: testVisualDatabasePath,
        }),
        runDesktopScreenshotGateFn: async () => {
          child.exitCode = 17;
          if (childFailure === "error") {
            child.emit("error", childError);
          }
          child.emit("close", 17, null);
          throw captureError;
        },
        spawnFn: () => child,
        terminateChildFn: async () => true,
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors[0], captureError);
        assert.equal(error.cause, captureError);
        if (childFailure === "error") {
          assert.equal(error.errors[1], childError);
          assert.match(error.message, /EPIPE: child pipe failed/);
        } else {
          assert.match(error.errors[1].message, /exited.*\(17\)/i);
          assert.match(error.message, /exited.*\(17\)/i);
        }
        return true;
      },
    );

    assert.deepEqual(cleanup, [testVisualDatabasePath]);
  }
});

test("desktop termination confirms the detached macOS process group is gone", async () => {
  const child = createFakeChild({ exitCode: 0, pid: 4242 });
  const signals = [];
  let groupRunning = true;
  const processKillFn = (pid, signal) => {
    signals.push({ pid, signal });
    if (signal === "SIGKILL") {
      groupRunning = false;
      return;
    }
    if (signal === 0 && !groupRunning) {
      throw Object.assign(new Error("process group missing"), { code: "ESRCH" });
    }
  };

  const stopped = await terminateChild(child, {
    groupKillGraceMs: 0,
    groupTermGraceMs: 0,
    platform: "darwin",
    processKillFn,
  });

  assert.equal(stopped, true);
  assert.ok(
    signals.some(({ pid, signal }) => pid === -4242 && signal === "SIGTERM"),
  );
  assert.ok(
    signals.some(({ pid, signal }) => pid === -4242 && signal === "SIGKILL"),
  );
  assert.ok(signals.some(({ pid, signal }) => pid === -4242 && signal === 0));
});

test("desktop termination also confirms a live wrapper when its process group is missing", async () => {
  for (const wrapperStops of [false, true]) {
    const child = createFakeChild({ exitCode: null, pid: 4343 });
    const childSignals = [];
    child.kill = (signal) => {
      childSignals.push(signal);
      if (wrapperStops && signal === "SIGTERM") {
        child.exitCode = 0;
        child.emit("exit", 0, null);
      }
      return true;
    };
    const processKillFn = () => {
      throw Object.assign(new Error("process group missing"), { code: "ESRCH" });
    };

    const stopped = await terminateChild(child, {
      groupKillGraceMs: 0,
      groupTermGraceMs: 0,
      platform: "darwin",
      processKillFn,
    });

    assert.equal(stopped, wrapperStops);
    assert.ok(childSignals.includes("SIGTERM"));
    assert.equal(childSignals.includes("SIGKILL"), !wrapperStops);
  }
});

test("desktop screenshot Tauri launch stays clean when Node deprecations throw", () => {
  const moduleUrl = new URL(
    "./run-desktop-screenshot-gate.mjs",
    import.meta.url,
  ).href;
  const probe = `
    import { spawnSync } from "node:child_process";
    import { resolveDesktopScreenshotTauriLaunch } from ${JSON.stringify(moduleUrl)};

    const launch = resolveDesktopScreenshotTauriLaunch({ args: ["--version"] });
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
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /tauri-cli \d+\./);
  assert.doesNotMatch(result.stderr, /DEP0190/);
});

test("desktop screenshot gate parses macOS window lookup output", () => {
  assert.equal(DEFAULT_WINDOW_COMMAND_TIMEOUT_MS, 15_000);
  assert.equal(DEFAULT_NATIVE_WINDOW_COMMAND_TIMEOUT_MS, 60_000);
  assert.deepEqual(
    parseDesktopWindowInfo(
      "Filament Manager\tFilament Manager\t20\t40\t1300\t900\n",
    ),
    {
      height: 900,
      processName: "Filament Manager",
      title: "Filament Manager",
      width: 1300,
      x: 20,
      y: 40,
    },
  );
  assert.equal(parseDesktopWindowInfo(""), null);
  assert.deepEqual(
    parseDesktopWindowInfo(
      "bambu-filament-manager\t\t0\t0\t900\t700\n",
    ),
    {
      height: 700,
      processName: "bambu-filament-manager",
      title: "",
      width: 900,
      x: 0,
      y: 0,
    },
  );
  assert.equal(
    parseDesktopWindowInfo("Filament Manager\tTitle\t0\t0\t0\t900"),
    null,
  );
});

test("desktop screenshot gate parses visible window diagnostics", async () => {
  assert.deepEqual(
    parseDesktopWindowList(
      "Finder\tDesktop\t0\t0\t1440\t900\nFilament Manager\tFilament Manager\t20\t40\t1300\t900\n",
    ).map((window) => window.title),
    ["Desktop", "Filament Manager"],
  );
  assert.match(buildDesktopWindowListScript(), /windowRows/);

  const calls = [];
  const nativeWindow = await findDesktopWindowWithNativeHelper({
    nativeWindowExecFileFn: async (command, args, options) => {
      calls.push({ args, command, options });
      return {
        stdout:
          "Unrelated Settings App\tFilament Manager\t1\t2\t1400\t900\n" +
          "bambu-filament-manager\t库存\t12\t42\t882\t882\n",
      };
    },
    processName: "bambu-filament-manager",
    windowSize: { height: 900, width: 900 },
    windowTitle: "Filament Manager",
  });
  assert.equal(nativeWindow?.title, "库存");
  assert.deepEqual(
    { height: nativeWindow?.height, width: nativeWindow?.width, x: nativeWindow?.x },
    { height: 900, width: 900, x: 3 },
  );
  assert.equal(calls[0]?.command, "swift");
  assert.deepEqual(calls[0]?.args.slice(-1), ["list"]);
  assert.equal(calls[0]?.options.shell, false);
  assert.equal(calls[0]?.options.timeout, 60_000);
  assert.equal(resolveMacosWindowInfoHelperLaunch("list").shell, false);
  assert.deepEqual(
    normalizeNativeDesktopWindowFrame(
      {
        height: 882,
        processName: "bambu-filament-manager",
        title: "库存",
        width: 882,
        x: 12,
        y: 42,
      },
      { height: 900, width: 900 },
    ),
    {
      height: 900,
      processName: "bambu-filament-manager",
      title: "库存",
      width: 900,
      x: 3,
      y: 33,
    },
  );
  assert.deepEqual(
    normalizeNativeDesktopWindowFrame(
      {
        height: 882,
        processName: "bambu-filament-manager",
        title: "库存",
        width: 882,
        x: -1440,
        y: -900,
      },
      { height: 900, width: 900 },
    ),
    {
      height: 900,
      processName: "bambu-filament-manager",
      title: "库存",
      width: 900,
      x: -1449,
      y: -909,
    },
  );
  assert.equal(
    selectDesktopWindowForProcess(
      [
        {
          height: 900,
          processName: "Unrelated Settings App",
          title: "Settings",
          width: 1400,
          x: 0,
          y: 0,
        },
        {
          height: 882,
          processName: "bambu-filament-manager",
          title: "库存",
          width: 882,
          x: 12,
          y: 42,
        },
      ],
      {
        processName: "bambu-filament-manager",
        windowTitle: "Settings",
      },
    )?.title,
    "库存",
  );
  assert.deepEqual(
    desktopWindowsForProcess(
      [
        { processName: "Other App", title: "Inventory" },
        { processName: "BAMBU-FILAMENT-MANAGER", title: "库存" },
      ],
      "bambu-filament-manager",
    ).map((window) => window.title),
    ["库存"],
  );
});

test("desktop screenshot gate ignores a foreign AppleScript title match", async () => {
  const calls = [];
  const window = await findDesktopWindow({
    execFileFn: async (command, args, options) => {
      calls.push({ args, command, options });
      return {
        stdout:
          "Unrelated Settings App\tSettings\t1\t2\t1400\t900\n" +
          "bambu-filament-manager\t库存\t12\t42\t882\t882\n",
      };
    },
    processName: "bambu-filament-manager",
    windowTitle: "Settings",
  });

  assert.equal(window?.processName, "bambu-filament-manager");
  assert.equal(window?.title, "库存");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "osascript");
  assert.match(calls[0]?.args[1], /set windowRows to/);
  assert.equal(window?.lookupSource, "applescript");
});

test("native lookup still requires Accessibility for safe activation", async () => {
  const accessibilityError = new Error("Not authorized to send Apple events");
  const window = await findDesktopWindow({
    execFileFn: async () => {
      throw accessibilityError;
    },
    nativeWindowExecFileFn: async () => ({
      stdout: "bambu-filament-manager\t库存\t12\t42\t882\t882\n",
    }),
    processName: "bambu-filament-manager",
    windowTitle: "Inventory",
  });

  assert.equal(window?.lookupSource, "native");
  await assert.rejects(
    activateDesktopWindow(window, {
      execFileFn: async () => {
        throw accessibilityError;
      },
      waitAfterActivateMs: 0,
    }),
    (error) => {
      assert.match(error.message, /requires macOS Accessibility permission/);
      assert.equal(error.cause, accessibilityError);
      return true;
    },
  );
});

test("desktop screenshot gate lookup script escapes quoted titles", () => {
  const script = buildDesktopWindowLookupScript('Filament "Manager"');
  assert.match(script, /Filament \\"Manager\\"/);
  assert.match(script, /bambu-filament-manager/);
  assert.match(script, /processName is/);
  assert.doesNotMatch(script, / or processName/);
  assert.match(script, /application processes whose visible is true/);

  const activateScript = buildDesktopWindowActivateScript('Filament "Manager"');
  assert.match(activateScript, /Filament \\"Manager\\"/);
  assert.match(activateScript, /frontmost/);

  const resizeScript = buildDesktopWindowResizeScript(
    {
      processName: 'Filament "Manager"',
      title: 'Inventory "Detail"',
    },
    { height: 700, width: 900 },
  );
  assert.match(resizeScript, /Filament \\"Manager\\"/);
  assert.match(resizeScript, /Inventory \\"Detail\\"/);
  assert.match(resizeScript, /set position of appWindow to \{0, 0\}/);
  assert.match(resizeScript, /to \{900, 700\}/);
  assert.ok(
    resizeScript.indexOf("set position of appWindow") <
      resizeScript.indexOf("set size of appWindow"),
  );
});

test("desktop screenshot gate normalizes visual QA scenarios", () => {
  assert.equal(
    normalizeDesktopVisualQaScenario("dashboard"),
    "dashboard-overview",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("inventory"),
    "inventory-overview",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("inventory-add"),
    "add-filament",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("wishlist-orders"),
    "wishlist-queue",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("loan-history"),
    "loans-overview",
  );
  assert.equal(normalizeDesktopVisualQaScenario("DETAIL"), "selected-roll");
  assert.equal(
    normalizeDesktopVisualQaScenario("roll-history"),
    "selected-roll-history",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("inventory-danger-zone"),
    "selected-roll-danger-zone",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("inventory-rfid"),
    "rfid-capture",
  );
  assert.equal(normalizeDesktopVisualQaScenario("loan-return"), "return-loan");
  assert.equal(
    normalizeDesktopVisualQaScenario("inbound-return"),
    "return-inbound-loan",
  );
  assert.equal(normalizeDesktopVisualQaScenario("printers"), "printer-board");
  assert.equal(
    normalizeDesktopVisualQaScenario("add-printer-modal"),
    "add-printer",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("slot-assignment"),
    "printer-slot-assignment",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("ams-onboarding"),
    "printer-slot-onboarding",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("rfid-override"),
    "printer-rfid-override",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("slot-swap"),
    "printer-slot-replacement",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("slot-unload"),
    "printer-slot-clear",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("batch-add"),
    "bambu-batch-add",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("general-settings"),
    "settings-general",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("companion-settings"),
    "settings-library",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("companion-role-change"),
    "settings-library-role-change",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-details"),
    "settings-library-network-details",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-editor"),
    "settings-library-network-editor",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-pairing"),
    "settings-library-pairing",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-browsers"),
    "settings-library-browsers",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("trusted-lan-browser-history"),
    "settings-library-browsers-history",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics"),
    "settings-printer-diagnostics",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics-fields"),
    "settings-printer-diagnostics-fields",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics-paused"),
    "settings-printer-diagnostics-paused",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("printer-editor"),
    "settings-printer-editor",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("printer-editor-dirty"),
    "settings-printer-editor-dirty",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("printer-editor-discard"),
    "settings-printer-editor-discard",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("filament-catalog"),
    "settings-catalog",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("missing-swatches"),
    "settings-catalog-swatch-review",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("program-maintenance"),
    "settings-maintenance",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("settings-diagnostics"),
    "settings-application-diagnostics",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("application-diagnostics"),
    "settings-application-diagnostics",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("usage-statistics"),
    "statistics-overview",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("total-consumption"),
    "statistics-consumption",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("statistics-borrower-usage"),
    "statistics-borrower",
  );
  assert.equal(
    normalizeDesktopVisualQaScenario("loan-usage-statistics"),
    "statistics-loans",
  );
  assert.equal(normalizeDesktopVisualQaScenario(""), null);
  assert.throws(
    () => normalizeDesktopVisualQaScenario("bad"),
    /Unknown desktop visual QA/,
  );
});

test("desktop screenshot gate normalizes screenshot locale overrides", () => {
  assert.equal(normalizeVisualQaLocale("nb"), "nb");
  assert.equal(normalizeVisualQaLocale("no"), "nb");
  assert.equal(normalizeVisualQaLocale("nb-NO"), "nb");
  assert.equal(normalizeVisualQaLocale("no_NO"), "nb");
  assert.equal(normalizeVisualQaLocale("en"), "en");
  assert.equal(normalizeVisualQaLocale("en-US"), "en");
  assert.equal(normalizeVisualQaLocale("en-GB"), "en");
  assert.equal(normalizeVisualQaLocale("en-XA"), "en-XA");
  assert.equal(normalizeVisualQaLocale("ar-XB"), "ar-XB");
  assert.equal(normalizeVisualQaLocale("zh-XB"), "zh-XB");
  assert.equal(normalizeVisualQaLocale(""), "en");
  assert.equal(normalizeVisualQaLocale("bad"), "en");
});

test("desktop screenshot gate normalizes supported theme overrides", () => {
  assert.equal(normalizeDesktopVisualQaTheme("light"), "light");
  assert.equal(normalizeDesktopVisualQaTheme(" DARK "), "dark");
  assert.equal(normalizeDesktopVisualQaTheme("Auto"), "auto");
  assert.throws(() => normalizeDesktopVisualQaTheme(""), /theme is required/);
  assert.throws(
    () => normalizeDesktopVisualQaTheme("sepia"),
    /Unknown desktop visual QA theme/,
  );
});

test("desktop screenshot gate scopes explicit themes to launched scenarios", () => {
  assert.equal(
    resolveDesktopVisualQaTheme([], { hasScenario: false, launch: false }),
    null,
  );
  assert.equal(
    resolveDesktopVisualQaTheme([], { hasScenario: true, launch: false }),
    "dark",
  );
  assert.equal(
    resolveDesktopVisualQaTheme(["--theme", "light"], {
      hasScenario: true,
      launch: true,
    }),
    "light",
  );
  assert.throws(
    () =>
      resolveDesktopVisualQaTheme(["--theme", "light"], {
        hasScenario: true,
        launch: false,
      }),
    /requires --launch/,
  );
  assert.throws(
    () =>
      resolveDesktopVisualQaTheme(["--theme", "light"], {
        hasScenario: false,
        launch: true,
      }),
    /requires --scenario/,
  );
});

test("desktop screenshot gate normalizes explicit responsive window sizes", () => {
  assert.deepEqual(normalizeDesktopVisualQaWindowSize("900x700"), {
    height: 700,
    width: 900,
  });
  assert.deepEqual(normalizeDesktopVisualQaWindowSize(" 1024 × 768 "), {
    height: 768,
    width: 1024,
  });
  assert.throws(
    () => normalizeDesktopVisualQaWindowSize(""),
    /window size is required/,
  );
  assert.throws(
    () => normalizeDesktopVisualQaWindowSize("900"),
    /Unknown desktop visual QA/,
  );
  assert.throws(
    () => normalizeDesktopVisualQaWindowSize("0x700"),
    /positive width and height/,
  );
});

test("desktop screenshot gate scopes explicit window sizes to launched scenarios", () => {
  assert.equal(
    resolveDesktopVisualQaWindowSize([], { hasScenario: true, launch: true }),
    null,
  );
  assert.deepEqual(
    resolveDesktopVisualQaWindowSize(["--window-size", "900x700"], {
      hasScenario: true,
      launch: true,
    }),
    { height: 700, width: 900 },
  );
  assert.throws(
    () =>
      resolveDesktopVisualQaWindowSize(["--window-size", "900x700"], {
        hasScenario: true,
        launch: false,
      }),
    /requires --launch/,
  );
  assert.throws(
    () =>
      resolveDesktopVisualQaWindowSize(["--window-size", "900x700"], {
        hasScenario: false,
        launch: true,
      }),
    /requires --scenario/,
  );
});

test("desktop screenshot gate passes scenario presentation through the Tauri launch environment", () => {
  const env = buildDesktopVisualQaLaunchEnv(
    {
      locale: "nb",
      scenario: "add-filament",
      themeMode: "light",
      windowSize: { height: 700, width: 900 },
    },
    { targetPath: testVisualDatabasePath },
    { EXISTING: "kept" },
  );

  assert.deepEqual(env, {
    EXISTING: "kept",
    FILAMENT_MANAGER_DB_PATH: testVisualDatabasePath,
    FILAMENT_MANAGER_VISUAL_QA: "1",
    FILAMENT_MANAGER_VISUAL_QA_LOCALE: "nb",
    FILAMENT_MANAGER_VISUAL_QA_SCENARIO: "add-filament",
    FILAMENT_MANAGER_VISUAL_QA_THEME: "light",
    FILAMENT_MANAGER_VISUAL_QA_WINDOW_SIZE: "900x700",
  });

  const defaultEnv = buildDesktopVisualQaLaunchEnv(
    { locale: "en" },
    { targetPath: testVisualDatabasePath },
    {},
  );
  assert.equal("FILAMENT_MANAGER_VISUAL_QA_THEME" in defaultEnv, false);
});

test("desktop screenshot gate reads scenario metadata from the shared manifest", () => {
  assert.deepEqual(desktopVisualQaScenarioDefinition("batch-add"), {
    aliases: ["batch-add", "bambu-batch"],
    category: "modal",
    id: "bambu-batch-add",
    page: "inventory",
  });
  assert.equal(
    desktopVisualQaScenarioDefinition("order-queue").requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("trusted-lan-details").settingsTab,
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("library-role-dialog").settingsTab,
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("library-role-switch")
      .requiresDatabaseFixture,
    undefined,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("trusted-lan-editor").settingsTab,
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("trusted-lan-pairing").settingsTab,
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("trusted-lan-browsers").settingsTab,
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("trusted-lan-browser-history")
      .settingsTab,
    "LIBRARY",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-editor").settingsTab,
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-editor-dirty").settingsTab,
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("printer-editor-discard").settingsTab,
    "PRINTERS",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("missing-swatches")
      .requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("settings-diagnostics")
      .requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("application-diagnostics").settingsTab,
    "MAINTENANCE",
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("statistics-consumption")
      .requiresDatabaseFixture,
    undefined,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("statistics-loans")
      .requiresDatabaseFixture,
    undefined,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("statistics-borrower")
      .requiresDatabaseFixture,
    true,
  );
  assert.equal(
    desktopVisualQaScenarioDefinition("hand-back-borrowed-in")
      .requiresDatabaseFixture,
    true,
  );
  assert.deepEqual(desktopVisualQaScenarioReadiness("printers"), {
    timeoutMs: 35_000,
    token: "printer-live-telemetry",
  });
  assert.equal(desktopVisualQaScenarioReadiness("add-printer"), null);
  assert.equal(desktopVisualQaScenarioDefinition("unknown"), null);
});

test("desktop screenshot gate marks DB-fixture visual states", () => {
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("ams-onboarding"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("wishlist-orders"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("printer-slot-onboarding"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("rfid-override"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("missing-swatches"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("application-diagnostics"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("inbound-return"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("borrower-usage-breakdown"),
    true,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("trusted-lan-pairing"),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("library-role-modal"),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("trusted-lan-browsers"),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("printer-editor"),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("printer-editor-dirty"),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("printer-editor-discard"),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture(
      "trusted-lan-browser-history",
    ),
    false,
  );
  assert.equal(
    desktopVisualQaScenarioRequiresDatabaseFixture("printers"),
    false,
  );
  assert.equal(desktopVisualQaScenarioRequiresDatabaseFixture(null), false);
});

test("desktop scenarios use a short settle delay instead of a blind live-data wait", () => {
  assert.equal(
    defaultDesktopVisualQaCaptureDelayMs(["printer-board"]),
    DESKTOP_VISUAL_QA_STATIC_SETTLE_MS,
  );
  assert.equal(
    defaultDesktopVisualQaCaptureDelayMs(["selected-roll-label"]),
    DESKTOP_VISUAL_QA_STATIC_SETTLE_MS,
  );
  assert.equal(defaultDesktopVisualQaCaptureDelayMs([null]), 0);
});

test("desktop readiness tokens require an exact child-output line", () => {
  assert.equal(
    DESKTOP_VISUAL_QA_READINESS_PREFIX,
    "FILAMENT_MANAGER_VISUAL_QA_READY:",
  );
  assert.equal(
    desktopVisualQaReadinessMarker("printer-live-telemetry"),
    "FILAMENT_MANAGER_VISUAL_QA_READY:printer-live-telemetry",
  );
  assert.equal(
    desktopVisualQaOutputHasReadinessToken(
      "building\nFILAMENT_MANAGER_VISUAL_QA_READY:printer-live-telemetry\nrunning\n",
      "printer-live-telemetry",
    ),
    true,
  );
  assert.equal(
    desktopVisualQaOutputHasReadinessToken(
      "prefix FILAMENT_MANAGER_VISUAL_QA_READY:printer-live-telemetry suffix",
      "printer-live-telemetry",
    ),
    false,
  );
});

test("desktop readiness polling succeeds on a bounded token and otherwise times out", async () => {
  const readyClock = createFakeClock();
  let output = "building\n";
  const ready = await waitForDesktopVisualQaReadiness({
    intervalMs: 10,
    nowFn: readyClock.now,
    readOutput: () => output,
    timeoutMs: 30,
    token: "printer-live-telemetry",
    waitFn: async (intervalMs) => {
      await readyClock.wait(intervalMs);
      if (readyClock.now() >= 20) {
        output += "FILAMENT_MANAGER_VISUAL_QA_READY:printer-live-telemetry\n";
      }
    },
  });
  assert.equal(ready, true);
  assert.equal(readyClock.now(), 20);

  const timeoutClock = createFakeClock();
  assert.equal(
    await waitForDesktopVisualQaReadiness({
      intervalMs: 10,
      nowFn: timeoutClock.now,
      readOutput: () => "building\n",
      timeoutMs: 25,
      token: "printer-live-telemetry",
      waitFn: timeoutClock.wait,
    }),
    false,
  );
  assert.equal(timeoutClock.now(), 30);
});

test("desktop screenshot gate maps scenario aliases to localized window titles", () => {
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "en"),
    ["Inventory"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "nb"),
    ["Lager"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "es-ES"),
    ["Inventario"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "pt-BR"),
    ["Inventário"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "it-IT"),
    ["Inventario"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "pl-PL"),
    ["Magazyn"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "nl-NL"),
    ["Voorraad"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "cs-CZ"),
    ["Sklad"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "zh-CN"),
    ["库存"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "ja-JP"),
    ["在庫"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "ko-KR"),
    ["재고"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "zh-TW"),
    ["庫存"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "tr-TR"),
    ["Envanter"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "uk-UA"),
    ["Інвентар"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "ru-RU"),
    ["Инвентарь"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("return-inbound-loan", "ru-RU"),
    ["Выдачи"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "hu-HU"),
    ["Készlet"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "sv-SE"),
    ["Lager"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "da-DK"),
    ["Lager"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "fi-FI"),
    ["Varasto"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "en-XA"),
    ["⟦Îñṽ·éñţ·öŕý·⟧"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "ar-XB"),
    ["⟦\u2067Îñṽ·éñţ·öŕý·\u2069⟧"],
  );
  assert.deepEqual(
    desktopVisualQaExpectedWindowTitles("wishlist-orders", "zh-XB"),
    ["【已內值頁內態項入有】"],
  );
  assert.deepEqual(desktopVisualQaExpectedWindowTitles(null, "en"), []);
  assert.equal(
    desktopVisualQaWindowMatchesScenario(
      createMetric({ window: { title: "Inventory" } }).window,
      "wishlist-queue",
      "en",
    ),
    true,
  );
  assert.equal(
    desktopVisualQaWindowMatchesScenario(
      createMetric({ window: { title: "Oversikt" } }).window,
      "wishlist-queue",
      "en",
    ),
    false,
  );
});

test("desktop screenshot gate lets later CLI scenario flags override npm defaults", () => {
  assert.equal(parseDesktopVisualQaScenarios(["--scenario", "all"]).length, 44);
  assert.deepEqual(
    parseDesktopVisualQaScenarios([
      "--scenario",
      "all",
      "--scenario",
      "bambu-live-diagnostics-fields",
    ]),
    ["settings-printer-diagnostics-fields"],
  );
});

test("desktop screenshot gate names single scenario captures by scenario", () => {
  assert.equal(
    desktopScreenshotNameForScenario({
      baseName: "desktop-scenario",
      scenario: "bambu-batch-add",
      scenarioCount: 1,
    }),
    "desktop-scenario-bambu-batch-add",
  );
  assert.equal(
    desktopScreenshotNameForScenario({
      baseName: "custom",
      explicitName: true,
      scenario: "bambu-batch-add",
      scenarioCount: 1,
    }),
    "custom",
  );
});

test("desktop screenshot gate retries only launched no-window failures", () => {
  assert.equal(
    shouldRetryDesktopLaunch({
      appKept: false,
      launchOwnershipUnresolved: false,
      retryableLaunchFailure: true,
      temporaryDatabaseRetained: false,
      terminationConfirmed: true,
      errors: [
        "No Filament Manager desktop window titled Dashboard was found after launching Tauri dev. Visible windows: none.",
      ],
    }),
    true,
  );
  assert.equal(
    shouldRetryDesktopLaunch({
      retryableLaunchFailure: false,
      errors: ["Desktop screenshot has too little color diversity."],
    }),
    false,
  );
  assert.equal(
    shouldRetryDesktopLaunch({
      errors: [
        "No Filament Manager desktop window was found after launching Tauri dev.",
      ],
    }),
    false,
  );
  assert.equal(shouldRetryDesktopLaunch({ errors: [] }), false);
  for (const unsafeResult of [
    { appKept: true },
    { launchOwnershipUnresolved: true },
    { temporaryDatabaseRetained: true },
    { terminationConfirmed: false },
  ]) {
    assert.equal(
      shouldRetryDesktopLaunch({
        appKept: false,
        launchOwnershipUnresolved: false,
        retryableLaunchFailure: true,
        temporaryDatabaseRetained: false,
        terminationConfirmed: true,
        ...unsafeResult,
      }),
      false,
    );
  }
});

test("desktop launch retry stops when an attempt retains resources", async () => {
  for (const retainedResult of [
    {
      appKept: true,
      temporaryDatabaseRetained: true,
    },
    {
      appKept: false,
      temporaryDatabaseRetained: true,
    },
  ]) {
    const calls = [];
    const options = { keepAppOnFail: true, relaunchDelayMs: 0 };
    const result = await runDesktopScreenshotGateWithLaunchRetry(
      options,
      3,
      async (attemptOptions) => {
        calls.push(attemptOptions);
        return {
          ...retainedResult,
          errors: [
            "No Filament Manager desktop window was found after launching Tauri dev.",
          ],
          retryableLaunchFailure: false,
        };
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0], options);
    assert.equal(result.launchAttempts, 1);
  }
});

test("desktop launch retry repeats only cleanly released launch failures", async () => {
  const calls = [];
  const options = { keepAppOnFail: false, relaunchDelayMs: 0 };
  const result = await runDesktopScreenshotGateWithLaunchRetry(
    options,
    3,
    async (attemptOptions) => {
      calls.push(attemptOptions);
      return {
        appKept: false,
        errors: [
          "No Filament Manager desktop window titled Dashboard was found after launching Tauri dev.",
        ],
        launchFailed: true,
        retryableLaunchFailure: true,
        temporaryDatabaseRetained: false,
        terminationConfirmed: true,
      };
    },
  );

  assert.equal(calls.length, 3);
  assert.ok(calls.every((attemptOptions) => attemptOptions === options));
  assert.equal(result.launchAttempts, 3);
  assert.equal(result.launchAttemptsExhausted, true);
  assert.equal(result.terminalLaunchFailure, true);
});

test("desktop launch retry defaults invalid attempt counts to one", async () => {
  for (const attempts of [undefined, Number.NaN, 0, -2]) {
    let calls = 0;
    const result = await runDesktopScreenshotGateWithLaunchRetry(
      { relaunchDelayMs: 0 },
      attempts,
      async () => {
        calls += 1;
        return { errors: [], retryableLaunchFailure: false };
      },
    );

    assert.equal(calls, 1);
    assert.equal(result.launchAttempts, 1);
  }
});

test("desktop launch retry never retries an exception", async () => {
  const attemptError = new Error("launch attempt failed");
  let calls = 0;

  await assert.rejects(
    runDesktopScreenshotGateWithLaunchRetry(
      { relaunchDelayMs: 0 },
      3,
      async () => {
        calls += 1;
        throw attemptError;
      },
    ),
    (error) => error === attemptError,
  );

  assert.equal(calls, 1);
});

test("desktop scenario launches stop after app ownership is retained or unresolved", async () => {
  for (const terminalResult of [
    { appKept: true, launchOwnershipUnresolved: false },
    { appKept: false, launchOwnershipUnresolved: true },
    {
      appKept: false,
      launchFailed: true,
      launchOwnershipUnresolved: false,
    },
  ]) {
    const scenarios = ["dashboard", "inventory", "loans"];
    const calls = [];
    const results = await runDesktopScreenshotScenariosWithLaunch(
      {
        baseName: "desktop-scenario",
        baseOptions: { keepAppOnFail: true },
        launchAttempts: 2,
        scenarios,
      },
      async (options, attempts) => {
        calls.push({ attempts, options });
        return {
          ...terminalResult,
          errors: ["launch ownership stopped"],
        };
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].attempts, 2);
    assert.equal(calls[0].options.scenario, "dashboard");
    assert.equal(calls[0].options.name, "desktop-scenario-dashboard");
    assert.equal(results.length, 1);
  }
});

test("desktop scenario launches preserve successful order and generated names", async () => {
  const scenarios = ["dashboard", "inventory", "loans"];
  const calls = [];
  const results = await runDesktopScreenshotScenariosWithLaunch(
    {
      baseName: "desktop-scenario",
      baseOptions: { locale: "en" },
      launchAttempts: 2,
      scenarios,
    },
    async (options, attempts) => {
      calls.push({ attempts, options });
      return { appKept: false, errors: [], launchOwnershipUnresolved: false };
    },
  );

  assert.deepEqual(
    calls.map(({ options }) => options.scenario),
    scenarios,
  );
  assert.deepEqual(
    calls.map(({ options }) => options.name),
    scenarios.map((scenario) => `desktop-scenario-${scenario}`),
  );
  assert.ok(calls.every(({ attempts }) => attempts === 2));
  assert.equal(results.length, 3);
});

test("desktop screenshot metric validation accepts rich desktop captures", () => {
  assert.deepEqual(validateDesktopScreenshotMetrics(createMetric()), []);
});

test("desktop screenshot theme validation uses modal-tolerant light and dark boundaries", () => {
  assert.deepEqual(
    validateDesktopScreenshotTheme(
      createMetric({
        screenshotPixels: { lumaMean: DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN },
      }),
      "light",
    ),
    [],
  );
  assert.match(
    validateDesktopScreenshotTheme(
      createMetric({
        screenshotPixels: { lumaMean: DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN - 0.1 },
      }),
      "light",
    )[0],
    /light theme screenshot is too dark/,
  );
  assert.deepEqual(
    validateDesktopScreenshotTheme(
      createMetric({
        screenshotPixels: { lumaMean: DESKTOP_DARK_THEME_MAX_LUMA_MEAN - 0.1 },
      }),
      "dark",
    ),
    [],
  );
  assert.match(
    validateDesktopScreenshotTheme(
      createMetric({
        screenshotPixels: { lumaMean: DESKTOP_DARK_THEME_MAX_LUMA_MEAN },
      }),
      "dark",
    )[0],
    /dark theme screenshot is too light/,
  );
  assert.deepEqual(
    validateDesktopScreenshotTheme(
      createMetric({ screenshotPixels: { lumaMean: 0 } }),
      "auto",
    ),
    [],
  );
});

test("desktop screenshot metric validation accepts retina desktop captures", () => {
  const metric = createMetric({
    screenshotPixels: {
      height: 1800,
      width: 2600,
    },
  });

  assert.deepEqual(validateDesktopScreenshotMetrics(metric), []);
  assert.equal(desktopScreenshotScale(metric)?.average, 2);
});

test("desktop screenshot gate waits for an appearing window", async () => {
  const clock = createFakeClock();
  let attempts = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      attempts += 1;
      return attempts >= 3 ? createMetric().window : null;
    },
    intervalMs: 1,
    nowFn: clock.now,
    timeoutMs: 50,
    waitFn: clock.wait,
  });

  assert.equal(window?.title, "Filament Manager");
  assert.equal(attempts, 3);
});

test("desktop screenshot window polling always makes one zero-timeout lookup", async () => {
  const expectedWindow = createMetric().window;
  let clockReads = 0;
  let lookupCalls = 0;
  let waitCalls = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      lookupCalls += 1;
      return expectedWindow;
    },
    intervalMs: 0,
    nowFn: () => {
      clockReads += 1;
      return clockReads === 1 ? 0 : 1;
    },
    timeoutMs: 0,
    waitFn: async () => {
      waitCalls += 1;
    },
  });

  assert.equal(window, expectedWindow);
  assert.equal(lookupCalls, 1);
  assert.equal(waitCalls, 0);
});

test("desktop screenshot window polling exposes permanent lookup failures", async () => {
  const clock = createFakeClock();
  const attempts = [];
  const lookupError = new Error("Accessibility denied");
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      throw lookupError;
    },
    intervalMs: 10,
    nowFn: clock.now,
    onLookupAttempt: (attempt) => attempts.push(attempt),
    timeoutMs: 25,
    waitFn: clock.wait,
  });

  assert.equal(window, null);
  assert.equal(attempts.length, 3);
  assert.ok(attempts.every((attempt) => attempt.error === lookupError));
});

test("desktop screenshot window polling clears a transient lookup failure", async () => {
  const clock = createFakeClock();
  const attempts = [];
  const expectedWindow = createMetric().window;
  let call = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      call += 1;
      if (call === 1) {
        throw new Error("temporary lookup failure");
      }
      return expectedWindow;
    },
    intervalMs: 1,
    nowFn: clock.now,
    onLookupAttempt: (attempt) => attempts.push(attempt),
    timeoutMs: 10,
    waitFn: clock.wait,
  });

  assert.equal(window, expectedWindow);
  assert.equal(attempts.length, 2);
  assert.match(attempts[0].error.message, /temporary lookup failure/);
  assert.equal(attempts[1].error, null);
  assert.equal(attempts[1].window, expectedWindow);
});

test("desktop screenshot gate waits for a scenario-ready desktop window", async () => {
  const clock = createFakeClock();
  let attempts = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      attempts += 1;
      return attempts === 1
        ? createMetric({ window: { title: "Dashboard" } }).window
        : createMetric({ window: { title: "Inventory" } }).window;
    },
    intervalMs: 1,
    isWindowReady: (windowInfo) => windowInfo.title === "Inventory",
    nowFn: clock.now,
    timeoutMs: 50,
    waitFn: clock.wait,
  });

  assert.equal(window?.title, "Inventory");
  assert.equal(attempts, 2);
});

test("desktop screenshot gate resizes and rereads the captured desktop window", async () => {
  const clock = createFakeClock();
  const commands = [];
  let attempts = 0;
  const originalWindow = createMetric().window;
  const window = await resizeDesktopWindow(
    { ...originalWindow, height: 800, width: 1200 },
    { height: 700, width: 900 },
    {
      execFileFn: async (command, args) => {
        commands.push({ args, command });
        return { stdout: "" };
      },
      findWindowFn: async () => {
        attempts += 1;
        return createMetric({
          window:
            attempts === 1
              ? { height: 700, width: 900, x: -20, y: 0 }
              : { height: 700, width: 900, x: 0, y: 0 },
        }).window;
      },
      nowFn: clock.now,
      resizeWindowPollMs: 1,
      resizeWindowTimeoutMs: 50,
      waitFn: clock.wait,
    },
  );

  assert.equal(commands[0]?.command, "osascript");
  assert.match(commands[0]?.args[1], /\{900, 700\}/);
  assert.equal(attempts, 2);
  assert.deepEqual(
    { height: window?.height, width: window?.width },
    { height: 700, width: 900 },
  );
});

test("desktop screenshot gate wait can abort when launch exits", async () => {
  const clock = createFakeClock();
  let attempts = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      attempts += 1;
      return null;
    },
    intervalMs: 1,
    nowFn: clock.now,
    shouldAbort: () => attempts >= 2,
    timeoutMs: 50,
    waitFn: clock.wait,
  });

  assert.equal(window, null);
  assert.equal(attempts, 2);
});

test("desktop screenshot gate rejects a stale matching window when launch exits during lookup", async () => {
  let launchExited = false;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      launchExited = true;
      return createMetric().window;
    },
    shouldAbort: () => launchExited,
    timeoutMs: 50,
  });

  assert.equal(window, null);
});

test("desktop screenshot gate stops polling at its timeout without real timers", async () => {
  const clock = createFakeClock();
  let attempts = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      attempts += 1;
      return null;
    },
    intervalMs: 10,
    nowFn: clock.now,
    timeoutMs: 25,
    waitFn: clock.wait,
  });

  assert.equal(window, null);
  assert.equal(attempts, 3);
  assert.equal(clock.now(), 30);
});

test("desktop screenshot gate times out stuck macOS helper commands", async () => {
  await assert.rejects(
    execFileWithTimeout(
      () => new Promise(() => {}),
      "osascript",
      ["-e", 'return ""'],
      {
        label: "Desktop window lookup",
        timeoutGraceMs: 1,
        timeoutMs: 1,
      },
    ),
    /Desktop window lookup timed out after 1ms/,
  );
});

test("native desktop helper has a bounded cold-start timeout", async () => {
  await assert.rejects(
    findDesktopWindowWithNativeHelper({
      nativeWindowCommandTimeoutMs: 1,
      nativeWindowExecFileFn: () => new Promise(() => {}),
    }),
    /Native macOS window list timed out after 1ms/,
  );
});

test("desktop screenshot helper commands always disable platform shells", async () => {
  const calls = [];
  const execFileFn = async (command, args, options) => {
    calls.push({ args, command, options });
    return { stdout: "ok" };
  };

  await execFileWithTimeout(execFileFn, "tool", ["first"], { timeoutMs: 0 });
  await execFileWithTimeout(execFileFn, "tool", ["second"], { timeoutMs: 50 });

  assert.deepEqual(
    calls.map(({ options }) => options),
    [
      { shell: false },
      { shell: false, timeout: 50 },
    ],
  );
});

test("desktop screenshot metric validation rejects missing and flat captures", () => {
  assert.ok(
    validateDesktopScreenshotMetrics({ window: null }).some((error) =>
      error.includes("No Filament Manager desktop window"),
    ),
  );

  const errors = validateDesktopScreenshotMetrics(
    createMetric({
      screenshotPixels: {
        colorBuckets: 2,
        edgeDeltaMean: 0.2,
        lumaStdDev: 1,
        saturatedPixelRatio: 0,
      },
      window: { height: 320, width: 500 },
    }),
  );

  assert.ok(errors.some((error) => error.includes("too small")));
  assert.ok(errors.some((error) => error.includes("color diversity")));
  assert.ok(errors.some((error) => error.includes("luminance contrast")));
  assert.ok(errors.some((error) => error.includes("edge detail")));
  assert.ok(errors.some((error) => error.includes("saturated pixels")));
});

test("desktop screenshot gate validates the requested size against the captured window", () => {
  assert.equal(
    desktopWindowMatchesRequestedSize(
      createMetric({ window: { height: 701, width: 899, x: 20, y: 40 } })
        .window,
      { height: 700, width: 900 },
    ),
    true,
  );
  assert.equal(
    desktopWindowMatchesRequestedSize(
      createMetric({ window: { height: 700, width: 900, x: -1 } }).window,
      { height: 700, width: 900 },
    ),
    false,
  );
  assert.equal(
    desktopWindowMatchesRequestedSize(
      createMetric({ window: { height: 700, width: 900, y: -1 } }).window,
      { height: 700, width: 900 },
    ),
    false,
  );
  assert.deepEqual(
    validateDesktopWindowSize(
      createMetric({ window: { height: 700, width: 900, x: 20, y: 40 } }),
      {
        height: 700,
        width: 900,
      },
    ),
    [],
  );
  assert.match(
    validateDesktopWindowSize(
      createMetric({ window: { height: 800, width: 1200, x: 20 } }),
      {
        height: 700,
        width: 900,
      },
    )[0],
    /1200x800 does not match requested 900x700/,
  );
  assert.match(
    validateDesktopWindowSize(
      createMetric({ window: { height: 700, width: 900, x: -1 } }),
      { height: 700, width: 900 },
    )[0],
    /outside the primary capture area at x=-1/,
  );
  assert.match(
    validateDesktopWindowSize(
      createMetric({ window: { height: 700, width: 900, x: 20, y: -1 } }),
      { height: 700, width: 900 },
    )[0],
    /outside the primary capture area at x=20, y=-1/,
  );
});

test("desktop screenshot capture refuses off-primary coordinates", async () => {
  let execCalls = 0;
  await assert.rejects(
    captureDesktopWindowScreenshot(
      createMetric({ window: { x: -1440, y: -900 } }).window,
      {
        execFileFn: async () => {
          execCalls += 1;
          return { stdout: "" };
        },
        outputDir: testOutputDir,
      },
    ),
    /must be inside the primary capture area.*x=-1440, y=-900/,
  );
  assert.equal(execCalls, 0);
});

test("desktop screenshot report lists window and artifact details", () => {
  const report = formatDesktopScreenshotGateReport({
    errors: [],
    metric: createMetric(),
    outputDir: testOutputDir,
    scenario: "add-filament",
  });

  assert.match(report, /Desktop visual QA scenario: add-filament/);
  assert.match(
    report,
    /Desktop visual QA scenario: add-filament \(inventory, modal\)/,
  );
  assert.match(report, /Desktop window: Filament Manager/);
  assert.match(report, /Pixels: 1300x900 @1\.0x/);
  assert.match(report, /desktop-window\.png/);
  assert.match(report, /Desktop screenshot gate ok/);
});

test("desktop screenshot report identifies requested and captured window sizes", () => {
  const report = formatDesktopScreenshotGateReport({
    errors: [],
    metric: createMetric({ window: { height: 700, width: 900 } }),
    outputDir: testOutputDir,
    scenario: "inventory-overview",
    windowSize: { height: 700, width: 900 },
  });

  assert.match(report, /window size: requested 900x700; captured 900x700/);
});

test("desktop screenshot report identifies explicit and automatic themes", () => {
  const lightMetric = createMetric();
  lightMetric.screenshotPixels.lumaMean = 166.4;
  const lightReport = formatDesktopScreenshotGateReport({
    errors: [],
    metric: lightMetric,
    outputDir: testOutputDir,
    scenario: "add-filament",
    themeMode: "light",
  });
  assert.match(
    lightReport,
    /theme: light \(mean luminance 166\.4, expected >= 96\)/,
  );

  const autoReport = formatDesktopScreenshotGateReport({
    errors: [],
    metric: createMetric(),
    outputDir: testOutputDir,
    scenario: "add-filament",
    themeMode: "auto",
  });
  assert.match(
    autoReport,
    /theme: auto \(system-resolved; luminance assertion skipped\)/,
  );
});

test("desktop screenshot report lists visible windows when launch misses the app", () => {
  const report = formatDesktopScreenshotGateReport({
    errors: ["No Filament Manager desktop window was found."],
    metric: {
      visibleWindows: [
        {
          height: 900,
          processName: "Codex",
          title: "Codex",
          width: 1440,
          x: 0,
          y: 0,
        },
      ],
      window: null,
    },
    outputDir: testOutputDir,
  });

  assert.match(report, /Visible desktop windows/);
  assert.match(report, /Codex: Codex/);
});

test("desktop screenshot report explains exhausted launch attempts", () => {
  const report = formatDesktopScreenshotGateReport({
    errors: ["launch failed"],
    launchAttempts: 2,
    launchAttemptsExhausted: true,
    metric: { visibleWindows: [], window: null },
    outputDir: testOutputDir,
  });

  assert.match(report, /stopped after 2 launch attempts/);
  assert.match(report, /later scenarios were not started/);
});

test("desktop screenshot report identifies retained app and database ownership", () => {
  const report = formatDesktopScreenshotGateReport({
    appKept: true,
    database: {
      assessment: { errors: [], profile: "rich", warnings: [] },
      fixtures: [],
      inspection: { counts: {}, details: {}, tables: [] },
      live: false,
      sourcePath: testSourceDatabasePath,
      targetPath: testVisualDatabasePath,
    },
    errors: ["No Filament Manager desktop window was found."],
    metric: { visibleWindows: [], window: null },
    outputDir: testOutputDir,
    temporaryDatabaseRetained: true,
  });

  assert.match(report, /app ownership was transferred to the caller/);
  assert.match(report, /retained temporary DB/);
  assert.ok(report.includes(testVisualDatabasePath));
});

test("desktop screenshot report does not invent a retained app for kept DB copies", () => {
  const report = formatDesktopScreenshotGateReport({
    appKept: false,
    database: {
      assessment: { errors: [], profile: "rich", warnings: [] },
      fixtures: [],
      inspection: { counts: {}, details: {}, tables: [] },
      live: false,
      sourcePath: testSourceDatabasePath,
      targetPath: testVisualDatabasePath,
    },
    errors: ["No Filament Manager desktop window was found."],
    metric: { visibleWindows: [], window: null },
    outputDir: testOutputDir,
    temporaryDatabaseRetained: true,
  });

  assert.match(report, /retained temporary DB/);
  assert.doesNotMatch(report, /after the retained app is closed/);
});
