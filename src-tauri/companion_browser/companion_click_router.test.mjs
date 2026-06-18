import test from "node:test";
import assert from "node:assert/strict";

import { routeCompanionClickAction } from "./companion_click_router.js";

function createTarget(attributes) {
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

test("click router dispatches root-flow changes", () => {
  const calls = [];
  const handled = routeCompanionClickAction(
    "set-root-flow",
    createTarget({
      "data-root-flow": "settings",
    }),
    {
      setRootFlow(flow) {
        calls.push(flow);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["settings"]);
});

test("click router dispatches theme, locale, and ownership actions", () => {
  const calls = [];
  const handledTheme = routeCompanionClickAction(
    "set-theme-mode",
    createTarget({
      "data-theme-mode": "dark",
    }),
    {
      setThemeMode(mode) {
        calls.push(["theme", mode]);
      },
    },
  );
  const handledLocale = routeCompanionClickAction(
    "set-locale",
    createTarget({
      "data-locale": "nb",
    }),
    {
      setLocale(locale) {
        calls.push(["locale", locale]);
      },
    },
  );
  const handledOwnership = routeCompanionClickAction(
    "set-filament-ownership",
    createTarget({
      "data-ownership-type": "BORROWED_IN",
    }),
    {
      setFilamentOwnership(mode) {
        calls.push(["ownership", mode]);
      },
    },
  );

  assert.equal(handledTheme, true);
  assert.equal(handledLocale, true);
  assert.equal(handledOwnership, true);
  assert.deepEqual(calls, [
    ["theme", "dark"],
    ["locale", "nb"],
    ["ownership", "BORROWED_IN"],
  ]);
});

test("click router dispatches add-spool source, catalog, and wishlist actions", () => {
  const calls = [];

  assert.equal(
    routeCompanionClickAction(
      "set-filament-source",
      createTarget({
        "data-filament-source": "esun",
      }),
      {
        setAddSpoolSource(value) {
          calls.push(["source", value]);
        },
      },
    ),
    true,
  );
  assert.equal(
    routeCompanionClickAction(
      "set-catalog-filter",
      createTarget({
        "data-catalog-filter": "DISCONTINUED",
      }),
      {
        setCatalogStatusFilter(value) {
          calls.push(["catalog", value]);
        },
      },
    ),
    true,
  );
  assert.equal(
    routeCompanionClickAction(
      "select-master",
      createTarget({
        "data-master-id": "master-1",
      }),
      {
        selectCatalogMaster(value) {
          calls.push(["master", value]);
        },
      },
    ),
    true,
  );
  assert.equal(
    routeCompanionClickAction(
      "set-wishlist-filter",
      createTarget({
        "data-wishlist-filter": "ON_ORDER",
      }),
      {
        setWishlistQueueFilter(value) {
          calls.push(["wishlist-filter", value]);
        },
      },
    ),
    true,
  );
  assert.equal(
    routeCompanionClickAction(
      "wishlist-update-status",
      createTarget({
        "data-wishlist-id": "wish-1",
        "data-wishlist-status": "RECEIVED",
      }),
      {
        submitWishlistStatus(itemId, status) {
          calls.push(["wishlist-status", itemId, status]);
        },
      },
    ),
    true,
  );
  assert.equal(
    routeCompanionClickAction(
      "wishlist-stock-now",
      createTarget({
        "data-wishlist-id": "wish-2",
      }),
      {
        submitWishlistStock(itemId) {
          calls.push(["wishlist-stock", itemId]);
        },
      },
    ),
    true,
  );

  assert.deepEqual(calls, [
    ["source", "esun"],
    ["catalog", "DISCONTINUED"],
    ["master", "master-1"],
    ["wishlist-filter", "ON_ORDER"],
    ["wishlist-status", "wish-1", "RECEIVED"],
    ["wishlist-stock", "wish-2"],
  ]);
});

test("click router dispatches slot-targeted printer loading", () => {
  const calls = [];
  const handled = routeCompanionClickAction(
    "start-printer-slot-assignment",
    createTarget({
      "data-printer-id": "printer-1",
      "data-printer-name": "P1S",
      "data-slot-id": "slot-4",
      "data-slot-index": "4",
      "data-slot-label": "AMS 1 · Slot 4",
    }),
    {
      startPrinterSlotAssignment(printerId, printerName, slotId, slotIndex, slotLabel) {
        calls.push([printerId, printerName, slotId, slotIndex, slotLabel]);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [["printer-1", "P1S", "slot-4", "4", "AMS 1 · Slot 4"]]);
});

test("click router dispatches loan-create from the loans shell", () => {
  const calls = [];
  const handled = routeCompanionClickAction(
    "start-loan-create",
    createTarget({
      "data-spool-id": "spool-9",
    }),
    {
      startLoanCreate(spoolId) {
        calls.push(spoolId);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["spool-9"]);
});

test("click router dispatches the loans picker launcher", () => {
  const calls = [];
  const handled = routeCompanionClickAction(
    "start-loan-picker",
    createTarget({}),
    {
      startLoanPicker() {
        calls.push("picker");
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["picker"]);
});

test("click router routes selected slot filament through the printer weight flow", () => {
  const calls = [];

  assert.equal(
    routeCompanionClickAction(
      "assign-selected-spool",
      createTarget({
        "data-printer-id": "printer-1",
        "data-printer-name": "X1C",
        "data-slot-id": "slot-a",
        "data-slot-index": "2",
        "data-slot-label": "AMS 1 · Slot 2",
        "data-spool-id": "spool-1",
      }),
      {
        startPrinterWeightUpdate(payload) {
          calls.push(payload);
        },
      },
    ),
    true,
  );

  assert.deepEqual(calls, [
    {
      mode: "assign",
      printerId: "printer-1",
      printerName: "X1C",
      slotId: "slot-a",
      slotIndex: "2",
      slotLabel: "AMS 1 · Slot 2",
      targetSpoolId: "spool-1",
    },
  ]);
});

test("click router dispatches live RFID candidate saves", () => {
  const calls = [];

  assert.equal(
    routeCompanionClickAction(
      "save-live-rfid-candidate",
      createTarget({
        "data-spool-id": "spool-1",
        "data-printer-id": "printer-1",
        "data-slot-id": "slot-a",
        "data-rfid-tag": "RFID-1",
        "data-rfid-observed-at": "2026-04-17T18:45:56Z",
      }),
      {
        submitLiveSlotCandidateRfidUpdate(...args) {
          calls.push(args);
        },
      },
    ),
    true,
  );

  assert.deepEqual(calls, [
    ["spool-1", "printer-1", "slot-a", "RFID-1", "2026-04-17T18:45:56Z"],
  ]);
});

test("click router returns false for unhandled actions", () => {
  const handled = routeCompanionClickAction("missing-action", createTarget({}), {});
  assert.equal(handled, false);
});
