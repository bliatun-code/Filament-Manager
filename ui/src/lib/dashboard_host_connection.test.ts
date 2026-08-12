import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardHostConnectionState,
  isDashboardHostFailureInGrace,
  observeDashboardHostConnection,
} from "./dashboard_host_connection";

test("cache-first checks preserve the last known host tone", () => {
  const live = createDashboardHostConnectionState("live");
  const checking = observeDashboardHostConnection(live, "checking");

  assert.strictEqual(checking, live);
  assert.equal(checking.tone, "live");
  assert.equal(checking.consecutiveCoreFailures, 0);
});

test("host connection warnings require two consecutive core failures", () => {
  const live = createDashboardHostConnectionState("live");
  const firstFailure = observeDashboardHostConnection(live, "failed");
  const secondFailure = observeDashboardHostConnection(firstFailure, "failed");

  assert.equal(firstFailure.tone, "live");
  assert.equal(isDashboardHostFailureInGrace(firstFailure, "failed"), true);
  assert.equal(secondFailure.tone, "warn");
  assert.equal(isDashboardHostFailureInGrace(secondFailure, "failed"), false);
});

test("a successful core read clears failures while repair warnings are immediate", () => {
  const warned = observeDashboardHostConnection(
    createDashboardHostConnectionState("live"),
    "repair",
  );
  assert.equal(warned.tone, "warn");

  const recovered = observeDashboardHostConnection(warned, "succeeded");
  assert.deepEqual(recovered, {
    consecutiveCoreFailures: 0,
    tone: "live",
  });
});
