import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageFiles = [
  "dashboard.tsx",
  "printers.tsx",
  "loans.tsx",
  "statistics.tsx",
];
const normalHeaderFiles = [
  ...pageFiles.map((file) => new URL(`./${file}`, import.meta.url)),
  new URL("../components/inventory_controls_panel.tsx", import.meta.url),
];
const loadErrorOwnerFiles = [
  ...pageFiles.map((file) => new URL(`./${file}`, import.meta.url)),
  new URL("../components/inventory_page_workspace.tsx", import.meta.url),
];
const dataOwnerFiles = [
  "use_dashboard_page_data.ts",
  "use_printer_page_data.ts",
  "loans.tsx",
  "use_statistics_page_data.ts",
];

test("primary data pages keep refresh controls out of normal page headers", () => {
  for (const file of normalHeaderFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /PageRefreshButton/, file.pathname);
  }
});

test("primary data pages only expose localized recovery after load errors", () => {
  for (const file of loadErrorOwnerFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /PageLoadErrorBanner/, file.pathname);
    assert.match(
      source,
      /t\("common\.refresh", "Refresh"\)/,
      file.pathname,
    );
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
