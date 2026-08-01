import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCompanionScreenshotScenarios,
  auditCompanionKeyboardNavigation,
  companionScreenshotGateNeedsLaunch,
  COMPANION_PRINTER_LIVE_WAIT_MS,
  COMPANION_SCREENSHOT_VIEWPORTS,
  formatCompanionScreenshotGateReport,
  formatLaunchedCompanionScreenshotGateReport,
  normalizeCompanionScreenshotLocale,
  POSIX_PROCESS_GROUP_KILL_GRACE_MS,
  POSIX_PROCESS_GROUP_TERM_GRACE_MS,
  resolveCompanionQaLoopbackBaseUrl,
  resolveCompanionScreenshotTauriLaunch,
  runLaunchedCompanionScreenshotGate,
  summarizeCompanionScreenshotPixels,
  terminateWindowsProcessTree,
  validateCompanionScreenshotMetrics,
  waitForCompanionPrinterLiveData,
  WINDOWS_PROCESS_TREE_TERMINATION_TIMEOUT_MS,
} from "./run-companion-screenshot-gate.mjs";

const testOutputDir = path.join(tmpdir(), "visual-qa");
const testProjectDir = path.join(tmpdir(), "filament manager project");
const testSourceDatabasePath = path.join(tmpdir(), "source.db");
const testVisualDatabasePath = path.join(tmpdir(), "visual.db");

test("POSIX process-group termination keeps bounded runner headroom", () => {
  assert.equal(POSIX_PROCESS_GROUP_TERM_GRACE_MS, 3_000);
  assert.equal(POSIX_PROCESS_GROUP_KILL_GRACE_MS, 5_000);
});

function createMetric(overrides = {}) {
  return {
    accessibility: {
      focusableCount: 8,
      unnamedFocusableCount: 0,
      ...overrides.accessibility,
    },
    appChildren: 1,
    counts: {
      detailModals: 0,
      emptySlotSwatchDots: 0,
      listRows: 12,
      loanCards: 3,
      outgoingLoanCalculations: 0,
      phoneNavButtons: 4,
      settingsCards: 3,
      slotCards: 5,
      swatchSurfaces: 10,
      swatchedPrinterActions: 0,
      taskSheets: 0,
      ...overrides.counts,
    },
    contentOverlay: {
      height: null,
      ...overrides.contentOverlay,
    },
    document: {
      clientWidth: 390,
      scrollHeight: 1200,
      scrollWidth: 390,
      ...overrides.document,
    },
    expectations: {
      inventory: true,
      swatches: true,
      ...overrides.expectations,
    },
    horizontalOverflow: false,
    keyboard: {
      outsideViewportTargets: 0,
      outsideViewportTargetNames: [],
      uniqueTargets: 6,
      unnamedTargets: 0,
      visits: 8,
      ...overrides.keyboard,
    },
    loanReturnSubmit: {
      disabled: null,
      present: false,
      ...overrides.loanReturnSubmit,
    },
    name: "phone-inventory",
    outsideElements: [],
    pairingScreen: false,
    screenshot: path.join(tmpdir(), "companion-phone-inventory.png"),
    screenshotPixels: {
      colorBuckets: 92,
      edgeDeltaMean: 7.4,
      height: 844,
      lumaMean: 38,
      lumaStdDev: 18,
      saturatedPixelRatio: 0.18,
      samples: 120000,
      swatchSamples: {
        averageSaturation: 0.42,
        colorful: 7,
        total: 8,
        visible: 8,
      },
      width: 390,
    },
    textOverflow: [],
    title: "Filament Manager Companion",
    url: "http://127.0.0.1:4278/companion",
    viewport: {
      height: 844,
      width: 390,
      ...overrides.viewport,
    },
    ...overrides,
  };
}

function createVisualQaDatabase(overrides = {}) {
  return {
    assessment: {
      errors: [],
      profile: "rich",
      warnings: [],
    },
    copyMethod: "test-copy",
    inspection: {
      counts: {
        filament_spools: 12,
        printers: 1,
      },
      details: {
        bambuLiveEnabledCount: 1,
        bambuLiveIntegrationCount: 1,
        bambuLiveObservedStateCount: 1,
        bambuLiveObservedTrayCount: 4,
        trustedLanEnabled: true,
        trustedLanCompanionUrl: "http://127.0.0.1:4278/companion",
        trustedLanInterfaceConfigured: true,
        trustedLanPort: 4278,
        usageEventCount: 1,
      },
      tables: ["filament_spools", "printers"],
    },
    live: false,
    sourcePath: testSourceDatabasePath,
    targetPath: testVisualDatabasePath,
    ...overrides,
  };
}

test("companion keyboard audit reports distinct, named, in-viewport targets", async () => {
  const visits = [
    { name: "Inventory", outsideViewport: false, target: "inventory" },
    { name: "Loans", outsideViewport: false, target: "loans" },
    { name: "Inventory", outsideViewport: false, target: "inventory" },
  ];
  let evaluateCalls = 0;
  let tabPresses = 0;
  const page = {
    keyboard: {
      press: async (key) => {
        assert.equal(key, "Tab");
        tabPresses += 1;
      },
    },
    evaluate: async () => {
      evaluateCalls += 1;
      return evaluateCalls === 1 ? undefined : visits[evaluateCalls - 2];
    },
  };

  const result = await auditCompanionKeyboardNavigation(page, 3);

  assert.equal(tabPresses, 3);
  assert.deepEqual(result, {
    outsideViewportTargets: 0,
    outsideViewportTargetNames: [],
    uniqueTargets: 2,
    unnamedTargets: 0,
    visits: 3,
  });
});

test("companion screenshot metrics reject unnamed and unreachable keyboard controls", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      accessibility: { focusableCount: 4, unnamedFocusableCount: 1 },
      keyboard: { uniqueTargets: 1, unnamedTargets: 1, outsideViewportTargets: 1 },
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("unnamed keyboard-focusable")));
  assert.ok(errors.some((error) => error.includes("at least two distinct")));
  assert.ok(errors.some((error) => error.includes("outside the viewport")));
});

