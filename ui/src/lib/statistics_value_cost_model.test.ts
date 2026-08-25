import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStatisticsMoney,
  groupStatisticsCurrencyAmounts,
  statisticsCoveragePercent,
  statisticsMissingReasonFilamentDefaultsTarget,
  statisticsMissingReasonLabel,
} from "./statistics_value_cost_model";
import type { StatisticsMonetarySummary } from "./tauri_client";

function summary(overrides: Partial<StatisticsMonetarySummary> = {}): StatisticsMonetarySummary {
  return {
    totals: [],
    coverage: {
      total_rows: 0,
      valued_rows: 0,
      unvalued_rows: 0,
      covered_grams: 0,
      uncovered_grams: 0,
      missing_reasons: [],
      trace_total_rows: 0,
      trace_returned_rows: 0,
      trace_truncated: false,
    },
    ...overrides,
  };
}

test("currency totals remain separate by currency and ownership", () => {
  const groups = groupStatisticsCurrencyAmounts(
    summary({
      totals: [
        { currency: "NOK", ownership_type: "OWNED", amount: 125 },
        { currency: "USD", ownership_type: "OWNED", amount: 40 },
        { currency: "NOK", ownership_type: "BORROWED_IN", amount: 20 },
      ],
    }),
  );

  assert.deepEqual(groups, [
    {
      currency: "NOK",
      owned: { currency: "NOK", ownership_type: "OWNED", amount: 125 },
      borrowedIn: { currency: "NOK", ownership_type: "BORROWED_IN", amount: 20 },
    },
    {
      currency: "USD",
      owned: { currency: "USD", ownership_type: "OWNED", amount: 40 },
      borrowedIn: null,
    },
  ]);
});

test("purchase-data gaps target the matching filament-default control", () => {
  assert.equal(
    statisticsMissingReasonFilamentDefaultsTarget("purchase_currency_missing"),
    "DEFAULT_CURRENCY",
  );
  assert.equal(
    statisticsMissingReasonFilamentDefaultsTarget("purchase_price_invalid"),
    "GROUP_PRICING",
  );
  assert.equal(
    statisticsMissingReasonFilamentDefaultsTarget("remaining_weight_missing"),
    null,
  );
});

test("money formatting keeps the ISO currency visible", () => {
  assert.match(formatStatisticsMoney(1234.5, "NOK", "en"), /NOK/);
  assert.match(formatStatisticsMoney(12, "USD", "nb"), /USD/);
});

test("coverage is derived only from authoritative row counts", () => {
  assert.equal(
    statisticsCoveragePercent(
      summary({
        coverage: {
          total_rows: 4,
          valued_rows: 3,
          unvalued_rows: 1,
          covered_grams: 750,
          uncovered_grams: 250,
          missing_reasons: [],
          trace_total_rows: 4,
          trace_returned_rows: 4,
          trace_truncated: false,
        },
      }),
    ),
    75,
  );
  assert.equal(statisticsCoveragePercent(summary()), null);
});

test("all backend missing-data reason tokens have readable labels", () => {
  const reasons = [
    "spool_missing",
    "remaining_weight_missing",
    "remaining_weight_invalid",
    "used_weight_missing",
    "used_weight_invalid",
    "initial_weight_missing",
    "initial_weight_invalid",
    "purchase_price_missing",
    "purchase_price_invalid",
    "purchase_currency_missing",
    "purchase_currency_invalid",
    "calculation_invalid",
  ];
  const t = (_key: string, fallback = "") => fallback;

  for (const reason of reasons) {
    const label = statisticsMissingReasonLabel(t, reason);
    assert.ok(label.length > 0);
    assert.doesNotMatch(label, /_/);
  }
});
