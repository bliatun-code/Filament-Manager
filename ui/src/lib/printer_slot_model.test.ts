import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSavedRfidPrinterSlotAssignment,
  buildMeasuredTotalWeightDraft,
  buildSlotCatalogOnboardingOpenState,
  buildSlotCatalogOnboardingPrompt,
  buildSlotCatalogOnboardingSaveState,
  findPrinterSlotById,
  parseWeightInput,
  prepareMeasuredWeightUpdate,
  preparePrinterSlotAssignment,
} from "./printer_slot_model";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
} from "./tauri_client";

test("parseWeightInput accepts non-negative integer grams and rejects empty or invalid values", () => {
  assert.equal(parseWeightInput(" 42 "), 42);
  assert.equal(parseWeightInput(""), null);
  assert.equal(parseWeightInput("-1"), null);
  assert.equal(parseWeightInput("abc"), null);
});

test("buildMeasuredTotalWeightDraft combines remaining filament and empty spool weight", () => {
  assert.equal(buildMeasuredTotalWeightDraft(750, 250), "1000");
  assert.equal(buildMeasuredTotalWeightDraft(-50, 20), "0");
  assert.equal(buildMeasuredTotalWeightDraft(null, 250), "");
});

test("findPrinterSlotById resolves the current slot snapshot", () => {
  const firstSlot = { slot_id: "slot-1", ams_id: "ams-1", slot_index: 1 } as PrinterAmsSlotRow;
  const secondSlot = { slot_id: "slot-2", ams_id: "ams-1", slot_index: 2 } as PrinterAmsSlotRow;
  const printers = [
    {
      printer: { id: "printer-1", name: "P1S", model: "Bambu Lab P1S" },
      slots: [firstSlot],
    },
    {
      printer: { id: "printer-2", name: "X1C", model: "Bambu Lab X1 Carbon" },
      slots: [secondSlot],
    },
  ] as PrinterOverviewRow[];

  assert.equal(findPrinterSlotById(printers, "printer-2", "slot-2"), secondSlot);
  assert.equal(findPrinterSlotById(printers, "printer-2", "missing"), null);
});

test("prepareMeasuredWeightUpdate separates host usage and local no-op decisions", () => {
  assert.deepEqual(prepareMeasuredWeightUpdate(800, 950, 200), {
    safeMeasuredTotal: 950,
    safeTareWeight: 200,
    measuredFilament: 750,
    baseline: 800,
    usedGrams: 50,
    clientAction: "record_usage",
    localAction: "record_usage",
  });
  assert.equal(prepareMeasuredWeightUpdate(750, 950, 200).localAction, "none");
  assert.equal(prepareMeasuredWeightUpdate(null, 950, 200).localAction, "update_weight");
});

test("preparePrinterSlotAssignment derives unknown live override from observed tag uid", () => {
  const slot = {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 1,
    spool_id: null,
    rfid_override_tray_uuid: null,
    rfid_override_color_hex: null,
  } as PrinterAmsSlotRow;
  const liveTray = {
    loaded: true,
    observed_rfid_tag: " TAG-UID-ONLY ",
    tray_uuid: null,
    color_hex: "#00FF00",
    match_status: "unknown_rfid",
  } as BambuLiveObservedTray;

  const prepared = preparePrinterSlotAssignment("printer-1", slot, "spool-1", liveTray);

  assert.equal(prepared.assignInput.rfid_override_tray_uuid, "TAG-UID-ONLY");
  assert.equal(prepared.assignInput.rfid_override_color_hex, "#00FF00");
  assert.equal(prepared.overrideChanged, true);
});

test("buildSavedRfidPrinterSlotAssignment assigns a persisted RFID spool without stale manual override", () => {
  const slot = {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 1,
    spool_id: null,
    rfid_override_tray_uuid: "OLD-UNKNOWN-RFID",
    rfid_override_color_hex: "#00FF00",
  } as PrinterAmsSlotRow;

  assert.deepEqual(buildSavedRfidPrinterSlotAssignment("printer-1", slot, "spool-1"), {
    printer_id: "printer-1",
    slot_id: "slot-1",
    spool_id: "spool-1",
    rfid_override_tray_uuid: null,
    rfid_override_color_hex: null,
    clear_live_cache_before_next_refresh: false,
  });
});

