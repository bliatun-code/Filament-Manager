import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(
  new URL("./inventory_rfid_capture_modal.tsx", import.meta.url),
  "utf8",
);
const panelsSource = readFileSync(
  new URL("./inventory_rfid_capture_panels.tsx", import.meta.url),
  "utf8",
);

test("InventoryRfidCaptureModal uses the shared wide modal chrome and internal scrolling", () => {
  assert.match(modalSource, /inventoryModalOverlayClassName/);
  assert.match(modalSource, /inventoryWideModalPanelClassName/);
  assert.match(modalSource, /closeOnBackdrop/);
  assert.match(modalSource, /zIndex=\{60\}/);
  assert.match(modalSource, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(modalSource, /shrink-0 border-t/);
  assert.doesNotMatch(modalSource, /max-w-6xl rounded-3xl/);
});

test("InventoryRfidCapture panels use the shared modal breakpoint language", () => {
  assert.match(panelsSource, /min-\[900px\]:col-span-4/);
  assert.match(panelsSource, /min-\[900px\]:grid-cols-2/);
  assert.doesNotMatch(panelsSource, /xl:col-span-4/);
  assert.doesNotMatch(panelsSource, /lg:grid-cols-2/);
});
