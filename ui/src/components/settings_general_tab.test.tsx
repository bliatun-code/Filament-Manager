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
  "settings.inventoryOverviewSingleLabelHint":
    "Trenger du bare én etikett? Åpne rullen i Lager og velg Lag QR-etikett.",
};

function i18nValue(locale: Locale = "en"): I18nContextValue {
  return {
    locale,
    setLocale: () => {},
    t: (key, fallback = "") => (locale === "nb" ? norwegianMessages[key] ?? fallback : fallback),
  };
}

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderGeneralTab(locale: Locale = "en", labelSheetOpen = false) {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(locale) },
      React.createElement(SettingsGeneralTab, {
        appVersion: "0.16.0",
        busy: false,
        inventoryLabelSheetModalProps: {
          items: labelSheetOpen
            ? [
                {
                  reference: "spool-1",
                  pngDataUrl:
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7aSykAAAAASUVORK5CYII=",
                },
              ]
            : [],
          loading: false,
          onClose: () => {},
          onSave: () => {},
          open: labelSheetOpen,
          saving: false,
        },
        locale,
        tauri: true,
        themeMode: "dark",
        t: i18nValue(locale).t,
        onLocaleSelection: () => {},
        onOpenInventoryLabelSheet: () => {},
        onThemeSelection: () => {},
      }),
    ),
  );
}

test("SettingsGeneralTab exposes license and source links", () => {
  const html = renderGeneralTab();

  assert.match(html, /AGPL-3\.0-or-later/);
  assert.match(html, /Source code/);
  assert.match(html, /View license/);
  assert.match(html, /Notices/);
  assert.match(html, /Product tour/);
  assert.match(html, /User manual/);
  assert.match(html, /Check for updates/);
  assert.match(html, /Download and installation remain manual/);
  assert.match(html, /Need just one label\?/);
  assert.match(
    html,
    /class="[^"]*border-slate-200[^"]*bg-white[^"]*text-slate-700[^"]*"[^>]*>Product tour/,
  );
  assert.doesNotMatch(
    html,
    /class="[^"]*border-indigo-200[^"]*bg-indigo-50[^"]*"[^>]*>Product tour/,
  );
  assert.doesNotMatch(html, /View release/);
});

test("SettingsGeneralTab exposes selected theme and language choices", () => {
  const html = renderGeneralTab();

  assert.match(html, /role="group" aria-label="Appearance"/);
  assert.match(html, /<select[^>]*aria-label="Language"/);
  assert.ok(html.indexOf("Appearance") < html.indexOf("Program"));
  assert.ok(html.indexOf("Language") < html.indexOf("Program"));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
  assert.match(html, /<option value="de">Deutsch<\/option>/);
  assert.match(html, /<option value="fr">Français<\/option>/);
  assert.match(html, /<option value="es">Español<\/option>/);
  assert.match(html, /<option value="fi-FI">Suomi<\/option>/);
  assert.equal((html.match(/<option /g) ?? []).length, 21);
  assert.doesNotMatch(html, /Pseudo \(QA\)/);
});

test("SettingsGeneralTab localizes license controls in Norwegian", () => {
  const html = renderGeneralTab("nb");

  assert.match(html, /Lisens/);
  assert.match(html, /Kildekode/);
  assert.match(html, /Vis lisens/);
  assert.match(html, /Notiser/);
  assert.match(html, /Hjelp/);
  assert.match(html, /Brukermanual/);
  assert.match(html, /Trenger du bare én etikett\?/);
});

test("SettingsGeneralTab opens a paper-aware inventory label sheet preview", () => {
  const html = renderGeneralTab("en", true);

  assert.match(html, /Create inventory label sheet/);
  assert.match(html, /Sheet preview/);
  assert.match(html, /A4/);
  assert.match(html, /US Letter/);
  assert.match(html, /60 × 24 mm/);
  assert.match(html, /30 labels per page/);
  assert.match(html, /Need just one label\?/);
  assert.match(html, /Open the roll in Inventory/);
  assert.match(html, /Save PDF to Downloads/);
  assert.match(html, /data:image\/png;base64/);
});
