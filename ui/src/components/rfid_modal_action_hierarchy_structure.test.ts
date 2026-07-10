import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

function saveAction(source: string): string {
  const saveHandler = source.lastIndexOf("onClick={onSave}");
  const start = source.lastIndexOf("<ModalActionButton", saveHandler);
  const end = source.indexOf("</ModalActionButton>", saveHandler);

  assert.ok(saveHandler >= 0, "expected an onSave action");
  assert.ok(start >= 0, "expected a ModalActionButton before onSave");
  assert.ok(end > saveHandler, "expected the save action to close");
  return source.slice(start, end);
}

test("RFID modal save actions use the semantic primary style without filament color", () => {
  const sources = [
    readComponentSource("inventory_rfid_capture_panels.tsx"),
    readComponentSource("slot_catalog_onboarding_modal.tsx"),
    readComponentSource("rfid_override_modal.tsx"),
  ];

  for (const source of sources) {
    const action = saveAction(source);
    assert.match(action, /variant="primary"/);
    assert.doesNotMatch(action, /swatchColor=/);
    assert.doesNotMatch(action, /resolvedTheme=/);
  }
});

test("RFID modal previews retain filament swatches as identity", () => {
  const capture = readComponentSource("inventory_rfid_capture_panels.tsx");
  const onboarding = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const override = readComponentSource("rfid_override_modal.tsx");

  for (const source of [capture, onboarding, override]) {
    assert.match(source, /SwatchSelectionPreviewHeader/);
    assert.match(source, /swatchColor=/);
  }
});
