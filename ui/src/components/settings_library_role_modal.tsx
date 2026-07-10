import { AppModal } from "./app_modal";
import type { Locale } from "../lib/i18n";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import { formatSettingsDateTime } from "../lib/settings_utils";
import type { LibrarySyncSettings } from "../lib/tauri_client";
import type { LibraryRoleChangeState } from "../pages/settings_library_sync_model";
import { ModalFooter, ModalHeader, ModalNotice } from "./modal_chrome";

type TranslateFn = (key: string, fallback: string) => string;

const migrationStepClass = "surface-subtle px-4 py-3";

function migrationStepBadgeClass(done: boolean): string {
  return `rounded-full px-3 py-1 text-xs font-semibold ${
    done
      ? "border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200"
      : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
  }`;
}

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
        <ModalHeader
          eyebrow={t("settings.libraryRoleLabel", "Library role")}
          title={
            roleChangeTarget === "HOST"
              ? t("settings.librarySyncConfirmSwitchToHost", "Switch to Host")
              : roleChangeTarget === "CLIENT"
                ? t("settings.librarySyncConfirmSwitchToClient", "Switch to Client")
                : t("settings.librarySyncConfirmSwitchToStandalone", "Switch to Standalone")
          }
          subtitle={
            roleChangeState.fromClient && roleChangeState.toHost
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
                      )
          }
          closeLabel={t("common.close", "Close")}
          onClose={onClose}
          className="-mx-5 -mt-5"
        />

        {roleChangeState.fromClient && roleChangeState.toHost ? (
          <ModalNotice>
            {t(
              "settings.librarySyncRoleChangeClientToHostHint",
              "This client becomes its own host after the switch. If you later want to move library data from the current host, create a full backup there and import it later under Program maintenance on this device.",
            )}
          </ModalNotice>
        ) : null}

        {roleChangeState.fromClient && roleChangeState.toStandalone ? (
          <ModalNotice>
            {locale === "nb"
              ? `Denne klienten forventer vanligvis at et vertsbibliotek er tilgjengelig. Du kan eksportere en full sikkerhetskopi på ${
                  librarySyncSettings?.host_device_name || t("common.unknown", "Ukjent")
                } og importere den senere under Programvedlikehold hvis du vil fortsette lokalt.`
              : `This client normally expects a host library. You can export a full backup on ${
                  librarySyncSettings?.host_device_name || t("common.unknown", "Unknown")
                } and import it later under Program maintenance if you want to continue locally.`}
          </ModalNotice>
        ) : null}

        {roleChangeState.toClient ? (
          <ModalNotice>
            {t(
              "settings.librarySyncRoleChangeClientHint",
              "Client mode expects a host connection. After switching, use Desktop client pairing to connect this device to the host you want to use.",
            )}
          </ModalNotice>
        ) : null}

        {(roleChangeState.requiresExport ||
          roleChangeState.requiresValidate ||
          roleChangeState.requiresImport) ? (
          <div className="space-y-3">
            {roleChangeState.requiresExport ? (
              <div className={migrationStepClass}>
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
                    <span className={migrationStepBadgeClass(Boolean(lastFullBackupExportedAt))}>
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
              <div className={migrationStepClass}>
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
                    <span className={migrationStepBadgeClass(roleChangeState.validateDone)}>
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
              <div className={migrationStepClass}>
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
                    <span className={migrationStepBadgeClass(Boolean(lastFullBackupImportedAt))}>
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
          <ModalNotice tone="warning">
            {t(
              "settings.librarySyncConfirmArmedHint",
              "One more click confirms this role change.",
            )}
          </ModalNotice>
        ) : null}

        <ModalFooter
          shrink={false}
          className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 bg-white/95 px-5 pb-5 pt-4 shadow-[0_-12px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:bg-slate-900/95"
        >
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
            className={settingsActionButtonClass(
              libraryRoleConfirmArmed ? "warning" : "primary",
              "comfortable",
            )}
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
        </ModalFooter>
      </div>
    </AppModal>
  );
}
