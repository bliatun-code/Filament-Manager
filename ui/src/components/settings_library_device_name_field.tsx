import { inlineStatusSignalClass } from "../lib/chip_styles";
import {
  settingsActionButtonClass,
  settingsGroupLabelClass,
  settingsTextInputClass,
} from "../lib/settings_ui_classes";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsLibraryDeviceNameFieldProps = {
  disabled: boolean;
  dirty: boolean;
  saving: boolean;
  tauri: boolean;
  t: TranslateFn;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function SettingsLibraryDeviceNameField({
  disabled,
  dirty,
  saving,
  tauri,
  t,
  value,
  onChange,
  onSave,
}: SettingsLibraryDeviceNameFieldProps) {
  const statusTone = saving ? "neutral" : dirty ? "warning" : "success";
  const statusLabel = saving
    ? t("settings.librarySyncSaving", "Saving...")
    : dirty
      ? t("settings.librarySyncDeviceNameUnsaved", "Unsaved changes")
      : t("settings.librarySyncDeviceNameSavedStatus", "Saved");

  return (
    <div>
      <label className="space-y-2">
        <div className={settingsGroupLabelClass}>
          {t("settings.librarySyncDeviceName", "Device name")}
        </div>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={settingsTextInputClass}
          placeholder={t("settings.librarySyncDeviceNamePlaceholder", "Workshop PC")}
          maxLength={120}
          disabled={!tauri || disabled || saving}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={settingsActionButtonClass(dirty ? "accent" : "neutral")}
          onClick={onSave}
          disabled={!tauri || disabled || saving || !dirty}
        >
          {saving
            ? t("settings.librarySyncSaving", "Saving...")
            : t("settings.librarySyncSaveDeviceName", "Save device name")}
        </button>
        <span
          role="status"
          aria-live="polite"
          className={inlineStatusSignalClass(statusTone, "text-xs")}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
