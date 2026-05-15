import { useRef } from "react";

type UseSettingsBackupFileInputsInput = {
  busy: boolean;
  clearConfirmResetAction: () => void;
  tauri: boolean;
};

export function useSettingsBackupFileInputs({
  busy,
  clearConfirmResetAction,
  tauri,
}: UseSettingsBackupFileInputsInput) {
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const backupValidateInputRef = useRef<HTMLInputElement | null>(null);

  function openDataImport() {
    if (!tauri || busy) {
      return;
    }
    clearConfirmResetAction();
    backupImportInputRef.current?.click();
  }

  function openBackupValidate() {
    if (!tauri || busy) {
      return;
    }
    clearConfirmResetAction();
    backupValidateInputRef.current?.click();
  }

  return {
    backupImportInputRef,
    backupValidateInputRef,
    handleOpenBackupValidate: openBackupValidate,
    handleOpenDataImport: openDataImport,
    openBackupValidate,
    openDataImport,
  };
}
