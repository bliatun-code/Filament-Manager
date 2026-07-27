import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_document_visible_polling.ts", import.meta.url),
  "utf8",
);

test("document-visible polling pauses while hidden and resumes immediately", () => {
  assert.match(source, /document\.visibilityState !== "hidden"/);
  assert.match(source, /document\.addEventListener\("visibilitychange"/);
  assert.match(source, /if \(!documentAllowsPolling\(\)\) \{\s*clearTimer\(\)/);
  assert.match(source, /consecutiveFailures = 0;\s*trigger\(\)/);
});

test("document-visible polling schedules bounded backoff after explicit failures", () => {
  assert.match(source, /\(await pollRef\.current\(\)\) !== false/);
  assert.match(source, /boundedPollingBackoffDelay/);
  assert.match(source, /failureMaxDelayMs/);
});
