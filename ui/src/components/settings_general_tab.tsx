import type { Locale } from "../lib/i18n";
import type { ThemeMode } from "../lib/theme_mode";
import {
  APP_LICENSE_ID,
  APP_LICENSE_NAME,
  licenseUrlForAppVersion,
  noticeUrlForAppVersion,
  screenshotTourUrl,
  sourceUrlForAppVersion,
  userGuideUrlForLocale,
} from "../lib/app_metadata";
import { openExternalUrl } from "../lib/tauri_maintenance_client";
import {
  chipButtonClass,
  settingsActionButtonClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";
import { SettingsSurfaceCard } from "./settings_ui";
import {
  SettingsInventoryLabelSheetModal,
  type SettingsInventoryLabelSheetModalProps,
} from "./settings_inventory_label_sheet_modal";

type TranslateFn = (key: string, fallback: string) => string;

export type SettingsGeneralTabProps = {
  appVersion: string | null;
  busy: boolean;
  locale: Locale;
  inventoryLabelSheetModalProps: SettingsInventoryLabelSheetModalProps;
  tauri: boolean;
  themeMode: ThemeMode;
  t: TranslateFn;
  onLocaleSelection: (locale: Locale) => void;
  onOpenInventoryLabelSheet: () => void;
  onThemeSelection: (mode: ThemeMode) => void;
};

export function SettingsGeneralTab({
  appVersion,
  busy,
  inventoryLabelSheetModalProps,
  locale,
  tauri,
  themeMode,
  t,
  onLocaleSelection,
  onOpenInventoryLabelSheet,
  onThemeSelection,
}: SettingsGeneralTabProps) {
  const displayVersion = appVersion?.trim() || t("common.unknown", "Unknown");
  const sourceUrl = sourceUrlForAppVersion(appVersion);
  const licenseUrl = licenseUrlForAppVersion(appVersion);
  const noticeUrl = noticeUrlForAppVersion(appVersion);
  const tourUrl = screenshotTourUrl();
  const userGuideUrl = userGuideUrlForLocale(locale);

  return (
    <>
      <SettingsSurfaceCard
        className="space-y-4"
        eyebrow={t("settings.appearance", "Appearance")}
        description={t("settings.autoHint", "Auto follows your system light/dark preference.")}
      >
        <div className="surface-subtle p-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("settings.appearance", "Appearance")}
          >
            {(["auto", "light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={themeMode === mode}
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
      </SettingsSurfaceCard>

      <SettingsSurfaceCard
        className="space-y-4"
        eyebrow={t("settings.language", "Language")}
        description={t(
          "settings.languageHint",
          "Choose app language. More sections will be localized incrementally.",
        )}
      >
        <div className="surface-subtle p-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("settings.language", "Language")}
          >
            <button
              type="button"
              aria-pressed={locale === "nb"}
              onClick={() => onLocaleSelection("nb")}
              className={chipButtonClass(locale === "nb")}
            >
              Norsk (bokmål)
            </button>
            <button
              type="button"
              aria-pressed={locale === "en"}
              onClick={() => onLocaleSelection("en")}
              className={chipButtonClass(locale === "en")}
            >
              English
            </button>
          </div>
        </div>
      </SettingsSurfaceCard>

      <SettingsSurfaceCard className="space-y-4" eyebrow={t("settings.program", "Program")}>
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
      </SettingsSurfaceCard>

      <SettingsSurfaceCard
        className="space-y-4"
        eyebrow={t("settings.help", "Help")}
        description={t(
          "settings.helpHint",
          "Open the visual product tour for screenshots of the main desktop and Companion workflows, or use the text manual for step-by-step behavior.",
        )}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void openExternalUrl(tourUrl);
            }}
            className={settingsActionButtonClass()}
          >
            {t("settings.productTour", "Product tour")}
          </button>
          <button
            type="button"
            onClick={() => {
              void openExternalUrl(userGuideUrl);
            }}
            className={settingsActionButtonClass()}
          >
            {t("settings.userManual", "User manual")}
          </button>
        </div>
      </SettingsSurfaceCard>

      <SettingsSurfaceCard
        className="space-y-4"
        eyebrow={t("settings.inventoryOverviewPrint", "Inventory label sheets")}
        description={t(
          "settings.inventoryOverviewPrintHint",
          "Create QR label sheets for every on-hand roll, using the same readable 60 × 24 mm layout as individual labels.",
        )}
      >
        <button
          type="button"
          onClick={onOpenInventoryLabelSheet}
          className={settingsActionButtonClass("accent")}
          disabled={!tauri || busy}
        >
          {t("settings.inventoryOverviewPrintAction", "Create inventory label sheet")}
        </button>
        <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t(
            "settings.inventoryOverviewSingleLabelHint",
            "Need just one label? Open the roll in Inventory and choose Create QR label.",
          )}
        </div>
      </SettingsSurfaceCard>

      <SettingsInventoryLabelSheetModal {...inventoryLabelSheetModalProps} />
    </>
  );
}
