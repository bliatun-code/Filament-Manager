import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  dictionaries,
  I18nContext,
  lookup,
  type I18nContextValue,
  type Locale,
} from "../lib/i18n";
import { SettingsGeneralTab } from "./settings_general_tab";

function i18nValue(locale: Locale = "en"): I18nContextValue {
  return {
    locale,
    setLocale: () => {},
    t: (key, fallback = "") => lookup(dictionaries[locale], key) ?? fallback,
  };
}

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderGeneralTab(locale: Locale = "en") {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(locale) },
      React.createElement(SettingsGeneralTab, {
        appVersion: "0.16.0",
        busy: false,
        locale,
        tauri: true,
        themeMode: "dark",
        t: i18nValue(locale).t,
        onLocaleSelection: () => {},
        onPrintInventoryOverviewA4: () => {},
        onThemeSelection: () => {},
      }),
    ),
  );
}

test("SettingsGeneralTab exposes license and versioned source links", () => {
  const html = renderGeneralTab();

  assert.match(html, /AGPL-3\.0-or-later/);
  assert.match(html, /Source code/);
  assert.match(html, /View license/);
  assert.match(html, /Notices/);
  assert.match(html, /Product tour/);
  assert.match(html, /User manual/);
});

test("SettingsGeneralTab localizes license controls in Norwegian", () => {
  const html = renderGeneralTab("nb");

  assert.match(html, /Lisens/);
  assert.match(html, /Kildekode/);
  assert.match(html, /Vis lisens/);
  assert.match(html, /Notiser/);
  assert.match(html, /Hjelp/);
  assert.match(html, /Brukermanual/);
});
