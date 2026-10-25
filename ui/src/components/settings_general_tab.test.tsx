import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppUpdateProvider } from "../lib/app_update_provider";
import { I18nContext, lookup, type I18nContextValue, type Locale } from "../lib/i18n";
import type { DictionaryNode } from "../lib/i18n_types";
import { loadLocaleDictionary } from "../lib/i18n_locales/load_dictionary";
import nbDictionary from "../lib/i18n_locales/locales/nb";
import { CATALOG_LOCALES } from "../../../src-tauri/companion_browser/supported_locales.js";
import { SettingsGeneralTab, type SettingsGeneralTabProps } from "./settings_general_tab";

const norwegianMessages: Record<string, string> = {
  "settings.backgroundMacosApprovalRequired":
    lookup(nbDictionary, "settings.backgroundMacosApprovalRequired") ?? "",
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
  "settings.versionedHelpUnavailable": "Hjelp for denne versjonen er utilgjengelig til en utgitt appversjon er identifisert.",
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
    launch_at_login_available: true,
    tray_available: true,
  },
  desktopLifecycleUpdateError: null,
  desktopLifecycleUpdating: false,
};

function renderGeneralTab(
  locale: Locale = "en",
  desktopLifecycleOverrides: Partial<DesktopLifecycleRenderProps> = {},
  appVersion: string | null = "0.32.1",
  dictionary?: DictionaryNode,
) {
  const translations = dictionary
    ? { ...i18nValue(locale), t: (key: string, fallback = "") => lookup(dictionary, key) ?? fallback }
    : i18nValue(locale);
  const desktopLifecycle = {
    ...defaultDesktopLifecycle,
    ...desktopLifecycleOverrides,
  };
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: translations },
      React.createElement(
        AppUpdateProvider,
        null,
        React.createElement(SettingsGeneralTab, {
          appVersion,
          busy: false,
          ...desktopLifecycle,
          locale,
          tauri: true,
          themeMode: "dark",
          t: translations.t,
          onLocaleSelection: () => {},
          onContinueInBackground: () => {},
          onLaunchAtLogin: () => {},
          onRetryDesktopLifecycleLoad: () => {},
          onThemeSelection: () => {},
        }),
      ),
    ),
  );
}

test("SettingsGeneralTab keeps filament defaults out of the General route", () => {
  const html = renderGeneralTab();

  assert.doesNotMatch(html, /Low-stock thresholds/);
  assert.doesNotMatch(html, /Default threshold/);
});

test("SettingsGeneralTab renders help links for the installed version and selected guide language", () => {
  const english = renderGeneralTab("en", {}, "0.31.0");
  assert.match(english, /href="https:\/\/github\.com\/bliatun-code\/Filament-Manager\/tree\/v0\.31\.0"/);
  assert.match(english, /href="https:\/\/github\.com\/bliatun-code\/Filament-Manager\/blob\/v0\.31\.0\/docs\/SCREENSHOTS\.md"/);
  assert.match(english, /href="https:\/\/github\.com\/bliatun-code\/Filament-Manager\/blob\/v0\.31\.0\/docs\/USER_GUIDE\.md"/);
  assert.doesNotMatch(english, /blob\/main\/docs/);

  const norwegian = renderGeneralTab("nb", {}, "v0.32.1");
  assert.match(norwegian, /href="https:\/\/github\.com\/bliatun-code\/Filament-Manager\/blob\/v0\.32\.1\/docs\/BRUKERVEILEDNING\.md"/);
  assert.match(norwegian, /href="https:\/\/github\.com\/bliatun-code\/Filament-Manager\/blob\/v0\.32\.1\/docs\/SCREENSHOTS\.md"/);
  assert.doesNotMatch(norwegian, /blob\/main\/docs/);
});

test("SettingsGeneralTab disables unidentified and development help instead of opening newer docs", () => {
  for (const appVersion of [null, "", "0.0.0", "0.33.0-dev", "invalid/version"]) {
    const html = renderGeneralTab("en", {}, appVersion);
    assert.match(html, /Version-specific help is unavailable/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Product tour<\/button>/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>User manual<\/button>/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Source code<\/button>/);
    assert.doesNotMatch(html, /href="[^"]*\/docs\//);
    assert.match(html, /View license/);
    assert.match(html, /Notices/);
  }
  assert.match(renderGeneralTab("nb", {}, null), /Hjelp for denne versjonen er utilgjengelig/);
});

