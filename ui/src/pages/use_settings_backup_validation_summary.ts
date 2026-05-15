import { useSettingsBackupValidationFlags } from "./use_settings_backup_validation_flags";
import { useSettingsBackupValidationState } from "./use_settings_backup_validation_state";

export function useSettingsBackupValidationSummary() {
  const validationState = useSettingsBackupValidationState();
  const validationFlags = useSettingsBackupValidationFlags(validationState.backupValidationState);

  return {
    ...validationState,
    ...validationFlags,
  };
}
