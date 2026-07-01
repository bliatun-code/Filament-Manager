import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./inventory_spool_detail_summary.tsx", import.meta.url),
  "utf8",
);

test("InventorySpoolDetailHeader matches the shared modal header scale", () => {
  assert.match(source, /modalEyebrowClassName/);
  assert.match(source, /CloseButton/);
  assert.match(source, /px-5 py-4/);
  assert.doesNotMatch(source, /text-\[11px\] font-semibold uppercase tracking-\[0\.14em\]/);
  assert.doesNotMatch(source, /tracking-\[0\.2em\]/);
  assert.doesNotMatch(source, /h-9 w-9/);
  assert.doesNotMatch(source, /&times;/);
});

test("InventorySpoolIdentityPanel keeps long RFID reference content readable", () => {
  assert.match(source, /min-\[760px\]:grid-cols-2/);
  assert.match(source, /min-\[760px\]:col-span-2/);
  assert.doesNotMatch(source, /2xl:grid-cols-3/);
  assert.doesNotMatch(source, /2xl:col-span-1/);
});

test("InventorySpoolIdentityPanel keeps live AMS sighting copy compact", () => {
  assert.match(source, /lastAmsSightingLiveActivity/);
  assert.match(source, /showRfidBindingHint/);
  assert.match(source, /rfidBindingMeta\.hint\.trim\(\)\.length > 0/);
  assert.doesNotMatch(source, /rfidRegisteredLiveActivityHint/);
});
