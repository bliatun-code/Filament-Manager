import { settingsLibraryRoleButtonClass } from "../lib/settings_ui_classes";
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
  librarySyncDeviceNameDraft: string;
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncRoleOptions: SettingsLibraryRoleOption[];
  librarySyncSettings: LibrarySyncSettings | null;
  libraryVisibility: LibrarySyncVisibilityState;
  tauri: boolean;
  t: TranslateFn;
  onDeviceNameChange: (value: string) => void;
  onRequestLibraryRoleChange: (mode: LibrarySyncMode) => void;
};

export function SettingsLibraryRolePanel({
  librarySyncBusy,
  librarySyncDeviceNameDraft,
  librarySyncModeDraft,
  librarySyncRoleOptions,
  librarySyncSettings,
  libraryVisibility,
  tauri,
  t,
  onDeviceNameChange,
  onRequestLibraryRoleChange,
}: SettingsLibraryRolePanelProps) {
  return (
    <>
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
          {t("settings.libraryRoleLabel", "Library role")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {librarySyncRoleOptions.map((option) => (
            <button
              key={option.mode}
              type="button"
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
        <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/50 dark:text-slate-200">
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
          <label className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              {t("settings.librarySyncDeviceName", "Device name")}
            </div>
            <input
              type="text"
              value={librarySyncDeviceNameDraft}
              onChange={(event) => onDeviceNameChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400/50 dark:focus:ring-indigo-500/20"
              placeholder={t("settings.librarySyncDeviceNamePlaceholder", "Workshop PC")}
              disabled={!tauri || librarySyncBusy}
            />
          </label>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              {t("settings.librarySyncLibraryId", "Library ID")}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
              {librarySyncSettings?.library_id || t("common.loading", "Loading...")}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
