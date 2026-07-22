import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionRuntimeState } from "./companion_runtime_state.js";

test("runtime state helpers update status, busy state, and detail feedback", () => {
  const state = {
    statusMessage: "",
    statusTone: "default",
    busy: false,
    detailFeedback: null,
  };
  let renderCount = 0;
  const announcements = [];
  const runtimeState = createCompanionRuntimeState({
    state,
    announceStatus(message, tone) {
      announcements.push([message, tone]);
    },
    render() {
      renderCount += 1;
    },
  });

  runtimeState.setStatus("Saving...", "success");
  runtimeState.setBusy(true);
  runtimeState.setDetailFeedback(" spool-1 ", " Updated ");

  assert.equal(state.statusMessage, "Saving...");
  assert.equal(state.statusTone, "success");
  assert.equal(state.busy, true);
  assert.deepEqual(state.detailFeedback, {
    spoolId: "spool-1",
    message: "Updated",
  });
  assert.equal(renderCount, 2);
  assert.deepEqual(announcements, [["Saving...", "success"]]);

  runtimeState.clearDetailFeedback("spool-1");
  assert.equal(state.detailFeedback, null);

  runtimeState.setDetailFeedback("", "");
  assert.equal(state.detailFeedback, null);
});

test("runtime state auto-clears success messages after the configured timeout", () => {
  const state = {
    statusMessage: "",
    statusTone: "default",
    busy: false,
    detailFeedback: null,
  };
  const scheduled = [];
  const cleared = [];
  let renderCount = 0;
  const runtimeState = createCompanionRuntimeState({
    state,
    statusDurationMs: 20000,
    setTimeoutRef(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeoutRef(timerId) {
      cleared.push(timerId);
    },
    render() {
      renderCount += 1;
    },
  });

  runtimeState.setStatus("Printer slot assigned.", "success");

  assert.equal(state.statusMessage, "Printer slot assigned.");
  assert.equal(state.statusTone, "success");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 20000);

  runtimeState.setStatus("Weight updated.", "success");

  assert.equal(state.statusMessage, "Weight updated.");
  assert.equal(state.statusTone, "success");
  assert.equal(scheduled.length, 2);
  assert.deepEqual(cleared, [1]);

  scheduled[0].callback();
  assert.equal(state.statusMessage, "Weight updated.");
  assert.equal(state.statusTone, "success");

  scheduled[1].callback();
  assert.equal(state.statusMessage, "");
  assert.equal(state.statusTone, "default");
  assert.equal(renderCount, 3);
});

test("runtime state sends errors to the injected status announcer", () => {
  const state = {
    statusMessage: "",
    statusTone: "default",
  };
  const announcements = [];
  const runtimeState = createCompanionRuntimeState({
    state,
    render() {},
    announceStatus(message, tone) {
      announcements.push({ message, tone });
    },
  });

  runtimeState.setStatus("Could not save the spool.", "error");

  assert.deepEqual(announcements, [
    { message: "Could not save the spool.", tone: "error" },
  ]);
});
