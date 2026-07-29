import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveAmsRemainingGrams,
  finiteAmsWeightNumber,
  formatAmsWeightEstimate,
  formatAmsWeightNumber,
  saneAmsRemainingGrams,
  saneAmsRemainingPercent,
  saneAmsSpoolWeight,
} from "./ams_weight_estimate";

test("AMS weight helpers format estimates and basis values consistently", () => {
  assert.equal(formatAmsWeightNumber(42), "42");
  assert.equal(formatAmsWeightNumber(42.5), "42.5");
  assert.equal(finiteAmsWeightNumber(Number.NaN), null);
  assert.equal(finiteAmsWeightNumber(0), 0);
  assert.equal(deriveAmsRemainingGrams(76, 1000), 760);
  assert.equal(deriveAmsRemainingGrams(33, 250), 83);
  assert.equal(deriveAmsRemainingGrams(105, 1000), null);
  assert.equal(deriveAmsRemainingGrams(50, -1000), null);
  assert.equal(saneAmsRemainingGrams(-1), null);
  assert.equal(saneAmsRemainingGrams(0), 0);
  assert.equal(saneAmsRemainingPercent(-1), null);
  assert.equal(saneAmsRemainingPercent(101), null);
  assert.equal(saneAmsRemainingPercent(0), 0);
  assert.equal(saneAmsSpoolWeight(0), null);
  assert.equal(saneAmsSpoolWeight(1000), 1000);

  assert.equal(
    formatAmsWeightEstimate({
      remainingGrams: 760,
      remainingPercent: 76,
      trayWeightG: 1000,
    }),
    "AMS estimate: 760 g / 1,000 g · 76%",
  );
  assert.equal(
    formatAmsWeightEstimate({ remainingGrams: 735, trayWeightG: 1000 }),
    "AMS estimate: 735 g / 1,000 g",
  );
  assert.equal(
    formatAmsWeightEstimate({ remainingPercent: 12.5 }),
    "AMS estimate: 12.5%",
  );
  assert.equal(
    formatAmsWeightEstimate({ basisLabel: "Basis", trayWeightG: 250 }),
    "Basis: 250 g",
  );
  assert.equal(
    formatAmsWeightEstimate({
      locale: "nb",
      remainingGrams: 735.5,
      remainingPercent: 73.5,
      trayWeightG: 1000,
    }),
    "AMS estimate: 735,5 g / 1\u00a0000 g · 73,5\u00a0%",
  );
  assert.equal(
    formatAmsWeightEstimate({
      remainingGrams: -5,
      remainingPercent: 105,
      trayWeightG: -1000,
    }),
    null,
  );
  assert.equal(formatAmsWeightEstimate({}), null);
});
