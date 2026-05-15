import { useSettingsBackupFileInputs } from "./use_settings_backup_file_inputs";
import { useSettingsResetConfirm } from "./use_settings_reset_confirm";

type UseSettingsBackupFileControlsInput = {
  busy: boolean;
  tauri: boolean;
};

export function useSettingsBackupFileControls({
  busy,
  tauri,
}: UseSettingsBackupFileControlsInput) {
  const resetConfirm = useSettingsResetConfirm();
  const fileInputs = useSettingsBackupFileInputs({
    busy,
    clearConfirmResetAction: resetConfirm.clearConfirmResetAction,
    tauri,
  });

  return {
    ...resetConfirm,
    ...fileInputs,
  };
}
