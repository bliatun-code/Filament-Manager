import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionPrinterMutations } from "./companion_printer_mutations.js";

function createHarness(overrides = {}) {
  const state = {
    csrfToken: "csrf-token",
    activeTaskSheet: null,
    pendingPrinterSlotTarget: { slotId: "slot-1" },
    printerSpoolSearch: "pla",
    ...overrides.state,
  };
  const fetchCalls = [];
  const statusCalls = [];
  const busyCalls = [];
  let refreshCount = 0;
  let renderCount = 0;

  const mutations = createCompanionPrinterMutations({
    state,
    fetchJson:
      overrides.fetchJson ??
      (async (path, init) => {
        fetchCalls.push({ path, init });
        return {};
      }),
    refreshOverview: async () => {
      refreshCount += 1;
    },
    setBusy: (busy) => busyCalls.push(busy),
    setStatus: (message, tone) => statusCalls.push({ message, tone }),
    render: () => {
      renderCount += 1;
    },
    clearDetailFeedback: () => {},
    setDetailFeedback: () => {},
    tr: (_key, fallback) => fallback,
    findSpoolRow: (spoolId) =>
      overrides.spoolRows?.find((row) => row.spool.id === spoolId) ?? null,
  });

  return {
    state,
    mutations,
    fetchCalls,
    statusCalls,
    busyCalls,
    get refreshCount() {
      return refreshCount;
    },
    get renderCount() {
      return renderCount;
    },
  };
}

test("printer replacement is sent as one atomic slot operation", async () => {
  const harness = createHarness({
    state: {
      activeTaskSheet: {
        type: "printer-weight",
        mode: "assign",
        printerId: "printer/a",
        slotId: "slot 1",
        currentSpoolId: "spool-old",
        targetSpoolId: "spool-new",
      },
    },
  });

  await harness.mutations.submitPrinterSlotOperation("", "1250", "980");

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(
    harness.fetchCalls[0].path,
    "/api/v1/printers/printer%2Fa/slots/slot%201/operation",
  );
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].init.body), {
    expected_current_spool_id: "spool-old",
    target_spool_id: "spool-new",
    outgoing_measured_total_g: 980,
    incoming_measured_total_g: 1250,
  });
  assert.equal(harness.refreshCount, 1);
  assert.equal(harness.state.activeTaskSheet, null);
  assert.equal(harness.state.pendingPrinterSlotTarget, null);
  assert.equal(harness.statusCalls.at(-1)?.tone, "success");
  assert.deepEqual(harness.busyCalls, [true, false]);
});

test("printer slot clear sends the measured outgoing total in the same request", async () => {
  const harness = createHarness({
    state: {
      activeTaskSheet: {
        type: "printer-weight",
        mode: "clear",
        printerId: "printer-1",
        slotId: "slot-1",
        currentSpoolId: "spool-old",
        targetSpoolId: "",
      },
    },
  });

  await harness.mutations.submitPrinterSlotOperation("", "", "1000");

  assert.equal(harness.fetchCalls.length, 1);
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].init.body), {
    expected_current_spool_id: "spool-old",
    target_spool_id: null,
    outgoing_measured_total_g: 1000,
    incoming_measured_total_g: null,
  });
  assert.equal(harness.refreshCount, 1);
});

test("failed atomic slot operation leaves the task open for a safe retry", async () => {
  const harness = createHarness({
    state: {
      activeTaskSheet: {
        type: "printer-weight",
        mode: "clear",
        printerId: "printer-1",
        slotId: "slot-1",
        currentSpoolId: "spool-old",
      },
    },
    fetchJson: async () => {
      throw new Error("slot changed");
    },
  });

  await harness.mutations.submitPrinterSlotOperation("", "", "1000");

  assert.equal(harness.refreshCount, 0);
  assert.equal(harness.state.activeTaskSheet?.currentSpoolId, "spool-old");
  assert.equal(harness.statusCalls.at(-1)?.message, "slot changed");
  assert.equal(harness.statusCalls.at(-1)?.tone, "error");
  assert.equal(harness.renderCount, 1);
  assert.deepEqual(harness.busyCalls, [true, false]);
});

test("weight-only slot update keeps the existing single-spool weight path", async () => {
  const harness = createHarness({
    state: {
      activeTaskSheet: {
        type: "printer-weight",
        mode: "update",
        printerId: "printer-1",
        slotId: "slot-1",
        currentSpoolId: "spool-current",
      },
    },
    spoolRows: [
      {
        spool: {
          id: "spool-current",
          remaining_g: 700,
          spool_tare_weight_g: 250,
        },
        master: { vendor: "Bambu" },
      },
    ],
  });

  await harness.mutations.submitPrinterSlotOperation("900", "", "");

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].path, "/api/v1/printers/printer-1/spools/spool-current/usage");
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].init.body), {
    grams: 50,
    job_name: null,
    success: true,
  });
});
