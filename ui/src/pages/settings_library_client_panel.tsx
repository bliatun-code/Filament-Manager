import { SettingsMetricTile } from "../components/settings_ui";
import {
  settingsActionButtonClass,
  settingsCompactInfoPanelClass,
  settingsSurfacePanelClass,
  settingsTextInputClass,
  settingsValueBoxClass,
} from "../lib/settings_ui_classes";
import { formatSettingsDateTime } from "../lib/settings_utils";
import type {
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
} from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
import type { LibrarySyncVisibilityState } from "./settings_library_sync_model";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsLibraryClientPanelProps = {
  librarySyncBusy: boolean;
  librarySyncDeviceNameDraft: string;
  librarySyncHostBaseUrlDraft: string;
  librarySyncPairingDraft: string;
  librarySyncSettings: LibrarySyncSettings | null;
  librarySyncSnapshot: LibrarySyncRemoteSnapshot | null;
  librarySyncSnapshotBusy: boolean;
  librarySyncValidation: LibrarySyncHostValidationResult | null;
  librarySyncValidationBusy: boolean;
  libraryVisibility: LibrarySyncVisibilityState;
  locale: Locale;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostNeedsRepair: boolean;
  settingsClientHostPairingValid: boolean;
  settingsClientHostWritePaired: boolean;
  showLibraryClientAdvanced: boolean;
  tauri: boolean;
  t: TranslateFn;
  onClearClientAuth: () => void;
  onDeviceNameChange: (value: string) => void;
  onFetchSnapshot: () => void;
  onPairHost: () => void;
  onPairingDraftChange: (value: string) => void;
  onRenewClientAuth: () => void;
  onToggleAdvanced: () => void;
};

