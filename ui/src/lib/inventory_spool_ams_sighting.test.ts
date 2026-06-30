import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInventorySpoolAmsSighting,
  type InventorySpoolAmsSightingSlot,
} from "./inventory_spool_ams_sighting";
import type { InventorySpool } from "./inventory_list_model";

function spool(overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id: "spool-1",
    masterId: "master-1",
    vendor: "Bambu",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Green",
    initialWeightGrams: 1000,
    status: "ASSIGNED",
    ownershipType: "OWNED",
    rfidTag: "TRAY-UUID-1",
    rfidObservedAt: "2026-04-15T21:47:43.000Z",
    ...overrides,
  };
}

function slot(
  overrides: Partial<InventorySpoolAmsSightingSlot> = {},
): InventorySpoolAmsSightingSlot {
  return {
    liveIsActive: false,
    liveLoaded: true,
    liveMatchedInventorySpoolId: "spool-1",
    liveObservedRfidTag: null,
    liveLastIdentitySeenAt: null,
    livePrinterLastSeenAt: "2026-06-30T20:10:00.000Z",
    liveTrayUuid: "TRAY-UUID-1",
    ...overrides,
  };
}

test("AMS sighting uses active assigned slot activity when saved RFID sighting is stale", () => {
  assert.deepEqual(buildInventorySpoolAmsSighting(spool(), slot()), {
    observedAt: "2026-06-30T20:10:00.000Z",
    source: "live_activity",
  });
});

test("AMS sighting uses matching live identity when it is newer than saved RFID", () => {
  assert.deepEqual(
    buildInventorySpoolAmsSighting(
      spool(),
      slot({
        liveLastIdentitySeenAt: "2026-06-30T20:09:00.000Z",
        livePrinterLastSeenAt: null,
      }),
    ),
    {
      observedAt: "2026-06-30T20:09:00.000Z",
      source: "live_identity",
    },
  );
});

test("AMS sighting keeps saved RFID when the live slot matches another spool", () => {
  assert.deepEqual(
    buildInventorySpoolAmsSighting(
      spool(),
      slot({
        liveIsActive: true,
        liveMatchedInventorySpoolId: "spool-2",
        liveTrayUuid: "TRAY-UUID-2",
      }),
    ),
    {
      observedAt: "2026-04-15T21:47:43.000Z",
      source: "saved_rfid",
    },
  );
});

test("AMS sighting does not use printer freshness for an unloaded assigned slot", () => {
  assert.deepEqual(
    buildInventorySpoolAmsSighting(
      spool(),
      slot({
        liveIsActive: false,
        liveLoaded: false,
      }),
    ),
    {
      observedAt: "2026-04-15T21:47:43.000Z",
      source: "saved_rfid",
    },
  );
});

test("AMS sighting keeps newer saved RFID over older live activity", () => {
  assert.deepEqual(
    buildInventorySpoolAmsSighting(
      spool({ rfidObservedAt: "2026-06-30T20:11:00.000Z" }),
      slot({ livePrinterLastSeenAt: "2026-06-30T20:10:00.000Z" }),
    ),
    {
      observedAt: "2026-06-30T20:11:00.000Z",
      source: "saved_rfid",
    },
  );
});
