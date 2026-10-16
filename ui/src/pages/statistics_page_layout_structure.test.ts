import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./statistics.tsx", import.meta.url), "utf8");
const consumptionSource = readFileSync(new URL("./statistics_consumption_panel.tsx", import.meta.url), "utf8");

test("a dominant period summary replaces equal-weight cards without squeezing its compact metrics", () => {
  assert.match(source, /<StatisticsConsumptionPanel/);
  assert.doesNotMatch(source, /<StatCard/);
  assert.match(consumptionSource, /grid-cols-1[\s\S]*lg:grid-cols-\[minmax\(0,1\.5fr\)_minmax\(15rem,1fr\)\]/);
  assert.match(consumptionSource, /text-4xl[\s\S]*sm:text-5xl/);
  assert.equal((consumptionSource.match(/<CompactMetric/g) ?? []).length, 3);
});

test("period metrics use the selected range while slot count remains a current snapshot", () => {
  assert.match(source, /<StatisticsPeriodPicker/);
  assert.match(source, /<StatisticsConsumptionPanel[\s\S]*periodLabel=\{periodRangeLabel\}[\s\S]*report=\{periodReport\}/);
  assert.match(consumptionSource, /report\.total_used_g/);
  assert.match(
    consumptionSource,
    /annotation=\{t\("statistics\.currentSnapshot", "Current snapshot"\)\}[\s\S]*statistics\.activeAms/,
  );
  assert.match(consumptionSource, /disabled=\{!periodAvailable \|\| !tauri\}/);
  assert.match(consumptionSource, /onOpenMetric\("LOGGED_JOBS"\)/);
  assert.match(consumptionSource, /onOpenMetric\("FAILED_JOBS"\)/);
  assert.match(consumptionSource, /onOpenMetric\("ACTIVE_SLOTS"\)/);
});

test("analysis views share one persistent reporting period and preserve all advanced panels", () => {
  assert.equal((source.match(/<StatisticsPeriodPicker/g) ?? []).length, 1);
  for (const view of ["CONSUMPTION", "VALUE", "PRINTERS"]) {
    assert.match(source, new RegExp(`<StatisticsAnalysisPanel activeView=\\{analysisView\\} view="${view}"`));
  }
  assert.match(source, /<details[\s\S]*statistics\.showForecast[\s\S]*<StatisticsForecastPanel/);
  assert.match(source, /<details[\s\S]*statistics\.ownershipDetails[\s\S]*<StatisticsOwnershipSnapshotPanel/);
  assert.match(source, /<details[\s\S]*statistics\.loanUsageDetails[\s\S]*<StatisticsOutboundLoanUsagePanel[\s\S]*<StatisticsInboundLoanUsagePanel/);
  assert.match(source, /view="VALUE">[\s\S]*<StatisticsValueCostPanel/);
  assert.match(source, /view="PRINTERS">[\s\S]*<StatisticsPerPrinterUsagePanel/);
  assert.match(source, /<\/StatisticsAnalysisPanel>[\s\S]*\{showConsumptionModal \?/);
});

test("data-backed desktop QA waits for statistics before opening or scrolling", () => {
  assert.match(source, /if \(loading \|\| error\)/);
  assert.match(
    source,
    /statistics-consumption[\s\S]*if \(desktopVisualQaActionStartedRef\.current\)/,
  );
  assert.match(
    source,
    /statistics-consumption[\s\S]*openConsumptionModal\(\)/,
  );
  assert.match(
    source,
    /statistics-loans[\s\S]*getElementById\("statistics-outbound-loan-usage"\)[\s\S]*scrollIntoView/,
  );
  assert.match(source, /window\.addEventListener\("resize", revealLoanUsage\)/);
  assert.match(source, /new ResizeObserver\(revealLoanUsage\)/);
  assert.match(source, /\[150, 450, 900\]\.map/);
  assert.match(
    source,
    /statistics-borrower[\s\S]*DESKTOP_VISUAL_QA_BORROWER_NAME[\s\S]*void openBorrowerModal\(borrower, "OUTBOUND"\)/,
  );
});

test("cached statistics use one settled Host warning", () => {
  assert.match(
    source,
    /shouldShowClientSnapshotWarning\(\{[\s\S]*initialLoadSettled: !loading/,
  );
  assert.match(source, /\{clientHostWarningVisible && !error \? \(/);
  assert.match(source, /<PageDataFallbackBanner/);
  assert.match(source, /clientStatsSource === "PARTIAL" \? "CACHED" : clientStatsSource/);
  assert.match(source, /clientStatsSource === "PARTIAL"[\s\S]*errors\.requestFailed/);
  assert.match(
    source,
    /clientStatsSource === "CACHED" \|\| clientStatsSource === "PARTIAL"[\s\S]*periodStatus !== "AVAILABLE"[\s\S]*statistics\.periodDetailsUnavailable/,
  );
  assert.match(
    source,
    /!loading && tauri && clientStatsSource === "LIVE" && periodStatus !== "AVAILABLE"/,
  );
  assert.match(source, /onRetry=\{\(\) => void reloadData\(\)\}/);
});
