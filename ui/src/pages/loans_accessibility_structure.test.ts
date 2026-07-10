import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loans.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../index.css", import.meta.url), "utf8");

test("loan search and filters expose names and selected state", () => {
  assert.match(source, /type="search"\s+aria-label=\{t\(/);
  assert.match(source, /aria-labelledby="loan-direction-filter-label"/);
  assert.match(source, /aria-pressed=\{directionFilter === mode\}/);
  assert.match(source, /aria-labelledby="loan-status-filter-label"/);
  assert.match(source, /aria-pressed=\{filter === mode\}/);
});

test("loan result count includes a localized unit", () => {
  assert.match(source, /loanResultCountUnit/);
  assert.match(source, /loans\.resultCountOne/);
  assert.match(source, /loans\.resultCountMany/);
  assert.match(source, /aria-live="polite"/);
  const countPillRule = cssSource.match(/\.count-pill\s*\{([^}]+)\}/s)?.[1] ?? "";
  assert.match(countPillRule, /inline-flex/);
  assert.match(countPillRule, /shrink-0/);
  assert.match(countPillRule, /whitespace-nowrap/);
});

test("desktop QA can open the real inbound hand-back dialog", () => {
  assert.match(source, /desktopVisualQaScenario !== "return-inbound-loan"/);
  assert.match(
    source,
    /desktopVisualQaScenario === "return-inbound-loan"[\s\S]*DESKTOP_VISUAL_QA_INBOUND_SPOOL_ID[\s\S]*isInboundLoan\(loan\)/,
  );
  assert.match(source, /openReturnModal\(activeLoan\)/);
});
