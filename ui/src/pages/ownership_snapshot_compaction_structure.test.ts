import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync(new URL("./dashboard_panels.tsx", import.meta.url), "utf8");
const statisticsSource = readFileSync(
  new URL("./statistics_overview_panels.tsx", import.meta.url),
  "utf8",
);

test("dashboard snapshot keeps its compact all-zero status", () => {
  assert.match(dashboardSource, /hasBorrowedInStock/);
  assert.match(dashboardSource, /dashboard\.noBorrowedInStock/);
});

test("statistics snapshot keeps explicit borrowed-in zero metrics", () => {
  assert.doesNotMatch(statisticsSource, /hasBorrowedInActivity/);
  assert.match(statisticsSource, /data-ownership=\{ownership\}/);
  assert.match(statisticsSource, /borrowedInOnHand/);
  assert.match(statisticsSource, /borrowedInPrintUsage30d/);
  assert.match(statisticsSource, /borrowedInInUse/);
  assert.match(statisticsSource, /borrowedInLowStock/);
});
