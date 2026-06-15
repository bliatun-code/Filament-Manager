import assert from "node:assert/strict";
import test from "node:test";

import {
  findLiveTrayForSlot,
  isBambuExternalTrayIndex,
  liveActiveTrayMatchesSlot,
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

function liveConfig(trays: BambuLiveObservedTray[]): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2099-01-01T00:00:00Z",
      progress_percent: 42,
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
  assert.equal(liveActiveTrayMatchesSlot(internalSlot, 255), false);
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
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    last_empty_seen_at: null,
    empty_observation_count: null,
    matched_inventory_spool_id: null,
    matched_inventory_mode: null,
    match_status: "unknown_from_printer",
    match_note: null,
  });
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
