import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readPageSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("statistics interactive cards share keyboard focus treatment", () => {
  const overviewPanels = readPageSource("statistics_overview_panels.tsx");
  const loanPanels = readPageSource("statistics_loan_panels.tsx");

  assert.match(overviewPanels, /statisticsInteractiveCardClass/);
  assert.match(loanPanels, /statisticsInteractiveCardClass/);
  assert.match(overviewPanels, /<button[\s\S]*aria-haspopup="dialog"/);
  assert.match(loanPanels, /<button[\s\S]*aria-haspopup="dialog"/);
  assert.match(overviewPanels, /statistics\.viewDetails/);
  assert.match(loanPanels, /statistics\.viewDetails/);
  assert.doesNotMatch(overviewPanels, /role="button"|tabIndex=\{0\}|onKeyDown/);
  assert.doesNotMatch(loanPanels, /role="button"|tabIndex=\{0\}|onKeyDown/);
  assert.doesNotMatch(
    overviewPanels,
    /cursor-pointer rounded-lg border p-3\.5 text-sm transition hover:-translate-y-0\.5/,
  );
  assert.doesNotMatch(
    loanPanels,
    /cursor-pointer rounded-2xl border border-slate-200 bg-slate-50\/85 px-4 py-3 text-sm transition hover:-translate-y-0\.5/,
  );
});
