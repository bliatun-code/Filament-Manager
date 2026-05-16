import { useSettingsLibraryRoleChange } from "./use_settings_library_role_change";
import { useSettingsLibraryRoleChangeState } from "./use_settings_library_role_change_state";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type UseSettingsLibraryRoleFlowInput = {
  clearFullBackupProgress: () => void;
  handleSaveLibrarySyncSettings: (nextMode?: LibrarySyncMode) => Promise<boolean>;
  hasValidatedFullBackup: boolean;
  hasValidatedLatestFullBackup: boolean;
  lastFullBackupExportedAt: string | null;
  lastFullBackupImportedAt: string | null;
  librarySyncBusy: boolean;
  librarySyncSavedMode: LibrarySyncMode;
  setLibrarySyncModeDraft: (mode: LibrarySyncMode) => void;
};

export function useSettingsLibraryRoleFlow({
  clearFullBackupProgress,
  handleSaveLibrarySyncSettings,
  hasValidatedFullBackup,
  hasValidatedLatestFullBackup,
  lastFullBackupExportedAt,
  lastFullBackupImportedAt,
  librarySyncBusy,
  librarySyncSavedMode,
  setLibrarySyncModeDraft,
}: UseSettingsLibraryRoleFlowInput) {
  const roleChange = useSettingsLibraryRoleChange({
    clearFullBackupProgress,
    handleSaveLibrarySyncSettings,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    librarySyncBusy,
    librarySyncSavedMode,
    setLibrarySyncModeDraft,
  });
  const roleChangeState = useSettingsLibraryRoleChangeState({
    pendingLibraryRoleTarget: roleChange.pendingLibraryRoleTarget,
    librarySyncSavedMode,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
  });

  return {
    ...roleChange,
    roleChangeState,
  };
}
