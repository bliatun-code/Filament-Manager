import assert from "node:assert/strict";
import test from "node:test";
import { dashboardSyncTimeLocale, formatDashboardSyncTime } from "./dashboard_sync_time";

test("dashboard sync time follows the selected Norwegian locale", () => {
  const date = new Date(2026, 6, 9, 21, 10, 0);

  assert.equal(dashboardSyncTimeLocale("nb"), "nb-NO");
  assert.equal(formatDashboardSyncTime(date, "nb"), "21:10");
  assert.doesNotMatch(formatDashboardSyncTime(date, "nb"), /AM|PM/i);
});
