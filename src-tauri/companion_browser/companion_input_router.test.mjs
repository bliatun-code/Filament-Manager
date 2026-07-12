import test from "node:test";
import assert from "node:assert/strict";

import { routeCompanionInputChange } from "./companion_input_router.js";

test("input router dispatches inventory, loan, and printer updates", () => {
  const calls = [];
  const handlers = {
    setInventorySearch(value) {
      calls.push(["inventory", value]);
    },
    setLoanSearch(value) {
      calls.push(["loan", value]);
    },
    setPrinterSpoolSearch(value) {
      calls.push(["printer", value]);
    },
    setBorrowedInDraftField() {
      return false;
    },
    render() {
      calls.push(["render"]);
    },
  };

  assert.equal(routeCompanionInputChange("inventory-search", "pla", handlers), true);
  assert.equal(routeCompanionInputChange("loan-search", "alex", handlers), true);
  assert.equal(routeCompanionInputChange("printer-spool-search", "petg", handlers), true);

  assert.deepEqual(calls, [
    ["inventory", "pla"],
    ["loan", "alex"],
    ["printer", "petg"],
  ]);
});

test("input router renders after add-filament draft field updates", () => {
  const calls = [];
  const handled = routeCompanionInputChange("filament-owner-name", "Alex", {
    setInventorySearch() {},
    setLoanSearch() {},
    setPrinterSpoolSearch() {},
    setBorrowedInDraftField(name, value) {
      calls.push([name, value]);
      return true;
    },
    render() {
      calls.push(["render"]);
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, [["filament-owner-name", "Alex"], ["render"]]);
});

test("input router returns false for unknown fields", () => {
  const handled = routeCompanionInputChange("unknown-field", "x", {
    setInventorySearch() {},
    setQrLookup() {},
    setLoanSearch() {},
    setPrinterSpoolSearch() {},
    setBorrowedInDraftField() {
      return false;
    },
    render() {},
  });

  assert.equal(handled, false);
});

test("input router dispatches the scalable locale select", () => {
  const calls = [];
  const handled = routeCompanionInputChange("app-locale", "fi-FI", {
    setLocale(value) {
      calls.push(value);
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, ["fi-FI"]);
});