test("SettingsGeneralTab loads and renders the unavailable-help notice in every selectable language", async () => {
  const english = await loadLocaleDictionary("en");
  const englishNotice = lookup(english, "settings.versionedHelpUnavailable");
  for (const { id } of CATALOG_LOCALES) {
    const dictionary = await loadLocaleDictionary(id);
    const notice = lookup(dictionary, "settings.versionedHelpUnavailable");
    assert.ok(notice, `${id} contains the versioned-help notice`);
    if (id !== "en") assert.notEqual(notice, englishNotice, `${id} has localized notice text`);
    const html = renderGeneralTab(id, {}, null, dictionary);
    assert.ok(html.includes(notice), `${id} renders its own notice without English fallback`);
    assert.doesNotMatch(html, /href="[^"]*\/docs\//);
  }
});

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
  assert.doesNotMatch(html, /Create inventory label sheet/);
  assert.match(
    html,
    /class="[^"]*app-soft-control[^"]*"[^>]*>Product tour/,
  );
  assert.doesNotMatch(
    html,
    /class="[^"]*app-(?:primary-action|selected-control)[^"]*"[^>]*>Product tour/,
  );
  assert.doesNotMatch(html, /View release/);
});

test("SettingsGeneralTab exposes selected theme and language choices", () => {
  const html = renderGeneralTab();
  const languageSelect =
    html.match(/<select[^>]*aria-label="Language"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";

  assert.match(html, /role="group" aria-label="Appearance"/);
  assert.match(languageSelect, /<select[^>]*aria-label="Language"/);
  assert.ok(html.indexOf("Appearance") < html.indexOf("Program"));
  assert.ok(html.indexOf("Language") < html.indexOf("Program"));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 4);
  assert.match(html, /theme-brand-choice-bambu/);
  assert.match(html, /A playful dark theme inspired by Bambu green/);
  assert.match(html, /theme-brand-choice-prusa/);
  assert.match(html, /A colorful dark theme inspired by Prusa orange/);
  assert.match(languageSelect, /<option value="de">Deutsch<\/option>/);
  assert.match(languageSelect, /<option value="fr">Français<\/option>/);
  assert.match(languageSelect, /<option value="es">Español<\/option>/);
  assert.match(languageSelect, /<option value="fi-FI">Suomi<\/option>/);
  assert.doesNotMatch(languageSelect, /Beta/);
  assert.equal((languageSelect.match(/<option /g) ?? []).length, 21);
  assert.doesNotMatch(languageSelect, /Pseudo \(QA\)/);
});

test("SettingsGeneralTab presents every selectable language without a beta label", () => {
  const html = renderGeneralTab("es");

  assert.doesNotMatch(html, /Beta languages are still being completed/);
});

test("SettingsGeneralTab localizes license controls in Norwegian", () => {
  const html = renderGeneralTab("nb");

  assert.match(html, /Lisens/);
  assert.match(html, /Kildekode/);
  assert.match(html, /Vis lisens/);
  assert.match(html, /Notiser/);
  assert.match(html, /Hjelp/);
  assert.match(html, /Brukermanual/);
  assert.doesNotMatch(html, /Lag etikettark/);
  assert.match(html, /Åpne menyen der når du vil avslutte programmet/);
  assert.match(html, /Starter skjult for denne brukerkontoen/);
});

