import { AppModal } from "./app_modal";
import type { Locale } from "../lib/i18n";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import { formatSettingsDateTime } from "../lib/settings_utils";
import type { LibrarySyncSettings } from "../lib/tauri_client";
import type { LibraryRoleChangeState } from "../pages/settings_library_sync_model";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsLibraryRoleModalProps = {
  busy: boolean;
  lastFullBackupExportedAt: string | null;
  lastFullBackupImportedAt: string | null;
  lastFullBackupValidatedAt: string | null;
  libraryRoleConfirmArmed: boolean;
  librarySyncBusy: boolean;
  librarySyncSettings: LibrarySyncSettings | null;
  locale: Locale;
  roleChangeState: LibraryRoleChangeState;
  tauri: boolean;
  t: TranslateFn;
  onClose: () => void;
  onConfirm: () => void;
  onExportFullBackup: () => void;
  onOpenBackupValidate: () => void;
  onOpenDataImport: () => void;
};

export function SettingsLibraryRoleModal({
  busy,
  lastFullBackupExportedAt,
  lastFullBackupImportedAt,
  lastFullBackupValidatedAt,
  libraryRoleConfirmArmed,
  librarySyncBusy,
  librarySyncSettings,
  locale,
  roleChangeState,
  tauri,
  t,
  onClose,
  onConfirm,
  onExportFullBackup,
  onOpenBackupValidate,
  onOpenDataImport,
}: SettingsLibraryRoleModalProps) {
  if (!roleChangeState.target) {
    return null;
  }

  const roleChangeTarget = roleChangeState.target;

  return (
    <AppModal closeOnBackdrop onBackdropClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {t("settings.libraryRoleLabel", "Library role")}
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {roleChangeTarget === "HOST"
                ? t("settings.librarySyncConfirmSwitchToHost", "Switch to Host")
                : roleChangeTarget === "CLIENT"
                  ? t("settings.librarySyncConfirmSwitchToClient", "Switch to Client")
                  : t("settings.librarySyncConfirmSwitchToStandalone", "Switch to Standalone")}
            </div>
            <div className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {roleChangeState.fromClient && roleChangeState.toHost
                ? t(
                    "settings.librarySyncHostHint",
                    "This device is prepared to host the library for other desktop or browser clients.",
                  )
                : roleChangeState.fromClient && roleChangeState.toStandalone
                  ? t(
                      "settings.librarySyncStandaloneHint",
                      "This device keeps using its own local library only.",
                    )
                  : roleChangeTarget === "HOST"
                    ? t(
                        "settings.librarySyncHostHint",
                        "This device is prepared to host the library for other desktop or browser clients.",
                      )
                    : roleChangeTarget === "CLIENT"
                      ? t(
                          "settings.librarySyncClientHint",
                          "This device connects to another host and keeps a read-only fallback cache when that host is unavailable.",
                        )
                      : t(
                          "settings.librarySyncStandaloneHint",
                          "This device keeps using its own local library only.",
                        )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/85 text-[1.35rem] leading-none text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800/60"
          >
            ×
          </button>
        </div>

        {roleChangeState.fromClient && roleChangeState.toHost ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
            {t(
              "settings.librarySyncRoleChangeClientToHostHint",
              "This client becomes its own host after the switch. If you later want to move library data from the current host, create a full backup there and import it later under Program maintenance on this device.",
            )}
          </div>
        ) : null}

        {roleChangeState.fromClient && roleChangeState.toStandalone ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
            {locale === "nb"
              ? `Denne klienten forventer vanligvis at et vertsbibliotek er tilgjengelig. Du kan eksportere en full sikkerhetskopi på ${
                  librarySyncSettings?.host_device_name || t("common.unknown", "Ukjent")
                } og importere den senere under Programvedlikehold hvis du vil fortsette lokalt.`
              : `This client normally expects a host library. You can export a full backup on ${
                  librarySyncSettings?.host_device_name || t("common.unknown", "Unknown")
                } and import it later under Program maintenance if you want to continue locally.`}
          </div>
        ) : null}

        {roleChangeState.toClient ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200">
            {t(
              "settings.librarySyncRoleChangeClientHint",
              "Client mode expects a host connection. After switching, use Desktop client pairing to connect this device to the host you want to use.",
            )}
          </div>
        ) : null}

        {(roleChangeState.requiresExport ||
          roleChangeState.requiresValidate ||
          roleChangeState.requiresImport) ? (
          <div className="space-y-3">
            {roleChangeState.requiresExport ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {t("settings.exportFullBackup", "Export full backup (JSON)")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {lastFullBackupExportedAt
                        ? formatSettingsDateTime(lastFullBackupExportedAt, locale)
                        : t(
                            "settings.librarySyncMigrationStepExportHint",
                            "Use the export button below before importing on the next machine.",
                          )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        lastFullBackupExportedAt
                          ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                      }`}
                    >
                      {lastFullBackupExportedAt
                        ? t("settings.librarySyncStepDone", "Done")
                        : t("settings.librarySyncStepPending", "Pending")}
                    </span>
                    <button
                      type="button"
                      onClick={onExportFullBackup}
                      className={settingsActionButtonClass("neutral")}
                      disabled={!tauri || busy}
                    >
                      {t("settings.exportFullBackup", "Export full backup (JSON)")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {roleChangeState.requiresValidate ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {t("settings.validateBackup", "Validate backup file")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {roleChangeState.validateDone
                        ? `${t(
                            "settings.librarySyncRoleChangeAutoValidatedHint",
                            "The latest exported backup was validated automatically in this guided flow.",
                          )} ${formatSettingsDateTime(
                            lastFullBackupValidatedAt || lastFullBackupExportedAt || "",
                            locale,
                          )}`
                        : t(
                            "settings.librarySyncRoleChangeValidateImportHint",
                            "Validate the same backup here. That backup can be imported later under Program maintenance on the device that should continue with the library.",
                          )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        roleChangeState.validateDone
                          ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                      }`}
                    >
                      {roleChangeState.validateDone
                        ? t("settings.librarySyncStepDone", "Done")
                        : t("settings.librarySyncStepPending", "Pending")}
                    </span>
                    {roleChangeState.validateDone ? null : (
                      <button
                        type="button"
                        onClick={onOpenBackupValidate}
                        className={settingsActionButtonClass("neutral")}
                        disabled={!tauri || busy}
                      >
                        {t("settings.validateBackup", "Validate backup file")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {roleChangeState.requiresImport ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {t("settings.importDataFile", "Import backup/data file")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {lastFullBackupImportedAt
                        ? formatSettingsDateTime(lastFullBackupImportedAt, locale)
                        : t(
                            "settings.librarySyncMigrationStepImportHint",
                            "Import the host backup here before this device takes over.",
                          )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        lastFullBackupImportedAt
                          ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                      }`}
                    >
                      {lastFullBackupImportedAt
                        ? t("settings.librarySyncStepDone", "Done")
                        : t("settings.librarySyncStepPending", "Pending")}
                    </span>
                    <button
                      type="button"
                      onClick={onOpenDataImport}
                      className={settingsActionButtonClass("neutral")}
                      disabled={!tauri || busy}
                    >
                      {t("settings.importDataFile", "Import backup/data file")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {libraryRoleConfirmArmed ? (
          <div className="rounded-xl border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
            {t(
              "settings.librarySyncConfirmArmedHint",
              "One more click confirms this role change.",
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
          <button
            type="button"
            onClick={onClose}
            className={settingsActionButtonClass("neutral")}
            disabled={librarySyncBusy}
          >
            {t("common.close", "Close")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
              libraryRoleConfirmArmed
                ? "border border-amber-300 bg-amber-500 text-slate-950 shadow-amber-900/20 hover:bg-amber-400 dark:border-amber-400/40 dark:bg-amber-400 dark:hover:bg-amber-300"
                : "border border-indigo-300 bg-indigo-500 text-white shadow-indigo-900/20 hover:bg-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-400 dark:text-slate-950 dark:hover:bg-indigo-300"
            }`}
            disabled={!tauri || librarySyncBusy || !roleChangeState.ready}
          >
            {librarySyncBusy
              ? t("settings.librarySyncSaving", "Saving...")
              : libraryRoleConfirmArmed
                ? t("settings.librarySyncConfirmAgain", "Click again to confirm")
                : roleChangeTarget === "HOST"
                  ? t("settings.librarySyncConfirmSwitchToHost", "Switch to Host")
                  : roleChangeTarget === "CLIENT"
                    ? t("settings.librarySyncConfirmSwitchToClient", "Switch to Client")
                    : t("settings.librarySyncConfirmSwitchToStandalone", "Switch to Standalone")}
          </button>
        </div>
      </div>
    </AppModal>
  );
}
