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
  assert.match(panelsSource, /CloseButton/);
  assert.match(panelsSource, /SwatchSelectionPreviewHeader/);
  assert.match(panelsSource, /eyebrow=\{t\("inventory\.rfidCaptureTitle"/);
  assert.match(panelsSource, /swatchColor=\{spoolHexColor\}/);
  assert.match(panelsSource, /min-\[900px\]:col-span-4/);
  assert.match(panelsSource, /min-\[900px\]:grid-cols-2/);
  assert.match(panelsSource, /buildRfidCaptureSlotLiveStatus/);
  assert.match(panelsSource, /inventoryRfidCaptureSlotButtonClassName/);
  assert.match(panelsSource, /formatRfidCapturedFieldsStatus/);
  assert.match(panelsSource, /capturedFieldsStatus/);
  assert.match(panelsSource, /focus-visible:border-sky-300/);
  assert.doesNotMatch(panelsSource, /loading \? t\("common\.loading"/);
  assert.doesNotMatch(
    panelsSource,
    /rounded-lg border px-3 py-2 text-left text-sm font-semibold transition/,
  );
  assert.match(panelsSource, /slotLiveStatus\.observedText/);
  assert.match(panelsSource, /slotLiveStatus\.stateLabel/);
  assert.doesNotMatch(panelsSource, /tracking-\[0\.2em\]/);
  assert.doesNotMatch(panelsSource, /h-5 w-5 rounded-md/);
  assert.doesNotMatch(panelsSource, />\s*×\s*<\/button>/);
  assert.doesNotMatch(panelsSource, /xl:col-span-4/);
  assert.doesNotMatch(panelsSource, /lg:grid-cols-2/);
});
