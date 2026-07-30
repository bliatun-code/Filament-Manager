import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_BACKED_ACCESSIBILITY_PAGES,
  formatAxeViolations,
  formatBrowserErrorDetails,
  parseDataBackedAccessibilityOptions,
} from "./run-data-backed-accessibility.mjs";

test("data-backed accessibility covers every desktop main page", () => {
  assert.deepEqual(
    DATA_BACKED_ACCESSIBILITY_PAGES.map(({ label }) => label),
    ["Dashboard", "Inventory", "Loans", "Printers", "Statistics", "Settings"],
  );
});

test("data-backed accessibility options stay deterministic in CI", () => {
  assert.deepEqual(parseDataBackedAccessibilityOptions([]), {
    headless: true,
    timeoutMs: 15_000,
  });
  assert.deepEqual(
    parseDataBackedAccessibilityOptions(["--headful", "--timeout-ms=30000"]),
    {
      headless: false,
      timeoutMs: 30_000,
    },
  );
  assert.throws(
    () => parseDataBackedAccessibilityOptions(["--timeout-ms=1.5"]),
    /positive integer/,
  );
});

test("axe violations retain page, rule, impact, target and failure summary", () => {
  assert.deepEqual(
    formatAxeViolations("Inventory", [
      {
        help: "Form elements must have labels",
        id: "label",
        impact: "critical",
        nodes: [
          {
            failureSummary: "Fix any of the following: Add a label",
            target: ["#search"],
          },
        ],
      },
    ]),
    [
      "Inventory: label (critical) at #search: Fix any of the following: Add a label",
    ],
  );
});

test("browser errors retain page, source, order and readable detail", () => {
  assert.equal(
    formatBrowserErrorDetails([
      new Error("Dashboard pageerror: render failed"),
      new Error("Printers console.error: request failed\nwith context"),
    ]),
    "  1. Dashboard pageerror: render failed\n" +
      "  2. Printers console.error: request failed with context",
  );
});
