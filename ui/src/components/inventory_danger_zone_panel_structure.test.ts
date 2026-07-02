import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./inventory_danger_zone_panel.tsx", import.meta.url),
  "utf8",
);

test("InventoryDangerZonePanel uses shared danger-zone button tones", () => {
  assert.match(source, /inventoryDangerZoneButtonClassName/);
  assert.match(source, /modalActionButtonClassName/);
  assert.match(source, /dangerZoneButtonVariant/);
  assert.match(source, /inventoryDangerZoneButtonClassName\("success"\)/);
  assert.match(source, /inventoryDangerZoneButtonClassName\("quietDanger"\)/);
  assert.match(source, /inventoryDangerZoneButtonClassName\("danger"\)/);
  assert.match(source, /inventoryDangerZoneButtonClassName\("critical"\)/);
  assert.doesNotMatch(source, /rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2/);
  assert.doesNotMatch(source, /rounded-lg border border-rose-300 bg-rose-50 px-4 py-2/);
  assert.doesNotMatch(source, /rounded-lg border border-red-400 bg-red-600 px-4 py-2/);
});
