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
  const messages: Record<string, string> = {
    "settings.langSetEn": "Language set to English.",
    "settings.langSetNb": "Language set to Norwegian.",
    "settings.langSetDe": "Language set to German.",
    "settings.langSetFr": "Language set to French.",
  };
  const t = (key: string, fallback = "") => messages[key] ?? fallback;

  assert.equal(buildSettingsLocaleSelectionMessage("nb", t), messages["settings.langSetNb"]);
  assert.equal(buildSettingsLocaleSelectionMessage("en", t), messages["settings.langSetEn"]);
  assert.equal(buildSettingsLocaleSelectionMessage("de", t), messages["settings.langSetDe"]);
  assert.equal(buildSettingsLocaleSelectionMessage("fr", t), messages["settings.langSetFr"]);
});
