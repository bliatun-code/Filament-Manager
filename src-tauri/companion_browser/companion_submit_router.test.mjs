import test from "node:test";
import assert from "node:assert/strict";

import { routeCompanionSubmitAction } from "./companion_submit_router.js";

function createData(values) {
  return {
    get(name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
    },
  };
}

test("submit router dispatches add-spool payloads for owned and borrowed-in stock", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "add-spool-form",
    createData({
      "filament-source": "manual",
      "filament-master-id": "",
      "filament-ownership-type": "OWNED",
      "filament-owner-name": "Alex",
      "filament-owner-contact": "alex@example.com",
      "filament-material": "PLA",
      "filament-name": "Loaner",
      "filament-color-name": "Orange",
      "filament-vendor": "Generic",
      "filament-hex-color": "#F97316",
      "filament-initial-weight": "640",
      "filament-location": "Shelf B",
      "filament-note": "Borrowed for tests",
    }),
    {
      submitManualSpoolRegistration(payload) {
        calls.push(payload);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    {
      source: "manual",
      masterId: "",
      ownershipType: "OWNED",
      ownerName: "Alex",
      ownerContact: "alex@example.com",
      material: "PLA",
      filamentName: "Loaner",
      colorName: "Orange",
      vendor: "Generic",
      hexColor: "#F97316",
      initialWeight: "640",
      location: "Shelf B",
      note: "Borrowed for tests",
    },
  ]);
});

test("submit router dispatches wishlist creation payloads", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "wishlist-item-form",
    createData({
      "filament-source": "bambu",
      "filament-master-id": "master-1",
      "filament-material": "PLA",
      "filament-name": "Basic",
      "filament-color-name": "Blue",
      "filament-vendor": "Bambu",
      "wishlist-quantity": "2",
      "wishlist-note": "Restock soon",
    }),
    {
      submitWishlistCreate(payload) {
        calls.push(payload);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [
    {
      source: "bambu",
      masterId: "master-1",
      material: "PLA",
      filamentName: "Basic",
      colorName: "Blue",
      vendor: "Bambu",
      quantity: "2",
      note: "Restock soon",
    },
  ]);
});

test("submit router shares the same return handler for history and detail return forms", () => {
  const calls = [];
  const handlers = {
    submitSpoolLoanReturn(...args) {
      calls.push(args);
    },
  };

  assert.equal(
    routeCompanionSubmitAction(
      "return-loan-form",
      createData({
        "loan-id": "loan-1",
        "spool-id": "spool-1",
        "returned-grams": "100",
        "return-note": "Done",
      }),
      handlers,
    ),
    true,
  );
  assert.equal(
    routeCompanionSubmitAction(
      "return-loan-history-form",
      createData({
        "loan-id": "loan-2",
        "spool-id": "spool-2",
        "returned-grams": "110",
        "return-note": "Done again",
      }),
      handlers,
    ),
    true,
  );

  assert.deepEqual(calls, [
    ["loan-1", "spool-1", "100", "Done"],
    ["loan-2", "spool-2", "110", "Done again"],
  ]);
});

test("submit router returns false for unhandled actions", () => {
  const handled = routeCompanionSubmitAction("unknown-form", createData({}), {});
  assert.equal(handled, false);
});
