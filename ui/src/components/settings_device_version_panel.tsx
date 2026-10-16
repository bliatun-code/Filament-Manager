import { useContext } from "react";
import { AppUpdateContext } from "../lib/app_update_context";
import { appUpdateCheckMessage } from "../lib/app_update_check";
import { latestReleaseUrl } from "../lib/app_metadata";
import { buildDeviceVersionStatus, type DeviceVersionRelation } from "../lib/device_version_status";
import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import { settingsActionButtonClass, settingsCompactInfoPanelClass, settingsSurfacePanelClass } from "../lib/settings_ui_classes";
import { openExternalUrl } from "../lib/tauri_maintenance_client";
import type { LibrarySyncHostValidationResult, LibrarySyncSettings } from "../lib/tauri_client";

export function SettingsDeviceVersionPanel({
  appVersion,
  busy,
  onRefreshHost,
  settings,
  t,
  tauri,
  validation,
}: {
  appVersion: string | null;
  busy: boolean;
  onRefreshHost: () => void;
  settings: LibrarySyncSettings | null;
  t: (key: string, fallback: string, params?: MessageParams) => string;
  tauri: boolean;
  validation: LibrarySyncHostValidationResult | null;
}) {
  const updates = useContext(AppUpdateContext);
  const versions = buildDeviceVersionStatus({ appVersion, settings, validation, updateState: updates?.state ?? null });
  const checking = updates?.state.status === "CHECKING";
  const updateFeedback = updates ? appUpdateCheckMessage(updates.state, t) : null;
  const relationLabel = (status: DeviceVersionRelation) => {
    switch (status) {
      case "update": return t("settings.deviceUpdateAvailable", "Update available");
      case "current": return t("settings.deviceVersionCurrent", "Latest published version");
      case "newer": return t("settings.deviceVersionNewer", "Newer than the published release");
      case "unknown": return t("settings.hostVersionUnknown", "Version not reported");
      case "unchecked": return t("settings.deviceUpdatesUnchecked", "Updates not checked");
    }
  };
  const needsRelease = versions.local.relation === "update" || versions.host.relation === "update";
  return (
    <section className={settingsSurfacePanelClass} aria-labelledby="settings-device-versions-title">
      <h3 id="settings-device-versions-title" className="font-semibold text-slate-900 dark:text-slate-100">
        {t("settings.deviceVersionsTitle", "App versions")}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          { id: "local", label: t("settings.thisDevice", "This device"), version: versions.local.version, status: versions.local.relation },
          { id: "host", label: versions.host.name || t("settings.librarySyncCurrentHost", "Current host"), version: versions.host.version, status: versions.host.relation },
        ].map((device) => (
          <div key={device.id} className={settingsCompactInfoPanelClass} data-device-version={device.id}>
            <div className="break-words text-xs text-slate-600 dark:text-slate-300">{device.label}</div>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{device.version ? `v${device.version}` : "—"}</p>
            <p className={`mt-1 text-xs ${device.status === "update" ? "font-semibold text-amber-800 dark:text-amber-200" : "text-slate-500 dark:text-slate-400"}`}>{relationLabel(device.status)}</p>
            {device.id === "host" && versions.host.source !== "unknown" ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{versions.host.source === "checked"
                ? t("settings.hostVersionChecked", "From the last host check")
                : t("settings.hostVersionCached", "From the last host snapshot")}</p>
            ) : null}
          </div>
        ))}
      </div>
      {versions.latest ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{t("settings.deviceLatestRelease", "Latest published: {version}", { version: `v${versions.latest}` })}</p> : null}
      {versions.host.source === "unknown" && !versions.host.checked ? <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t("settings.hostVersionUnverified", "The host app version is unavailable until the configured host is verified.")}</p> : null}
      {versions.host.source === "cached" ? <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t("settings.hostVersionCachedHint", "This saved version may have changed. Refresh the host status to verify it.")}</p> : null}
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("settings.hostCatalogRunsHere", "Catalog refresh runs on the host. Update the host as well to receive catalog fixes.")}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t("settings.deviceVersionsIndependent", "Updating this device does not update the host.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={settingsActionButtonClass()} disabled={!tauri || busy || !settings?.client_auth_paired} onClick={onRefreshHost}>
          {t("settings.hostVersionRefresh", "Refresh host status")}
        </button>
        {updates ? <button type="button" className={settingsActionButtonClass()} disabled={!tauri || checking} onClick={() => void updates.checkManually()}>
          {checking ? t("common.loading", "Loading...") : t("settings.checkForUpdates", "Check for updates")}
        </button> : null}
        {needsRelease ? <button type="button" className={settingsActionButtonClass("accent")} disabled={!tauri} onClick={() => void openExternalUrl(latestReleaseUrl())}>
          {t("settings.viewRelease", "View release")}
        </button> : null}
      </div>
      {updateFeedback && (updates?.state.status === "ERROR" || !versions.latest) ? <p role="status" className="mt-3 text-xs text-slate-600 dark:text-slate-300">{updateFeedback}</p> : null}
    </section>
  );
}
