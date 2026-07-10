import {
  settingsGroupLabelClass,
  settingsInfoPanelClass,
  settingsLibraryRoleButtonClass,
  settingsValueBoxClass,
} from "../lib/settings_ui_classes";
import { SettingsLibraryDeviceNameField } from "../components/settings_library_device_name_field";
import type { LibrarySyncSettings } from "../lib/tauri_client";
import type {
  LibrarySyncMode,
  LibrarySyncVisibilityState,
} from "./settings_library_sync_model";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsLibraryRoleOption = {
  mode: LibrarySyncMode;
  label: string;
};

type SettingsLibraryRolePanelProps = {
  librarySyncBusy: boolean;
  librarySyncDeviceNameDirty: boolean;
  librarySyncDeviceNameDraft: string;
  librarySyncDeviceNameSaveBusy: boolean;
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncRoleOptions: SettingsLibraryRoleOption[];
  librarySyncSettings: LibrarySyncSettings | null;
  libraryVisibility: LibrarySyncVisibilityState;
  tauri: boolean;
  t: TranslateFn;
  onDeviceNameChange: (value: string) => void;
  onRequestLibraryRoleChange: (mode: LibrarySyncMode) => void;
  onSaveDeviceName: () => void;
};

export function SettingsLibraryRolePanel({
  librarySyncBusy,
  librarySyncDeviceNameDirty,
  librarySyncDeviceNameDraft,
  librarySyncDeviceNameSaveBusy,
  librarySyncModeDraft,
  librarySyncRoleOptions,
  librarySyncSettings,
  libraryVisibility,
  tauri,
  t,
  onDeviceNameChange,
  onRequestLibraryRoleChange,
  onSaveDeviceName,
}: SettingsLibraryRolePanelProps) {
  return (
    <>
      <div className="space-y-2">
        <div className={settingsGroupLabelClass}>
          {t("settings.libraryRoleLabel", "Library role")}
        </div>
        <div
          role="group"
          aria-label={t("settings.libraryRoleLabel", "Library role")}
          className="flex flex-wrap items-center gap-2"
        >
          {librarySyncRoleOptions.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={librarySyncModeDraft === option.mode}
              onClick={() => onRequestLibraryRoleChange(option.mode)}
              className={settingsLibraryRoleButtonClass(librarySyncModeDraft === option.mode)}
              disabled={!tauri || librarySyncBusy}
            >
              {librarySyncModeDraft === option.mode ? (
                <span className="settings-library-role-dot" aria-hidden="true" />
              ) : null}
              {option.label}
            </button>
          ))}
        </div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {t(
            "settings.librarySyncSaveHint",
            "Role changes open a guided flow. Nothing is saved until you confirm.",
          )}
        </div>
      </div>

      {librarySyncModeDraft === "HOST" ? null : (
        <div className={settingsInfoPanelClass}>
          {librarySyncModeDraft === "STANDALONE"
            ? libraryVisibility.standaloneWebappEnabled
              ? t(
                  "settings.librarySyncStandaloneWebappHint",
                  "This device keeps its own local library and is also serving the web app from here.",
                )
              : t(
                  "settings.librarySyncStandaloneHint",
                  "This device keeps using its own local library only.",
                )
            : t(
                "settings.librarySyncClientHint",
                "This device connects to another host and keeps a read-only fallback cache when that host is unavailable.",
              )}
        </div>
      )}

      {libraryVisibility.showDeviceFields ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SettingsLibraryDeviceNameField
            disabled={librarySyncBusy}
            dirty={librarySyncDeviceNameDirty}
            saving={librarySyncDeviceNameSaveBusy}
            tauri={tauri}
            t={t}
            value={librarySyncDeviceNameDraft}
            onChange={onDeviceNameChange}
            onSave={onSaveDeviceName}
          />

          <div className="space-y-2">
            <div className={settingsGroupLabelClass}>
              {t("settings.librarySyncLibraryId", "Library ID")}
            </div>
            <div className={settingsValueBoxClass}>
              {librarySyncSettings?.library_id || t("common.loading", "Loading...")}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
