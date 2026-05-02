import test from "node:test";
import assert from "node:assert/strict";
import { formatGrams, parsePositiveWeight } from "./weight_display";

test("formatGrams clamps negative values and supports empty display modes", () => {
  assert.equal(formatGrams(125), "125 g");
  assert.equal(formatGrams(-12), "0 g");
  assert.equal(formatGrams(null), "—");
  assert.equal(formatGrams(undefined, "zero"), "0 g");
});

test("parsePositiveWeight returns fallback for invalid or non-positive values", () => {
  assert.equal(parsePositiveWeight("850", 1000), 850);
  assert.equal(parsePositiveWeight("0", 1000), 1000);
  assert.equal(parsePositiveWeight("-2", 1000), 1000);
  assert.equal(parsePositiveWeight("nope", 750), 750);
});
