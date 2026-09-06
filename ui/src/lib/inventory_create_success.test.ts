import assert from "node:assert/strict";
import test from "node:test";
import { inventoryCreateSessionReducer as reduce, newInventoryCreateSession } from "./inventory_create_success";

const receipt = Object.freeze({ spoolId: "committed-id", message: "Added captured filament" });

test("completed registration survives unrelated state and resets only at a session boundary", () => {
  const initial = newInventoryCreateSession("local-1");
  const completed = reduce(initial, { type: "completed", authorityKey: "local-1", sessionId: 0, receipt });
  assert.equal(completed.receipt, receipt);
  assert.equal(reduce(completed, { type: "authority", authorityKey: "local-1" }), completed);
  const next = reduce(completed, { type: "reset" });
  assert.equal(next.receipt, null);
  assert.equal(next.sessionId, 1);
  assert.equal(reduce(next, { type: "completed", authorityKey: "local-1", sessionId: 0, receipt }), next);
});

test("authority changes discard success and fence an old A completion after A to B to A", () => {
  const initial = newInventoryCreateSession("host-A-generation-1");
  const second = reduce(initial, { type: "authority", authorityKey: "host-B-generation-2" });
  const returned = reduce(second, { type: "authority", authorityKey: "host-A-generation-3" });
  assert.equal(returned.receipt, null);
  assert.equal(reduce(returned, { type: "completed", authorityKey: initial.authorityKey, sessionId: 0, receipt }), returned);
  assert.equal(reduce(returned, { type: "completed", authorityKey: returned.authorityKey, sessionId: 0, receipt }), returned);
  assert.equal(reduce(returned, { type: "completed", authorityKey: returned.authorityKey, sessionId: returned.sessionId, receipt }).receipt, receipt);
});
