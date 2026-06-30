import type { Locale } from "../lib/i18n";
import type { ThemeMode } from "../lib/theme_mode";
import {
  APP_LICENSE_ID,
  APP_LICENSE_NAME,
  licenseUrlForAppVersion,
  noticeUrlForAppVersion,
  sourceUrlForAppVersion,
} from "../lib/app_metadata";
import { openExternalUrl } from "../lib/tauri_maintenance_client";
import {
  chipButtonClass,
  settingsActionButtonClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsGeneralTabProps = {
  appVersion: string | null;
  busy: boolean;
  locale: Locale;
  tauri: boolean;
  themeMode: ThemeMode;
  t: TranslateFn;
  onLocaleSelection: (locale: Locale) => void;
  onPrintInventoryOverviewA4: () => void;
  onThemeSelection: (mode: ThemeMode) => void;
};

export function SettingsGeneralTab({
  appVersion,
  busy,
  locale,
  tauri,
  themeMode,
  t,
  onLocaleSelection,
  onPrintInventoryOverviewA4,
  onThemeSelection,
}: SettingsGeneralTabProps) {
  const displayVersion = appVersion?.trim() || t("common.unknown", "Unknown");
  const sourceUrl = sourceUrlForAppVersion(appVersion);
  const licenseUrl = licenseUrlForAppVersion(appVersion);
  const noticeUrl = noticeUrlForAppVersion(appVersion);

  return (
    <>
      <section className="surface-card space-y-4">
        <div className="section-eyebrow">
          {t("settings.program", "Program")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-subtle px-4 py-3">
            <div className={settingsSectionLabelClass}>
              {t("settings.version", "Version")}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {displayVersion}
            </div>
          </div>
          <div className="surface-subtle px-4 py-3">
            <div className={settingsSectionLabelClass}>
              {t("settings.license", "License")}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {APP_LICENSE_ID}
            </div>
          </div>
        </div>
        <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            "settings.licenseHelp",
            "Filament Manager is open source. Modified distributed versions, and modified versions used over a network, must make their corresponding source available under the same license.",
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void openExternalUrl(sourceUrl);
            }}
            className={settingsActionButtonClass()}
          >
            {t("settings.sourceCode", "Source code")}
          </button>
          <button
            type="button"
            onClick={() => {
              void openExternalUrl(licenseUrl);
            }}
            className={settingsActionButtonClass()}
            title={APP_LICENSE_NAME}
          >
            {t("settings.viewLicense", "View license")}
          </button>
          <button
            type="button"
            onClick={() => {
              void openExternalUrl(noticeUrl);
            }}
            className={settingsActionButtonClass()}
          >
            {t("settings.viewNotices", "Notices")}
          </button>
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="section-eyebrow">
          {t("settings.appearance", "Appearance")}
        </div>
        <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t("settings.autoHint", "Auto follows your system light/dark preference.")}
        </div>
        <div className="surface-subtle p-3">
          <div className="flex flex-wrap gap-2">
            {(["auto", "light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onThemeSelection(mode)}
                className={chipButtonClass(themeMode === mode)}
              >
                {mode === "auto"
                  ? t("settings.auto", "Auto (system)")
                  : mode === "light"
                    ? t("settings.light", "Light")
                    : t("settings.dark", "Dark")}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="section-eyebrow">
          {t("settings.language", "Language")}
        </div>
        <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            "settings.languageHint",
            "Choose app language. More sections will be localized incrementally.",
          )}
        </div>
        <div className="surface-subtle p-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onLocaleSelection("nb")}
              className={chipButtonClass(locale === "nb")}
            >
              Norsk (bokmål)
            </button>
            <button
              type="button"
              onClick={() => onLocaleSelection("en")}
              className={chipButtonClass(locale === "en")}
            >
              English
            </button>
          </div>
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="section-eyebrow">
          {t("settings.inventoryOverviewPrint", "Inventory A4 overview")}
        </div>
        <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            "settings.inventoryOverviewPrintHint",
            "Print a material-sorted list with swatch, QR and filament details for all in-stock spools.",
          )}
        </div>
        <button
          type="button"
          onClick={onPrintInventoryOverviewA4}
          className={settingsActionButtonClass("accent")}
          disabled={!tauri || busy}
        >
          {t("settings.inventoryOverviewPrintAction", "Print A4 inventory overview")}
        </button>
      </section>
    </>
  );
}
