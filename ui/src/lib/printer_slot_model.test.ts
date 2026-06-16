import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMeasuredTotalWeightDraft,
  parseWeightInput,
  prepareMeasuredWeightUpdate,
  preparePrinterSlotAssignment,
} from "./printer_slot_model";
import type { BambuLiveObservedTray, PrinterAmsSlotRow } from "./tauri_client";

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
