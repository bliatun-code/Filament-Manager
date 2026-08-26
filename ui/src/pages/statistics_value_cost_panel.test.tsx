import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  StatisticsInventoryValueTraceRow,
  StatisticsMaterialCostTraceRow,
  StatisticsMonetarySummary,
  StatisticsValueCostReport,
} from "../lib/tauri_client";
import { statisticsMissingReasonOpensFilamentDefaults } from "../lib/statistics_value_cost_model";
import {
  InventoryValueTraceCard,
  MaterialCostTraceCard,
  StatisticsValueCostPanel,
} from "./statistics_value_cost_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t = (
  _key: string,
  fallback = "",
  params: Record<string, string | number> = {},
) =>
  Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    fallback,
  );

function monetarySummary(
  overrides: Partial<StatisticsMonetarySummary> = {},
): StatisticsMonetarySummary {
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

const report: StatisticsValueCostReport = {
  inventory_value: monetarySummary({
    totals: [
      { currency: "NOK", ownership_type: "OWNED", amount: 125 },
      { currency: "NOK", ownership_type: "BORROWED_IN", amount: 20 },
      { currency: "USD", ownership_type: "OWNED", amount: 40 },
    ],
    coverage: {
      total_rows: 4,
      valued_rows: 3,
      unvalued_rows: 1,
      covered_grams: 750,
      uncovered_grams: 250,
      missing_reasons: [
        { reason: "purchase_price_missing", rows: 1, grams: 250 },
      ],
      trace_total_rows: 4,
      trace_returned_rows: 4,
      trace_truncated: false,
    },
  }),
  material_cost: monetarySummary({
    totals: [{ currency: "EUR", ownership_type: "OWNED", amount: 12 }],
    coverage: {
      total_rows: 1,
      valued_rows: 1,
      unvalued_rows: 0,
      covered_grams: 100,
      uncovered_grams: 0,
      missing_reasons: [],
      trace_total_rows: 1,
      trace_returned_rows: 1,
      trace_truncated: false,
    },
  }),
  inventory_trace: [],
  material_cost_trace: [],
};

test("value and cost panel keeps currencies and ownership totals visibly separate", () => {
  const html = renderToStaticMarkup(
    <StatisticsValueCostPanel
      hostUpgradeRequired={false}
      loading={false}
      locale="en"
      periodLabel="1–31 Aug 2026"
      report={report}
      t={t}
    />,
  );

  assert.equal((html.match(/data-currency="NOK"/g) ?? []).length, 1);
  assert.equal((html.match(/data-currency="USD"/g) ?? []).length, 1);
  assert.equal((html.match(/data-currency="EUR"/g) ?? []).length, 1);
  assert.match(html, /Owned/);
  assert.match(html, /Borrowed in/);
  assert.match(html, /3 of 4 rows valued/);
  assert.match(html, /Purchase price is missing/);
  assert.match(html, /aria-valuenow="75"/);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /145\.00/);
});

test("purchase price and currency coverage gaps open filament defaults accessibly", () => {
  const actionableReport: StatisticsValueCostReport = {
    ...report,
    inventory_value: monetarySummary({
      coverage: {
        total_rows: 5,
        valued_rows: 0,
        unvalued_rows: 5,
        covered_grams: 0,
        uncovered_grams: 1_000,
        missing_reasons: [
          { reason: "purchase_price_missing", rows: 1, grams: 200 },
          { reason: "purchase_price_invalid", rows: 1, grams: 200 },
          { reason: "purchase_currency_missing", rows: 1, grams: 200 },
          { reason: "purchase_currency_invalid", rows: 1, grams: 200 },
          { reason: "remaining_weight_missing", rows: 1, grams: 200 },
        ],
        trace_total_rows: 5,
        trace_returned_rows: 5,
        trace_truncated: false,
      },
    }),
  };
  const html = renderToStaticMarkup(
    <StatisticsValueCostPanel
      hostUpgradeRequired={false}
      loading={false}
      locale="en"
      onOpenFilamentDefaults={() => {}}
      periodLabel="1–31 Aug 2026"
      report={actionableReport}
      t={t}
    />,
  );

  assert.equal((html.match(/Open filament defaults/g) ?? []).length, 4);
  assert.match(html, /aria-label="Purchase price is missing\. Open filament defaults"/);
  assert.match(html, /aria-label="Purchase currency is invalid\. Open filament defaults"/);
  assert.doesNotMatch(
    html,
    /aria-label="Remaining weight is missing\. Open filament defaults"/,
  );
  assert.equal(statisticsMissingReasonOpensFilamentDefaults("purchase_price_missing"), true);
  assert.equal(statisticsMissingReasonOpensFilamentDefaults("purchase_currency_invalid"), true);
  assert.equal(statisticsMissingReasonOpensFilamentDefaults("remaining_weight_missing"), false);
});

