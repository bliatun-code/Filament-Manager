import type { Locale } from "../lib/i18n";
import type { ThemeMode } from "../lib/theme_mode";
import { chipButtonClass, settingsActionButtonClass } from "../lib/settings_ui_classes";

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
  return (
    <>
      <section className="surface-card space-y-3">
        <div className="section-eyebrow">
          {t("settings.program", "Program")}
        </div>
        <div className="text-sm text-slate-700 dark:text-slate-300">
          {t("settings.version", "Version")}:{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {appVersion?.trim() || t("common.unknown", "Unknown")}
          </span>
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
