import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDesktopVisualQaLaunchEnv,
  buildDesktopWindowActivateScript,
  buildDesktopWindowListScript,
  buildDesktopWindowLookupScript,
  buildDesktopWindowResizeScript,
  DESKTOP_DARK_THEME_MAX_LUMA_MEAN,
  DESKTOP_LIGHT_THEME_MIN_LUMA_MEAN,
  DESKTOP_PRINTER_LIVE_WAIT_MS,
  DEFAULT_WINDOW_COMMAND_TIMEOUT_MS,
  desktopScreenshotScale,
  desktopScreenshotNameForScenario,
  desktopWindowMatchesRequestedSize,
  desktopVisualQaExpectedWindowTitles,
  desktopVisualQaScenarioDefinition,
  desktopVisualQaScenarioRequiresDatabaseFixture,
  desktopVisualQaWindowMatchesScenario,
  defaultDesktopVisualQaCaptureDelayMs,
  execFileWithTimeout,
  formatDesktopScreenshotGateReport,
  normalizeDesktopVisualQaScenario,
  normalizeDesktopVisualQaTheme,
  normalizeDesktopVisualQaWindowSize,
  normalizeVisualQaLocale,
  parseDesktopVisualQaScenarios,
  parseDesktopWindowList,
  parseDesktopWindowInfo,
  resolveDesktopVisualQaTheme,
  resolveDesktopVisualQaWindowSize,
  resizeDesktopWindow,
  shouldRetryDesktopLaunch,
  validateDesktopScreenshotMetrics,
  validateDesktopScreenshotTheme,
  validateDesktopWindowSize,
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
  assert.equal(DEFAULT_WINDOW_COMMAND_TIMEOUT_MS, 15_000);
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
  assert.equal(
    parseDesktopWindowInfo("Filament Manager\tTitle\t0\t0\t0\t900"),
    null,
  );
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

  const resizeScript = buildDesktopWindowResizeScript(
    {
      processName: 'Filament "Manager"',
      title: 'Inventory "Detail"',
    },
    { height: 700, width: 900 },
  );
  assert.match(resizeScript, /Filament \\"Manager\\"/);
  assert.match(resizeScript, /Inventory \\"Detail\\"/);
  assert.match(resizeScript, /to \{900, 700\}/);
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

test("desktop screenshot gate passes scenario theme through the Tauri launch environment", () => {
  const env = buildDesktopVisualQaLaunchEnv(
    { locale: "nb", scenario: "add-filament", themeMode: "light" },
    { targetPath: "/tmp/visual-qa.db" },
    { EXISTING: "kept" },
  );

  assert.deepEqual(env, {
    EXISTING: "kept",
    FILAMENT_MANAGER_DB_PATH: "/tmp/visual-qa.db",
    FILAMENT_MANAGER_VISUAL_QA: "1",
    FILAMENT_MANAGER_VISUAL_QA_LOCALE: "nb",
    FILAMENT_MANAGER_VISUAL_QA_SCENARIO: "add-filament",
    FILAMENT_MANAGER_VISUAL_QA_THEME: "light",
  });

  const defaultEnv = buildDesktopVisualQaLaunchEnv(
    { locale: "en" },
    { targetPath: "/tmp/visual-qa.db" },
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

test("desktop printer captures wait for live data before taking screenshots", () => {
  assert.equal(
    defaultDesktopVisualQaCaptureDelayMs(["printer-board"]),
    DESKTOP_PRINTER_LIVE_WAIT_MS,
  );
  assert.equal(
    defaultDesktopVisualQaCaptureDelayMs(["selected-roll-label"]),
    3_500,
  );
  assert.equal(defaultDesktopVisualQaCaptureDelayMs([null]), 0);
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
  assert.equal(parseDesktopVisualQaScenarios(["--scenario", "all"]).length, 43);
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

test("desktop screenshot gate waits for a scenario-ready desktop window", async () => {
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
    timeoutMs: 50,
  });

  assert.equal(window?.title, "Inventory");
  assert.equal(attempts, 2);
});

test("desktop screenshot gate resizes and rereads the captured desktop window", async () => {
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
              ? { height: 800, width: 1200 }
              : { height: 700, width: 900 },
        }).window;
      },
      resizeWindowPollMs: 1,
      resizeWindowTimeoutMs: 50,
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
      createMetric({ window: { height: 701, width: 899 } }).window,
      { height: 700, width: 900 },
    ),
    true,
  );
  assert.deepEqual(
    validateDesktopWindowSize(
      createMetric({ window: { height: 700, width: 900 } }),
      {
        height: 700,
        width: 900,
      },
    ),
    [],
  );
  assert.match(
    validateDesktopWindowSize(
      createMetric({ window: { height: 800, width: 1200 } }),
      {
        height: 700,
        width: 900,
      },
    )[0],
    /1200x800 does not match requested 900x700/,
  );
});

test("desktop screenshot report lists window and artifact details", () => {
  const report = formatDesktopScreenshotGateReport({
    errors: [],
    metric: createMetric(),
    outputDir: "/tmp/visual-qa",
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
    outputDir: "/tmp/visual-qa",
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
    outputDir: "/tmp/visual-qa",
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
    outputDir: "/tmp/visual-qa",
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
    outputDir: "/tmp/visual-qa",
  });

  assert.match(report, /Visible desktop windows/);
  assert.match(report, /Codex: Codex/);
});
