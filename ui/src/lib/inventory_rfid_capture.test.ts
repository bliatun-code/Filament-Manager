import test from "node:test";
import assert from "node:assert/strict";
import {
  assessRfidCaptureMatch,
  buildRfidCaptureSlotSummaries,
  buildSelectedRfidCaptureSnapshot,
  decodeTrayExistBitsSlotPresence,
  filterRfidCaptureSlots,
  formatRfidCapturePresetName,
  getRfidBindingState,
  isBambuRfidVendor,
  rfidBindingCopy,
  rfidCaptureMatchMeta,
  selectRfidCaptureSlot,
  supportsRfidCapture,
  type RfidCaptureSummary,
  type RfidCapturePrinterSlotLike,
} from "./inventory_rfid_capture";
import type { InventorySpool } from "./inventory_list_model";
import type { BambuLiveIntegrationSettings } from "./tauri_client";

function createSpool(overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id: "spool-1",
    masterId: "master-1",
    vendor: "Bambu",
    material: "PLA-CF",
    filamentName: "PLA-CF",
    colorName: "Blue",
    hexColor: "#2563EB",
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
    ...overrides,
  };
}

function createSummary(overrides: Partial<RfidCaptureSummary> = {}): RfidCaptureSummary {
  return {
    material: "pla cf",
    colorHex: "#2563EB",
    ...overrides,
  };
}

function createSlot(
  overrides: Partial<RfidCapturePrinterSlotLike> = {},
): RfidCapturePrinterSlotLike {
  return {
    printerId: "printer-a",
    amsId: "ams_1",
    slotId: "slot-a1",
    slotIndex: 1,
    liveObservedRfidTag: null,
    liveTrayUuid: null,
    liveChipId: null,
    liveTrayInfoIdx: null,
    liveTrayIdName: null,
    liveFilamentType: null,
    liveFilamentName: null,
    liveColorHex: null,
    liveTrayWeightG: null,
    liveRemainingPercent: null,
    liveLastIdentitySeenAt: null,
    livePrinterLastSeenAt: null,
    liveAmsExistBits: null,
    liveAmsReadDoneBits: null,
    liveAmsBambuBits: null,
    ...overrides,
  };
}

function liveIntegration(
  overrides: Partial<BambuLiveIntegrationSettings> = {},
): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: null,
    ...overrides,
  };
}

test("assessRfidCaptureMatch returns exact when normalized material and color match", () => {
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary()), "EXACT");
});

test("assessRfidCaptureMatch allows near color matches as partial", () => {
  assert.equal(
    assessRfidCaptureMatch(createSpool(), createSummary({ colorHex: "#2563CC" })),
    "PARTIAL",
  );
});

test("assessRfidCaptureMatch checks all colors in composite swatches", () => {
  assert.equal(
    assessRfidCaptureMatch(
      createSpool({ hexColor: "multi(#720062,#3A913F)" }),
      createSummary({ colorHex: "#3A913F", material: "PLA-CF" }),
    ),
    "EXACT",
  );
  assert.equal(
    assessRfidCaptureMatch(
      createSpool({ hexColor: "gradient(#720062,#3A913F)" }),
      createSummary({ colorHex: "#3A9142", material: "PLA-CF" }),
    ),
    "PARTIAL",
  );
});

test("assessRfidCaptureMatch rejects missing material, material mismatches, and distant colors", () => {
  assert.equal(assessRfidCaptureMatch(null, createSummary()), "NONE");
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary({ material: null })), "NONE");
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary({ material: "PETG" })), "NONE");
  assert.equal(assessRfidCaptureMatch(createSpool(), createSummary({ colorHex: "#EF4444" })), "NONE");
});

test("rfidCaptureMatchMeta maps confidence to localized chip metadata", () => {
  const t = (key: string, fallback: string) => `${key}:${fallback}`;
  assert.deepEqual(rfidCaptureMatchMeta("NONE", t), null);
  const exact = rfidCaptureMatchMeta("EXACT", t);
  assert.equal(exact?.label, "inventory.rfidMatchExact:Sikker");
  assert.match(exact?.className ?? "", /emerald|green|success/);
});