function createFakeChild() {
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.unrefCalls = 0;
  child.kill = (signal) => {
    child.killedSignal = signal;
    child.exitCode = 0;
    child.signalCode = signal;
    queueMicrotask(() => child.emit("exit", 0, signal));
    return true;
  };
  child.unref = () => {
    child.unrefCalls += 1;
  };
  return child;
}

function throwMissingProcessGroup() {
  throw Object.assign(new Error("process group missing"), { code: "ESRCH" });
}

function createLaunchedCompanionOptions(overrides = {}) {
  const { child = createFakeChild(), ...options } = overrides;
  return {
    cleanupVisualQaDatabase: () => {},
    platform: "darwin",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    processKillFn: throwMissingProcessGroup,
    runCompanionScreenshotGate: async (screenshotOptions) => ({
      baseUrl: screenshotOptions.baseUrl,
      errors: [],
      metrics: [createMetric()],
      outputDir: screenshotOptions.outputDir,
    }),
    runCompanionVisualGate: async (visualOptions) => ({
      baseUrl: visualOptions.baseUrl,
      errors: [],
      metrics: { spools: 12 },
    }),
    spawnFn: () => child,
    waitForCompanionServer: async () => ({ ready: true }),
    ...options,
  };
}

test("companion screenshot metric validation accepts rich rendered surfaces", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric(),
    createMetric({
      counts: { taskSheets: 1 },
      expectations: { inventory: true, sheet: true, swatches: true },
      name: "phone-add-spool",
    }),
    createMetric({
      counts: { detailModals: 1 },
      expectations: { detail: true, swatches: true },
      name: "phone-detail",
    }),
    createMetric({
      counts: { settingsCards: 3 },
      expectations: { settings: true },
      name: "phone-settings",
    }),
  ]);

  assert.deepEqual(errors, []);
});

test("Companion QA launch resolves database settings to loopback only", () => {
  const database = createVisualQaDatabase({
    inspection: {
      counts: {},
      details: {
        trustedLanCompanionUrl: "http://192.168.1.50:5312/companion",
        trustedLanPort: 5312,
      },
      tables: [],
    },
  });

  assert.equal(
    resolveCompanionQaLoopbackBaseUrl(null, database),
    "http://127.0.0.1:5312",
  );
  assert.throws(
    () => resolveCompanionQaLoopbackBaseUrl("http://192.168.1.50:5312", database),
    /restricted to http:\/\/127\.0\.0\.1/,
  );
});

test("launched Companion QA refuses live databases before preparation", async () => {
  let prepareCalls = 0;
  await assert.rejects(
    runLaunchedCompanionScreenshotGate({
      live: true,
      prepareVisualQaDatabase: async () => {
        prepareCalls += 1;
        return createVisualQaDatabase();
      },
    }),
    /refuses --live/,
  );
  assert.equal(prepareCalls, 0);
});

test("companion screenshot scenarios cover wide, tablet, and phone task surfaces", () => {
  const scenarios = buildCompanionScreenshotScenarios();

  assert.deepEqual(
    scenarios.map((scenario) => scenario.name),
    [
      "wide-inventory",
      "wide-add-spool",
      "wide-lend-spool",
      "wide-return-loan",
      "wide-detail",
      "wide-printers",
      "wide-settings",
      "tablet-inventory",
      "tablet-add-spool",
      "tablet-lend-spool",
      "tablet-return-loan",
      "tablet-detail",
      "tablet-printers",
      "tablet-settings",
      "phone-inventory",
      "phone-add-spool",
      "phone-lend-spool",
      "phone-return-loan",
      "phone-detail",
      "phone-printers",
      "phone-settings",
    ],
  );

  assert.equal(
    scenarios.find((scenario) => scenario.name === "wide-detail")?.viewport.width,
    COMPANION_SCREENSHOT_VIEWPORTS.wide.width,
  );
  assert.equal(
    scenarios.find((scenario) => scenario.name === "tablet-add-spool")?.viewport.width,
    COMPANION_SCREENSHOT_VIEWPORTS.tablet.width,
  );
  assert.deepEqual(
    scenarios.find((scenario) => scenario.name === "wide-lend-spool")?.expectations,
    {
      contentSizedOverlay: true,
      outgoingLoanCalculation: true,
      sheet: true,
      swatches: true,
    },
  );
  assert.deepEqual(
    scenarios.find((scenario) => scenario.name === "wide-return-loan")?.expectations,
    { contentSizedOverlay: true, enabledLoanReturnSubmit: true, loans: true, sheet: true },
  );
  assert.deepEqual(
    scenarios.find((scenario) => scenario.name === "phone-return-loan")?.expectations,
    { enabledLoanReturnSubmit: true, loans: true, sheet: true },
  );
  assert.deepEqual(
    scenarios.find((scenario) => scenario.name === "wide-printers")?.expectations,
    {
      emptySlotsWithoutSwatches: true,
      printers: true,
      stablePrinterActions: true,
      swatches: true,
    },
  );
  assert.deepEqual(
    scenarios.find((scenario) => scenario.name === "tablet-settings")?.expectations,
    { settings: true },
  );
});

test("companion printer screenshots wait up to 30 seconds for live data", async () => {
  const calls = [];
  const page = {
    waitForSelector: async (selector, options) => {
      calls.push({ options, selector });
    },
  };

  assert.equal(await waitForCompanionPrinterLiveData(page), true);
  assert.deepEqual(calls, [
    {
      options: { state: "visible", timeout: COMPANION_PRINTER_LIVE_WAIT_MS },
      selector: ".printer-live-dot, .printer-live-strip",
    },
  ]);
  assert.equal(COMPANION_PRINTER_LIVE_WAIT_MS, 30_000);
});

test("companion printer screenshots continue when live data stays unavailable", async () => {
  const page = {
    waitForSelector: async () => {
      throw new Error("timeout");
    },
  };

  assert.equal(await waitForCompanionPrinterLiveData(page, 5), false);
});

