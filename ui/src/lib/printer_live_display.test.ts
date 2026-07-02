import assert from "node:assert/strict";
import test from "node:test";

import {
  findLiveTrayForSlot,
  formatPrinterSpoolStatusLabel,
  formatPrinterSpoolStatusTone,
  isBambuExternalTrayIndex,
  isUnknownLiveRfid,
  liveActiveTrayMatchesSlot,
  liveTrayMatchesSlot,
  resolveLiveConnectionIndicator,
} from "./printer_live_display";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedTray,
  PrinterAmsSlotRow,
} from "./tauri_client";

const t = (_key: string, fallback = "") => fallback;

function slot(overrides: Partial<PrinterAmsSlotRow> = {}): PrinterAmsSlotRow {
  return {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 1,
    ...overrides,
  };
}

function tray(overrides: Partial<BambuLiveObservedTray> = {}): BambuLiveObservedTray {
  return {
    tray_index: 0,
    loaded: true,
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function liveConfig(
  trays: BambuLiveObservedTray[],
  activeAmsIndex: number | null = null,
): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2099-01-01T00:00:00Z",
      progress_percent: 42,
      active_ams_index: activeAmsIndex,
      active_tray_index: 255,
      trays,
    },
  };
}

test("Bambu external tray indexes are treated as virtual external slots", () => {
  const externalSlot = slot({ ams_id: "printer_ext", slot_index: 1 });
  const internalSlot = slot({ ams_id: "printer_ams_1", slot_index: 1 });

  assert.equal(isBambuExternalTrayIndex(255), true);
  assert.equal(isBambuExternalTrayIndex(254), true);
  assert.equal(isBambuExternalTrayIndex(0), false);
  assert.equal(liveActiveTrayMatchesSlot(externalSlot, 255), true);
  assert.equal(liveActiveTrayMatchesSlot(externalSlot, 254), true);
  assert.equal(liveActiveTrayMatchesSlot(externalSlot, 0), false);
  assert.equal(liveActiveTrayMatchesSlot(internalSlot, 0), true);
  assert.equal(liveActiveTrayMatchesSlot(slot({ ams_id: "printer_ams_2" }), 0), false);
  assert.equal(liveActiveTrayMatchesSlot(internalSlot, 255), false);
});

test("Bambu active tray matching uses packed AMS coordinates when available", () => {
  const ams1Slot = slot({ ams_id: "printer_ams_1", slot_index: 1 });
  const ams2Slot = slot({ ams_id: "printer_ams_2", slot_index: 1 });
  const ams2Slot2 = slot({ ams_id: "printer_ams_2", slot_index: 2 });

  assert.equal(liveActiveTrayMatchesSlot(ams2Slot, 0, 1), true);
  assert.equal(liveActiveTrayMatchesSlot(ams1Slot, 0, 1), false);
  assert.equal(liveActiveTrayMatchesSlot(ams2Slot2, 0, 1), false);
  assert.equal(liveActiveTrayMatchesSlot(ams1Slot, 0, null), true);
  assert.equal(liveActiveTrayMatchesSlot(ams2Slot, 0, null), false);
});

test("live tray matching uses observed AMS index when available", () => {
  const ams1Slot = slot({ ams_id: "printer_ams_1", slot_index: 1 });
  const ams2Slot = slot({ ams_id: "printer_ams_2", slot_index: 1 });
  const indexedAms2Tray = tray({ ams_index: 1, tray_index: 0 });
  const legacyTray = tray({ tray_index: 0 });

  assert.equal(liveTrayMatchesSlot(ams2Slot, indexedAms2Tray), true);
  assert.equal(liveTrayMatchesSlot(ams1Slot, indexedAms2Tray), false);
  assert.equal(liveTrayMatchesSlot(ams1Slot, legacyTray), true);
  assert.equal(liveTrayMatchesSlot(ams2Slot, legacyTray), false);
});

test("findLiveTrayForSlot maps external slots to Bambu virtual trays", () => {
  const externalSlot = slot({ ams_id: "printer_ext", slot_index: 1 });
  const primaryExternalTray = tray({
    tray_index: 255,
    filament_type: "PLA",
    filament_name: "External spool",
  });
  const secondaryExternalTray = tray({ tray_index: 254, filament_type: "PETG" });

  assert.equal(
    findLiveTrayForSlot(
      "printer-1",
      externalSlot,
      { "printer-1": liveConfig([secondaryExternalTray, primaryExternalTray]) },
      false,
      "LIVE",
    ).tray,
    primaryExternalTray,
  );

  assert.equal(
    findLiveTrayForSlot(
      "printer-1",
      externalSlot,
      { "printer-1": liveConfig([secondaryExternalTray]) },
      false,
      "LIVE",
    ).tray,
    secondaryExternalTray,
  );
});

