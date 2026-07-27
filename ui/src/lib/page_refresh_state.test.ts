import assert from "node:assert/strict";
import test from "node:test";

import {
  createPageRefreshState,
  reducePageRefreshState,
} from "./page_refresh_state";

test("a refresh after successful data keeps the previous data visible", () => {
  const initial = createPageRefreshState(true);
  const loaded = reducePageRefreshState(initial, { type: "success" });
  const refreshing = reducePageRefreshState(loaded, { type: "begin" });

  assert.equal(refreshing.hasSuccessfulData, true);
  assert.equal(refreshing.loading, false);
  assert.equal(refreshing.refreshing, true);
});

test("cached successful data starts ready while its background refresh runs", () => {
  const cached = createPageRefreshState(true, true);
  const refreshing = reducePageRefreshState(cached, { type: "begin" });

  assert.equal(cached.hasSuccessfulData, true);
  assert.equal(cached.loading, false);
  assert.equal(refreshing.hasSuccessfulData, true);
  assert.equal(refreshing.loading, false);
  assert.equal(refreshing.refreshing, true);
});

test("a failed refresh preserves successful-data state and exposes the error", () => {
  const loaded = reducePageRefreshState(createPageRefreshState(true), {
    type: "success",
  });
  const failed = reducePageRefreshState(
    reducePageRefreshState(loaded, { type: "begin" }),
    { type: "failure", error: "Refresh failed" },
  );

  assert.equal(failed.hasSuccessfulData, true);
  assert.equal(failed.loading, false);
  assert.equal(failed.refreshing, false);
  assert.equal(failed.error, "Refresh failed");
});

test("the next successful refresh clears a stale error", () => {
  const failed = reducePageRefreshState(createPageRefreshState(true), {
    type: "failure",
    error: "Refresh failed",
  });
  const recovered = reducePageRefreshState(failed, { type: "success" });

  assert.equal(recovered.error, null);
  assert.equal(recovered.hasSuccessfulData, true);
  assert.equal(recovered.loading, false);
  assert.equal(recovered.refreshing, false);
});