export function SettingsLibraryClientPanel({
  librarySyncBusy,
  librarySyncDeviceNameDraft,
  librarySyncHostBaseUrlDraft,
  librarySyncPairingDraft,
  librarySyncSettings,
  librarySyncSnapshot,
  librarySyncSnapshotBusy,
  librarySyncValidation,
  librarySyncValidationBusy,
  libraryVisibility,
  locale,
  settingsClientHostBaseUrl,
  settingsClientHostNeedsRepair,
  settingsClientHostPairingValid,
  settingsClientHostWritePaired,
  showLibraryClientAdvanced,
  tauri,
  t,
  onClearClientAuth,
  onDeviceNameChange,
  onFetchSnapshot,
  onPairHost,
  onPairingDraftChange,
  onRenewClientAuth,
  onToggleAdvanced,
}: SettingsLibraryClientPanelProps) {
  return (
    <div className="space-y-4">
      <div className={settingsSurfacePanelClass}>
        <div className="font-semibold text-slate-900 dark:text-slate-100">
          {t("settings.librarySyncClientAuthTitle", "Desktop client pairing")}
        </div>
        <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            "settings.librarySyncClientPairingFlowHint",
            "Start with a short-lived pairing link from the host. The client uses that link to detect, verify and connect to the correct host automatically.",
          )}
        </div>
        <div className="mt-3">
          <label className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              {t("settings.librarySyncDeviceName", "Device name")}
            </div>
            <input
              type="text"
              value={librarySyncDeviceNameDraft}
              onChange={(event) => onDeviceNameChange(event.target.value)}
              className={settingsTextInputClass}
              placeholder={t("settings.librarySyncDeviceNamePlaceholder", "Workshop PC")}
              disabled={!tauri || librarySyncBusy}
            />
          </label>
        </div>
        {!settingsClientHostWritePaired ? (
          <>
            <label className="mt-3 block space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                {t("settings.librarySyncClientAuthInput", "Pairing link")}
              </div>
              <input
                type="text"
                value={librarySyncPairingDraft}
                onChange={(event) => onPairingDraftChange(event.target.value)}
                className={settingsTextInputClass}
                placeholder="http://192.168.86.25:4278/companion?pairing=..."
                disabled={!tauri || librarySyncBusy}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPairHost}
                className={settingsActionButtonClass("accent")}
                disabled={!tauri || librarySyncBusy || !librarySyncPairingDraft.trim()}
              >
                {t("settings.librarySyncPairHost", "Pair desktop client")}
              </button>
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                {t("settings.librarySyncClientAuthUnpaired", "Not paired")}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className={`mt-3 ${settingsCompactInfoPanelClass}`}>
              <div className="font-semibold text-slate-800 dark:text-slate-100">
                {t("settings.librarySyncCurrentHost", "Current host")}
              </div>
              <div className="mt-1">
                {librarySyncSettings?.host_device_name ||
                  librarySyncValidation?.device_name ||
                  t("common.unknown", "Unknown")}
              </div>
              <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {librarySyncHostBaseUrlDraft.trim() ||
                  settingsClientHostBaseUrl ||
                  t("common.unknown", "Unknown")}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {settingsClientHostNeedsRepair ? (
                <button
                  type="button"
                  onClick={onRenewClientAuth}
                  className={settingsActionButtonClass("accent")}
                  disabled={!tauri || librarySyncBusy}
                >
                  {t("settings.librarySyncRenewPairing", "Renew pairing")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClearClientAuth}
                className={settingsActionButtonClass("neutral")}
                disabled={!tauri || librarySyncBusy || !librarySyncSettings?.client_auth_paired}
              >
                {t("settings.librarySyncClearClientAuth", "Remove pairing")}
              </button>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  settingsClientHostPairingValid
                    ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100"
                }`}
              >
                {settingsClientHostPairingValid
                  ? t("settings.librarySyncClientAuthPaired", "Paired")
                  : t("settings.librarySyncClientAuthNeedsRepair", "Re-pair required")}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {settingsClientHostNeedsRepair
                ? t(
                    "settings.librarySyncClientAuthRepairHint",
                    "Host is still reachable, but this desktop client must be paired again before protected sync actions can continue.",
                  )
                : t(
                    "settings.librarySyncClientAuthPersistentHint",
                    "This client stays paired until you remove the pairing here or on the host.",
                  )}
            </div>
          </>
        )}

        {librarySyncValidation ? (
          <div
            className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-6 ${
              librarySyncValidation.ok &&
              librarySyncValidation.matches_library_id &&
              (!librarySyncValidation.pairing_checked || librarySyncValidation.pairing_valid)
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                : librarySyncValidation.ok || librarySyncValidation.reachable
                  ? "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
                  : "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100"
            }`}
          >
            <div className="font-semibold">
              {librarySyncValidation.pairing_checked && !librarySyncValidation.pairing_valid
                ? t(
                    "settings.librarySyncHostCheckPairingInvalid",
                    "Host is reachable, but desktop client pairing must be refreshed.",
                  )
                : librarySyncValidation.message}
            </div>
          </div>
        ) : null}
      </div>

      <div className={settingsSurfacePanelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {t("settings.librarySyncAdvancedTitle", "Advanced host details")}
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">
              {t(
                "settings.librarySyncAdvancedHint",
                "Open this only when you need diagnostics or cached snapshot details.",
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleAdvanced}
            className={settingsActionButtonClass(showLibraryClientAdvanced ? "accent" : "neutral")}
            disabled={!tauri || librarySyncBusy}
          >
            {showLibraryClientAdvanced
              ? t("settings.librarySyncHideAdvanced", "Hide details")
              : t("settings.librarySyncShowAdvanced", "Show details")}
          </button>
        </div>

        {showLibraryClientAdvanced ? (
          <div className="mt-4 space-y-4">
            <div className={settingsSurfacePanelClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                    {t("settings.librarySyncLibraryId", "Library ID")}
                  </div>
                  <div className={`mt-2 break-all ${settingsValueBoxClass}`}>
                    {librarySyncSettings?.library_id || t("common.loading", "Loading...")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onFetchSnapshot}
                  className={settingsActionButtonClass("neutral")}
                  disabled={
                    !tauri ||
                    librarySyncBusy ||
                    librarySyncValidationBusy ||
                    librarySyncSnapshotBusy ||
                    !librarySyncHostBaseUrlDraft.trim()
                  }
                >
                  {librarySyncSnapshotBusy
                    ? t("settings.librarySyncRefreshingSnapshot", "Refreshing snapshot...")
                    : t("settings.librarySyncFetchSnapshot", "Fetch snapshot")}
                </button>
              </div>

              {libraryVisibility.clientHasStatusDetails ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SettingsMetricTile
                    label={t("settings.librarySyncLastChecked", "Last checked")}
                    value={
                      librarySyncSettings?.last_checked_at
                        ? formatSettingsDateTime(librarySyncSettings.last_checked_at, locale)
                        : t("common.unknown", "Unknown")
                    }
                  />
                  <SettingsMetricTile
                    label={t("settings.librarySyncLastReachable", "Last reachable")}
                    value={
                      librarySyncSettings?.last_reachable_at
                        ? formatSettingsDateTime(librarySyncSettings.last_reachable_at, locale)
                        : t("common.unknown", "Unknown")
                    }
                  />
                </div>
              ) : null}

              {librarySyncSettings?.last_validation_message ? (
                <div className="surface-subtle mt-3 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                  {librarySyncSettings.last_validation_message}
                </div>
              ) : null}
            </div>

            {libraryVisibility.clientHasSnapshot && librarySyncSnapshot ? (
              <div className="surface-subtle px-4 py-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">
                    {t("settings.librarySyncCachedSnapshot", "Cached host snapshot")}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {librarySyncValidation?.ok && librarySyncValidation.matches_library_id
                      ? t("settings.librarySyncStatusLive", "Live")
                      : t("settings.librarySyncStatusCached", "Cached")}
                  </div>
                </div>
                <div className="mt-2 text-slate-600 dark:text-slate-300">
                  {t("settings.librarySyncSnapshotCapturedAt", "Captured")}:{" "}
                  <span className="font-semibold">
                    {formatSettingsDateTime(librarySyncSnapshot.captured_at, locale)}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <SettingsMetricTile
                    label={t("settings.librarySyncSnapshotTotalSpools", "Total spools")}
                    value={librarySyncSnapshot.total_spools}
                  />
                  <SettingsMetricTile
                    label={t("settings.librarySyncSnapshotAssigned", "Assigned")}
                    value={librarySyncSnapshot.in_use}
                  />
                  <SettingsMetricTile
                    label={t("settings.librarySyncSnapshotLowStock", "Low stock")}
                    value={librarySyncSnapshot.low_stock}
                  />
                  <SettingsMetricTile
                    label={t("settings.librarySyncSnapshotLoans", "Active loans")}
                    value={librarySyncSnapshot.active_loans}
                  />
                  <SettingsMetricTile
                    label={t("settings.librarySyncSnapshotPrinters", "Printers")}
                    value={librarySyncSnapshot.printers}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