test("findLiveTrayForSlot can rebuild external live trays from host slot snapshots", () => {
  const externalSlot = slot({
    ams_id: "printer_ext",
    slot_index: 1,
    live_loaded: true,
    live_filament_type: "PLA",
    live_filament_name: "External spool",
    live_color_hex: "#2255AA",
    live_tray_info_idx: "EXTERNAL_PRESET",
    live_nozzle_temp_max_c: 240,
    live_nozzle_temp_min_c: 190,
    live_last_identity_seen_at: "2099-01-01T00:00:00Z",
    live_match_status: "unknown_from_printer",
  });

  const { tray: rebuiltTray } = findLiveTrayForSlot(
    "printer-1",
    externalSlot,
    {},
    true,
    "LIVE",
  );

  assert.deepEqual(rebuiltTray, {
    ams_index: null,
    tray_index: 255,
    loaded: true,
    filament_type: "PLA",
    filament_name: "External spool",
    color_hex: "#2255AA",
    tray_weight_g: null,
    remaining_percent: null,
    remaining_grams: null,
    observed_rfid_tag: null,
    tray_uuid: null,
    chip_id: null,
    tray_info_idx: "EXTERNAL_PRESET",
    tray_id_name: null,
    nozzle_temp_max_c: 240,
    nozzle_temp_min_c: 190,
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    last_empty_seen_at: null,
    empty_observation_count: null,
    matched_inventory_spool_id: null,
    matched_inventory_mode: null,
    match_status: "unknown_from_printer",
    match_note: null,
  });
});

test("findLiveTrayForSlot rebuilds host slot snapshots with observed tag uid", () => {
  const internalSlot = slot({
    live_observed_rfid_tag: "TAG-UID-ONLY",
    live_match_status: "unknown_rfid",
  });

  const { tray: rebuiltTray } = findLiveTrayForSlot(
    "printer-1",
    internalSlot,
    {},
    true,
    "LIVE",
  );

  assert.equal(rebuiltTray?.loaded, true);
  assert.equal(rebuiltTray?.observed_rfid_tag, "TAG-UID-ONLY");
  assert.equal(rebuiltTray?.tray_uuid, null);
  assert.equal(isUnknownLiveRfid(rebuiltTray), true);
});

test("findLiveTrayForSlot maps indexed internal trays to their AMS unit", () => {
  const ams1Slot = slot({ ams_id: "printer_ams_1", slot_index: 1 });
  const ams2Slot = slot({ ams_id: "printer_ams_2", slot_index: 1 });
  const ams2Tray = tray({
    ams_index: 1,
    tray_index: 0,
    filament_name: "AMS 2 spool",
  });

  assert.equal(
    findLiveTrayForSlot(
      "printer-1",
      ams1Slot,
      { "printer-1": liveConfig([ams2Tray]) },
      false,
      "LIVE",
    ).tray,
    null,
  );
  assert.equal(
    findLiveTrayForSlot(
      "printer-1",
      ams2Slot,
      { "printer-1": liveConfig([ams2Tray]) },
      false,
      "LIVE",
    ).tray,
    ams2Tray,
  );
});

test("live connection indicator can use external slot live snapshots", () => {
  assert.deepEqual(
    resolveLiveConnectionIndicator(
      { enabled: true, observed_state: null },
      [
        slot({
          ams_id: "printer_ext",
          live_mqtt_connected: true,
          live_printer_last_seen_at: "2099-01-01T00:00:00Z",
        }),
      ],
      t,
    ),
    {
      tone: "success",
      label: "Live connected",
    },
  );
});

test("printer spool status display uses shared domain parsing without hiding unknown values", () => {
  assert.equal(formatPrinterSpoolStatusLabel("IN_USE", t), "Assigned");
  assert.equal(formatPrinterSpoolStatusTone("IN_USE"), "success");
  assert.equal(formatPrinterSpoolStatusLabel("borrowed", t), "Loaned out");
  assert.equal(formatPrinterSpoolStatusTone("borrowed"), "warning");
  assert.equal(formatPrinterSpoolStatusLabel("MISSING", t), "Missing");
  assert.equal(formatPrinterSpoolStatusTone("DELETED"), "danger");
  assert.equal(formatPrinterSpoolStatusLabel("LEGACY_ACTIVE", t), "LEGACY_ACTIVE");
  assert.equal(formatPrinterSpoolStatusTone("LEGACY_ACTIVE"), "neutral");
});
