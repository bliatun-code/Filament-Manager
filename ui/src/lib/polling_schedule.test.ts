import assert from "node:assert/strict";
import test from "node:test";

import { boundedPollingBackoffDelay } from "./polling_schedule";

test("polling backoff grows exponentially and stays bounded", () => {
  const delays = [1, 2, 3, 4, 5, 6].map((failureCount) =>
    boundedPollingBackoffDelay({
      failureCount,
      initialDelayMs: 1_000,
      maxDelayMs: 10_000,
    }),
  );

  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 10_000, 10_000]);
});

test("polling backoff normalizes invalid bounds and attempt counts", () => {
  assert.equal(
    boundedPollingBackoffDelay({
      failureCount: 0,
      initialDelayMs: -5,
      maxDelayMs: -10,
    }),
    0,
  );
  assert.equal(
    boundedPollingBackoffDelay({
      failureCount: 3.9,
      initialDelayMs: 2_000,
      maxDelayMs: 1_000,
    }),
    2_000,
  );
});
