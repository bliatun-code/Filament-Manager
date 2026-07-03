import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("./statistics_metric_modal.tsx", import.meta.url), "utf8");
const primitivesSource = readFileSync(new URL("./statistics_primitives.tsx", import.meta.url), "utf8");

test("statistics metric modal uses shared printer metric cards", () => {
  assert.match(primitivesSource, /function StatisticsPrinterMetricCard/);
  assert.match(primitivesSource, /printerBrandSurfaceStyle/);
  assert.match(modalSource, /StatisticsPrinterMetricCard/);
  assert.doesNotMatch(modalSource, /printerBrandSurfaceStyle/);
  assert.doesNotMatch(modalSource, /className="rounded-2xl border p-4"/);
});
