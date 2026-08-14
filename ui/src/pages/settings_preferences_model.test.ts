import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMessage,
  type MessageParams,
} from "../../../src-tauri/companion_browser/message_format.js";
import { SELECTABLE_LOCALES } from "../../../src-tauri/companion_browser/supported_locales.js";
import {
  loadLocaleDictionary,
  lookup,
  type DictionaryNode,
  type Locale,
} from "../lib/i18n";
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

function dictionaryTranslator(locale: Locale, dictionary: DictionaryNode) {
  return (key: string, fallback = "", params: MessageParams = {}) =>
    formatMessage(lookup(dictionary, key) ?? fallback, params, locale);
}

test("buildSettingsLocaleSelectionMessage is localized for all 21 selectable locales", async () => {
  const expectedMessages: Record<string, string> = {
    en: "Language selected: English.",
    nb: "Valgt språk: Norsk (bokmål).",
    de: "Ausgewählte Sprache: Deutsch.",
    fr: "Langue sélectionnée : Français.",
    es: "Idioma seleccionado: Español.",
    "pt-BR": "Idioma selecionado: Português (Brasil).",
    "it-IT": "Lingua selezionata: Italiano.",
    "pl-PL": "Wybrany język: Polski.",
    "nl-NL": "Geselecteerde taal: Nederlands.",
    "cs-CZ": "Vybraný jazyk: Čeština.",
    "zh-CN": "已选择语言：简体中文。",
    "ja-JP": "選択した言語：日本語",
    "ko-KR": "선택한 언어: 한국어.",
    "zh-TW": "已選擇語言：繁體中文。",
    "tr-TR": "Seçilen dil: Türkçe.",
    "uk-UA": "Вибрана мова: Українська.",
    "ru-RU": "Выбранный язык: Русский.",
    "hu-HU": "Kiválasztott nyelv: Magyar.",
    "sv-SE": "Valt språk: Svenska.",
    "da-DK": "Valgt sprog: Dansk.",
    "fi-FI": "Valittu kieli: Suomi.",
  };

  assert.equal(SELECTABLE_LOCALES.length, 21);
  for (const definition of SELECTABLE_LOCALES) {
    const locale = definition.id as Locale;
    const dictionary = await loadLocaleDictionary(locale);
    assert.equal(
      buildSettingsLocaleSelectionMessage(
        locale,
        dictionaryTranslator(locale, dictionary),
      ),
      expectedMessages[locale],
      locale,
    );
  }
});

test("buildSettingsLocaleSelectionMessage names every target before the desktop translator rerenders", async () => {
  const dictionary = await loadLocaleDictionary("en");
  const t = dictionaryTranslator("en", dictionary);

  assert.equal(SELECTABLE_LOCALES.length, 21);
  for (const definition of SELECTABLE_LOCALES) {
    assert.equal(
      buildSettingsLocaleSelectionMessage(definition.id as Locale, t),
      `Language selected: ${definition.nativeLabel}.`,
      definition.id,
    );
  }
});

test("background lifecycle settings are localized for all 21 selectable locales", async () => {
  const keys = [
    "backgroundOperation",
    "backgroundOperationHint",
    "backgroundOperationLoading",
    "backgroundOperationSaving",
    "backgroundTrayUnavailable",
    "backgroundTrayOpen",
    "backgroundTrayQuit",
    "continueInBackground",
    "continueInBackgroundHint",
    "launchAtLogin",
    "launchAtLoginHint",
    "backgroundMoveToApplicationsError",
    "backgroundOperationLoadError",
    "backgroundOperationUpdateError",
    "backgroundOperationRetry",
  ] as const;
  const english = await loadLocaleDictionary("en");

  assert.equal(SELECTABLE_LOCALES.length, 21);
  for (const definition of SELECTABLE_LOCALES) {
    const locale = definition.id as Locale;
    const dictionary = await loadLocaleDictionary(locale);
    for (const key of keys) {
      const path = `settings.${key}`;
      const value = lookup(dictionary, path);
      assert.equal(typeof value, "string", `${locale}: ${path}`);
      assert.notEqual(value?.trim(), "", `${locale}: ${path}`);
      if (locale !== "en") {
        assert.notEqual(value, lookup(english, path), `${locale}: ${path}`);
      }
    }
  }
});
