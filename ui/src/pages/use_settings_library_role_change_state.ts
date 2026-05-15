import {
  buildLibraryRoleChangeState,
  type LibrarySyncMode,
} from "./settings_library_sync_model";

type UseSettingsLibraryRoleChangeStateOptions = {
  hasValidatedFullBackup: boolean;
  hasValidatedLatestFullBackup: boolean;
  lastFullBackupExportedAt: string | null;
  lastFullBackupImportedAt: string | null;
  librarySyncSavedMode: LibrarySyncMode;
  pendingLibraryRoleTarget: LibrarySyncMode | null;
};

export function useSettingsLibraryRoleChangeState({
  hasValidatedFullBackup,
  hasValidatedLatestFullBackup,
  lastFullBackupExportedAt,
  lastFullBackupImportedAt,
  librarySyncSavedMode,
  pendingLibraryRoleTarget,
}: UseSettingsLibraryRoleChangeStateOptions) {
  return buildLibraryRoleChangeState({
    target: pendingLibraryRoleTarget,
    savedMode: librarySyncSavedMode,
    hasExportedFullBackup: Boolean(lastFullBackupExportedAt),
    hasImportedFullBackup: Boolean(lastFullBackupImportedAt),
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
  });
}
