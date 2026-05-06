import assert from "node:assert/strict";
import test from "node:test";

import { formatDateTime, parseDateTime, parseDateTimeMs } from "./date_time";

test("parseDateTimeMs treats sqlite timestamps without timezone as UTC", () => {
  assert.equal(parseDateTimeMs("2026-04-28 22:12:08"), Date.UTC(2026, 3, 28, 22, 12, 8));
});

test("parseDateTimeMs preserves explicit timezone offsets", () => {
  assert.equal(parseDateTimeMs("2026-04-28T22:12:08+02:00"), Date.UTC(2026, 3, 28, 20, 12, 8));
});

test("parseDateTime returns a Date for valid timestamps", () => {
  assert.equal(parseDateTime("2026-04-28 22:12:08")?.toISOString(), "2026-04-28T22:12:08.000Z");
});

test("formatDateTime returns the raw input for invalid timestamps", () => {
  assert.equal(formatDateTime("not-a-date", "nb"), "not-a-date");
});
