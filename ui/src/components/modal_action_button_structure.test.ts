import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("modal action buttons share secondary and primary chrome", () => {
  const actionButtonClass = readComponentSource("modal_action_button_class.ts");
  const rfidCapturePanels = readComponentSource("inventory_rfid_capture_panels.tsx");
  const rfidOverrideModal = readComponentSource("rfid_override_modal.tsx");
  const slotOnboardingModal = readComponentSource("slot_catalog_onboarding_modal.tsx");
  const rawSecondaryClass =
    /rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold/;
  const rawPrimaryClass =
    /rounded-lg border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold/;

  assert.match(actionButtonClass, /modalActionButtonClassName/);
  assert.match(actionButtonClass, /focus-visible:border-sky-300/);
  assert.match(actionButtonClass, /variant === "primary"/);
  for (const source of [rfidCapturePanels, rfidOverrideModal, slotOnboardingModal]) {
    assert.match(source, /modalActionButtonClassName\(\)/);
    assert.match(source, /modalActionButtonClassName\("primary"\)/);
    assert.doesNotMatch(source, rawSecondaryClass);
    assert.doesNotMatch(source, rawPrimaryClass);
  }
});
