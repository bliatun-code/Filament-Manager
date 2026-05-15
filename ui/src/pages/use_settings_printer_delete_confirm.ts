import { useCallback, useEffect, useState } from "react";
import type { PrinterRow } from "../lib/tauri_client";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

type UseSettingsPrinterDeleteConfirmInput = {
  printers: PrinterRow[];
};

export function useSettingsPrinterDeleteConfirm({
  printers,
}: UseSettingsPrinterDeleteConfirmInput) {
  const [confirmDeletePrinterId, setConfirmDeletePrinterId] = useState<string | null>(
    null,
  );

  const clearConfirmDeletePrinter = useCallback(() => {
    setConfirmDeletePrinterId(null);
  }, [setConfirmDeletePrinterId]);

  useSettingsAutoClearValue(confirmDeletePrinterId, clearConfirmDeletePrinter, 6000);

  useEffect(() => {
    if (!confirmDeletePrinterId) {
      return;
    }
    if (!printers.some((printer) => printer.id === confirmDeletePrinterId)) {
      clearConfirmDeletePrinter();
    }
  }, [clearConfirmDeletePrinter, confirmDeletePrinterId, printers]);

  return {
    confirmDeletePrinterId,
    setConfirmDeletePrinterId,
  };
}
