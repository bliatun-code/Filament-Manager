import type { SettingsBackupValidationState } from "./settings_backup_model";

export function useSettingsBackupValidationFlags(
  backupValidationState: SettingsBackupValidationState,
) {
  return {
    backupValidationHasExtraTables: backupValidationState.hasExtraTables,
    backupValidationHasMissingTables: backupValidationState.hasMissingTables,
    backupValidationHasWarnings: backupValidationState.hasWarnings,
    hasValidatedFullBackup: backupValidationState.hasValidatedFullBackup,
    hasValidatedLatestFullBackup: backupValidationState.hasValidatedLatestFullBackup,
  };
}
