import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSlotCatalogOnboardingPrompt,
  buildMeasuredTotalWeightDraft,
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
