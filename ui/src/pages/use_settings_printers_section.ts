import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Locale } from "../lib/i18n";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import type {
  BambuLiveIntegrationEntry,
  MasterCatalogRow,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import { buildSettingsPrintersRouteProps } from "./settings_printers_route_props";
import {
  chooseSettingsPrinterEditorVisualQaPrinter,
  type SettingsPrinterMessageLabels,
} from "./settings_printer_model";
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
  spoolRows: NormalizedSpoolWithMasterRow[];
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
  const printerEditorDiscardAppliedRef = useRef(false);
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
    editPrinterDirty,
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
  const isDiagnosticsVisualQaScenario =
    visualQaScenario === "settings-printer-diagnostics" ||
    visualQaScenario === "settings-printer-diagnostics-fields" ||
    visualQaScenario === "settings-printer-diagnostics-paused";
  const isPrinterEditorVisualQaScenario =
    visualQaScenario === "settings-printer-editor" ||
    visualQaScenario === "settings-printer-editor-dirty" ||
    visualQaScenario === "settings-printer-editor-discard";
  const isDirtyPrinterEditorVisualQaScenario =
    visualQaScenario === "settings-printer-editor-dirty" ||
    visualQaScenario === "settings-printer-editor-discard";

  useEffect(() => {
    if (!isPrinterEditorVisualQaScenario || loading) {
      return;
    }
    const editorPrinter = chooseSettingsPrinterEditorVisualQaPrinter(
      sortedPrinters,
      bambuLiveIntegrations,
    );
    if (!editorPrinter) {
      return;
    }

    if (expandedBambuDetailsPrinterId !== null) {
      setExpandedBambuDetailsPrinterId(null);
    }
    if (editPrinterId !== editorPrinter.id) {
      startPrinterEdit({
        bambuLiveIntegrations,
        printer: editorPrinter,
        printerOverview,
      });
      return;
    }
    if (isDirtyPrinterEditorVisualQaScenario) {
      const dirtyPrinterName = `${editorPrinter.name} (draft)`;
      if (editPrinterName !== dirtyPrinterName) {
        setEditPrinterName(dirtyPrinterName);
      }
    }
  }, [
    bambuLiveIntegrations,
    editPrinterId,
    editPrinterName,
    expandedBambuDetailsPrinterId,
    isDirtyPrinterEditorVisualQaScenario,
    isPrinterEditorVisualQaScenario,
    loading,
    printerOverview,
    setEditPrinterName,
    setExpandedBambuDetailsPrinterId,
    sortedPrinters,
    startPrinterEdit,
    visualQaScenario,
  ]);

  useEffect(() => {
    if (
      !isPrinterEditorVisualQaScenario ||
      visualQaScenario === "settings-printer-editor-discard" ||
      !editPrinterId
    ) {
      return;
    }

    const timeoutIds: number[] = [];
    const revealEditorState = () => {
      const dirtyScenario = visualQaScenario === "settings-printer-editor-dirty";
      const selector = dirtyScenario
        ? "[data-desktop-visual-qa-target='settings-printer-editor-actions']"
        : "[data-desktop-visual-qa-target='settings-printer-editor']";
      document.querySelector(selector)?.scrollIntoView({
        behavior: "auto",
        block: dirtyScenario ? "end" : "center",
      });
    };
    const scheduleReveal = () => {
      for (const delay of [150, 450, 900]) {
        timeoutIds.push(window.setTimeout(revealEditorState, delay));
      }
    };

    scheduleReveal();
    window.addEventListener("resize", scheduleReveal);
    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("resize", scheduleReveal);
    };
  }, [editPrinterId, isPrinterEditorVisualQaScenario, visualQaScenario]);

  useEffect(() => {
    if (
      visualQaScenario !== "settings-printer-editor-discard" ||
      !editPrinterId ||
      !editPrinterDirty
    ) {
      return;
    }

    const timeoutIds: number[] = [];
    const revealDiscardConfirmation = () => {
      const confirmation = document.querySelector(
        "[data-desktop-visual-qa-target='settings-printer-discard-confirmation']",
      );
      if (confirmation) {
        printerEditorDiscardAppliedRef.current = true;
        confirmation.scrollIntoView({ behavior: "auto", block: "center" });
        return;
      }

      const cancelButton = document.querySelector<HTMLButtonElement>(
        "[data-desktop-visual-qa-action='settings-printer-cancel']",
      );
      if (!cancelButton || cancelButton.disabled) {
        return;
      }
      cancelButton.click();
    };
    const scheduleReveal = () => {
      for (const delay of [150, 450, 900, 1_400]) {
        timeoutIds.push(window.setTimeout(revealDiscardConfirmation, delay));
      }
    };

    scheduleReveal();
    window.addEventListener("resize", scheduleReveal);
    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("resize", scheduleReveal);
    };
  }, [busy, editPrinterDirty, editPrinterId, visualQaScenario]);

  useEffect(() => {
    if (!isDiagnosticsVisualQaScenario) {
      return;
    }
    const livePrinter = sortedPrinters.find(
      (printer) => bambuLiveIntegrations[printer.id]?.enabled,
    );
    if (!livePrinter) {
      return;
    }

    if (expandedBambuDetailsPrinterId !== livePrinter.id) {
      ensureDiagnosticSession(livePrinter.id);
      setExpandedBambuDetailsPrinterId(livePrinter.id);
      return;
    }

    if (
      !diagnosticCaptureByPrinterId[livePrinter.id] ||
      diagnosticCaptureActiveByPrinterId[livePrinter.id] == null
    ) {
      ensureDiagnosticSession(livePrinter.id);
      return;
    }

    if (visualQaScenario === "settings-printer-diagnostics-fields") {
      setDiagnosticSortByPrinterId((current) => {
        if (current[livePrinter.id] === "change_count") {
          return current;
        }
        return { ...current, [livePrinter.id]: "change_count" };
      });
      setDiagnosticFilterByPrinterId((current) => {
        if (current[livePrinter.id] === "all") {
          return current;
        }
        return { ...current, [livePrinter.id]: "all" };
      });
    }

    if (
      visualQaScenario === "settings-printer-diagnostics-paused" &&
      diagnosticCaptureActiveByPrinterId[livePrinter.id] === true
    ) {
      toggleBambuLiveCapture(livePrinter.id, true);
    }
  }, [
    bambuLiveIntegrations,
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    ensureDiagnosticSession,
    expandedBambuDetailsPrinterId,
    isDiagnosticsVisualQaScenario,
    setDiagnosticFilterByPrinterId,
    setDiagnosticSortByPrinterId,
    setExpandedBambuDetailsPrinterId,
    sortedPrinters,
    toggleBambuLiveCapture,
    visualQaScenario,
  ]);

  useEffect(() => {
    if (visualQaScenario !== "settings-printer-diagnostics-fields") {
      return;
    }
    if (!expandedBambuDetailsPrinterId) {
      return;
    }
    const capturedFieldCount =
      diagnosticCaptureByPrinterId[expandedBambuDetailsPrinterId]?.fields.length ?? 0;
    if (capturedFieldCount === 0) {
      return;
    }

    let frame: number | null = null;
    let timers: number[] = [];
    const revealCapturedFields = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        document
          .querySelector("[data-desktop-visual-qa-target='bambu-live-captured-fields']")
          ?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    };
    const scheduleReveal = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [150, 450, 900].map((delay) =>
        window.setTimeout(revealCapturedFields, delay),
      );
      revealCapturedFields();
    };

    scheduleReveal();
    window.addEventListener("resize", scheduleReveal);
    return () => {
      window.removeEventListener("resize", scheduleReveal);
      timers.forEach((timer) => window.clearTimeout(timer));
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [diagnosticCaptureByPrinterId, expandedBambuDetailsPrinterId, visualQaScenario]);

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
    editPrinterDirty,
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
    editPrinterDirty,
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
