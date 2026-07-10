import {
  settingsChoiceButtonClass,
  settingsGroupLabelClass,
  settingsWebappStatusClass,
  settingsWebappSwitchClass,
  settingsWebappSwitchKnobClass,
  settingsWebappSwitchTrackClass,
} from "../lib/settings_ui_classes";
import type { TrustedLanCompanionStatus } from "../lib/tauri_client";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsLibraryWebappControlProps = {
  librarySyncModeDraft: LibrarySyncMode;
  tauri: boolean;
  trustedLanActionBusy: boolean;
  trustedLanEnabledDraft: boolean;
  trustedLanHasPrivateInterfaces: boolean;
  trustedLanStatus: TrustedLanCompanionStatus | null;
  t: TranslateFn;
  onToggleTrustedLanEnabled: (nextEnabled: boolean) => void;
};

export function SettingsLibraryWebappControl({
  librarySyncModeDraft,
  tauri,
  trustedLanActionBusy,
  trustedLanEnabledDraft,
  trustedLanHasPrivateInterfaces,
  trustedLanStatus,
  t,
  onToggleTrustedLanEnabled,
}: SettingsLibraryWebappControlProps) {
  const webappRunning = Boolean(trustedLanStatus?.enabled && trustedLanStatus?.running);

  return (
    <div className="space-y-2">
      <div className={settingsGroupLabelClass}>
        {t("settings.libraryWebappLabel", "Web app")}
      </div>
      {librarySyncModeDraft === "CLIENT" ? (
        <div className="flex flex-wrap gap-2">
          <span className={settingsChoiceButtonClass(true)}>
            {t("settings.libraryWebappRunsOnHost", "Runs on host")}
          </span>
        </div>
      ) : librarySyncModeDraft === "HOST" ? (
        <div className="flex flex-wrap gap-2">
          <span
            className={settingsWebappStatusClass(
              Boolean(trustedLanStatus?.enabled && trustedLanStatus?.running),
            )}
          >
            <span className="settings-webapp-status-dot" aria-hidden="true" />
            {trustedLanStatus?.enabled && trustedLanStatus?.running
              ? t("settings.libraryWebappRunning", "Running")
              : trustedLanActionBusy
                ? t("settings.trustedLanStatusStarting", "Starting...")
                : t("settings.trustedLanStateNeedsAttention", "Check")}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={trustedLanEnabledDraft}
            aria-label={t("settings.libraryWebappToggle", "Enable web app")}
            onClick={() => onToggleTrustedLanEnabled(!trustedLanEnabledDraft)}
            className={settingsWebappSwitchClass(trustedLanEnabledDraft)}
            disabled={
              !tauri ||
              trustedLanActionBusy ||
              (!trustedLanEnabledDraft && !trustedLanHasPrivateInterfaces)
            }
          >
            <span
              className={settingsWebappSwitchTrackClass(trustedLanEnabledDraft)}
              aria-hidden="true"
            >
              <span className={settingsWebappSwitchKnobClass(trustedLanEnabledDraft)} />
            </span>
            <span>
              {trustedLanEnabledDraft
                ? t("common.on", "On")
                : t("common.off", "Off")}
            </span>
          </button>
          {trustedLanEnabledDraft ? (
            <span
              role="status"
              aria-live="polite"
              className={settingsWebappStatusClass(webappRunning)}
            >
              <span className="settings-webapp-status-dot" aria-hidden="true" />
              {webappRunning
                ? t("settings.libraryWebappRunning", "Running")
                : trustedLanActionBusy
                  ? t("settings.trustedLanStatusStarting", "Starting...")
                  : t("settings.trustedLanStateNeedsAttention", "Check")}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
