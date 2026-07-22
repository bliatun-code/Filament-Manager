import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertZoomMetrics,
  buildAppModalAccessibilityHarnessDocument,
  runAppModalAccessibilityTest,
} from "./run-app-modal-accessibility.mjs";

function readRepoFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("AppModal accessibility harness is wired as a separate Vite entry", () => {
  const html = readRepoFile("ui/app-modal-accessibility.html");
  const harness = readRepoFile(
    "ui/src/accessibility/app_modal_accessibility_harness.tsx",
  );
  const focusModel = readRepoFile("ui/src/components/app_modal_focus.ts");

  assert.match(html, /app_modal_accessibility_entry\.tsx/);
  assert.match(harness, /data-testid="modal-opener"/);
  assert.match(harness, /data-testid="initial-action"/);
  assert.match(harness, /data-testid="details-summary"/);
  assert.match(harness, /data-testid="last-action"/);
  assert.match(focusModel, /"summary"/);
});

test("AppModal accessibility harness compiles into a standalone browser document", async () => {
  const document = await buildAppModalAccessibilityHarnessDocument();
  assert.match(document, /<!doctype html>/i);
  assert.match(document, /AppModalAccessibilityHarness/);
  assert.match(document, /<style>/);
  assert.match(document, /<script>/);
});

test("200% zoom metrics reject page overflow and require internal modal scrolling", () => {
  const passingMetrics = {
    dialogClientHeight: 300,
    dialogLeft: 16,
    dialogOverflowY: "auto",
    dialogRight: 900,
    dialogScrollHeight: 900,
    documentScrollWidth: 1280,
    viewportWidth: 1280,
    zoomScale: 2,
  };

  assert.doesNotThrow(() => assertZoomMetrics(passingMetrics));
  assert.throws(
    () =>
      assertZoomMetrics({
        ...passingMetrics,
        documentScrollWidth: 1400,
      }),
    /horizontal scrolling/,
  );
  assert.throws(
    () =>
      assertZoomMetrics({
        ...passingMetrics,
        dialogScrollHeight: 300,
      }),
    /scroll inside the dialog/,
  );
});

test("AppModal accessibility lifecycle closes the browser when context setup fails", async () => {
  let browserClosed = false;
  await assert.rejects(
    runAppModalAccessibilityTest({
      buildHarnessDocument: async () => "<!doctype html><html></html>",
      chromium: {
        launch: async () => ({
          close: async () => {
            browserClosed = true;
          },
          newContext: async () => {
            throw new Error("context setup failed");
          },
        }),
      },
    }),
    /context setup failed/,
  );
  assert.equal(browserClosed, true);
});

test("AppModal accessibility lifecycle preserves primary and cleanup failures", async () => {
  let browserClosed = false;
  let contextClosed = false;
  await assert.rejects(
    runAppModalAccessibilityTest({
      buildHarnessDocument: async () => "<!doctype html><html></html>",
      chromium: {
        launch: async () => ({
          close: async () => {
            browserClosed = true;
            throw new Error("browser close failed");
          },
          newContext: async () => ({
            close: async () => {
              contextClosed = true;
              throw new Error("context close failed");
            },
            newPage: async () => {
              throw new Error("page setup failed");
            },
          }),
        }),
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(
        error.errors.map((entry) => entry.message),
        ["page setup failed", "context close failed", "browser close failed"],
      );
      assert.match(error.message, /page setup failed/);
      assert.match(error.message, /context close failed/);
      assert.match(error.message, /browser close failed/);
      return true;
    },
  );
  assert.equal(contextClosed, true);
  assert.equal(browserClosed, true);
});
