import assert from "node:assert/strict";
import test from "node:test";

import { derivePrinterSlotDisplayState } from "./printer_slot_display";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
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

function liveConfig(
  activeTrayIndex: number,
  activeAmsIndex: number | null = null,
): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2099-01-01T00:00:00Z",
      progress_percent: 34,
      active_ams_index: activeAmsIndex,
      active_tray_index: activeTrayIndex,
      trays: [],
    },
  };
}

function spoolRow(
  id: string,
  overrides: {
    vendor?: string;
    material?: string;
    filamentName?: string;
    colorName?: string;
    hexColor?: string;
    status?: string;
  } = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `${id}-master`,
      status: overrides.status ?? "IN_STOCK",
      rfid_tag: null,
    },
    master: {
      id: `${id}-master`,
      vendor: overrides.vendor ?? "Bambu",
      material: overrides.material ?? "PLA",
      filament_name: overrides.filamentName ?? "PLA Matte",
      color_name: overrides.colorName ?? "Black",
      hex_color: overrides.hexColor ?? "#000000",
      default_weight: 1000,
    },
  };
}

function catalogRow(
  id: string,
  overrides: Partial<MasterCatalogRow> = {},
): MasterCatalogRow {
  return {
    id,
    vendor: overrides.vendor ?? "Bambu Lab",
    material: overrides.material ?? "PLA",
    filament_name: overrides.filament_name ?? "PLA Matte",
    color_name: overrides.color_name ?? "Black",
    hex_color: overrides.hex_color ?? "#000000",
    default_weight: overrides.default_weight ?? 1000,
    is_discontinued: overrides.is_discontinued ?? false,
    product_url: overrides.product_url ?? null,
    discontinued_at: overrides.discontinued_at ?? null,
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

test("derivePrinterSlotDisplayState uses packed AMS coordinates for active internal slots", () => {
  const ams1State = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_1", slot_index: 1 }),
    liveConfig: liveConfig(0, 1),
    liveTray: tray({ tray_index: 0, ams_index: 0 }),
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });
  const ams2State = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_2", slot_index: 1 }),
    liveConfig: liveConfig(0, 1),
    liveTray: tray({ tray_index: 0, ams_index: 1 }),
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(ams1State.liveSlotInUse, false);
  assert.equal(ams2State.liveSlotInUse, true);
});

test("derivePrinterSlotDisplayState marks active internal manual slots without fresh RFID identity", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_1", slot_index: 3, spool_id: "spool-esun" }),
    liveConfig: liveConfig(2, 0),
    liveTray: null,
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.liveSignalEnabled, true);
  assert.equal(state.liveIdentityFresh, false);
  assert.equal(state.liveSlotInUse, true);
  assert.equal(state.liveIdentityLabel, null);
  assert.equal(state.showManualLabel, true);
});

test("derivePrinterSlotDisplayState keeps registered RFID rolls away from manual fallback labels", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({
      ams_id: "printer_ams_1",
      slot_index: 1,
      spool_id: "spool-bambu",
      spool_rfid_tag: "RFID-1",
    }),
    liveConfig: liveConfig(2, 0),
    liveTray: null,
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.liveIdentityFresh, false);
  assert.equal(state.liveIdentityLabel, "RFID registered");
  assert.equal(state.liveSlotInUse, false);
  assert.equal(state.showManualLabel, false);
});

test("derivePrinterSlotDisplayState ignores stale active tray signals without RFID identity", () => {
  const staleConfig = liveConfig(2, 0);
  staleConfig.observed_state.last_seen_at = "2000-01-01T00:00:00Z";

  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_1", slot_index: 3, spool_id: "spool-esun" }),
    liveConfig: staleConfig,
    liveTray: null,
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

test("derivePrinterSlotDisplayState keeps unknown RFID strict while offering Bambu metadata suggestions", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_1", slot_index: 1 }),
    liveConfig: liveConfig(0, 0),
    liveTray: tray({
      tray_index: 0,
      tray_uuid: "UNREGISTERED-BAMBU-RFID",
      match_status: "unknown_rfid",
      filament_type: "PLA",
      filament_name: "PLA Matte",
      color_hex: "#000000",
    }),
    spoolRows: [
      spoolRow("bambu-black"),
      spoolRow("esun-black", {
        vendor: "eSUN",
        filamentName: "PLA+HS",
        hexColor: "#000000",
      }),
    ],
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.unknownLiveRfid, true);
  assert.equal(state.liveInventoryMatch.kind, "none");
  assert.equal(state.liveSuggestedInventoryMatch.kind, "metadata_single");
  assert.deepEqual(state.liveSuggestedInventoryMatch.candidates.map((row) => row.spool.id), [
    "bambu-black",
  ]);
  assert.equal(state.liveCatalogMatch.kind, "none");
});

test("derivePrinterSlotDisplayState falls back to Bambu catalog suggestions when inventory has no match", () => {
  const state = derivePrinterSlotDisplayState({
    slot: slot({ ams_id: "printer_ams_1", slot_index: 1 }),
    liveConfig: liveConfig(0, 0),
    liveTray: tray({
      tray_index: 0,
      tray_uuid: "UNREGISTERED-BAMBU-RFID",
      match_status: "unknown_rfid",
      filament_type: "PLA",
      filament_name: "PLA Matte",
      color_hex: "#000000",
    }),
    spoolRows: [],
    catalogRows: [
      catalogRow("bambu-matte-black"),
      catalogRow("bambu-matte-white", { color_name: "White", hex_color: "#FFFFFF" }),
    ],
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: () => null,
  });

  assert.equal(state.unknownLiveRfid, true);
  assert.equal(state.liveSuggestedInventoryMatch.kind, "none");
  assert.equal(state.liveCatalogMatch.kind, "catalog_single");
  assert.deepEqual(state.liveCatalogMatch.candidates.map((row) => row.id), [
    "bambu-matte-black",
  ]);
});
