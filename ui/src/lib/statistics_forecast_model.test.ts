import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsumptionForecast,
  formatForecastDate,
} from "./statistics_forecast_model";
import {
  normalizeSpoolWithMasterRow,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import type { SpoolWithMasterRow } from "./tauri_client";

function spool({
  current,
  initial,
  ownership = "OWNED",
  remaining,
  status = "IN_STOCK",
}: {
  current?: number | null;
  initial?: number | null;
  ownership?: string;
  remaining?: number | null;
  status?: string;
}): NormalizedSpoolWithMasterRow {
  return normalizeSpoolWithMasterRow({
    spool: {
      current_weight_g: current,
      initial_weight_g: initial,
      ownership_type: ownership,
      remaining_g: remaining,
      status,
    },
  } as SpoolWithMasterRow);
}

test("forecast uses owned on-hand stock and the explicit 30-day usage basis", () => {
  const result = buildConsumptionForecast({
    asOfDate: "2026-08-21",
    ownedConsumption30d: 3_000,
    spools: [
      spool({ remaining: 900 }),
      spool({ current: 600, remaining: null, status: "ASSIGNED" }),
      spool({ ownership: "BORROWED_IN", remaining: 700 }),
      spool({ remaining: 500, status: "EMPTY" }),
      spool({ initial: 400, remaining: null, status: "LOST" }),
    ],
  });

  assert.equal(result.ownedOnHandSpoolCount, 2);
  assert.equal(result.ownedOnHandGrams, 1_500);
  assert.equal(result.usageBasisGrams, 3_000);
  assert.equal(result.averageDailyUsageGrams, 100);
  assert.equal(result.projectedUsageGrams, 3_000);
  assert.equal(result.projectedRemainingGrams, 0);
  assert.equal(result.daysOfSupply, 15);
  assert.equal(result.estimatedDepletionDate, "2026-09-05");
});

test("forecast remains informational when no recorded usage basis exists", () => {
  const result = buildConsumptionForecast({
    asOfDate: "2026-08-21",
    ownedConsumption30d: 0,
    spools: [spool({ remaining: 850 })],
  });

  assert.equal(result.hasUsageBasis, false);
  assert.equal(result.daysOfSupply, null);
  assert.equal(result.estimatedDepletionDate, null);
  assert.equal(result.projectedUsageGrams, 0);
  assert.equal(result.projectedRemainingGrams, 850);
});

test("forecast is deterministic for identical inputs and clamps invalid grams", () => {
  const input = {
    asOfDate: "2026-08-21",
    ownedConsumption30d: -200,
    spools: [spool({ remaining: Number.NaN }), spool({ remaining: -50 })],
  };

  assert.deepEqual(buildConsumptionForecast(input), buildConsumptionForecast(input));
  assert.equal(buildConsumptionForecast(input).ownedOnHandGrams, 0);
});

test("forecast date formatting uses calendar dates without timezone drift", () => {
  assert.equal(formatForecastDate("2026-09-05", "en"), "Sep 5, 2026");
  assert.equal(formatForecastDate("not-a-date", "en"), "not-a-date");
});
