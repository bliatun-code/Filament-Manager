import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./statistics.tsx", import.meta.url), "utf8");

test("headline metrics keep readable card widths before the extra-wide breakpoint", () => {
  assert.match(
    source,
    /content-section grid grid-cols-1 gap-3 min-\[720px\]:grid-cols-2 xl:grid-cols-4/,
  );
  assert.doesNotMatch(source, /gap-3 md:grid-cols-4/);
});

test("period metrics use the selected range while slot count remains a current snapshot", () => {
  assert.match(
    source,
    /statistics\.totalConsumption[\s\S]*trend=\{periodRangeLabel\}/,
  );
  assert.match(source, /statistics\.loggedJobs[\s\S]*trend=\{periodRangeLabel\}/);
  assert.match(
    source,
    /statistics\.activeAms[\s\S]*trend=\{t\("statistics\.currentSnapshot", "Current snapshot"\)\}/,
  );
  assert.match(source, /actionLabel=\{periodReport \? t\("statistics\.viewDetails"/);
  assert.match(source, /opensDialog=\{periodReport != null\}/);
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
