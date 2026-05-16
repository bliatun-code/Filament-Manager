import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsLocaleSelectionMessage,
  buildSettingsThemeSelectionMessage,
} from "./settings_preferences_model";

test("buildSettingsThemeSelectionMessage formats the selected mode", () => {
  assert.equal(
    buildSettingsThemeSelectionMessage("auto", {
      themeSetTo: "Theme mode set to",
    }),
    "Theme mode set to auto.",
  );
});

test("buildSettingsLocaleSelectionMessage returns locale-specific feedback", () => {
  const labels = {
    languageSetEnglish: "Language set to English.",
    languageSetNorwegian: "Language set to Norwegian.",
  };

  assert.equal(buildSettingsLocaleSelectionMessage("nb", labels), labels.languageSetNorwegian);
  assert.equal(buildSettingsLocaleSelectionMessage("en", labels), labels.languageSetEnglish);
});
