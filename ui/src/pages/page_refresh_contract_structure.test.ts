import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageFiles = ["dashboard.tsx", "printers.tsx", "loans.tsx", "statistics.tsx"];
const dataOwnerFiles = [
  "use_dashboard_page_data.ts",
  "use_printer_page_data.ts",
  "loans.tsx",
  "use_statistics_page_data.ts",
];

test("primary data pages expose the shared localized refresh action", () => {
  for (const file of pageFiles) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(source, /PageRefreshButton/, file);
    assert.match(source, /t\("common\.refresh", "Refresh"\)/, file);
  }
});

test("primary data pages share stale-while-refreshing state semantics", () => {
  for (const file of dataOwnerFiles) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(source, /usePageRefreshState/, file);
    assert.match(source, /completeRefresh\(\)/, file);
    assert.match(source, /failRefresh\(/, file);
  }
});
