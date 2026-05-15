import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsPageLoadErrorMessage,
  buildSettingsPageTabLabels,
} from "./settings_page_model";

test("settings page load error message returns stable fallback copy", () => {
  assert.equal(
    buildSettingsPageLoadErrorMessage({ loadFailed: "Failed to load settings." }),
    "Failed to load settings.",
  );
});

test("settings page tab labels keep all primary tabs explicit", () => {
  const labels = buildSettingsPageTabLabels({
    CATALOG: "Filament catalogue",
    GENERAL: "General",
    LIBRARY: "Library & web app",
    MAINTENANCE: "Program maintenance",
    PRINTERS: "3D printers",
  });

  assert.deepEqual(labels, {
    CATALOG: "Filament catalogue",
    GENERAL: "General",
    LIBRARY: "Library & web app",
    MAINTENANCE: "Program maintenance",
    PRINTERS: "3D printers",
  });
});
