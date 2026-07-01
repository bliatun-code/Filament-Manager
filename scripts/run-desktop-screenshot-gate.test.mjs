import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDesktopWindowActivateScript,
  buildDesktopWindowLookupScript,
  formatDesktopScreenshotGateReport,
  parseDesktopWindowInfo,
  validateDesktopScreenshotMetrics,
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

test("desktop screenshot gate lookup script escapes quoted titles", () => {
  const script = buildDesktopWindowLookupScript('Filament "Manager"');
  assert.match(script, /Filament \\"Manager\\"/);
  assert.match(script, /application processes whose visible is true/);

  const activateScript = buildDesktopWindowActivateScript('Filament "Manager"');
  assert.match(activateScript, /Filament \\"Manager\\"/);
  assert.match(activateScript, /frontmost/);
});

test("desktop screenshot metric validation accepts rich desktop captures", () => {
  assert.deepEqual(validateDesktopScreenshotMetrics(createMetric()), []);
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
  });

  assert.match(report, /Desktop window: Filament Manager/);
  assert.match(report, /desktop-window\.png/);
  assert.match(report, /Desktop screenshot gate ok/);
});
