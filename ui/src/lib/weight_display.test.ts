import test from "node:test";
import assert from "node:assert/strict";
import { formatGrams, parseNonNegativeWeight, parsePositiveWeight } from "./weight_display";

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

test("parseNonNegativeWeight accepts zero and safe whole grams without partial parsing", () => {
  for (const [raw, expected] of [["0", 0], [" 850 ", 850], ["00850", 850], [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER]] as const) {
    assert.equal(parseNonNegativeWeight(raw), expected);
  }
  for (const raw of ["", " ", "-1", "2.5", "850 g", "1e3", "+2", "Infinity", String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(parseNonNegativeWeight(raw), null, raw);
  }
});
