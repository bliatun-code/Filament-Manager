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

test("submit router dispatches wishlist receipt quantity", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "wishlist-stock-form",
    createData({
      "wishlist-id": "wish-7",
      "received-quantity": "3",
    }),
    {
      submitWishlistStock(...args) {
        calls.push(args);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [["wish-7", "3"]]);
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

test("submit router includes spool id for borrowed-in hand-back submissions", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "hand-back-loan-form",
    createData({
      "loan-id": "loan-9",
      "spool-id": "spool-9",
      "returned-grams": "400",
      "return-note": "Back with owner",
    }),
    {
      submitBorrowedInHandBack(...args) {
        calls.push(args);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [["loan-9", "spool-9", "400", "Back with owner"]]);
});

test("submit router dispatches spool detail updates for status, current location, and home location", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "update-spool-details-form",
    createData({
      "spool-id": "spool-7",
      status: "EMPTY",
      location: "Printer:Brutus:printer_1_ams_1_slot_2",
      "home-location": "Archive Bin",
    }),
    {
      submitSpoolDetailsUpdate(...args) {
        calls.push(args);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [[
    "spool-7",
    "EMPTY",
    "Printer:Brutus:printer_1_ams_1_slot_2",
    "Archive Bin",
  ]]);
});

test("submit router dispatches RFID save payloads from the selected live source", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "update-spool-rfid-form",
    createData({
      "spool-id": "spool-11",
      "rfid-source": `${encodeURIComponent("00112233445566778899AABBCCDDEEFF")}|${encodeURIComponent("2026-04-17T18:45:56Z")}`,
    }),
    {
      submitSpoolRfidUpdate(...args) {
        calls.push(args);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [[
    "spool-11",
    "00112233445566778899AABBCCDDEEFF",
    "2026-04-17T18:45:56Z",
  ]]);
});

test("submit router keeps routing RFID updates when selected live source is malformed", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "update-spool-rfid-form",
    createData({
      "spool-id": "spool-12",
      "rfid-source": "bad%zz|2026-04-17T18%3A45%3A56Z",
    }),
    {
      submitSpoolRfidUpdate(...args) {
        calls.push(args);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [["spool-12", "bad%zz", "2026-04-17T18:45:56Z"]]);
});

test("submit router still routes detail updates that may later return translated browser errors", () => {
  const calls = [];
  const handled = routeCompanionSubmitAction(
    "update-spool-details-form",
    createData({
      "spool-id": "spool-9",
      status: "IN_STOCK",
      location: "Printer:Brutus:printer_1_ams_1_slot_2",
      "home-location": "Hylle 8",
    }),
    {
      submitSpoolDetailsUpdate(...args) {
        calls.push(args);
      },
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, [[
    "spool-9",
    "IN_STOCK",
    "Printer:Brutus:printer_1_ams_1_slot_2",
    "Hylle 8",
  ]]);
});

test("submit router returns false for unhandled actions", () => {
  const handled = routeCompanionSubmitAction("unknown-form", createData({}), {});
  assert.equal(handled, false);
});
