import type {
  BambuLiveIntegrationEntry,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
import { useSettingsBambuLiveDiagnostics } from "./use_settings_bambu_live_diagnostics";
import { useSettingsPrinterDeleteConfirm } from "./use_settings_printer_delete_confirm";
import { useSettingsPrinterDerivedState } from "./use_settings_printer_derived_state";
import { useSettingsPrinterEditDraft } from "./use_settings_printer_edit_draft";

type UseSettingsPrinterSectionStateInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  locale: Locale;
  printerOverview: PrinterOverviewRow[];
  printers: PrinterRow[];
};

export function useSettingsPrinterSectionState({
  bambuLiveIntegrations,
  locale,
  printerOverview,
  printers,
}: UseSettingsPrinterSectionStateInput) {
  const editDraft = useSettingsPrinterEditDraft();
  const diagnostics = useSettingsBambuLiveDiagnostics({
    bambuLiveIntegrations,
    expandedBambuDetailsPrinterId: editDraft.expandedBambuDetailsPrinterId,
  });
  const derivedState = useSettingsPrinterDerivedState({
    editPrinterModel: editDraft.editPrinterModel,
    locale,
    printerOverview,
    printers,
  });
  const deleteConfirm = useSettingsPrinterDeleteConfirm({ printers });

  return {
    ...editDraft,
    ...diagnostics,
    ...derivedState,
    ...deleteConfirm,
  };
}