test("client coverage gaps point to the Host without exposing a local settings action", () => {
  const html = renderToStaticMarkup(
    <StatisticsValueCostPanel
      filamentDefaultsManagedOnHost
      hostUpgradeRequired={false}
      loading={false}
      locale="en"
      onOpenFilamentDefaults={() => {}}
      periodLabel="1–31 Aug 2026"
      report={report}
      t={t}
    />,
  );

  assert.match(
    html,
    /Manage library-wide filament defaults on the Host desktop app\./,
  );
  assert.doesNotMatch(html, /Open filament defaults/);
  assert.doesNotMatch(html, /aria-label="Purchase price is missing\./);
});

test("legacy Host state asks for an upgrade and never invents a local total", () => {
  const html = renderToStaticMarkup(
    <StatisticsValueCostPanel
      hostUpgradeRequired
      loading={false}
      locale="en"
      periodLabel="1–31 Aug 2026"
      report={null}
      t={t}
    />,
  );

  assert.match(html, /This Host predates value and cost reporting/);
  assert.match(html, /Update the Host/);
  assert.doesNotMatch(html, /data-currency=|0\.00/);
});

test("coverage does not present an unknown weight as zero grams", () => {
  const missingWeightReport: StatisticsValueCostReport = {
    ...report,
    material_cost: monetarySummary({
      coverage: {
        total_rows: 1,
        valued_rows: 0,
        unvalued_rows: 1,
        covered_grams: 0,
        uncovered_grams: 0,
        missing_reasons: [
          { reason: "used_weight_missing", rows: 1, grams: 0 },
        ],
        trace_total_rows: 1,
        trace_returned_rows: 1,
        trace_truncated: false,
      },
    }),
  };
  const html = renderToStaticMarkup(
    <StatisticsValueCostPanel
      hostUpgradeRequired={false}
      loading={false}
      locale="en"
      periodLabel="1–31 Aug 2026"
      report={missingWeightReport}
      t={t}
    />,
  );

  assert.match(html, /Used weight is missing/);
  assert.match(html, /weight unavailable/);
  assert.match(html, /not counted as zero/);
  assert.doesNotMatch(html, /Used weight is missing[\s\S]*1 rows · 0 g/);
});

test("inventory trace labels missing remaining weight instead of showing zero", () => {
  const row: StatisticsInventoryValueTraceRow = {
    spool_id: "spool-1",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Black",
    vendor: "Bambu Lab",
    status: "IN_STOCK",
    ownership_type: "OWNED",
    remaining_g: null,
    initial_weight_g: 1000,
    purchase_price: 249,
    purchase_currency: "NOK",
    amount: null,
    missing_reasons: ["remaining_weight_missing"],
  };
  const html = renderToStaticMarkup(
    <InventoryValueTraceCard locale="en" row={row} t={t} />,
  );

  assert.match(html, /Remaining[\s\S]*Not recorded/);
  assert.match(html, /Not valued/);
  assert.match(html, /Remaining weight is missing/);
  assert.match(html, /Spool reference: spool-1/);
  assert.doesNotMatch(html, />0 g</);
});

test("usage trace makes missing spool, ownership and used weight explicit", () => {
  const row: StatisticsMaterialCostTraceRow = {
    usage_id: "usage-legacy",
    source: "MANUAL",
    spool_id: null,
    printer_id: "printer-1",
    job_name: "Bracket",
    status: "FAILED",
    used_at: "2026-08-20T12:00:00Z",
    material: "PETG",
    filament_name: "HF",
    color_name: "Gray",
    vendor: "Generic",
    ownership_type: null,
    used_g: null,
    initial_weight_g: null,
    purchase_price: null,
    purchase_currency: null,
    amount: null,
    missing_reasons: ["spool_missing", "used_weight_missing"],
  };
  const html = renderToStaticMarkup(
    <MaterialCostTraceCard locale="en" row={row} t={t} />,
  );

  assert.equal((html.match(/Spool unavailable/g) ?? []).length, 2);
  assert.match(html, /Used[\s\S]*Not recorded/);
  assert.match(html, />Failed</);
  assert.match(html, /The referenced spool is missing/);
  assert.match(html, /Used weight is missing/);
  assert.match(html, /Usage reference: usage-legacy/);
  assert.doesNotMatch(html, />0 g</);
});