test("SettingsGeneralTab exposes accessible lifecycle loading and load recovery", () => {
  const loadingHtml = renderGeneralTab("en", {
    desktopLifecycleLoading: true,
    desktopLifecycleSettings: null,
  });

  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /role="status" aria-live="polite"/);
  assert.match(loadingHtml, /Loading background settings…/);
  assert.doesNotMatch(loadingHtml, /Continue running when I close the window/);

  const errorHtml = renderGeneralTab("en", {
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
  const html = renderGeneralTab("en", {
    desktopLifecycleUpdateError: "permission denied",
  });

  assert.match(html, /The background settings could not be updated/);
  assert.doesNotMatch(html, /permission denied/);
  assert.doesNotMatch(html, /could not be loaded/);
  assert.doesNotMatch(html, />Retry<\/button>/);

  const applicationPathHtml = renderGeneralTab("en", {
    desktopLifecycleUpdateError: "APP_LOCATION_UNSTABLE",
  });
  assert.match(
    applicationPathHtml,
    /Move Filament Manager to Applications before enabling launch at login/,
  );
  assert.doesNotMatch(applicationPathHtml, /APP_LOCATION_UNSTABLE/);
});

test("SettingsGeneralTab explains macOS approval in English and Norwegian without native details", () => {
  const desktopLifecycleUpdateError = "MACOS_LOGIN_APPROVAL_REQUIRED: Native approval diagnostic";
  const english = renderGeneralTab("en", { desktopLifecycleUpdateError });
  assert.match(english, /role="alert"/);
  assert.match(english, /macOS requires your approval/);
  assert.match(english, /System Settings.*General.*Login Items/);
  assert.match(english, /allow Filament Manager under Background App Activity/);
  assert.doesNotMatch(english, /could not be updated|MACOS_LOGIN_APPROVAL_REQUIRED|Native approval diagnostic/);

  const norwegian = renderGeneralTab("nb", { desktopLifecycleUpdateError });
  assert.match(norwegian, /macOS krever godkjenning fra deg/);
  assert.match(norwegian, /Systeminnstillinger.*Generelt.*Påloggingsobjekter/);
  assert.match(norwegian, /tillat Filament Manager under Bakgrunnsaktivitet/);
  assert.doesNotMatch(norwegian, /macOS requires your approval|MACOS_LOGIN_APPROVAL_REQUIRED|Native approval diagnostic/);
});

test("SettingsGeneralTab recognizes only the exact macOS approval error prefix", () => {
  for (const desktopLifecycleUpdateError of [
    "MACOS_LOGIN_APPROVAL_REQUIRED",
    "macos_login_approval_required: diagnostic",
    "Other error: MACOS_LOGIN_APPROVAL_REQUIRED: diagnostic",
    "MACOS_LOGIN_APPROVAL_REQUIRED_EXTRA: diagnostic",
  ]) {
    const html = renderGeneralTab("en", { desktopLifecycleUpdateError });
    assert.match(html, /The background settings could not be updated/);
    assert.doesNotMatch(html, /macOS requires your approval|diagnostic/);
  }
});

test("SettingsGeneralTab disables close-to-tray when the tray is unavailable", () => {
  const html = renderGeneralTab("en", {
    desktopLifecycleSettings: {
      continue_in_background: false,
      launch_at_login: false,
      launch_at_login_available: true,
      tray_available: false,
    },
  });
  const backgroundStart = html.indexOf('id="settings-background-operation"');
  const backgroundEnd = html.indexOf('id="settings-update-check"', backgroundStart);
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

test("SettingsGeneralTab isolates unavailable launch-at-login state", () => {
  const html = renderGeneralTab("en", {
    desktopLifecycleSettings: {
      continue_in_background: true,
      launch_at_login: false,
      launch_at_login_available: false,
      tray_available: true,
    },
  });
  const backgroundStart = html.indexOf('id="settings-background-operation"');
  const backgroundEnd = html.indexOf('id="settings-update-check"', backgroundStart);
  const backgroundHtml = html.slice(backgroundStart, backgroundEnd);
  const checkboxes = backgroundHtml.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];

  assert.match(backgroundHtml, /Launch at login is unavailable in this session/);
  assert.match(backgroundHtml, /does not affect the separate close-to-tray setting/);
  assert.equal(checkboxes.length, 2);
  assert.doesNotMatch(checkboxes[0] ?? "", /disabled=""/);
  assert.match(checkboxes[0] ?? "", /checked=""/);
  assert.match(checkboxes[1] ?? "", /disabled=""/);
  assert.match(
    checkboxes[1] ?? "",
    /aria-describedby="settings-background-launch-unavailable"/,
  );
});

test("SettingsGeneralTab no longer owns the inventory label sheet workflow", () => {
  const html = renderGeneralTab("en");

  assert.doesNotMatch(html, /Create inventory label sheet/);
  assert.doesNotMatch(html, /Sheet preview/);
});