test("companion screenshot metric validation enforces content-sized compact overlays", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      contentOverlay: { height: 610 },
      counts: { taskSheets: 1 },
      expectations: { contentSizedOverlay: true, sheet: true },
      name: "wide-lend-spool",
    }),
    createMetric({
      contentOverlay: { height: 830 },
      counts: { detailModals: 1 },
      expectations: { contentSizedOverlay: true, detail: true },
      name: "wide-detail-full-height",
    }),
    createMetric({
      contentOverlay: { height: null },
      expectations: { contentSizedOverlay: true },
      name: "tablet-overlay-missing",
    }),
  ]);

  assert.ok(
    errors.some((error) =>
      error.includes("wide-detail-full-height compact overlay fills too much of the viewport"),
    ),
  );
  assert.ok(
    errors.some((error) => error.includes("tablet-overlay-missing expected a measurable compact overlay")),
  );
  assert.ok(errors.every((error) => !error.includes("wide-lend-spool")));
});

test("companion screenshot gate normalizes screenshot locale overrides", () => {
  assert.equal(normalizeCompanionScreenshotLocale("nb"), "nb");
  assert.equal(normalizeCompanionScreenshotLocale("no"), "nb");
  assert.equal(normalizeCompanionScreenshotLocale("nb-NO"), "nb");
  assert.equal(normalizeCompanionScreenshotLocale("no_NO"), "nb");
  assert.equal(normalizeCompanionScreenshotLocale("en"), "en");
  assert.equal(normalizeCompanionScreenshotLocale("en-US"), "en");
  assert.equal(normalizeCompanionScreenshotLocale("en-GB"), "en");
  assert.equal(normalizeCompanionScreenshotLocale("en-XA"), "en-XA");
  assert.equal(normalizeCompanionScreenshotLocale("ar-XB"), "ar-XB");
  assert.equal(normalizeCompanionScreenshotLocale("zh-XB"), "zh-XB");
  assert.equal(normalizeCompanionScreenshotLocale(""), "en");
  assert.equal(normalizeCompanionScreenshotLocale("bad"), "en");
});

test("companion screenshot metric validation rejects pairing and overflow shells", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      appChildren: 0,
      document: { clientWidth: 390, scrollWidth: 420 },
      horizontalOverflow: true,
      name: "phone-broken",
      outsideElements: [{ tag: "section" }],
      pairingScreen: true,
      textOverflow: [{ tag: "button" }],
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("pairing screen")));
  assert.ok(errors.some((error) => error.includes("blank app root")));
  assert.ok(errors.some((error) => error.includes("horizontal overflow")));
  assert.ok(errors.some((error) => error.includes("outside viewport")));
  assert.ok(errors.some((error) => error.includes("text overflow")));
});

test("companion screenshot metric validation rejects missing settings cards", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      counts: { settingsCards: 0 },
      expectations: { settings: true },
      name: "phone-settings",
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("expected settings cards")));
});

test("companion screenshot metric validation requires the outgoing loan calculation", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      counts: { outgoingLoanCalculations: 0, taskSheets: 1 },
      expectations: { outgoingLoanCalculation: true, sheet: true },
      name: "wide-lend-spool-missing-calculation",
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("expected an outgoing loan weight calculation")));
});

test("companion screenshot metric validation rejects ambiguous printer action and empty-slot colors", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      counts: {
        emptySlotSwatchDots: 1,
        slotCards: 5,
        swatchedPrinterActions: 4,
      },
      expectations: {
        emptySlotsWithoutSwatches: true,
        printers: true,
        stablePrinterActions: true,
      },
      name: "wide-printers-ambiguous-actions",
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("4 filament-colored printer action(s)")));
  assert.ok(errors.some((error) => error.includes("1 swatch dot(s) on empty printer slots")));
});

test("companion screenshot metric validation accepts an enabled loan return submit", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      counts: { loanCards: 3, taskSheets: 1 },
      expectations: { enabledLoanReturnSubmit: true, loans: true, sheet: true },
      loanReturnSubmit: { disabled: false, present: true },
      name: "phone-return-loan",
    }),
  ]);

  assert.deepEqual(errors, []);
});

test("companion screenshot metric validation rejects missing or disabled loan return submits", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      counts: { loanCards: 3, taskSheets: 1 },
      expectations: { enabledLoanReturnSubmit: true, loans: true, sheet: true },
      loanReturnSubmit: { disabled: null, present: false },
      name: "tablet-return-loan-missing-submit",
    }),
    createMetric({
      counts: { loanCards: 3, taskSheets: 1 },
      expectations: { enabledLoanReturnSubmit: true, loans: true, sheet: true },
      loanReturnSubmit: { disabled: true, present: true },
      name: "phone-return-loan-disabled-submit",
    }),
  ]);

  assert.ok(
    errors.some((error) =>
      error.includes("tablet-return-loan-missing-submit expected a loan return submit button"),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.includes("phone-return-loan-disabled-submit loan return submit button is disabled"),
    ),
  );
});

test("companion screenshot metric validation rejects flat raster captures", () => {
  const errors = validateCompanionScreenshotMetrics([
    createMetric({
      name: "phone-flat",
      screenshotPixels: {
        colorBuckets: 3,
        edgeDeltaMean: 0.2,
        height: 844,
        lumaMean: 12,
        lumaStdDev: 1.1,
        saturatedPixelRatio: 0,
        samples: 120000,
        swatchSamples: {
          averageSaturation: 0,
          colorful: 0,
          total: 4,
          visible: 0,
        },
        width: 390,
      },
    }),
  ]);

  assert.ok(errors.some((error) => error.includes("color diversity")));
  assert.ok(errors.some((error) => error.includes("luminance contrast")));
  assert.ok(errors.some((error) => error.includes("edge detail")));
  assert.ok(errors.some((error) => error.includes("visible swatch pixels")));
});

