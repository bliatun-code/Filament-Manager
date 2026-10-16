import assert from "node:assert/strict";
import test from "node:test";
import type { FilamentConsumptionRow } from "../lib/tauri_client";
import {
  buildStatisticsMaterialBreakdown,
  nextStatisticsAnalysisView,
} from "./statistics_analysis_model";

const row = (overrides: Partial<FilamentConsumptionRow> = {}): FilamentConsumptionRow => ({
  material: "PLA", filament_name: "Basic", color_name: "Red", hex_color: "#ff0000",
  vendor: "Bambu Lab", ownership_type: "OWNED", used_grams: 200, jobs: 2, ...overrides,
});

test("material overview sums actual rows without inventing job counts or time buckets", () => {
  const input = [
    row(), row({ used_grams: 50, ownership_type: "BORROWED_IN", printer_id: "second" }),
    row({ hex_color: "#0000ff", used_grams: 250 }),
    row({ material: "PETG", used_grams: 100, hex_color: "multi(#0f0,#ff0)" }),
  ];
  const result = buildStatisticsMaterialBreakdown(input);
  assert.deepEqual(result, [
    { material: "PLA", usedGrams: 500, colors: [
      { color: "#FF0000", usedGrams: 250 }, { color: "#0000FF", usedGrams: 250 },
    ] },
    { material: "PETG", usedGrams: 100, colors: [{ color: "multi(#0F0,#FF0)", usedGrams: 100 }] },
  ]);
  assert.equal(input[0].hex_color, "#ff0000");
});

test("invalid and zero weights never produce fabricated bars; unknown colors remain neutral", () => {
  assert.deepEqual(buildStatisticsMaterialBreakdown([
    row({ used_grams: 0 }), row({ used_grams: -5 }), row({ used_grams: Number.NaN }),
    row({ used_grams: Infinity }), row({ material: " ", hex_color: "url(unsafe)", used_grams: 30 }),
  ]), [{ material: "", usedGrams: 30, colors: [{ color: null, usedGrams: 30 }] }]);
  assert.deepEqual(buildStatisticsMaterialBreakdown([]), []);
});

test("analysis tabs wrap with arrows and support Home/End without handling unrelated keys", () => {
  assert.equal(nextStatisticsAnalysisView("CONSUMPTION", "ArrowLeft"), "PRINTERS");
  assert.equal(nextStatisticsAnalysisView("PRINTERS", "ArrowRight"), "CONSUMPTION");
  assert.equal(nextStatisticsAnalysisView("CONSUMPTION", "ArrowRight"), "VALUE");
  assert.equal(nextStatisticsAnalysisView("PRINTERS", "Home"), "CONSUMPTION");
  assert.equal(nextStatisticsAnalysisView("VALUE", "End"), "PRINTERS");
  assert.equal(nextStatisticsAnalysisView("VALUE", "Tab"), null);
  assert.equal(nextStatisticsAnalysisView("VALUE", "ArrowDown"), null);
});
