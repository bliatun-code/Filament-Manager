import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loan_history_card.tsx", import.meta.url), "utf8");

test("LoanHistoryCard return action keeps focus-visible treatment", () => {
  assert.match(source, /loanHistoryReturnButtonClassName/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /disabled:cursor-not-allowed/);
  assert.doesNotMatch(
    source,
    /shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2\.5 py-1 text-\[11px\] font-semibold text-emerald-800 shadow-sm shadow-emerald-200\/25 transition/,
  );
});
