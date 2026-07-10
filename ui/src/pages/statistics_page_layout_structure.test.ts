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

test("total consumption is explicitly all-time and every headline card opens details", () => {
  assert.match(
    source,
    /statistics\.totalConsumption[\s\S]*trend=\{t\("statistics\.allTime", "All time"\)\}/,
  );
  assert.equal((source.match(/actionLabel=\{t\("statistics\.viewDetails"/g) ?? []).length, 4);
  assert.equal((source.match(/\sopensDialog\s/g) ?? []).length, 4);
});

test("data-backed desktop QA waits for statistics before opening or scrolling", () => {
  assert.match(source, /if \(loading \|\| error\)/);
  assert.match(
    source,
    /statistics-consumption[\s\S]*if \(desktopVisualQaActionStartedRef\.current\)/,
  );
  assert.match(
    source,
    /statistics-consumption[\s\S]*void openConsumptionModal\(\)/,
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
