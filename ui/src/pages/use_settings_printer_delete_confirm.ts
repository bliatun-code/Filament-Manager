import { useCallback, useEffect } from "react";
import type { PrinterRow } from "../lib/tauri_client";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

type UseSettingsPrinterDeleteConfirmInput = {
  confirmDeletePrinterId: string | null;
  printers: PrinterRow[];
  setConfirmDeletePrinterId: (printerId: string | null) => void;
};

export function useSettingsPrinterDeleteConfirm({
  confirmDeletePrinterId,
  printers,
  setConfirmDeletePrinterId,
}: UseSettingsPrinterDeleteConfirmInput) {
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
}