test("formatRfidCapturePresetName presents BambuStudio profile names as readable parts", () => {
  const t = (_key: string, fallback: string) => fallback;

  assert.equal(
    formatRfidCapturePresetName("Bambu PLA Basic @BBL P1S 0.4 nozzle", t),
    "Bambu PLA Basic · P1S · 0.4 mm nozzle",
  );
  assert.equal(
    formatRfidCapturePresetName("Generic PLA @0.2 nozzle", t),
    "Generic PLA · 0.2 mm nozzle",
  );
  assert.equal(formatRfidCapturePresetName("Bambu PLA Basic @base", t), "Bambu PLA Basic");
  assert.equal(formatRfidCapturePresetName(null, t), null);
});

test("RFID binding state separates Bambu registration from unsupported vendors", () => {
  assert.equal(isBambuRfidVendor("Bambu"), true);
  assert.equal(isBambuRfidVendor("Bambu Lab"), true);
  assert.equal(isBambuRfidVendor("eSUN"), false);
  assert.equal(getRfidBindingState(null, null, "Bambu"), "BAMBU_UNREGISTERED");
  assert.equal(getRfidBindingState(null, null, "eSUN"), "UNSUPPORTED_VENDOR");
  assert.equal(getRfidBindingState("RFID-1", null, "Bambu"), "LINKED_UNSEEN");
  assert.equal(
    getRfidBindingState("RFID-1", "2026-06-05T01:00:00Z", "Bambu"),
    "LINKED_SEEN",
  );
});

test("rfidBindingCopy avoids freshness language for saved RFID identities", () => {
  const t = (key: string, fallback: string) => `${key}:${fallback}`;
  assert.equal(
    rfidBindingCopy("BAMBU_UNREGISTERED", t).label,
    "inventory.rfidBambuUnregistered:RFID not registered yet",
  );
  assert.equal(
    rfidBindingCopy("UNSUPPORTED_VENDOR", t).label,
    "inventory.rfidUnsupportedVendor:AMS RFID not available",
  );
  assert.equal(
    rfidBindingCopy("LINKED_SEEN", t).label,
    "inventory.rfidRegistered:RFID registered",
  );
});

test("filterRfidCaptureSlots prefers assigned-printer capture sources", () => {
  const slots = [
    createSlot({ printerId: "printer-a", slotId: "a-1" }),
    createSlot({ printerId: "printer-b", slotId: "b-1" }),
    createSlot({ printerId: "printer-b", slotId: "b-ext", amsId: "ams_1_ext" }),
  ];

  assert.deepEqual(
    filterRfidCaptureSlots(slots, {
      assignedSlot: slots[1],
      clientReadOnly: false,
      liveIntegrations: {
        "printer-a": liveIntegration(),
        "printer-b": liveIntegration(),
      },
    }).map((slot) => slot.slotId),
    ["b-1"],
  );
});

test("filterRfidCaptureSlots uses host-observed slot data in client read-only mode", () => {
  const hostSlot = createSlot({
    printerId: "printer-host",
    slotId: "host-1",
    liveObservedRfidTag: "RFID-1",
  });
  const emptySlot = createSlot({ printerId: "printer-host", slotId: "host-2" });

  assert.deepEqual(
    filterRfidCaptureSlots([emptySlot, hostSlot], {
      assignedSlot: null,
      clientReadOnly: true,
      liveIntegrations: {},
    }).map((slot) => slot.slotId),
    ["host-1"],
  );
});

test("selectRfidCaptureSlot honors explicit, assigned, and first-slot fallbacks", () => {
  const slots = [
    createSlot({ slotId: "slot-1" }),
    createSlot({ slotId: "slot-2" }),
  ];

  assert.equal(selectRfidCaptureSlot(slots, { selectedSlotId: "slot-2" })?.slotId, "slot-2");
  assert.equal(
    selectRfidCaptureSlot(slots, { selectedSlotId: null, assignedSlot: slots[1] })?.slotId,
    "slot-2",
  );
  assert.equal(selectRfidCaptureSlot(slots, { selectedSlotId: "missing" }), null);
  assert.equal(selectRfidCaptureSlot(slots, { selectedSlotId: null })?.slotId, "slot-1");
});

