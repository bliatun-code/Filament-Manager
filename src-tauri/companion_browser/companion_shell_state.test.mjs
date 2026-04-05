import test from "node:test";
import assert from "node:assert/strict";

import { detectCompanionLayoutMode, createCompanionShellState } from "./companion_shell_state.js";
import { createInitialCompanionState, resetSessionState } from "./session_state.js";

function createShellStateHarness(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    ...overrides.state,
  };
  const renderCalls = [];
  const shellState = createCompanionShellState({
    state,
    render: () => {
      renderCalls.push("render");
    },
    resetSessionState,
  });

  return {
    state,
    shellState,
    renderCalls,
  };
}

test("detectCompanionLayoutMode keeps the phone, tablet, and desktop breakpoints stable", () => {
  assert.equal(detectCompanionLayoutMode(320), "phone");
  assert.equal(detectCompanionLayoutMode(767), "phone");
  assert.equal(detectCompanionLayoutMode(768), "tablet");
  assert.equal(detectCompanionLayoutMode(1199), "tablet");
  assert.equal(detectCompanionLayoutMode(1200), "desktop");
});

test("setRootFlow collapses storage utilities and preserves printer selection without auto-opening the picker", () => {
  const harness = createShellStateHarness({
    state: {
      activeRootFlow: "storage",
      showStorageQr: true,
      showBorrowedInForm: true,
      detailOpen: true,
      printers: [{ printer: { id: "printer-2" } }],
      selectedSpoolId: "",
    },
  });

  harness.shellState.setRootFlow("printers");

  assert.equal(harness.state.activeRootFlow, "printers");
  assert.equal(harness.state.activePrinterId, "printer-2");
  assert.equal(harness.state.showStorageQr, false);
  assert.equal(harness.state.showBorrowedInForm, false);
  assert.equal(harness.state.detailOpen, false);
  assert.equal(harness.state.activeTaskSheet, null);
  assert.equal(harness.state.activeSection, "printers");
  assert.equal(harness.renderCalls.length, 1);
});

test("toggleBorrowedInForm closes the QR sheet and updates the shell immediately", () => {
  const harness = createShellStateHarness({
    state: {
      showStorageQr: true,
      showBorrowedInForm: false,
    },
  });

  harness.shellState.toggleBorrowedInForm();

  assert.equal(harness.state.showBorrowedInForm, true);
  assert.equal(harness.state.showStorageQr, false);
  assert.equal(harness.renderCalls.length, 1);
});

test("add-spool source and queue controls update the shared draft", () => {
  const harness = createShellStateHarness({
    state: {
      catalogMasters: [
        { id: "master-bambu", vendor: "Bambu", default_weight: 1000 },
        { id: "master-esun", vendor: "eSUN", default_weight: 750 },
      ],
    },
  });

  harness.shellState.setAddSpoolSource("esun");
  harness.shellState.selectCatalogMaster("master-esun");
  harness.shellState.setCatalogStatusFilter("DISCONTINUED");
  harness.shellState.setWishlistQueueFilter("ON_ORDER");

  assert.equal(harness.state.borrowedInDraft.source, "esun");
  assert.equal(harness.state.borrowedInDraft.selectedMasterId, "master-esun");
  assert.equal(harness.state.borrowedInDraft.initialWeight, "750");
  assert.equal(harness.state.borrowedInDraft.catalogStatusFilter, "DISCONTINUED");
  assert.equal(harness.state.borrowedInDraft.wishlistFilter, "ON_ORDER");
  assert.deepEqual(harness.renderCalls, ["render", "render", "render", "render"]);
});

test("printer spool search stays local to the slot-targeted picker task sheet", () => {
  const harness = createShellStateHarness({
    state: {
      activeRootFlow: "printers",
      printerSpoolSearch: "",
    },
  });

  harness.shellState.startPrinterSlotAssignment("printer-7", "P1S", "slot-3", "3", "AMS 1 · Slot 3");
  harness.shellState.setPrinterSpoolSearch("petg");
  harness.shellState.closeActiveTaskSheet();

  assert.equal(harness.state.printerSpoolSearch, "");
  assert.equal(harness.state.activeTaskSheet, null);
  assert.deepEqual(harness.renderCalls, ["render", "render", "render"]);
});

test("startPrinterSlotAssignment opens the picker for a specific slot target", () => {
  const harness = createShellStateHarness({
    state: {
      activeRootFlow: "printers",
      printers: [{ printer: { id: "printer-7" } }],
    },
  });

  harness.shellState.startPrinterSlotAssignment("printer-7", "P1S", "slot-3", "3", "AMS 1 · Slot 3");

  assert.equal(harness.state.activeRootFlow, "printers");
  assert.equal(harness.state.activePrinterId, "printer-7");
  assert.deepEqual(harness.state.activeTaskSheet, {
    type: "printer-picker",
    printerId: "printer-7",
    printerName: "P1S",
    slotId: "slot-3",
    slotIndex: "3",
    slotLabel: "AMS 1 · Slot 3",
  });
  assert.deepEqual(harness.state.pendingPrinterSlotTarget, {
    printerId: "printer-7",
    printerName: "P1S",
    slotId: "slot-3",
    slotIndex: "3",
    slotLabel: "AMS 1 · Slot 3",
  });
  assert.deepEqual(harness.renderCalls, ["render"]);
});
