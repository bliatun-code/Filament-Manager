import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDesktopWindowActivateScript,
  buildDesktopWindowListScript,
  buildDesktopWindowLookupScript,
  desktopScreenshotScale,
  desktopScreenshotNameForScenario,
  formatDesktopScreenshotGateReport,
  normalizeDesktopVisualQaScenario,
  parseDesktopVisualQaScenarios,
  parseDesktopWindowList,
  parseDesktopWindowInfo,
  shouldRetryDesktopLaunch,
  validateDesktopScreenshotMetrics,
  waitForDesktopWindow,
} from "./run-desktop-screenshot-gate.mjs";

function createMetric(overrides = {}) {
  return {
    screenshot: "/tmp/desktop-window.png",
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

test("desktop screenshot gate parses macOS window lookup output", () => {
  assert.deepEqual(
    parseDesktopWindowInfo("Filament Manager\tFilament Manager\t20\t40\t1300\t900\n"),
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
  assert.equal(parseDesktopWindowInfo("Filament Manager\tTitle\t0\t0\t0\t900"), null);
});

test("desktop screenshot gate parses visible window diagnostics", () => {
  assert.deepEqual(
    parseDesktopWindowList(
      "Finder\tDesktop\t0\t0\t1440\t900\nFilament Manager\tFilament Manager\t20\t40\t1300\t900\n",
    ).map((window) => window.title),
    ["Desktop", "Filament Manager"],
  );
  assert.match(buildDesktopWindowListScript(), /windowRows/);
});

test("desktop screenshot gate lookup script escapes quoted titles", () => {
  const script = buildDesktopWindowLookupScript('Filament "Manager"');
  assert.match(script, /Filament \\"Manager\\"/);
  assert.match(script, /bambu-filament-manager/);
  assert.match(script, /processName contains/);
  assert.match(script, /application processes whose visible is true/);

  const activateScript = buildDesktopWindowActivateScript('Filament "Manager"');
  assert.match(activateScript, /Filament \\"Manager\\"/);
  assert.match(activateScript, /frontmost/);
});

test("desktop screenshot gate normalizes visual QA scenarios", () => {
  assert.equal(normalizeDesktopVisualQaScenario("inventory-add"), "add-filament");
  assert.equal(normalizeDesktopVisualQaScenario("DETAIL"), "selected-roll");
  assert.equal(normalizeDesktopVisualQaScenario("inventory-rfid"), "rfid-capture");
  assert.equal(normalizeDesktopVisualQaScenario("loan-return"), "return-loan");
  assert.equal(normalizeDesktopVisualQaScenario("printers"), "printer-board");
  assert.equal(normalizeDesktopVisualQaScenario("slot-assignment"), "printer-slot-assignment");
  assert.equal(normalizeDesktopVisualQaScenario("batch-add"), "bambu-batch-add");
  assert.equal(normalizeDesktopVisualQaScenario("general-settings"), "settings-general");
  assert.equal(normalizeDesktopVisualQaScenario("companion-settings"), "settings-library");
  assert.equal(
    normalizeDesktopVisualQaScenario("bambu-live-diagnostics"),
    "settings-printer-diagnostics",
  );
  assert.equal(normalizeDesktopVisualQaScenario("filament-catalog"), "settings-catalog");
  assert.equal(normalizeDesktopVisualQaScenario("program-maintenance"), "settings-maintenance");
  assert.equal(normalizeDesktopVisualQaScenario("usage-statistics"), "statistics-overview");
  assert.equal(normalizeDesktopVisualQaScenario(""), null);
  assert.throws(() => normalizeDesktopVisualQaScenario("bad"), /Unknown desktop visual QA/);
});

test("desktop screenshot gate lets later CLI scenario flags override npm defaults", () => {
  assert.deepEqual(
    parseDesktopVisualQaScenarios(["--scenario", "all", "--scenario", "bambu-live-diagnostics"]),
    ["settings-printer-diagnostics"],
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
      errors: [
        "No Filament Manager desktop window was found after launching Tauri dev. Visible windows: none.",
      ],
    }),
    true,
  );
  assert.equal(
    shouldRetryDesktopLaunch({
      errors: ["Desktop screenshot has too little color diversity."],
    }),
    false,
  );
  assert.equal(shouldRetryDesktopLaunch({ errors: [] }), false);
});

test("desktop screenshot metric validation accepts rich desktop captures", () => {
  assert.deepEqual(validateDesktopScreenshotMetrics(createMetric()), []);
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
  let attempts = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      attempts += 1;
      return attempts >= 3 ? createMetric().window : null;
    },
    intervalMs: 1,
    timeoutMs: 50,
  });

  assert.equal(window?.title, "Filament Manager");
  assert.equal(attempts, 3);
});

test("desktop screenshot gate wait can abort when launch exits", async () => {
  let attempts = 0;
  const window = await waitForDesktopWindow({
    findWindowFn: async () => {
      attempts += 1;
      return null;
    },
    intervalMs: 1,
    shouldAbort: () => attempts >= 2,
    timeoutMs: 50,
  });

  assert.equal(window, null);
  assert.equal(attempts, 2);
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

test("desktop screenshot report lists window and artifact details", () => {
  const report = formatDesktopScreenshotGateReport({
    errors: [],
    metric: createMetric(),
    outputDir: "/tmp/visual-qa",
    scenario: "add-filament",
  });

  assert.match(report, /Desktop visual QA scenario: add-filament/);
  assert.match(report, /Desktop window: Filament Manager/);
  assert.match(report, /Pixels: 1300x900 @1\.0x/);
  assert.match(report, /desktop-window\.png/);
  assert.match(report, /Desktop screenshot gate ok/);
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
    outputDir: "/tmp/visual-qa",
  });

  assert.match(report, /Visible desktop windows/);
  assert.match(report, /Codex: Codex/);
});