test("buildSlotCatalogOnboardingPrompt prepares safe owned defaults from live catalog fallback", () => {
  const printer = {
    printer: {
      id: "printer-1",
      name: "X1C",
      model: "Bambu Lab X1 Carbon",
    },
  } as PrinterOverviewRow;
  const slot = {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 2,
  } as PrinterAmsSlotRow;
  const master = {
    id: "master-1",
    vendor: "Bambu",
    material: "PLA",
    filament_name: "PLA Matte",
    color_name: "Black",
    hex_color: "#000000",
    default_weight: 750,
    product_url: null,
    is_discontinued: false,
    discontinued_at: null,
  } as MasterCatalogRow;
  const liveTray = {
    loaded: true,
    tray_uuid: "RFID-1",
    last_identity_seen_at: null,
  } as BambuLiveObservedTray;
  const liveConfig = {
    enabled: true,
    observed_state: {
      last_seen_at: "2099-01-02T00:00:00Z",
    },
  } as BambuLiveIntegrationSettings;

  const prompt = buildSlotCatalogOnboardingPrompt(printer, slot, master, liveTray, liveConfig);

  assert.equal(prompt.printerId, "printer-1");
  assert.equal(prompt.master.id, "master-1");
  assert.equal(prompt.observedAt, "2099-01-02T00:00:00Z");
  assert.equal(prompt.initialWeight, "750");
  assert.equal(prompt.ownershipType, "OWNED");
  assert.equal(prompt.borrowedFromName, "");
});

test("buildSlotCatalogOnboardingOpenState blocks stale catalog onboarding opens", () => {
  const slot = {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 2,
  } as PrinterAmsSlotRow;
  const liveTray = {
    loaded: true,
    observed_rfid_tag: "RFID-1",
  } as BambuLiveObservedTray;

  assert.deepEqual(buildSlotCatalogOnboardingOpenState(slot, liveTray), {
    disabled: false,
    reason: null,
    observedRfid: "RFID-1",
    slot,
  });
  assert.equal(
    buildSlotCatalogOnboardingOpenState(slot, { loaded: true } as BambuLiveObservedTray)
      .reason,
    "missing_rfid",
  );
  assert.equal(
    buildSlotCatalogOnboardingOpenState(slot, liveTray, {
      currentSlot: { ...slot, spool_id: "fresh-spool" } as PrinterAmsSlotRow,
    }).reason,
    "occupied_slot",
  );
});

test("buildSlotCatalogOnboardingSaveState blocks unsafe catalog slot onboarding writes", () => {
  const printer = {
    printer: {
      id: "printer-1",
      name: "X1C",
      model: "Bambu Lab X1 Carbon",
    },
  } as PrinterOverviewRow;
  const slot = {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 2,
  } as PrinterAmsSlotRow;
  const master = {
    id: "master-1",
    vendor: "Bambu",
    material: "PLA",
    filament_name: "PLA Matte",
    color_name: "Black",
    hex_color: "#000000",
    default_weight: 750,
    product_url: null,
    is_discontinued: false,
    discontinued_at: null,
  } as MasterCatalogRow;
  const liveConfig = null;
  const readyPrompt = buildSlotCatalogOnboardingPrompt(
    printer,
    slot,
    master,
    {
      loaded: true,
      observed_rfid_tag: "RFID-1",
    } as BambuLiveObservedTray,
    liveConfig,
  );

  assert.deepEqual(buildSlotCatalogOnboardingSaveState(readyPrompt), {
    disabled: false,
    reason: null,
    observedRfid: "RFID-1",
  });
  assert.deepEqual(
    buildSlotCatalogOnboardingSaveState(readyPrompt, { busy: true }),
    {
      disabled: true,
      reason: "busy",
      observedRfid: "RFID-1",
    },
  );
  assert.equal(
    buildSlotCatalogOnboardingSaveState({
      ...readyPrompt,
      liveTray: { loaded: true } as BambuLiveObservedTray,
    }).reason,
    "missing_rfid",
  );
  assert.equal(
    buildSlotCatalogOnboardingSaveState({
      ...readyPrompt,
      slot: { ...slot, spool_id: "existing-spool" } as PrinterAmsSlotRow,
    }).reason,
    "occupied_slot",
  );
  assert.equal(
    buildSlotCatalogOnboardingSaveState(readyPrompt, {
      currentSlot: { ...slot, spool_id: "freshly-assigned-spool" } as PrinterAmsSlotRow,
    }).reason,
    "occupied_slot",
  );
  assert.equal(
    buildSlotCatalogOnboardingSaveState({
      ...readyPrompt,
      ownershipType: "BORROWED_IN",
      borrowedFromName: " ",
    }).reason,
    "borrowed_owner_required",
  );
  assert.equal(
    buildSlotCatalogOnboardingSaveState({
      ...readyPrompt,
      ownershipType: "BORROWED_IN",
      borrowedFromName: "Nora",
    }).reason,
    null,
  );
});
