import assert from "node:assert/strict";
import test from "node:test";

import { derivePrinterSlotDisplayState } from "./printer_slot_display";
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
    tray_index: 255,
    loaded: true,
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function liveConfig(activeTrayIndex: number): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2099-01-01T00:00:00Z",
      progress_percent: 34,
      active_tray_index: activeTrayIndex,
      trays: [],
    },
  };
}

test("derivePrinterSlotDisplayState marks Bambu external virtual tray as live in use", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ext", slot_index: 1 }),
    liveConfig: liveConfig(255),
    liveTray: tray(),
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.liveSignalEnabled, true);
  assert.equal(state.liveSlotInUse, true);
  assert.equal(state.lastLiveIdentityAt, "2099-01-01T00:00:00Z");
});

test("derivePrinterSlotDisplayState keeps Bambu external active tray away from internal slots", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_1", slot_index: 1 }),
    liveConfig: liveConfig(255),
    liveTray: tray({ tray_index: 0 }),
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.liveSignalEnabled, true);
  assert.equal(state.liveSlotInUse, false);
});

test("derivePrinterSlotDisplayState can show external host snapshot as live in client mode", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ext", slot_index: 1, live_is_active: true }),
    liveConfig: null,
    liveTray: tray(),
    selectedTargetSpool: null,
    clientReadOnly: true,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.liveSignalEnabled, true);
  assert.equal(state.liveSlotInUse, true);
});