test("companion screenshot pixel summary measures contrast and swatch samples", () => {
  const width = 20;
  const height = 12;
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixelNumber = index / 4;
    const x = pixelNumber % width;
    const y = Math.floor(pixelNumber / width);
    const isSwatch = x >= 4 && x <= 8 && y >= 3 && y <= 7;
    pixels[index] = isSwatch ? 30 : x * 6;
    pixels[index + 1] = isSwatch ? 190 : y * 10;
    pixels[index + 2] = isSwatch ? 80 : 32;
    pixels[index + 3] = 255;
  }

  const summary = summarizeCompanionScreenshotPixels(
    { height, pixels, width },
    [{ height: 5, left: 4, top: 3, width: 5 }],
  );

  assert.ok(summary.colorBuckets > 8);
  assert.ok(summary.lumaStdDev > 10);
  assert.equal(summary.swatchSamples.visible, 1);
  assert.equal(summary.swatchSamples.colorful, 1);
});

test("companion screenshot launch need detection covers unreachable server failures", () => {
  assert.equal(companionScreenshotGateNeedsLaunch(new Error("fetch failed")), true);
  assert.equal(companionScreenshotGateNeedsLaunch(new Error("connect ECONNREFUSED 127.0.0.1:4278")), true);
  assert.equal(companionScreenshotGateNeedsLaunch(new Error("layout overflow")), false);
});

test("companion screenshot launch uses the local Tauri wrapper without a shell", () => {
  const executable = "node-runtime";
  const launch = resolveCompanionScreenshotTauriLaunch({ executable });

  assert.deepEqual(launch, {
    args: [fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)), "dev"],
    command: executable,
    shell: false,
  });
});

