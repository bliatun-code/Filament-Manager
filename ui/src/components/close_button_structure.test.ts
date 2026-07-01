import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("shared close button owns close affordance styling and accessibility", () => {
  const closeButton = readComponentSource("close_button.tsx");
  const modalChrome = readComponentSource("modal_chrome.tsx");
  const settingsRoleModal = readComponentSource("settings_library_role_modal.tsx");

  assert.match(closeButton, /closeButtonBaseClassName/);
  assert.match(closeButton, /focus-visible:border-sky-300/);
  assert.match(closeButton, /aria-label=\{label\}/);
  assert.match(closeButton, /title=\{label\}/);
  assert.match(closeButton, /aria-hidden="true"/);
  assert.match(modalChrome, /CloseButton/);
  assert.match(modalChrome, /ModalHeaderActionButton/);
  assert.match(modalChrome, /modalHeaderActionButtonClassName/);
  assert.match(modalChrome, /focus-visible:border-sky-300/);
  assert.match(settingsRoleModal, /CloseButton/);
  assert.match(settingsRoleModal, /size="large"/);
  assert.doesNotMatch(modalChrome, />\s*×\s*<\/button>/);
  assert.doesNotMatch(settingsRoleModal, />\s*×\s*<\/button>/);
});
