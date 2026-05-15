import { useMemo } from "react";
import { resolvePrinterModelProfile } from "../lib/printer_profiles";
import type { PrinterOverviewRow, PrinterRow } from "../lib/tauri_client";
import {
  buildPrinterSlotsByPrinterId,
  sortSettingsPrinters,
} from "./settings_printer_model";

type UseSettingsPrinterDerivedStateOptions = {
  editPrinterModel: string;
  locale: string;
  printerOverview: PrinterOverviewRow[];
  printers: PrinterRow[];
};

export function useSettingsPrinterDerivedState({
  editPrinterModel,
  locale,
  printerOverview,
  printers,
}: UseSettingsPrinterDerivedStateOptions) {
  const sortedPrinters = useMemo(
    () => sortSettingsPrinters(printers, locale),
    [locale, printers],
  );
  const printerSlotsByPrinterId = useMemo(
    () => buildPrinterSlotsByPrinterId(printerOverview),
    [printerOverview],
  );
  const editModelProfile = useMemo(
    () => resolvePrinterModelProfile(editPrinterModel || ""),
    [editPrinterModel],
  );

  return {
    editModelProfile,
    printerSlotsByPrinterId,
    sortedPrinters,
  };
}
