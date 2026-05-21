import assert from "node:assert/strict";
import test from "node:test";

import { firstDefinedTimestamp } from "./source_timestamps";

test("firstDefinedTimestamp returns the first non-empty timestamp", () => {
  assert.equal(firstDefinedTimestamp(null, undefined, "", "2026-04-01"), "2026-04-01");
  assert.equal(firstDefinedTimestamp(null, undefined, ""), null);
});
