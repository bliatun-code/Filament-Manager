import assert from "node:assert/strict";
import test from "node:test";

import {
  createPageRefreshState,
  isClientCompositeSnapshotPartial,
  isClientSnapshotFallback,
  reducePageRefreshState,
  resolveClientPageFeedbackState,
  shouldShowClientSnapshotWarning,
} from "./page_refresh_state";

test("client Host warnings stay hidden until the initial load settles", () => {
  for (const source of ["UNRESOLVED", "LIVE", "CACHED", "OFFLINE"] as const) {
    assert.equal(
      shouldShowClientSnapshotWarning({
        clientReadOnly: true,
        initialLoadSettled: false,
        source,
      }),
      false,
    );
  }
});

test("only settled cached and offline client snapshots show a Host warning", () => {
  assert.equal(isClientSnapshotFallback("UNRESOLVED"), false);
  assert.equal(isClientSnapshotFallback("LIVE"), false);
  assert.equal(isClientSnapshotFallback("CACHED"), true);
  assert.equal(isClientSnapshotFallback("OFFLINE"), true);

  for (const source of ["CACHED", "OFFLINE"] as const) {
    assert.equal(
      shouldShowClientSnapshotWarning({
        clientReadOnly: true,
        initialLoadSettled: true,
        source,
      }),
      true,
    );
  }
  assert.equal(
    shouldShowClientSnapshotWarning({
      clientReadOnly: false,
      initialLoadSettled: true,
      source: "OFFLINE",
    }),
    false,
  );
});

test("client feedback stays quiet during startup, prioritizes fallback, and clears after reconnect", () => {
  const states = [
    {
      label: "role unresolved",
      input: {
        clientReadOnly: true,
        hasLoadError: false,
        initialLoadSettled: false,
        partial: false,
        requestPending: true,
        source: "UNRESOLVED" as const,
      },
      expected: { fallback: false, loadError: false },
    },
    {
      label: "live response still loading",
      input: {
        clientReadOnly: true,
        hasLoadError: true,
        initialLoadSettled: false,
        partial: false,
        requestPending: true,
        source: "LIVE" as const,
      },
      expected: { fallback: false, loadError: false },
    },
    {
      label: "cached snapshot after Host loss",
      input: {
        clientReadOnly: true,
        hasLoadError: true,
        initialLoadSettled: true,
        partial: false,
        requestPending: false,
        source: "CACHED" as const,
      },
      expected: { fallback: true, loadError: false },
    },
    {
      label: "offline without a cached snapshot",
      input: {
        clientReadOnly: true,
        hasLoadError: true,
        initialLoadSettled: true,
        partial: false,
        requestPending: false,
        source: "OFFLINE" as const,
      },
      expected: { fallback: true, loadError: false },
    },
    {
      label: "live again after reconnect",
      input: {
        clientReadOnly: true,
        hasLoadError: false,
        initialLoadSettled: true,
        partial: false,
        requestPending: false,
        source: "LIVE" as const,
      },
      expected: { fallback: false, loadError: false },
    },
  ];

  for (const { expected, input, label } of states) {
    const feedback = resolveClientPageFeedbackState(input);
    assert.equal(
      feedback.clientDataWarningVisible,
      expected.fallback,
      `${label}: fallback warning`,
    );
    assert.equal(
      feedback.loadErrorVisible,
      expected.loadError,
      `${label}: generic load error`,
    );
  }
});

test("generic failures remain visible when no client fallback explains them", () => {
  assert.deepEqual(
    resolveClientPageFeedbackState({
      clientReadOnly: true,
      hasLoadError: true,
      initialLoadSettled: true,
      partial: false,
      requestPending: false,
      source: "LIVE",
    }),
    {
      clientDataWarningVisible: false,
      clientHostWarningVisible: false,
      clientPartialWarningVisible: false,
      loadErrorVisible: true,
    },
  );
});

test("a failed library-role request remains visible and retryable", () => {
  assert.deepEqual(
    resolveClientPageFeedbackState({
      clientReadOnly: true,
      hasLoadError: true,
      initialLoadSettled: false,
      partial: false,
      requestPending: false,
      source: "UNRESOLVED",
    }),
    {
      clientDataWarningVisible: false,
      clientHostWarningVisible: false,
      clientPartialWarningVisible: false,
      loadErrorVisible: true,
    },
  );
});

test("composite client snapshots identify stale or unavailable secondary slices", () => {
  assert.equal(
    isClientCompositeSnapshotPartial({
      primarySource: "LIVE",
      secondarySources: ["LIVE", "CACHED"],
    }),
    true,
  );
  assert.equal(
    isClientCompositeSnapshotPartial({
      primarySource: "LIVE",
      secondarySources: ["LIVE", "OFFLINE"],
    }),
    true,
  );
  assert.equal(
    isClientCompositeSnapshotPartial({
      primarySource: "CACHED",
      secondarySources: ["LIVE", "CACHED"],
    }),
    false,
  );
  assert.equal(
    isClientCompositeSnapshotPartial({
      primarySource: "CACHED",
      secondarySources: ["CACHED", "OFFLINE"],
    }),
    true,
  );
  assert.equal(
    isClientCompositeSnapshotPartial({
      primarySource: "OFFLINE",
      secondarySources: ["CACHED", "OFFLINE"],
    }),
    false,
  );
});

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
