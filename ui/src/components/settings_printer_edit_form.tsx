import type { PrinterModelProfile } from "../lib/printer_profiles";
import {
  multiMaterialSlotsInputLabel,
  multiMaterialUnitsInputLabel,
} from "../lib/printer_profiles";

type SettingsPrinterEditFormProps = {
  bambuLiveAccessCode: string;
  bambuLiveEnabled: boolean;
  bambuLiveHost: string;
  bambuLivePrinterSerial: string;
  busy: boolean;
  model: string;
  modelProfile: PrinterModelProfile;
  name: string;
  settingsClientReadOnly: boolean;
  slotsPerUnit: string;
  supportsBambuLive: boolean;
  tauri: boolean;
  t: (key: string, fallback?: string) => string;
  units: string;
  onBambuLiveAccessCodeChange: (value: string) => void;
  onBambuLiveEnabledChange: (value: boolean) => void;
  onBambuLiveHostChange: (value: string) => void;
  onBambuLivePrinterSerialChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSlotsPerUnitChange: (value: string) => void;
  onUnitsChange: (value: string) => void;
};

const textInputClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100";

export function SettingsPrinterEditForm({
  bambuLiveAccessCode,
  bambuLiveEnabled,
  bambuLiveHost,
  bambuLivePrinterSerial,
  busy,
  model,
  modelProfile,
  name,
  settingsClientReadOnly,
  slotsPerUnit,
  supportsBambuLive,
  tauri,
  t,
  units,
  onBambuLiveAccessCodeChange,
  onBambuLiveEnabledChange,
  onBambuLiveHostChange,
  onBambuLivePrinterSerialChange,
  onModelChange,
  onNameChange,
  onSave,
  onSlotsPerUnitChange,
  onUnitsChange,
}: SettingsPrinterEditFormProps) {
  const disabled = !tauri || busy;
  const multiMaterialDisabled = disabled || modelProfile.maxUnits === 0;
  const liveConfigDisabled = disabled || settingsClientReadOnly;

  return (
    <div className="mt-3 space-y-4 border-t border-slate-200 pt-3 dark:border-slate-700">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_110px_130px_auto]">
        <input
          type="text"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          list="printer-model-options"
          className={textInputClass}
          placeholder={t("settings.printerModel", "Printer model")}
          disabled={disabled}
        />
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className={textInputClass}
          placeholder={t("settings.printerName", "Printer name")}
          disabled={disabled}
        />
        <input
          type="number"
          min={0}
          max={modelProfile.maxUnits}
          value={units}
          onChange={(event) => onUnitsChange(event.target.value)}
          className={textInputClass}
          title={multiMaterialUnitsInputLabel(t, model)}
          disabled={multiMaterialDisabled}
        />
        <input
          type="number"
          min={1}
          max={modelProfile.maxSlotsPerUnit}
          value={slotsPerUnit}
          onChange={(event) => onSlotsPerUnitChange(event.target.value)}
          className={textInputClass}
          title={multiMaterialSlotsInputLabel(t, model)}
          disabled={multiMaterialDisabled}
        />
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          onClick={onSave}
          disabled={disabled}
        >
          {t("settings.saveReconfigure", "Save changes")}
        </button>
      </div>

      {supportsBambuLive ? (
        <div className="surface-subtle border-dashed p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("settings.bambuLiveSection", "Live Bambu status (beta)")}
              </div>
              <div className="max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">
                {t(
                  "settings.bambuLiveHint",
                  "Optional local read-only integration for observing printer and AMS status while we evaluate which live fields are stable and valuable.",
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={bambuLiveEnabled}
                onChange={(event) => onBambuLiveEnabledChange(event.target.checked)}
                disabled={liveConfigDisabled}
              />
              {t("settings.enableBambuLive", "Enable live status")}
            </label>
          </div>

          {settingsClientReadOnly ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {t(
                "settings.bambuLiveStandaloneOnly",
                "Live Bambu status can only be configured on the host desktop in this phase.",
              )}
            </div>
          ) : null}

          {bambuLiveEnabled ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="text"
                value={bambuLiveHost}
                onChange={(event) => onBambuLiveHostChange(event.target.value)}
                className={textInputClass}
                placeholder={t("settings.bambuLiveHost", "Printer host / IP")}
                disabled={liveConfigDisabled}
              />
              <input
                type="password"
                value={bambuLiveAccessCode}
                onChange={(event) => onBambuLiveAccessCodeChange(event.target.value)}
                className={textInputClass}
                placeholder={t("settings.bambuLiveAccessCode", "Access code")}
                disabled={liveConfigDisabled}
              />
              <input
                type="text"
                value={bambuLivePrinterSerial}
                onChange={(event) => onBambuLivePrinterSerialChange(event.target.value)}
                className={textInputClass}
                placeholder={t("settings.bambuLivePrinterSerial", "Printer serial")}
                disabled={liveConfigDisabled}
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {bambuLiveEnabled
                ? t(
                    "settings.bambuLiveOptInNote",
                    "Credentials are stored locally on this desktop as part of the current experimental opt-in flow.",
                  )
                : t(
                    "settings.bambuLiveDisabledNote",
                    "Leave disabled to keep the current printer flow unchanged.",
                  )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
