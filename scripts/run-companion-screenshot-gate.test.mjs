import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import {
  buildCompanionScreenshotScenarios,
  companionScreenshotGateNeedsLaunch,
  COMPANION_SCREENSHOT_VIEWPORTS,
  formatCompanionScreenshotGateReport,
  formatLaunchedCompanionScreenshotGateReport,
  normalizeCompanionScreenshotLocale,
  runLaunchedCompanionScreenshotGate,
  summarizeCompanionScreenshotPixels,
  validateCompanionScreenshotMetrics,
} from "./run-companion-screenshot-gate.mjs";

function createMetric(overrides = {}) {
  return {
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
    loanReturnSubmit: {
      disabled: null,
      present: false,
      ...overrides.loanReturnSubmit,
    },
    name: "phone-inventory",
    outsideElements: [],
    pairingScreen: false,
    screenshot: "/tmp/companion-phone-inventory.png",
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
    sourcePath: "/tmp/source.db",
    targetPath: "/tmp/visual.db",
    ...overrides,
  };
}

function createFakeChild() {
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal) => {
    child.killedSignal = signal;
    child.exitCode = 0;
    child.signalCode = signal;
    queueMicrotask(() => child.emit("exit", 0, signal));
    return true;
  };
  child.unref = () => {};
  return child;
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
  assert.equal(normalizeCompanionScreenshotLocale("en"), "en");
  assert.equal(normalizeCompanionScreenshotLocale("en-US"), "en");
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

test("launched companion screenshot gate starts Tauri dev and cleans up temp DB", async () => {
  const child = createFakeChild();
  const calls = {
    cleanup: [],
    prepare: [],
    screenshot: [],
    spawn: [],
    visual: [],
    wait: [],
  };
  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: (path) => calls.cleanup.push(path),
    outputDir: "/tmp/visual-qa",
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
    themeMode: "dark",
    timeoutMs: 1234,
    waitForCompanionServer: async (baseUrl, options) => {
      calls.wait.push({ baseUrl, options });
      return { ready: true };
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.baseUrl, "http://127.0.0.1:4278");
  assert.deepEqual(calls.prepare, [{ live: false, profile: undefined, sourcePath: undefined }]);
  assert.equal(calls.spawn[0]?.command, "npm");
  assert.deepEqual(calls.spawn[0]?.args, ["run", "tauri", "--", "dev"]);
  assert.equal(calls.spawn[0]?.options.env.FILAMENT_MANAGER_DB_PATH, "/tmp/visual.db");
  assert.equal(calls.spawn[0]?.options.env.FILAMENT_MANAGER_VISUAL_QA, "1");
  assert.equal(calls.wait[0]?.baseUrl, "http://127.0.0.1:4278");
  assert.equal(calls.visual[0]?.timeoutMs, 1234);
  assert.equal(calls.screenshot[0]?.themeMode, "dark");
  assert.deepEqual(calls.cleanup, ["/tmp/visual.db"]);
  assert.equal(child.killedSignal, "SIGTERM");
});

test("launched companion screenshot gate reports startup failures with launch output", async () => {
  const child = createFakeChild();
  const result = await runLaunchedCompanionScreenshotGate({
    cleanupVisualQaDatabase: () => {},
    outputDir: "/tmp/visual-qa",
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
});

test("launched companion screenshot report includes launch diagnostics", () => {
  const report = formatLaunchedCompanionScreenshotGateReport({
    baseUrl: "http://127.0.0.1:4278",
    database: createVisualQaDatabase(),
    errors: ["broken"],
    launchOutputTail: "tail output",
    outputDir: "/tmp/visual-qa",
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
    outputDir: "/tmp/visual-qa",
  });

  assert.match(report, /Companion screenshot gate target/);
  assert.match(report, /companion-phone-inventory\.png/);
  assert.match(report, /settings 3/);
  assert.match(report, /Companion screenshot gate ok/);
});
