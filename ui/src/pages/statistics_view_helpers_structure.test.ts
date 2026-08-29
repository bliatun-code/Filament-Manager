import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./statistics_view_helpers.ts", import.meta.url),
  "utf8",
);

test("statistics filter controls share focus-visible treatment", () => {
  assert.match(source, /statisticsFilterInputClass/);
  assert.match(source, /statisticsFilterSelectClass/);
  assert.match(source, /statisticsFilterButtonChromeClass/);
  assert.match(source, /statisticsFilterButtonClass/);
  assert.match(source, /statisticsInteractiveCardClass/);
  assert.equal((source.match(/app-form-control app-control-focus/g) ?? []).length, 2);
  assert.equal((source.match(/app-soft-control/g) ?? []).length, 1);
  assert.equal((source.match(/focus-visible:border-sky-300/g) ?? []).length, 1);
  assert.equal((source.match(/focus-visible:ring-sky-100/g) ?? []).length, 1);
  assert.equal((source.match(/dark:focus-visible:border-sky-400\/60/g) ?? []).length, 1);
});
