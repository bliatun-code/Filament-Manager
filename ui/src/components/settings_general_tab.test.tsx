import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue, type Locale } from "../lib/i18n";
import { SettingsGeneralTab } from "./settings_general_tab";

const norwegianMessages: Record<string, string> = {
  "settings.license": "Lisens",
  "settings.sourceCode": "Kildekode",
  "settings.viewLicense": "Vis lisens",
  "settings.viewNotices": "Notiser",
  "settings.help": "Hjelp",
  "settings.userManual": "Brukermanual",
};

function i18nValue(locale: Locale = "en"): I18nContextValue {
  return {
    locale,
    setLocale: () => {},
    t: (key, fallback = "") => (locale === "nb" ? norwegianMessages[key] ?? fallback : fallback),
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
  assert.match(
    html,
    /class="[^"]*border-slate-200[^"]*bg-white[^"]*text-slate-700[^"]*"[^>]*>Product tour/,
  );
  assert.doesNotMatch(
    html,
    /class="[^"]*border-indigo-200[^"]*bg-indigo-50[^"]*"[^>]*>Product tour/,
  );
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
