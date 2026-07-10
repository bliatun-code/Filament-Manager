import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsLibraryDeviceNameField } from "./settings_library_device_name_field";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderField(dirty: boolean, saving = false, disabled = false) {
  return renderToStaticMarkup(
    React.createElement(SettingsLibraryDeviceNameField, {
      disabled,
      dirty,
      saving,
      tauri: true,
      t: (_key, fallback) => fallback,
      value: dirty ? "Workshop iMac" : "Workshop Mac",
      onChange: () => {},
      onSave: () => {},
    }),
  );
}

test("device-name field exposes saved, dirty, and busy states", () => {
  const savedHtml = renderField(false);
  assert.match(savedHtml, />Saved<\/span>/);
  assert.match(savedHtml, /<button[^>]*disabled=""[^>]*>Save device name<\/button>/);

  const dirtyHtml = renderField(true);
  assert.match(dirtyHtml, />Unsaved changes<\/span>/);
  assert.doesNotMatch(dirtyHtml, /<button[^>]*disabled=""[^>]*>Save device name<\/button>/);

  const busyHtml = renderField(true, true);
  assert.match(busyHtml, /<button[^>]*disabled=""[^>]*>Saving\.\.\.<\/button>/);
  assert.match(busyHtml, />Saving\.\.\.<\/span>/);

  const blockedHtml = renderField(true, false, true);
  assert.match(blockedHtml, />Unsaved changes<\/span>/);
  assert.doesNotMatch(blockedHtml, />Saving\.\.\.<\/span>/);
});
