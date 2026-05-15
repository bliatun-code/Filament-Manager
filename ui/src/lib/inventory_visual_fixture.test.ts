import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInventoryDetailVisualFixture,
  isInventoryDetailVisualFixtureEnabled,
} from "./inventory_visual_fixture";

test("inventory detail visual fixture is explicit and dev-only", () => {
  assert.equal(isInventoryDetailVisualFixtureEnabled("?bfm_inventory_fixture=detail", true), true);
  assert.equal(isInventoryDetailVisualFixtureEnabled("?bfm_inventory_fixture=detail", false), false);
  assert.equal(isInventoryDetailVisualFixtureEnabled("?bfm_inventory_fixture=list", true), false);
});

test("inventory detail visual fixture opens a selected spool with RFID context", () => {
  const fixture = buildInventoryDetailVisualFixture(new Date("2026-05-15T10:30:00.000Z"));
  const selectedSpool = fixture.spools.find((spool) => spool.id === fixture.selectedSpoolId);
  const selectedSlot = fixture.printerOverview
    .flatMap((printer) => printer.slots)
    .find((slot) => slot.slot_id === fixture.selectedRfidCaptureSlotId);

  assert.ok(selectedSpool);
  assert.equal(selectedSpool.status, "ASSIGNED");
  assert.equal(selectedSlot?.spool_id, fixture.selectedSpoolId);
  assert.ok(fixture.rfidCaptureFieldsBySlotId[fixture.selectedRfidCaptureSlotId]?.length);
  assert.ok(fixture.historyRows.some((row) => row.event_type === "RFID_TAG_UPDATED"));
});
