import test from "node:test";
import assert from "node:assert/strict";
import { formatGrams, parsePositiveWeight } from "./weight_display";

test("formatGrams clamps negative values and supports empty display modes", () => {
  assert.equal(formatGrams(125), "125 g");
  assert.equal(formatGrams(-12), "0 g");
  assert.equal(formatGrams(null), "—");
  assert.equal(formatGrams(undefined, "zero"), "0 g");
});

test("formatGrams localizes grouping and decimal separators", () => {
  assert.equal(formatGrams(1234.5, "dash", "en"), "1,234.5 g");
  assert.equal(formatGrams(1234.5, "dash", "nb"), "1\u00a0234,5 g");
});

test("parsePositiveWeight accepts only positive safe whole grams", () => {
  assert.equal(parsePositiveWeight("850"), 850);
  assert.equal(parsePositiveWeight(" 850 "), 850);
  assert.equal(parsePositiveWeight("0"), null);
  assert.equal(parsePositiveWeight("-2"), null);
  assert.equal(parsePositiveWeight("2.5"), null);
  assert.equal(parsePositiveWeight("850 g"), null);
  assert.equal(parsePositiveWeight(""), null);
  assert.equal(parsePositiveWeight(String(Number.MAX_SAFE_INTEGER + 1)), null);
});
