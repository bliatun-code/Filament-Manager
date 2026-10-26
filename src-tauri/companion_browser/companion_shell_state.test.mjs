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
    submitUnweighedPrinterOperation: overrides.submitUnweighedPrinterOperation,
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
      showBorrowedInForm: true,
      detailOpen: true,
      printers: [{ printer: { id: "printer-2" } }],
      selectedSpoolId: "",
    },
  });

  harness.shellState.setRootFlow("printers");

  assert.equal(harness.state.activeRootFlow, "printers");
  assert.equal(harness.state.activePrinterId, "printer-2");
  assert.equal(harness.state.showBorrowedInForm, false);
  assert.equal(harness.state.detailOpen, false);
  assert.equal(harness.state.activeTaskSheet, null);
  assert.equal(harness.state.activeSection, "printers");
  assert.equal(harness.renderCalls.length, 1);
});

test("toggleBorrowedInForm updates the shell immediately", () => {
  const harness = createShellStateHarness({
    state: {
      showBorrowedInForm: false,
    },
  });

  harness.shellState.toggleBorrowedInForm();

  assert.equal(harness.state.showBorrowedInForm, true);
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

test("startLoanCreate opens a loans task sheet for the selected spool", () => {
  const harness = createShellStateHarness({
    state: {
      activeRootFlow: "storage",
      selectedSpoolId: "",
    },
  });

  harness.shellState.startLoanCreate("spool-22");

  assert.equal(harness.state.activeRootFlow, "loans");
  assert.equal(harness.state.selectedSpoolId, "spool-22");
  assert.equal(harness.state.detailOpen, false);
  assert.deepEqual(harness.state.activeTaskSheet, {
    type: "loan-create",
    spoolId: "spool-22",
  });
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("startLoanPicker opens the loans picker task sheet", () => {
  const harness = createShellStateHarness({
    state: {
      activeRootFlow: "storage",
      detailOpen: true,
    },
  });

  harness.shellState.startLoanPicker();

  assert.equal(harness.state.activeRootFlow, "loans");
  assert.equal(harness.state.detailOpen, false);
  assert.deepEqual(harness.state.activeTaskSheet, {
    type: "loan-picker",
  });
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("startPrinterWeightUpdate derives model-aware prusa slot labels for task sheets", () => {
  const harness = createShellStateHarness({
    state: {
      activeRootFlow: "printers",
      locale: "nb",
      printers: [
        {
          printer: {
            id: "printer-prusa",
            name: "Prusan",
            model: "Prusa MK4S",
          },
          slots: [
            {
              slot_id: "slot-2",
              ams_id: "printer_prusa_ams_1",
              slot_index: 2,
              spool_id: "spool-7",
              spool_remaining_g: 850,
              spool_hex_color: "#ffffff",
            },
          ],
        },
      ],
      spools: [
        {
          spool: {
            id: "spool-7",
            remaining_g: 850,
            location_id: "Hylle 2",
          },
          master: {
            filament_name: "PLA Basic",
            color_name: "Silver",
            vendor: "Prusa",
            hex_color: "#ffffff",
          },
        },
      ],
    },
  });

  harness.shellState.startPrinterWeightUpdate({
    mode: "update",
    printerId: "printer-prusa",
    slotId: "slot-2",
  });

  assert.equal(harness.state.activeTaskSheet?.slotLabel, "MMU3 · Kanal 2");
});

test('an observed roll opens catalog creation with its matching series and returns to printers', () => {
  const harness = createShellStateHarness({state:{
    printers:[{printer:{id:'p'},slots:[{slot_id:'s',spool_id:null,live_loaded:true,live_match_status:'unknown_rfid',live_filament_type:'PLA',live_filament_name:'PLA Tough+',live_color_hex:'#FFFFFF'}]}],
    catalogMasters:[{id:'matte',vendor:'Bambu',material:'PLA',filament_name:'PLA Matte',hex_color:'#FFFFFF'},
      {id:'tough',vendor:'Bambu',material:'PLA',filament_name:'PLA Tough+',hex_color:'#FFFFFF',default_weight:1000}],
  }});
  harness.shellState.openLiveCatalogSpool('p','s');
  assert.equal(harness.state.borrowedInDraft.selectedMasterId,'tough');
  assert.equal(harness.state.borrowedInDraft.catalogSearch,'PLA Tough+');
  assert.equal(harness.state.activeTaskSheet.returnFlow,'printers');
  assert.equal(harness.state.showBorrowedInForm,true);
  harness.state.activeTaskSheet=null;
  harness.state.printers[0].slots[0].spool_id='occupied';
  harness.shellState.openLiveCatalogSpool('p','s');
  assert.equal(harness.state.activeTaskSheet,null);
});

test("trusted AMS clear and swap submit directly while manual unload keeps a blank measurement", () => {
  for(const mode of ["clear","assign"]) for(const confirmed of [false,true]) {
    const at=new Date().toISOString();let submissions=0, submittedTask=null;
    const harness=createShellStateHarness({submitUnweighedPrinterOperation:task=>{submissions++;submittedTask=task;},state:{
      printers:[{printer:{id:"p",model:"P1S"},slots:[{slot_id:"s",spool_id:"old",spool_remaining_g:510,
        live_can_unload_without_weighing:confirmed,live_loaded:true,live_mqtt_connected:true,
        live_match_status:"clear_match",live_matched_inventory_mode:"exact_rfid",live_matched_inventory_spool_id:"old",
        live_remaining_grams:510,live_weight_seen_at:at,live_last_identity_seen_at:at,live_printer_last_seen_at:at}]}],
      spools:[{spool:{id:"old",remaining_g:510},master:{vendor:"Bambu"}},{spool:{id:"new",remaining_g:800},master:{vendor:"eSUN"}}],
    }});
    harness.shellState.startPrinterWeightUpdate({mode,printerId:"p",slotId:"s",targetSpoolId:mode==="assign"?"new":null});
    assert.equal(submissions,confirmed?1:0);
    const task=confirmed?submittedTask:harness.state.activeTaskSheet;
    assert.equal(task.outgoingWeightConfirmed,confirmed);
    assert.equal(task.incomingWeightRequired,false);
    if(confirmed) assert.equal(harness.state.activeTaskSheet,null,"no intermediate weighing sheet");
  }
});