test("companion screenshot Tauri launch stays clean when Node deprecations throw", () => {
  const moduleUrl = new URL("./run-companion-screenshot-gate.mjs", import.meta.url).href;
  const probe = `
    import { spawnSync } from "node:child_process";
    import { resolveCompanionScreenshotTauriLaunch } from ${JSON.stringify(moduleUrl)};

    const launch = resolveCompanionScreenshotTauriLaunch({ args: ["--version"] });
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

test("companion screenshot cleanup validates Windows process tree ids", async () => {
  const calls = [];
  const execFileFn = async (...args) => calls.push(args);

  assert.equal(await terminateWindowsProcessTree(null, execFileFn), false);
  assert.equal(await terminateWindowsProcessTree(0, execFileFn), false);
  assert.equal(await terminateWindowsProcessTree(-12, execFileFn), false);
  assert.equal(await terminateWindowsProcessTree("12345", execFileFn), false);
  assert.equal(await terminateWindowsProcessTree("invalid", execFileFn), false);
  assert.deepEqual(calls, []);
});

test("launched companion screenshot gate starts Tauri dev and cleans up temp DB", async () => {
  const child = createFakeChild();
  const chmodFn = async () => {};
  const calls = {
    cleanup: [],
    order: [],
    prepare: [],
    screenshot: [],
    spawn: [],
    taskkill: [],
    visual: [],
    wait: [],
  };
  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: (path) => {
      calls.cleanup.push(path);
      calls.order.push("cleanup");
    },
    chmodFn,
    cwd: testProjectDir,
    outputDir: testOutputDir,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async (options) => {
      calls.prepare.push(options);
      return createVisualQaDatabase();
    },
    runCompanionScreenshotGate: async (options) => {
      calls.screenshot.push(options);
      return {
        baseUrl: options.baseUrl,
        errors: [],
        metrics: [createMetric()],
        outputDir: options.outputDir,
      };
    },
    runCompanionVisualGate: async (options) => {
      calls.visual.push(options);
      return { baseUrl: options.baseUrl, errors: [], metrics: { spools: 12 } };
    },
    spawnFn: (command, args, options) => {
      calls.spawn.push({ args, command, options });
      child.stderr.write("ready soon\n");
      return child;
    },
    taskkillExecFileFn: async (command, args, options) => {
      calls.taskkill.push({ args, command, options });
      calls.order.push("taskkill");
    },
    themeMode: "dark",
    timeoutMs: 1234,
    waitForCompanionServer: async (baseUrl, options) => {
      calls.wait.push({ baseUrl, options });
      return { ready: true };
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.appKept, false);
  assert.equal(result.baseUrl, "http://127.0.0.1:4278");
  assert.equal(result.launchOwnershipUnresolved, false);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.equal(result.terminationConfirmed, true);
  assert.deepEqual(calls.prepare, [{ live: false, profile: undefined, sourcePath: undefined }]);
  assert.equal(calls.spawn[0]?.command, process.execPath);
  assert.deepEqual(calls.spawn[0]?.args, [
    fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)),
    "dev",
  ]);
  assert.equal(calls.spawn[0]?.options.cwd, testProjectDir);
  assert.equal(calls.spawn[0]?.options.detached, true);
  assert.equal(calls.spawn[0]?.options.shell, false);
  assert.equal(calls.spawn[0]?.options.windowsHide, true);
  assert.deepEqual(calls.spawn[0]?.options.stdio, ["ignore", "pipe", "pipe"]);
  assert.deepEqual(calls.taskkill, [
    {
      args: ["/PID", "12345", "/T", "/F"],
      command: "taskkill.exe",
      options: {
        timeout: WINDOWS_PROCESS_TREE_TERMINATION_TIMEOUT_MS,
        windowsHide: true,
      },
    },
  ]);
  assert.equal(
    calls.spawn[0]?.options.env.FILAMENT_MANAGER_DB_PATH,
    testVisualDatabasePath,
  );
  assert.equal(calls.spawn[0]?.options.env.FILAMENT_MANAGER_VISUAL_QA, "1");
  assert.equal(calls.wait[0]?.baseUrl, "http://127.0.0.1:4278");
  assert.equal(calls.visual[0]?.timeoutMs, 1234);
  assert.equal(calls.screenshot[0]?.themeMode, "dark");
  assert.equal(calls.screenshot[0]?.platform, "win32");
  assert.equal(calls.screenshot[0]?.chmodFn, chmodFn);
  assert.deepEqual(calls.cleanup, [testVisualDatabasePath]);
  assert.deepEqual(calls.order, ["taskkill", "cleanup"]);
  assert.equal(child.killedSignal, undefined);
});

test("launched companion gate cleans its generated database when spawn throws synchronously", async () => {
  const calls = { cleanup: [], spawn: 0, taskkill: 0, wait: 0 };
  const spawnError = new Error("spawn EACCES");

  await assert.rejects(
    runLaunchedCompanionScreenshotGate({
      cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
      platform: "win32",
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      spawnFn: () => {
        calls.spawn += 1;
        throw spawnError;
      },
      taskkillExecFileFn: async () => {
        calls.taskkill += 1;
      },
      waitForCompanionServer: async () => {
        calls.wait += 1;
        return { ready: true };
      },
    }),
    (error) => error === spawnError,
  );

  assert.equal(calls.spawn, 1);
  assert.equal(calls.taskkill, 0);
  assert.equal(calls.wait, 0);
  assert.deepEqual(calls.cleanup, [testVisualDatabasePath]);
});

test("launched companion gate preserves synchronous spawn and cleanup failures", async () => {
  const spawnError = new Error("spawn EACCES");
  const cleanupError = new Error("cleanup denied");

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        cleanupVisualQaDatabase: () => {
          throw cleanupError;
        },
        spawnFn: () => {
          throw spawnError;
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [spawnError, cleanupError]);
      assert.equal(error.cause, spawnError);
      assert.equal(error.cleanupFailed, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /cleanup failed or may be incomplete/i);
      return true;
    },
  );
});

test("launched companion gate cleans its generated database after a malformed URL", async () => {
  const cleanup = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        baseUrl: "not a valid companion URL",
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
      }),
    ),
    (error) => error?.code === "ERR_INVALID_URL",
  );

  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched companion gate preserves malformed URL and cleanup failures", async () => {
  const cleanupError = new Error("cleanup denied");

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        baseUrl: "not a valid companion URL",
        cleanupVisualQaDatabase: () => {
          throw cleanupError;
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0]?.code, "ERR_INVALID_URL");
      assert.equal(error.errors[1], cleanupError);
      assert.equal(error.cause, error.errors[0]);
      assert.equal(error.cleanupFailed, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      return true;
    },
  );
});

test("launched companion gate preserves kept copies and live databases when spawn throws", async () => {
  for (const scenario of [
    { database: createVisualQaDatabase(), keep: true },
    {
      database: createVisualQaDatabase({
        live: true,
        targetPath: testSourceDatabasePath,
      }),
      keep: false,
    },
  ]) {
    const cleanup = [];
    const spawnError = new Error("spawn EACCES");

    await assert.rejects(
      runLaunchedCompanionScreenshotGate({
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        keep: scenario.keep,
        prepareVisualQaDatabase: async () => scenario.database,
        spawnFn: () => {
          throw spawnError;
        },
      }),
      (error) => {
        if (scenario.keep && !scenario.database.live) {
          assert.ok(error instanceof AggregateError);
          assert.deepEqual(error.errors, [spawnError]);
          assert.equal(error.cause, spawnError);
          assert.equal(error.temporaryDatabaseRetained, true);
          assert.ok(error.message.includes(testVisualDatabasePath));
          return true;
        }
        return error === spawnError;
      },
    );

    assert.deepEqual(cleanup, []);
  }
});

test("launched companion gate reports asynchronous spawn errors without taskkill and cleans once", async () => {
  const child = createFakeChild();
  const calls = { cleanup: [], taskkill: 0 };
  const spawnError = Object.assign(new Error("spawn missing command"), {
    code: "ENOENT",
  });

  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
    keepAppOnFail: true,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    spawnFn: () => child,
    taskkillExecFileFn: async () => {
      calls.taskkill += 1;
    },
    waitForCompanionServer: async (_baseUrl, options) => {
      child.pid = undefined;
      child.exitCode = -2;
      child.emit("error", spawnError);
      child.emit("close", -2, null);
      assert.equal(options.shouldAbort(), true);
      return { ready: false };
    },
  });

  assert.match(result.errors[0], /ENOENT: spawn missing command/);
  assert.equal(calls.taskkill, 0);
  assert.deepEqual(calls.cleanup, [testVisualDatabasePath]);
});

test("launched companion gate rejects a stale ready server after its child fails", async () => {
  const child = createFakeChild();
  const calls = { cleanup: [], screenshot: 0, taskkill: 0, visual: 0 };
  const spawnError = Object.assign(new Error("spawn missing command"), {
    code: "ENOENT",
  });

  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    runCompanionScreenshotGate: async () => {
      calls.screenshot += 1;
      return { errors: [] };
    },
    runCompanionVisualGate: async () => {
      calls.visual += 1;
      return { errors: [] };
    },
    spawnFn: () => child,
    taskkillExecFileFn: async () => {
      calls.taskkill += 1;
    },
    waitForCompanionServer: async () => {
      child.pid = undefined;
      child.exitCode = -2;
      child.emit("error", spawnError);
      child.emit("close", -2, null);
      return { ready: true };
    },
  });

  assert.match(result.errors[0], /ENOENT: spawn missing command/);
  assert.equal(calls.visual, 0);
  assert.equal(calls.screenshot, 0);
  assert.equal(calls.taskkill, 0);
  assert.deepEqual(calls.cleanup, [testVisualDatabasePath]);
});

test("launched companion gate rechecks child ownership across visual and screenshot phases", async () => {
  for (const failurePhase of ["visual", "screenshot"]) {
    const child = createFakeChild();
    const calls = { cleanup: [], screenshot: 0, taskkill: 0, visual: 0 };
    const spawnError = Object.assign(new Error("spawn missing command"), {
      code: "ENOENT",
    });
    const failChild = () => {
      child.pid = undefined;
      child.exitCode = -2;
      child.emit("error", spawnError);
      child.emit("close", -2, null);
    };

    const result = await runLaunchedCompanionScreenshotGate({
      cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      runCompanionScreenshotGate: async (options) => {
        calls.screenshot += 1;
        if (failurePhase === "screenshot") {
          failChild();
        }
        return {
          baseUrl: options.baseUrl,
          errors: [],
          metrics: [createMetric()],
          outputDir: options.outputDir,
        };
      },
      runCompanionVisualGate: async (options) => {
        calls.visual += 1;
        if (failurePhase === "visual") {
          failChild();
        }
        return { baseUrl: options.baseUrl, errors: [], metrics: {} };
      },
      spawnFn: () => child,
      taskkillExecFileFn: async () => {
        calls.taskkill += 1;
      },
      waitForCompanionServer: async () => ({ ready: true }),
    });

    assert.match(result.errors[0], /ENOENT: spawn missing command/);
    assert.equal(calls.visual, 1);
    assert.equal(calls.screenshot, failurePhase === "visual" ? 0 : 1);
    assert.equal(calls.taskkill, 0);
    assert.deepEqual(calls.cleanup, [testVisualDatabasePath]);
  }
});

test("launched companion gate rechecks the Windows process tree after wrapper close", async () => {
  const child = createFakeChild();
  const calls = { cleanup: [], taskkill: 0 };

  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
    keepAppOnFail: true,
    platform: "win32",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    spawnFn: () => child,
    taskkillExecFileFn: async () => {
      calls.taskkill += 1;
    },
    waitForCompanionServer: async (_baseUrl, options) => {
      child.exitCode = 17;
      child.emit("close", 17, null);
      assert.equal(options.shouldAbort(), true);
      return { ready: false };
    },
  });

  assert.match(result.errors[0], /exited early \(17\)/);
  assert.equal(calls.taskkill, 1);
  assert.deepEqual(calls.cleanup, [testVisualDatabasePath]);
});

test("launched companion gate retains the DB when a stopped wrapper leaves a live process group", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const signals = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        child,
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        groupKillGraceMs: 0,
        groupTermGraceMs: 0,
        processKillFn: (pid, signal) => {
          signals.push({ pid, signal });
        },
        waitForCompanionServer: async (_baseUrl, options) => {
          child.exitCode = 17;
          child.emit("close", 17, null);
          assert.equal(options.shouldAbort(), true);
          return { ready: false };
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.match(error.message, /termination could not be confirmed/i);
      assert.match(error.message, /groupStopped=false/);
      assert.match(error.message, /wrapperStopped=true/);
      return true;
    },
  );

  assert.ok(
    signals.some(({ pid, signal }) => pid === -12345 && signal === "SIGTERM"),
  );
  assert.ok(
    signals.some(({ pid, signal }) => pid === -12345 && signal === "SIGKILL"),
  );
  assert.deepEqual(cleanup, []);
});

test("launched companion gate waits through macOS EPERM until a zombie process group is reaped", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const signals = [];
  let now = 0;
  let groupProbes = 0;

  const result = await runLaunchedCompanionScreenshotGate(
    createLaunchedCompanionOptions({
      child,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      groupPollMs: 1,
      groupTermGraceMs: 10,
      nowFn: () => now,
      processKillFn: (pid, signal) => {
        signals.push({ pid, signal });
        if (signal !== 0) {
          return;
        }
        groupProbes += 1;
        throw Object.assign(new Error(
          groupProbes < 3 ? "zombie process group" : "process group missing",
        ), {
          code: groupProbes < 3 ? "EPERM" : "ESRCH",
        });
      },
      waitFn: async (milliseconds) => {
        now += milliseconds;
      },
      waitForCompanionServer: async (_baseUrl, options) => {
        child.exitCode = 17;
        child.emit("close", 17, null);
        assert.equal(options.shouldAbort(), true);
        return { ready: false };
      },
    }),
  );

  assert.match(result.errors[0], /exited early \(17\)/);
  assert.equal(groupProbes, 3);
  assert.equal(result.terminationConfirmed, true);
  assert.equal(result.launchOwnershipUnresolved, false);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.ok(
    signals.some(({ pid, signal }) => pid === -12345 && signal === "SIGTERM"),
  );
  assert.equal(
    signals.some(({ pid, signal }) => pid === -12345 && signal === "SIGKILL"),
    false,
  );
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched companion gate fails closed when process-group probing returns an unknown error", async () => {
  const child = createFakeChild();
  const cleanup = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        child,
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        groupKillGraceMs: 0,
        groupTermGraceMs: 0,
        processKillFn: (_pid, signal) => {
          if (signal === 0) {
            throw Object.assign(new Error("unexpected process-group probe failure"), {
              code: "EIO",
            });
          }
        },
        waitForCompanionServer: async (_baseUrl, options) => {
          child.exitCode = 17;
          child.emit("close", 17, null);
          assert.equal(options.shouldAbort(), true);
          return { ready: false };
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.match(error.message, /groupStopped=false/);
      assert.match(error.message, /wrapperStopped=true/);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched companion gate cleans the DB after a stopped wrapper process group disappears", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const signals = [];
  let groupRunning = true;

  const result = await runLaunchedCompanionScreenshotGate(
    createLaunchedCompanionOptions({
      child,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      groupKillGraceMs: 0,
      groupTermGraceMs: 0,
      processKillFn: (pid, signal) => {
        signals.push({ pid, signal });
        if (signal === "SIGTERM") {
          groupRunning = false;
          return;
        }
        if (signal === 0 && !groupRunning) {
          throw Object.assign(new Error("process group missing"), {
            code: "ESRCH",
          });
        }
      },
      waitForCompanionServer: async (_baseUrl, options) => {
        child.exitCode = 17;
        child.emit("close", 17, null);
        assert.equal(options.shouldAbort(), true);
        return { ready: false };
      },
    }),
  );

  assert.match(result.errors[0], /exited early \(17\)/);
  assert.equal(result.terminationConfirmed, true);
  assert.equal(result.launchOwnershipUnresolved, false);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.ok(
    signals.some(({ pid, signal }) => pid === -12345 && signal === "SIGTERM"),
  );
  assert.equal(
    signals.some(({ pid, signal }) => pid === -12345 && signal === "SIGKILL"),
    false,
  );
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched companion gate retains the DB when a closed Windows wrapper tree is unresolved", async () => {
  const child = createFakeChild();
  const cleanup = [];
  const taskkillError = new Error("process tree no longer addressable");

  await assert.rejects(
    runLaunchedCompanionScreenshotGate({
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      killProcessFn: () => {
        throw new Error("wrapper already closed");
      },
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      spawnFn: () => child,
      taskkillExecFileFn: async () => {
        throw taskkillError;
      },
      waitForCompanionServer: async (_baseUrl, options) => {
        child.exitCode = 17;
        child.emit("close", 17, null);
        assert.equal(options.shouldAbort(), true);
        return { ready: false };
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /exited early \(17\)/);
      assert.equal(error.errors[1].cause, taskkillError);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /process tree no longer addressable/);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched companion gate preserves keep and live ownership after asynchronous spawn errors", async () => {
  for (const scenario of [
    { database: createVisualQaDatabase(), keep: true },
    {
      database: createVisualQaDatabase({
        live: true,
        targetPath: testSourceDatabasePath,
      }),
      keep: false,
    },
  ]) {
    const child = createFakeChild();
    const cleanup = [];
    const spawnError = Object.assign(new Error("spawn missing command"), {
      code: "ENOENT",
    });
    const result = await runLaunchedCompanionScreenshotGate({
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      keep: scenario.keep,
      keepAppOnFail: true,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => scenario.database,
      spawnFn: () => child,
      waitForCompanionServer: async (_baseUrl, options) => {
        child.pid = undefined;
        child.exitCode = -2;
        child.emit("error", spawnError);
        child.emit("close", -2, null);
        assert.equal(options.shouldAbort(), true);
        return { ready: false };
      },
    });

    assert.match(result.errors[0], /ENOENT: spawn missing command/);
    assert.deepEqual(cleanup, []);
  }
});

test("launched companion screenshot gate reports startup failures with launch output", async () => {
  const child = createFakeChild();
  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: () => {},
    processKillFn: throwMissingProcessGroup,
    outputDir: testOutputDir,
    platform: "darwin",
    postTerminateDelayMs: 0,
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    spawnFn: () => {
      queueMicrotask(() => child.stdout.write("boot line\n"));
      return child;
    },
    waitForCompanionServer: async () => ({
      lastError: new Error("fetch failed"),
      ready: false,
    }),
  });

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /did not become reachable/);
  assert.match(result.errors[0], /fetch failed/);
  assert.match(result.launchOutputTail, /boot line/);
  assert.equal(result.screenshotGate, null);
  assert.equal(result.visualGate, null);
  assert.equal(child.killedSignal, "SIGTERM");
});

test("launched companion gate preserves a primary exception when teardown is clean", async () => {
  const primaryError = new Error("readiness crashed");
  const cleanup = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        terminateChildFn: async () => true,
        waitForCompanionServer: async () => {
          throw primaryError;
        },
      }),
    ),
    (error) => error === primaryError,
  );

  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("launched companion gate composes primary and termination failures", async () => {
  const primaryError = new Error("readiness crashed");
  const terminationError = new Error("termination exploded");
  const cleanup = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        terminateChildFn: async () => {
          throw terminationError;
        },
        waitForCompanionServer: async () => {
          throw primaryError;
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primaryError, terminationError]);
      assert.equal(error.cause, primaryError);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /no retry is safe/i);
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched companion gate treats an unconfirmed termination as unresolved ownership", async () => {
  const cleanup = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        terminateChildFn: async () => false,
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /termination could not be confirmed/i);
      assert.match(error.message, /no retry is safe/i);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched companion gate composes gate and cleanup failures", async () => {
  const cleanupError = new Error("cleanup denied");

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        cleanupVisualQaDatabase: () => {
          throw cleanupError;
        },
        runCompanionVisualGate: async (options) => ({
          baseUrl: options.baseUrl,
          errors: ["layout broken"],
          metrics: {},
        }),
        terminateChildFn: async () => true,
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /layout broken/);
      assert.equal(error.errors[1], cleanupError);
      assert.equal(error.cause, error.errors[0]);
      assert.equal(error.cleanupFailed, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      return true;
    },
  );
});

test("launched companion gate reports cleanup failure after an otherwise green run", async () => {
  const cleanupError = new Error("cleanup denied");

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        cleanupVisualQaDatabase: () => {
          throw cleanupError;
        },
        terminateChildFn: async () => true,
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [cleanupError]);
      assert.equal(error.cause, cleanupError);
      assert.equal(error.cleanupFailed, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      return true;
    },
  );
});

test("launched companion gate reports a failed keep-app ownership transfer", async () => {
  const child = createFakeChild();
  const releaseError = new Error("unref failed");
  const cleanup = [];

  await assert.rejects(
    runLaunchedCompanionScreenshotGate(
      createLaunchedCompanionOptions({
        child,
        cleanupVisualQaDatabase: (path) => cleanup.push(path),
        keepAppOnFail: true,
        releaseChildFn: async () => {
          throw releaseError;
        },
        waitForCompanionServer: async () => ({
          lastError: new Error("fetch failed"),
          ready: false,
        }),
      }),
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.at(-1), releaseError);
      assert.match(error.message, /ownership transfer failed/i);
      assert.equal(error.launchOwnershipUnresolved, true);
      assert.equal(error.temporaryDatabaseRetained, true);
      assert.ok(error.message.includes(testVisualDatabasePath));
      return true;
    },
  );

  assert.deepEqual(cleanup, []);
});

test("launched companion gate reclaims a child that stops during async transfer", async () => {
  const child = createFakeChild();
  const cleanup = [];
  let terminationCalls = 0;
  const result = await runLaunchedCompanionScreenshotGate(
    createLaunchedCompanionOptions({
      child,
      cleanupVisualQaDatabase: (path) => cleanup.push(path),
      keepAppOnFail: true,
      releaseChildFn: async () => {
        child.exitCode = 17;
        child.emit("close", 17, null);
      },
      terminateChildFn: async () => {
        terminationCalls += 1;
        return true;
      },
      waitForCompanionServer: async () => ({
        lastError: new Error("fetch failed"),
        ready: false,
      }),
    }),
  );

  assert.equal(result.appKept, false);
  assert.equal(result.launchOwnershipUnresolved, false);
  assert.equal(result.temporaryDatabaseRetained, false);
  assert.equal(result.terminationConfirmed, true);
  assert.equal(terminationCalls, 1);
  assert.deepEqual(cleanup, [testVisualDatabasePath]);
});

test("companion screenshot cleanup retains the temp DB when Windows taskkill fails", async () => {
  const child = createFakeChild();
  const calls = { cleanup: [], taskkill: 0 };
  await assert.rejects(
    runLaunchedCompanionScreenshotGate({
      cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
      killProcessFn: () => {
        throw new Error("fake process group");
      },
      outputDir: testOutputDir,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      runCompanionScreenshotGate: async (options) => ({
        baseUrl: options.baseUrl,
        errors: [],
        metrics: [createMetric()],
        outputDir: options.outputDir,
      }),
      runCompanionVisualGate: async (options) => ({
        baseUrl: options.baseUrl,
        errors: [],
        metrics: { spools: 12 },
      }),
      spawnFn: () => child,
      taskkillExecFileFn: async () => {
        calls.taskkill += 1;
        throw new Error("taskkill unavailable");
      },
      waitForCompanionServer: async () => ({ ready: true }),
    }),
    (error) => {
      assert.match(error.message, /Tauri may still be using http:\/\/127\.0\.0\.1:4278/);
      assert.match(error.message, /database cleanup was skipped/i);
      assert.ok(error.message.includes(testVisualDatabasePath));
      assert.match(error.message, /process-tree termination could not be confirmed/);
      assert.match(error.message, /taskkill unavailable/);
      return true;
    },
  );

  assert.equal(calls.taskkill, 1);
  assert.equal(child.killedSignal, "SIGTERM");
  assert.deepEqual(calls.cleanup, []);
});

test("companion screenshot cleanup retains the temp DB when Windows taskkill times out", async () => {
  const child = createFakeChild();
  const calls = { cleanup: [], taskkill: [] };
  const timeoutError = new Error("taskkill timed out");
  timeoutError.code = "ETIMEDOUT";

  await assert.rejects(
    runLaunchedCompanionScreenshotGate({
      cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
      killProcessFn: () => {
        throw new Error("fake process group");
      },
      outputDir: testOutputDir,
      platform: "win32",
      postTerminateDelayMs: 0,
      prepareVisualQaDatabase: async () => createVisualQaDatabase(),
      spawnFn: () => child,
      taskkillExecFileFn: async (command, args, options) => {
        calls.taskkill.push({ args, command, options });
        throw timeoutError;
      },
      taskkillTimeoutMs: 25,
      waitForCompanionServer: async () => ({
        lastError: new Error("fetch failed"),
        ready: false,
      }),
    }),
    /ETIMEDOUT: taskkill timed out/,
  );

  assert.deepEqual(calls.taskkill, [
    {
      args: ["/PID", "12345", "/T", "/F"],
      command: "taskkill.exe",
      options: { timeout: 25, windowsHide: true },
    },
  ]);
  assert.equal(child.killedSignal, "SIGTERM");
  assert.deepEqual(calls.cleanup, []);
});

test("companion screenshot keep-on-failure leaves the Windows app and DB running", async () => {
  const child = createFakeChild();
  const calls = { cleanup: 0, taskkill: 0 };
  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: () => {
      calls.cleanup += 1;
    },
    keepAppOnFail: true,
    outputDir: testOutputDir,
    platform: "win32",
    prepareVisualQaDatabase: async () => createVisualQaDatabase(),
    spawnFn: () => child,
    taskkillExecFileFn: async () => {
      calls.taskkill += 1;
    },
    waitForCompanionServer: async () => ({
      lastError: new Error("fetch failed"),
      ready: false,
    }),
  });

  assert.equal(result.errors.length, 1);
  assert.equal(result.appKept, true);
  assert.equal(result.launchOwnershipUnresolved, false);
  assert.equal(result.temporaryDatabaseRetained, true);
  assert.equal(result.terminationConfirmed, null);
  assert.equal(calls.taskkill, 0);
  assert.equal(calls.cleanup, 0);
  assert.equal(child.unrefCalls, 1);
  assert.equal(child.killedSignal, undefined);
});

test("launched companion screenshot report includes launch diagnostics", () => {
  const report = formatLaunchedCompanionScreenshotGateReport({
    baseUrl: "http://127.0.0.1:4278",
    database: createVisualQaDatabase(),
    errors: ["broken"],
    launchOutputTail: "tail output",
    outputDir: testOutputDir,
    screenshotGate: null,
    visualGate: null,
  });

  assert.match(report, /Companion screenshot QA used a temporary DB copy/);
  assert.match(report, /Companion launched screenshot gate errors/);
  assert.match(report, /tail output/);
});

test("companion screenshot report lists artifact paths", () => {
  const report = formatCompanionScreenshotGateReport({
    baseUrl: "http://127.0.0.1:4278",
    errors: [],
    metrics: [createMetric()],
    outputDir: testOutputDir,
  });

  assert.match(report, /Companion screenshot gate target/);
  assert.match(report, /companion-phone-inventory\.png/);
  assert.match(report, /settings 3/);
  assert.match(report, /Companion screenshot gate ok/);
});
