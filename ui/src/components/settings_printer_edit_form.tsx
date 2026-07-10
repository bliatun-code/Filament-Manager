import { useState, type FormEvent } from "react";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import type { PrinterModelProfile } from "../lib/printer_profiles";
import {
  multiMaterialSlotsInputLabel,
  multiMaterialUnitsInputLabel,
} from "../lib/printer_profiles";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";
import { FeedbackBanner } from "./feedback_banner";
import { settingsPrinterDomIdPrefix } from "./settings_bambu_live_dom_ids";

type SettingsPrinterEditFormProps = {
  bambuLiveAccessCode: string;
  bambuLiveEnabled: boolean;
  bambuLiveHost: string;
  bambuLivePrinterSerial: string;
  busy: boolean;
  dirty: boolean;
  model: string;
  modelProfile: PrinterModelProfile;
  name: string;
  printerId: string;
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
  onCancel: () => void;
  onModelChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSlotsPerUnitChange: (value: string) => void;
  onUnitsChange: (value: string) => void;
};

export function SettingsPrinterEditForm({
  bambuLiveAccessCode,
  bambuLiveEnabled,
  bambuLiveHost,
  bambuLivePrinterSerial,
  busy,
  dirty,
  model,
  modelProfile,
  name,
  printerId,
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
  onCancel,
  onModelChange,
  onNameChange,
  onSave,
  onSlotsPerUnitChange,
  onUnitsChange,
}: SettingsPrinterEditFormProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const disabled = !tauri || busy;
  const multiMaterialDisabled = disabled || modelProfile.maxUnits === 0;
  const parsedUnits = Number.parseInt(units, 10);
  const slotsDisabled =
    multiMaterialDisabled || !Number.isFinite(parsedUnits) || parsedUnits <= 0;
  const liveConfigDisabled = disabled || settingsClientReadOnly;
  const fieldIdPrefix = settingsPrinterDomIdPrefix(printerId);
  const configurationHintId = `${fieldIdPrefix}-configuration-hint`;
  const modelInputId = `${fieldIdPrefix}-model`;
  const nameInputId = `${fieldIdPrefix}-name`;
  const unitsInputId = `${fieldIdPrefix}-units`;
  const slotsInputId = `${fieldIdPrefix}-slots-per-unit`;
  const liveEnabledInputId = `${fieldIdPrefix}-live-enabled`;
  const liveHostInputId = `${fieldIdPrefix}-live-host`;
  const liveAccessCodeInputId = `${fieldIdPrefix}-live-access-code`;
  const livePrinterSerialInputId = `${fieldIdPrefix}-live-printer-serial`;
  const liveHintId = `${fieldIdPrefix}-live-hint`;
  const liveNoteId = `${fieldIdPrefix}-live-note`;
  const unitsLabel = multiMaterialUnitsInputLabel(t, model);
  const slotsLabel = multiMaterialSlotsInputLabel(t, model);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && dirty) {
      onSave();
    }
  }

  function handleCancel() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }

  return (
    <form
      className="mt-3 space-y-4 border-t border-slate-200 pt-3 dark:border-slate-700"
      data-desktop-visual-qa-target="settings-printer-editor"
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 lg:grid-cols-[1.2fr_1fr_110px_130px]">
          <label className="flex min-w-0 flex-col gap-1" htmlFor={modelInputId}>
            <span className={settingsSectionLabelClass}>
              {t("settings.printerModel", "Printer model")}
            </span>
            <input
              id={modelInputId}
              type="text"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              list="printer-model-options"
              aria-describedby={configurationHintId}
              className={`${settingsFormControlClass} mt-auto`}
              placeholder={t("settings.printerModel", "Printer model")}
              disabled={disabled}
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1" htmlFor={nameInputId}>
            <span className={settingsSectionLabelClass}>
              {t("settings.printerName", "Printer name")}
            </span>
            <input
              id={nameInputId}
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              aria-describedby={configurationHintId}
              className={`${settingsFormControlClass} mt-auto`}
              placeholder={t("settings.printerName", "Printer name")}
              disabled={disabled}
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1" htmlFor={unitsInputId}>
            <span className={settingsSectionLabelClass}>{unitsLabel}</span>
            <input
              id={unitsInputId}
              type="number"
              min={0}
              max={modelProfile.maxUnits}
              value={units}
              onChange={(event) => onUnitsChange(event.target.value)}
              aria-describedby={configurationHintId}
              className={`${settingsFormControlClass} mt-auto`}
              disabled={multiMaterialDisabled}
              required={!multiMaterialDisabled}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1" htmlFor={slotsInputId}>
            <span className={settingsSectionLabelClass}>{slotsLabel}</span>
            <input
              id={slotsInputId}
              type="number"
              min={1}
              max={modelProfile.maxSlotsPerUnit}
              value={slotsPerUnit}
              onChange={(event) => onSlotsPerUnitChange(event.target.value)}
              aria-describedby={configurationHintId}
              className={`${settingsFormControlClass} mt-auto`}
              disabled={slotsDisabled}
              required={!slotsDisabled}
            />
          </label>
        </div>
        <p
          id={configurationHintId}
          className="text-xs leading-5 text-slate-600 dark:text-slate-400"
        >
          {t(
            "settings.columnsHint",
            "Choose model, name and multi-material capacity. EXT stays available automatically.",
          )}
        </p>
      </div>

      {supportsBambuLive ? (
        <fieldset className="surface-subtle border-dashed px-3 pb-3">
          <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("settings.bambuLiveSection", "Live Bambu status (beta)")}
          </legend>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p
              id={liveHintId}
              className="max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400"
            >
              {t(
                "settings.bambuLiveHint",
                "Optional local read-only integration for observing printer and AMS status while we evaluate which live fields are stable and valuable.",
              )}
            </p>
            <label
              htmlFor={liveEnabledInputId}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <input
                id={liveEnabledInputId}
                type="checkbox"
                checked={bambuLiveEnabled}
                onChange={(event) => onBambuLiveEnabledChange(event.target.checked)}
                aria-describedby={liveHintId}
                disabled={liveConfigDisabled}
              />
              {t("settings.enableBambuLive", "Enable live status")}
            </label>
          </div>

          {settingsClientReadOnly ? (
            <FeedbackBanner tone="warning" compact className="mt-3">
              {t(
                "settings.bambuLiveStandaloneOnly",
                "Live Bambu status can only be configured on the host desktop in this phase.",
              )}
            </FeedbackBanner>
          ) : null}

          {bambuLiveEnabled ? (
            <div className="mt-3 grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 lg:grid-cols-3">
              <label className="flex min-w-0 flex-col gap-1" htmlFor={liveHostInputId}>
                <span className={settingsSectionLabelClass}>
                  {t("settings.bambuLiveHost", "Printer host / IP")}
                </span>
                <input
                  id={liveHostInputId}
                  type="text"
                  value={bambuLiveHost}
                  onChange={(event) => onBambuLiveHostChange(event.target.value)}
                  aria-describedby={liveHintId}
                  className={settingsFormControlClass}
                  placeholder={t("settings.bambuLiveHost", "Printer host / IP")}
                  autoCapitalize="none"
                  autoComplete="off"
                  disabled={liveConfigDisabled}
                  required
                  spellCheck={false}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1" htmlFor={liveAccessCodeInputId}>
                <span className={settingsSectionLabelClass}>
                  {t("settings.bambuLiveAccessCode", "Access code")}
                </span>
                <input
                  id={liveAccessCodeInputId}
                  type="password"
                  value={bambuLiveAccessCode}
                  onChange={(event) => onBambuLiveAccessCodeChange(event.target.value)}
                  aria-describedby={`${liveHintId} ${liveNoteId}`}
                  className={settingsFormControlClass}
                  placeholder={t("settings.bambuLiveAccessCode", "Access code")}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  disabled={liveConfigDisabled}
                  required
                  spellCheck={false}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1" htmlFor={livePrinterSerialInputId}>
                <span className={settingsSectionLabelClass}>
                  {t("settings.bambuLivePrinterSerial", "Printer serial")}
                </span>
                <input
                  id={livePrinterSerialInputId}
                  type="text"
                  value={bambuLivePrinterSerial}
                  onChange={(event) => onBambuLivePrinterSerialChange(event.target.value)}
                  aria-describedby={liveHintId}
                  className={settingsFormControlClass}
                  placeholder={t("settings.bambuLivePrinterSerial", "Printer serial")}
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={liveConfigDisabled}
                  required
                  spellCheck={false}
                />
              </label>
            </div>
          ) : null}

          <p id={liveNoteId} className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {bambuLiveEnabled
              ? t(
                  "settings.bambuLiveOptInNote",
                  "Credentials are stored locally on this desktop as part of the current experimental opt-in flow.",
                )
              : t(
                  "settings.bambuLiveDisabledNote",
                  "Leave disabled to keep the current printer flow unchanged.",
                )}
          </p>
        </fieldset>
      ) : null}

      <div
        className="border-t border-slate-200 pt-3 dark:border-slate-700"
        data-desktop-visual-qa-target="settings-printer-editor-actions"
      >
        {confirmDiscard ? (
          <div data-desktop-visual-qa-target="settings-printer-discard-confirmation">
            <FeedbackBanner tone="warning" compact>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {t("settings.printerDiscardTitle", "Discard unsaved printer changes?")}
                  </div>
                  <div>
                    {t(
                      "settings.printerDiscardHint",
                      "Your changes will be lost and the printer will keep its current configuration.",
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={settingsActionButtonClass("neutral", "compact")}
                    onClick={() => setConfirmDiscard(false)}
                    disabled={disabled}
                  >
                    {t("settings.printerKeepEditing", "Keep editing")}
                  </button>
                  <button
                    type="button"
                    className={settingsActionButtonClass("dangerQuiet", "compact")}
                    onClick={onCancel}
                    disabled={disabled}
                  >
                    {t("settings.printerDiscardChanges", "Discard changes")}
                  </button>
                </div>
              </div>
            </FeedbackBanner>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              role="status"
              aria-live="polite"
              className={inlineStatusSignalClass(dirty ? "warning" : "neutral", "text-xs")}
            >
              {dirty
                ? t("settings.printerUnsavedChanges", "Unsaved changes")
                : t("settings.printerNoChanges", "No changes to save")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-desktop-visual-qa-action="settings-printer-cancel"
                className={settingsActionButtonClass("neutral")}
                onClick={handleCancel}
                disabled={disabled}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="submit"
                className={settingsActionButtonClass(dirty ? "primary" : "neutral")}
                disabled={disabled || !dirty}
              >
                {t("settings.saveReconfigure", "Save changes")}
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
