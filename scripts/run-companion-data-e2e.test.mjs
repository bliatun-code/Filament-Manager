import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPANION_E2E_RECORD,
  COMPANION_E2E_PRINTER_TARGET,
  COMPANION_E2E_WISHLIST_RECEIPT,
  assertCompanionDataE2eOptions,
  formatCompanionDataE2eLaunchFailure,
  formatCompanionDataE2eReport,
  parseCompanionDataE2eCliOptions,
  readCompanionDataE2eState,
  runCompanionDataWorkflows,
} from "./run-companion-data-e2e.mjs";
import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";
import {
  applyVisualQaDatabaseFixture,
  cleanupVisualQaDatabase,
} from "./visual-qa-db.mjs";

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
    startupTimeoutMs: undefined,
    timeoutMs: 25_000,
  });
  assert.deepEqual(
    parseCompanionDataE2eCliOptions([
      "--startup-timeout-ms",
      "120000",
      "--timeout-ms=30000",
    ]),
    {
      live: false,
      startupTimeoutMs: 120_000,
      timeoutMs: 30_000,
    },
  );
  assert.throws(
    () =>
      parseCompanionDataE2eCliOptions([
        "--startup-timeout-ms",
        "invalid",
      ]),
    /--startup-timeout-ms must be a positive integer/,
  );
  assert.throws(
    () => parseCompanionDataE2eCliOptions(["--timeout-ms=0"]),
    /--timeout-ms must be a positive integer/,
  );
});

test("Companion data E2E reader returns an empty workflow state for a clean fixture", () => {
  const fixture = createVisualQaFixture();
  try {
    const state = readCompanionDataE2eState(
      fixture.outputPath,
      COMPANION_E2E_RECORD,
    );
    assert.deepEqual({ ...state, printerAssignments: undefined }, {
      history: [],
      loan: null,
      loanMatches: [],
      printerAssignment: null,
      printerAssignments: undefined,
      spool: null,
      spoolMatches: [],
      wishlistItem: null,
      wishlistReceiptEvents: [],
      wishlistSpools: [],
    });
    assert.equal(state.printerAssignments.length, 11);
    assert.deepEqual(
      state.printerAssignments.find(
        (assignment) =>
          assignment.slot_id === COMPANION_E2E_PRINTER_TARGET.slotId,
      ),
      {
        printer_id: COMPANION_E2E_PRINTER_TARGET.printerId,
        printer_name: COMPANION_E2E_PRINTER_TARGET.printerName,
        slot_id: COMPANION_E2E_PRINTER_TARGET.slotId,
        slot_index: Number(COMPANION_E2E_PRINTER_TARGET.slotIndex),
        spool_id: null,
      },
    );
  } finally {
    cleanupVisualQaDatabase(fixture.outputPath);
  }
});

test("Companion data E2E reader exposes the fixed partial wishlist receipt fixture", async () => {
  const fixture = createVisualQaFixture();
  try {
    await applyVisualQaDatabaseFixture(fixture.outputPath, "wishlist-orders");
    const state = readCompanionDataE2eState(
      fixture.outputPath,
      COMPANION_E2E_RECORD,
    );
    assert.deepEqual(state.wishlistItem, {
      color_name: COMPANION_E2E_WISHLIST_RECEIPT.colorName,
      filament_name: COMPANION_E2E_WISHLIST_RECEIPT.filamentName,
      id: COMPANION_E2E_WISHLIST_RECEIPT.itemId,
      master_id: "visual_qa_master_wishlist_teal",
      material: COMPANION_E2E_WISHLIST_RECEIPT.material,
      quantity: COMPANION_E2E_WISHLIST_RECEIPT.initialQuantity,
      status: COMPANION_E2E_WISHLIST_RECEIPT.status,
      vendor: COMPANION_E2E_WISHLIST_RECEIPT.vendor,
    });
    assert.deepEqual(state.wishlistReceiptEvents, []);
    assert.deepEqual(state.wishlistSpools, []);
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
      historyEvents: ["CREATED", "WEIGHT_UPDATED", "LOANED_OUT", "LOAN_RETURNED"],
      persistedWeight: 777,
      postReturnWeight: 900,
      printerName: "QA Printer",
      printerSlotCleared: true,
      printerSlotId: "qa-slot-4",
      receivedWishlistItemId: COMPANION_E2E_WISHLIST_RECEIPT.itemId,
      receivedWishlistSpoolId: "qa-received",
      wishlistRemainingQuantity: 2,
    },
  });
  assert.match(report, /temporary database copies/);
  assert.match(report, /printer load\/clear: QA Printer · qa-slot-4 \(cleared\)/);
  assert.match(report, /persisted weight update: 777 g/);
  assert.match(
    report,
    /wishlist receipt: visual_qa_wishlist_on_order -> qa-received \(2 remaining\)/,
  );
  assert.match(report, /weight after return: 900 g/);
  assert.match(report, /final loan status: RETURNED/);
  assert.match(report, /LOAN_RETURNED/);
});

test("Companion data E2E launch failure includes the captured Tauri output", () => {
  assert.equal(
    formatCompanionDataE2eLaunchFailure({
      errors: ["Companion server did not become reachable."],
      launchOutputTail: "  Compiling filament-manager\nFinished dev profile  ",
    }),
    [
      "Companion server did not become reachable.",
      "Tauri launch output tail:",
      "Compiling filament-manager\nFinished dev profile",
    ].join("\n"),
  );
  assert.equal(
    formatCompanionDataE2eLaunchFailure({
      errors: ["Companion server did not become reachable."],
      launchOutputTail: "   ",
    }),
    "Companion server did not become reachable.",
  );
});