test("supportsRfidCapture requires an available runtime and matching source mode", () => {
  const hostSlot = createSlot({ liveTrayUuid: "tray-1" });

  assert.equal(
    supportsRfidCapture({
      tauriAvailable: false,
      captureSlotCount: 1,
      clientReadOnly: true,
      selectedSlot: hostSlot,
    }),
    false,
  );
  assert.equal(
    supportsRfidCapture({
      tauriAvailable: true,
      captureSlotCount: 1,
      clientReadOnly: true,
      selectedSlot: hostSlot,
    }),
    true,
  );
  assert.equal(
    supportsRfidCapture({
      tauriAvailable: true,
      captureSlotCount: 1,
      clientReadOnly: false,
      liveIntegration: liveIntegration({ enabled: false }),
    }),
    false,
  );
});

test("RFID capture snapshot and slot summaries merge live and cached identity fields", () => {
  const slot = createSlot({ slotId: "slot-1", slotIndex: 1 });
  const integration = liveIntegration({
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2026-05-15T12:00:00.000Z",
      ams_exist_bits: "1",
      ams_read_done_bits: "1",
      ams_bambu_bits: "1",
      trays: [
        {
          tray_index: 0,
          loaded: true,
          tray_uuid: "TRAY-LIVE",
          tray_info_idx: "GFSA00_04",
          tray_id_name: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
          filament_type: "PLA",
          filament_name: "Basic",
          color_hex: "#2563EB",
          remaining_percent: 72,
          remaining_grams: 720,
          last_identity_seen_at: "2026-05-15T12:00:00.000Z",
        },
      ],
    },
  });

  const snapshot = buildSelectedRfidCaptureSnapshot(slot, {
    clientReadOnly: false,
    liveIntegration: integration,
  });
  assert.equal(snapshot?.observedAt, "2026-05-15T12:00:00.000Z");
  assert.equal(
    snapshot?.fields.find((field) => field.path === "ams.tray_exist_bits")?.valueText,
    "1",
  );

  const summaries = buildRfidCaptureSlotSummaries([slot], {
    clientReadOnly: false,
    liveIntegrations: { "printer-a": integration },
    fieldsBySlotId: {},
  });

  assert.equal(summaries["slot-1"].rfidTag, "TRAY-LIVE");
  assert.equal(summaries["slot-1"].trayInfoIdx, "GFSA00_04");
  assert.equal(summaries["slot-1"].trayIdName, "Bambu PLA Basic @BBL P1S 0.4 nozzle");
  assert.equal(summaries["slot-1"].material, "PLA");
  assert.equal(summaries["slot-1"].colorHex, "#2563EB");
  assert.equal(summaries["slot-1"].trayExistBits, "1");
  assert.equal(summaries["slot-1"].trayPresentInAms, true);
});

test("host RFID capture treats AMS slot presence bits as useful diagnostic data", () => {
  const slot = createSlot({
    liveAmsExistBits: "0100",
    livePrinterLastSeenAt: "2026-06-06T04:50:45.000Z",
  });

  const slots = filterRfidCaptureSlots([slot], {
    clientReadOnly: true,
    liveIntegrations: {},
  });
  const snapshot = buildSelectedRfidCaptureSnapshot(slot, {
    clientReadOnly: true,
  });

  assert.equal(slots.length, 1);
  assert.equal(
    snapshot?.fields.find((field) => field.path === "ams.tray_exist_bits")?.valueText,
    "0100",
  );
});

test("decodeTrayExistBitsSlotPresence reads Bambu hex slot masks", () => {
  assert.equal(decodeTrayExistBitsSlotPresence("e", 1), false);
  assert.equal(decodeTrayExistBitsSlotPresence("e", 2), true);
  assert.equal(decodeTrayExistBitsSlotPresence("e", 3), true);
  assert.equal(decodeTrayExistBitsSlotPresence("0x3", 1), true);
  assert.equal(decodeTrayExistBitsSlotPresence("0x3", 2), true);
  assert.equal(decodeTrayExistBitsSlotPresence("0x3", 3), false);
  assert.equal(decodeTrayExistBitsSlotPresence("not-hex", 1), null);
  assert.equal(decodeTrayExistBitsSlotPresence(null, 1), null);
});
