import assert from "node:assert/strict";
import test from "node:test";

import {
  canRefillSpoolStatus,
  nextLostToggleStatus,
  shouldReactivateSpoolFromMeasuredTotal,
} from "./inventory_spool_detail_actions_model";

test("selected spool refill actions only apply to empty statuses", () => {
  assert.equal(canRefillSpoolStatus("EMPTY"), true);
  assert.equal(canRefillSpoolStatus("empty"), true);
  assert.equal(canRefillSpoolStatus("IN_STOCK"), false);
  assert.equal(canRefillSpoolStatus("IN_USE"), false);
  assert.equal(canRefillSpoolStatus("loaned out"), false);
});

test("selected spool lost toggle normalizes legacy status aliases", () => {
  assert.equal(nextLostToggleStatus("LOST"), "IN_STOCK");
  assert.equal(nextLostToggleStatus("lost"), "IN_STOCK");
  assert.equal(nextLostToggleStatus("IN_USE"), "LOST");
  assert.equal(nextLostToggleStatus("loaned out"), "LOST");
  assert.equal(nextLostToggleStatus("EMPTY"), "LOST");
});

test("selected spool measured weight reactivates only non-empty remaining filament", () => {
  assert.equal(shouldReactivateSpoolFromMeasuredTotal("EMPTY", 251, 250), true);
  assert.equal(shouldReactivateSpoolFromMeasuredTotal("empty", 250, 250), false);
  assert.equal(shouldReactivateSpoolFromMeasuredTotal("EMPTY", 249, 250), false);
  assert.equal(shouldReactivateSpoolFromMeasuredTotal("LOST", 800, 250), false);
  assert.equal(shouldReactivateSpoolFromMeasuredTotal("IN_STOCK", 800, 250), false);
});
