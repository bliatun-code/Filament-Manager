import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPANION_E2E_RECORD,
  assertCompanionDataE2eOptions,
  formatCompanionDataE2eReport,
  parseCompanionDataE2eCliOptions,
  readCompanionDataE2eState,
  runCompanionDataWorkflows,
} from "./run-companion-data-e2e.mjs";
import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";
import { cleanupVisualQaDatabase } from "./visual-qa-db.mjs";

test("Companion data E2E refuses live, source, interface and database dependency overrides", () => {
  assert.throws(
    () => assertCompanionDataE2eOptions({ live: true }),
    /refuses --live/,
  );
  assert.throws(
    () => assertCompanionDataE2eOptions({ sourcePath: "/private/user.db" }),
    /refuses sourcePath\/--source/,
  );
  assert.throws(
    () => assertCompanionDataE2eOptions({ sourcePath: undefined }),
    /refuses sourcePath\/--source/,
  );
  assert.throws(
    () => assertCompanionDataE2eOptions({ interfaces: [] }),
    /fixed loopback interface/,
  );
  for (const dependency of [
    "cleanupVisualQaDatabase",
    "createVisualQaFixture",
    "prepareVisualQaDatabase",
    "runLaunchedCompanionScreenshotGate",
  ]) {
    assert.throws(
      () => assertCompanionDataE2eOptions({ [dependency]: () => {} }),
      new RegExp(`refuses the ${dependency} dependency override`),
    );
  }
  assert.doesNotThrow(() => assertCompanionDataE2eOptions({ live: false }));
});

test("Companion data E2E CLI refuses every explicit source form", () => {
  assert.throws(
    () => parseCompanionDataE2eCliOptions(["--source", "/private/user.db"]),
    /refuses --source/,
  );
  assert.throws(
    () => parseCompanionDataE2eCliOptions(["--source=/private/user.db"]),
    /refuses --source/,
  );
  assert.deepEqual(parseCompanionDataE2eCliOptions(["--timeout-ms", "25000"]), {
    live: false,
    timeoutMs: 25_000,
  });
});

test("Companion data E2E reader returns an empty workflow state for a clean fixture", () => {
  const fixture = createVisualQaFixture();
  try {
    assert.deepEqual(readCompanionDataE2eState(fixture.outputPath, COMPANION_E2E_RECORD), {
      history: [],
      loan: null,
      spool: null,
    });
  } finally {
    cleanupVisualQaDatabase(fixture.outputPath);
  }
});

test("Companion browser lifecycle closes earlier resources when setup fails", async () => {
  let browserClosed = false;
  await assert.rejects(
    runCompanionDataWorkflows({
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

test("Companion browser lifecycle preserves workflow and cleanup failures", async () => {
  let browserClosed = false;
  let contextClosed = false;
  const page = { on() {} };
  await assert.rejects(
    runCompanionDataWorkflows({
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
            newPage: async () => page,
          }),
        }),
      },
      runPageWorkflows: async () => {
        throw new Error("workflow failed");
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal(error.errors.length, 3);
      assert.match(error.message, /workflow failed/);
      assert.match(error.message, /context close failed/);
      assert.match(error.message, /browser close failed/);
      return true;
    },
  );
  assert.equal(contextClosed, true);
  assert.equal(browserClosed, true);
});

test("Companion data E2E report lists all persisted workflow outcomes", () => {
  const report = formatCompanionDataE2eReport({
    workflows: {
      createdSpoolId: "qa-created",
      finalLoanStatus: "RETURNED",
      persistedWeight: 777,
      postReturnWeight: 900,
      historyEvents: ["CREATED", "WEIGHT_UPDATED", "LOANED_OUT", "LOAN_RETURNED"],
    },
  });
  assert.match(report, /temporary database copies/);
  assert.match(report, /persisted weight update: 777 g/);
  assert.match(report, /weight after return: 900 g/);
  assert.match(report, /final loan status: RETURNED/);
  assert.match(report, /LOAN_RETURNED/);
});
