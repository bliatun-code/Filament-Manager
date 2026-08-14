import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppUpdateProvider } from "../lib/app_update_provider";
import { I18nContext, type I18nContextValue, type Locale } from "../lib/i18n";
import { SettingsGeneralTab, type SettingsGeneralTabProps } from "./settings_general_tab";

const norwegianMessages: Record<string, string> = {
  "settings.backgroundOperation": "Bakgrunnskjøring",
  "settings.backgroundOperationRetry": "Prøv igjen",
  "settings.continueInBackground": "Fortsett å kjøre når jeg lukker vinduet",
  "settings.continueInBackgroundHint":
    "Vinduet skjules i menylinjen eller systemstatusfeltet. Åpne menyen der når du vil avslutte programmet.",
  "settings.launchAtLoginHint":
    "Starter skjult for denne brukerkontoen. Hvis ikonet i menylinjen eller systemstatusfeltet er utilgjengelig, åpnes vinduet i stedet.",
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

type DesktopLifecycleRenderProps = Pick<
  SettingsGeneralTabProps,
  | "desktopLifecycleLoadError"
  | "desktopLifecycleLoading"
  | "desktopLifecycleSettings"
  | "desktopLifecycleUpdateError"
  | "desktopLifecycleUpdating"
>;

const defaultDesktopLifecycle: DesktopLifecycleRenderProps = {
  desktopLifecycleLoadError: null,
  desktopLifecycleLoading: false,
  desktopLifecycleSettings: {
    continue_in_background: false,
    launch_at_login: false,
    tray_available: true,
  },
  desktopLifecycleUpdateError: null,
  desktopLifecycleUpdating: false,
};

function renderGeneralTab(
  locale: Locale = "en",
  labelSheetOpen = false,
  desktopLifecycleOverrides: Partial<DesktopLifecycleRenderProps> = {},
) {
  const desktopLifecycle = {
    ...defaultDesktopLifecycle,
    ...desktopLifecycleOverrides,
  };
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue(locale) },
      React.createElement(
        AppUpdateProvider,
        null,
        React.createElement(SettingsGeneralTab, {
          appVersion: "0.16.0",
          busy: false,
          ...desktopLifecycle,
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
          onContinueInBackground: () => {},
          onLaunchAtLogin: () => {},
          onOpenInventoryLabelSheet: () => {},
          onRetryDesktopLifecycleLoad: () => {},
          onThemeSelection: () => {},
        }),
      ),
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
  assert.match(html, /Check automatically/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /at most once per day/);
  assert.match(html, /Download and installation remain manual/);
  assert.match(html, /Background operation/);
  assert.match(html, /Continue running when I close the window/);
  assert.match(html, /Start in the background when I sign in/);
  assert.match(html, /Open its menu when you want to stop the program/);
  assert.match(html, /Starts hidden for this user account/);
  assert.doesNotMatch(html, /Use Quit there/);
  assert.doesNotMatch(html, /Starts minimized/);
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
  assert.match(html, /Åpne menyen der når du vil avslutte programmet/);
  assert.match(html, /Starter skjult for denne brukerkontoen/);
});

test("SettingsGeneralTab exposes accessible lifecycle loading and load recovery", () => {
  const loadingHtml = renderGeneralTab("en", false, {
    desktopLifecycleLoading: true,
    desktopLifecycleSettings: null,
  });

  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /role="status" aria-live="polite"/);
  assert.match(loadingHtml, /Loading background settings…/);
  assert.doesNotMatch(loadingHtml, /Continue running when I close the window/);

  const errorHtml = renderGeneralTab("en", false, {
    desktopLifecycleLoadError: "native state unavailable",
    desktopLifecycleSettings: null,
  });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /The background settings could not be loaded/);
  assert.doesNotMatch(errorHtml, /native state unavailable/);
  assert.match(errorHtml, /<button[^>]*>Retry<\/button>/);
  assert.doesNotMatch(errorHtml, /could not be updated/);
});

test("SettingsGeneralTab reports update errors separately from load errors", () => {
  const html = renderGeneralTab("en", false, {
    desktopLifecycleUpdateError: "permission denied",
  });

  assert.match(html, /The background settings could not be updated/);
  assert.doesNotMatch(html, /permission denied/);
  assert.doesNotMatch(html, /could not be loaded/);
  assert.doesNotMatch(html, />Retry<\/button>/);

  const applicationPathHtml = renderGeneralTab("en", false, {
    desktopLifecycleUpdateError: "APP_LOCATION_UNSTABLE",
  });
  assert.match(
    applicationPathHtml,
    /Move Filament Manager to Applications before enabling launch at login/,
  );
  assert.doesNotMatch(applicationPathHtml, /APP_LOCATION_UNSTABLE/);
});

test("SettingsGeneralTab disables close-to-tray when the tray is unavailable", () => {
  const html = renderGeneralTab("en", false, {
    desktopLifecycleSettings: {
      continue_in_background: false,
      launch_at_login: false,
      tray_available: false,
    },
  });
  const backgroundStart = html.indexOf('id="settings-background-operation"');
  const backgroundEnd = html.indexOf("Program", backgroundStart);
  const backgroundHtml = html.slice(backgroundStart, backgroundEnd);
  const checkboxes = backgroundHtml.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];

  assert.match(backgroundHtml, /menu bar or system tray icon is unavailable/);
  assert.match(backgroundHtml, /Closing the window will quit the program/);
  assert.equal(checkboxes.length, 2);
  assert.match(checkboxes[0] ?? "", /disabled=""/);
  assert.match(
    checkboxes[0] ?? "",
    /aria-describedby="settings-background-tray-unavailable"/,
  );
  assert.doesNotMatch(checkboxes[1] ?? "", /disabled=""/);
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
