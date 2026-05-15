import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsPageChromeLabels,
  buildSettingsPageDesktopOnlyMessage,
  buildSettingsPageLoadErrorMessage,
  buildSettingsPageTabLabels,
} from "./settings_page_model";

test("settings page load error message returns stable fallback copy", () => {
  const labels = {
    desktopOnly: "Settings are only available in the desktop app build.",
    loadFailed: "Failed to load settings.",
  };

  assert.equal(buildSettingsPageLoadErrorMessage(labels), labels.loadFailed);
  assert.equal(
    buildSettingsPageDesktopOnlyMessage(labels),
    labels.desktopOnly,
  );
});

test("settings page chrome labels keep the page header copy explicit", () => {
  const labels = {
    desktopOnly: "Settings are only available in the desktop app build.",
    subtitle:
      "Configure trusted-LAN browser access, printers, catalogue updates and maintenance actions.",
    title: "Settings",
  };

  assert.deepEqual(buildSettingsPageChromeLabels(labels), labels);
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
