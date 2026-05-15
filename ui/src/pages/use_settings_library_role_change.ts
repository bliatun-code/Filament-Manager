import { useCallback, useState } from "react";
import {
  buildLibraryRoleChangeState,
  type LibrarySyncMode,
} from "./settings_library_sync_model";

type UseSettingsLibraryRoleChangeInput = {
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

export function useSettingsLibraryRoleChange({
  clearFullBackupProgress,
  handleSaveLibrarySyncSettings,
  hasValidatedFullBackup,
  hasValidatedLatestFullBackup,
  lastFullBackupExportedAt,
  lastFullBackupImportedAt,
  librarySyncBusy,
  librarySyncSavedMode,
  setLibrarySyncModeDraft,
}: UseSettingsLibraryRoleChangeInput) {
  const [pendingLibraryRoleTarget, setPendingLibraryRoleTarget] =
    useState<LibrarySyncMode | null>(null);
  const [libraryRoleConfirmArmed, setLibraryRoleConfirmArmed] = useState(false);

  const closeLibraryRoleChangeModal = useCallback(() => {
    setPendingLibraryRoleTarget(null);
    setLibraryRoleConfirmArmed(false);
    setLibrarySyncModeDraft(librarySyncSavedMode);
    clearFullBackupProgress();
  }, [clearFullBackupProgress, librarySyncSavedMode, setLibrarySyncModeDraft]);

  const handleRequestLibraryRoleChange = useCallback((target: LibrarySyncMode) => {
    if (target === librarySyncSavedMode) {
      setPendingLibraryRoleTarget(null);
      setLibraryRoleConfirmArmed(false);
      setLibrarySyncModeDraft(target);
      return;
    }

    clearFullBackupProgress();
    setPendingLibraryRoleTarget(target);
    setLibraryRoleConfirmArmed(false);
    setLibrarySyncModeDraft(target);
  }, [clearFullBackupProgress, librarySyncSavedMode, setLibrarySyncModeDraft]);

  const handleConfirmLibraryRoleChange = useCallback(async () => {
    if (!pendingLibraryRoleTarget || librarySyncBusy) {
      return;
    }

    const roleChangeState = buildLibraryRoleChangeState({
      target: pendingLibraryRoleTarget,
      savedMode: librarySyncSavedMode,
      hasExportedFullBackup: Boolean(lastFullBackupExportedAt),
      hasImportedFullBackup: Boolean(lastFullBackupImportedAt),
      hasValidatedFullBackup,
      hasValidatedLatestFullBackup,
    });

    if (!roleChangeState.ready) {
      return;
    }

    if (!libraryRoleConfirmArmed) {
      setLibraryRoleConfirmArmed(true);
      return;
    }

    const saved = await handleSaveLibrarySyncSettings(pendingLibraryRoleTarget);
    if (saved) {
      setPendingLibraryRoleTarget(null);
      setLibraryRoleConfirmArmed(false);
    }
  }, [
    handleSaveLibrarySyncSettings,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    libraryRoleConfirmArmed,
    librarySyncBusy,
    librarySyncSavedMode,
    pendingLibraryRoleTarget,
  ]);

  return {
    closeLibraryRoleChangeModal,
    handleConfirmLibraryRoleChange,
    handleRequestLibraryRoleChange,
    libraryRoleConfirmArmed,
    pendingLibraryRoleTarget,
  };
}
