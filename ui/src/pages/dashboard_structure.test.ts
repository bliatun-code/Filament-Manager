import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");

test("Dashboard header action button keeps shared focus treatment", () => {
  assert.match(source, /dashboardHeaderActionButtonClassName/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /focus-visible:ring-sky-100/);
  assert.match(source, /dark:focus-visible:border-sky-400\/60/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center gap-2 rounded-lg border border-slate-300\/70 bg-white\/86 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-300\/25 backdrop-blur transition hover:bg-white dark:border-slate-700\/70/,
  );
});
