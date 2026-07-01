import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Locale } from "../lib/i18n";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import type {
  BambuLiveIntegrationEntry,
  MasterCatalogRow,
  PrinterOverviewRow,
  PrinterRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import { buildSettingsPrintersRouteProps } from "./settings_printers_route_props";
import type { SettingsPrinterMessageLabels } from "./settings_printer_model";
import { useSettingsBambuLiveToggleActions } from "./use_settings_bambu_live_toggle_actions";
import { useSettingsPrinterActions } from "./use_settings_printer_actions";
import { useSettingsPrinterSectionState } from "./use_settings_printer_section_state";

type UseSettingsPrintersSectionInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  busy: boolean;
  catalogRows: MasterCatalogRow[];
  loading: boolean;
  locale: Locale;
  printerOverview: PrinterOverviewRow[];
  printers: PrinterRow[];
  reloadSettings: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostWritePaired: boolean;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsPrinterMessageLabels: () => SettingsPrinterMessageLabels;
  spoolRows: SpoolWithMasterRow[];
  tauri: boolean;
};

export function useSettingsPrintersSection({
  bambuLiveIntegrations,
  busy,
  catalogRows,
  loading,
  locale,
  printerOverview,
  printers,
  reloadSettings,
  setBusy,
  setError,
  setInfo,
  settingsClientHostBaseUrl,
  settingsClientHostWritePaired,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsPrinterMessageLabels,
  spoolRows,
  tauri,
}: UseSettingsPrintersSectionInput) {
  const {
    cancelPrinterEdit,
    confirmDeletePrinterId,
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    diagnosticChartFieldByPrinterId,
    diagnosticFilterByPrinterId,
    diagnosticSortByPrinterId,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editModelProfile,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    ensureDiagnosticSession,
    expandedBambuDetailsPrinterId,
    printerSlotsByPrinterId,
    setConfirmDeletePrinterId,
    setDiagnosticChartFieldByPrinterId,
    setDiagnosticFilterByPrinterId,
    setDiagnosticSortByPrinterId,
    setEditAmsUnits,
    setEditBambuLiveAccessCode,
    setEditBambuLiveEnabled,
    setEditBambuLiveHost,
    setEditBambuLivePrinterSerial,
    setEditPrinterModel,
    setEditPrinterName,
    setEditSlotsPerUnit,
    setExpandedBambuDetailsPrinterId,
    sortedPrinters,
    startPrinterEdit,
    toggleBambuLiveCapture,
  } = useSettingsPrinterSectionState({
    bambuLiveIntegrations,
    locale,
    printerOverview,
    printers,
  });
  const visualQaScenario = resolveDesktopVisualQaScenario();

  useEffect(() => {
    if (visualQaScenario !== "settings-printer-diagnostics") {
      return;
    }
    if (expandedBambuDetailsPrinterId) {
      return;
    }
    const livePrinter = sortedPrinters.find(
      (printer) => bambuLiveIntegrations[printer.id]?.enabled,
    );
    if (!livePrinter) {
      return;
    }
    ensureDiagnosticSession(livePrinter.id);
    setExpandedBambuDetailsPrinterId(livePrinter.id);
  }, [
    bambuLiveIntegrations,
    ensureDiagnosticSession,
    expandedBambuDetailsPrinterId,
    setExpandedBambuDetailsPrinterId,
    sortedPrinters,
    visualQaScenario,
  ]);

  const { handleToggleBambuLiveCapture, handleToggleBambuLiveDetails } =
    useSettingsBambuLiveToggleActions({
      ensureDiagnosticSession,
      setExpandedBambuDetailsPrinterId,
      toggleBambuLiveCapture,
    });

  const {
    handleCancelEditPrinter,
    handleDeletePrinter,
    handleSavePrinterReconfigure,
    handleStartEditPrinter,
  } = useSettingsPrinterActions({
    bambuLiveIntegrations,
    busy,
    cancelPrinterEdit,
    confirmDeletePrinterId,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    printerOverview,
    printers,
    reloadSettings,
    setBusy,
    setConfirmDeletePrinterId,
    setError,
    setInfo,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsPrinterMessageLabels,
    startPrinterEdit,
    tauri,
  });

  const settingsPrintersRouteProps = buildSettingsPrintersRouteProps({
    bambuLiveIntegrations,
    busy,
    catalogRows,
    confirmDeletePrinterId,
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    diagnosticChartFieldByPrinterId,
    diagnosticFilterByPrinterId,
    diagnosticSortByPrinterId,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editModelProfile,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    expandedBambuDetailsPrinterId,
    loading,
    printerSlotsByPrinterId,
    printers,
    settingsClientReadOnly,
    sortedPrinters,
    spoolRows,
    tauri,
    onBambuLiveAccessCodeChange: setEditBambuLiveAccessCode,
    onBambuLiveEnabledChange: setEditBambuLiveEnabled,
    onBambuLiveHostChange: setEditBambuLiveHost,
    onBambuLivePrinterSerialChange: setEditBambuLivePrinterSerial,
    onCancelEditPrinter: handleCancelEditPrinter,
    onCopyError: setError,
    onCopySuccess: setInfo,
    onDeletePrinter: handleDeletePrinter,
    onDiagnosticChartFieldChange: setDiagnosticChartFieldByPrinterId,
    onDiagnosticFilterChange: setDiagnosticFilterByPrinterId,
    onDiagnosticSortChange: setDiagnosticSortByPrinterId,
    onEditAmsUnitsChange: setEditAmsUnits,
    onEditPrinterModelChange: setEditPrinterModel,
    onEditPrinterNameChange: setEditPrinterName,
    onEditSlotsPerUnitChange: setEditSlotsPerUnit,
    onSavePrinterReconfigure: handleSavePrinterReconfigure,
    onStartEditPrinter: handleStartEditPrinter,
    onToggleBambuLiveCapture: handleToggleBambuLiveCapture,
    onToggleBambuLiveDetails: handleToggleBambuLiveDetails,
  });

  return { settingsPrintersRouteProps };
}
