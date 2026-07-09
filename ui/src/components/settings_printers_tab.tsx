import type {
  Dispatch,
  SetStateAction,
} from "react";
import type {
  DiagnosticCaptureSession,
  DiagnosticFilterKey,
  DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import { useI18n } from "../lib/i18n";
import { formatSettingsDateTime } from "../lib/settings_utils";
import type { PrinterModelProfile } from "../lib/printer_profiles";
import type {
  BambuLiveIntegrationEntry,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterRow,
} from "../lib/tauri_client";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  buildSettingsBambuLiveDiagnosticsModel,
} from "../pages/settings_bambu_live_diagnostics_model";
import {
  SettingsPrinterCard,
  type SettingsPrinterEditActions,
  type SettingsPrinterEditDraft,
  type SettingsPrinterLiveDiagnosticsActions,
  type SettingsPrinterLiveDiagnosticsState,
} from "./settings_printer_card";
import { SettingsSurfaceCard } from "./settings_ui";

export type SettingsPrintersTabProps = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  busy: boolean;
  catalogRows: MasterCatalogRow[];
  confirmDeletePrinterId: string | null;
  diagnosticCaptureActiveByPrinterId: Record<string, boolean>;
  diagnosticCaptureByPrinterId: Record<string, DiagnosticCaptureSession>;
  diagnosticChartFieldByPrinterId: Record<string, string>;
  diagnosticFilterByPrinterId: Record<string, DiagnosticFilterKey>;
  diagnosticSortByPrinterId: Record<string, DiagnosticSortKey>;
  editAmsUnits: string;
  editBambuLiveAccessCode: string;
  editBambuLiveEnabled: boolean;
  editBambuLiveHost: string;
  editBambuLivePrinterSerial: string;
  editModelProfile: PrinterModelProfile;
  editPrinterId: string | null;
  editPrinterModel: string;
  editPrinterName: string;
  editSlotsPerUnit: string;
  expandedBambuDetailsPrinterId: string | null;
  loading: boolean;
  printerSlotsByPrinterId: Map<string, PrinterAmsSlotRow[]>;
  printers: PrinterRow[];
  settingsClientReadOnly: boolean;
  sortedPrinters: PrinterRow[];
  spoolRows: NormalizedSpoolWithMasterRow[];
  tauri: boolean;
  onBambuLiveAccessCodeChange: (value: string) => void;
  onBambuLiveEnabledChange: (value: boolean) => void;
  onBambuLiveHostChange: (value: string) => void;
  onBambuLivePrinterSerialChange: (value: string) => void;
  onCancelEditPrinter: () => void;
  onCopyError: (message: string) => void;
  onCopySuccess: (message: string) => void;
  onDeletePrinter: (printer: PrinterRow) => void;
  onDiagnosticChartFieldChange: (updater: SetStateAction<Record<string, string>>) => void;
  onDiagnosticFilterChange: Dispatch<SetStateAction<Record<string, DiagnosticFilterKey>>>;
  onDiagnosticSortChange: Dispatch<SetStateAction<Record<string, DiagnosticSortKey>>>;
  onEditAmsUnitsChange: (value: string) => void;
  onEditPrinterModelChange: (value: string) => void;
  onEditPrinterNameChange: (value: string) => void;
  onEditSlotsPerUnitChange: (value: string) => void;
  onSavePrinterReconfigure: () => void;
  onStartEditPrinter: (printer: PrinterRow) => void;
  onToggleBambuLiveCapture: (printerId: string, captureActive: boolean) => void;
  onToggleBambuLiveDetails: (printerId: string) => void;
};

export function SettingsPrintersTab({
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
  onBambuLiveAccessCodeChange,
  onBambuLiveEnabledChange,
  onBambuLiveHostChange,
  onBambuLivePrinterSerialChange,
  onCancelEditPrinter,
  onCopyError,
  onCopySuccess,
  onDeletePrinter,
  onDiagnosticChartFieldChange,
  onDiagnosticFilterChange,
  onDiagnosticSortChange,
  onEditAmsUnitsChange,
  onEditPrinterModelChange,
  onEditPrinterNameChange,
  onEditSlotsPerUnitChange,
  onSavePrinterReconfigure,
  onStartEditPrinter,
  onToggleBambuLiveCapture,
  onToggleBambuLiveDetails,
}: SettingsPrintersTabProps) {
  const { locale, t } = useI18n();
  const editDraft: SettingsPrinterEditDraft = {
    bambuLiveAccessCode: editBambuLiveAccessCode,
    bambuLiveEnabled: editBambuLiveEnabled,
    bambuLiveHost: editBambuLiveHost,
    bambuLivePrinterSerial: editBambuLivePrinterSerial,
    model: editPrinterModel,
    modelProfile: editModelProfile,
    name: editPrinterName,
    slotsPerUnit: editSlotsPerUnit,
    units: editAmsUnits,
  };

  return (
    <SettingsSurfaceCard className="xl:col-span-2" eyebrow={t("nav.printers", "Printers")}>
      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="surface-subtle px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
            {t("common.loadingPrinters", "Loading printers...")}
          </div>
        ) : null}
        {!loading && printers.length === 0 ? (
          <div className="surface-subtle border-dashed px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
            {t("printers.noPrinters", "No printers configured yet. Use Add printer to create one.")}
          </div>
        ) : null}
        {sortedPrinters.map((printer) => {
          const printerSlots = printerSlotsByPrinterId.get(printer.id) ?? [];
          const liveConfig = bambuLiveIntegrations[printer.id] ?? null;
          const diagnosticSession = diagnosticCaptureByPrinterId[printer.id] ?? null;
          const captureActive = diagnosticCaptureActiveByPrinterId[printer.id] ?? false;
          const diagnosticSort = diagnosticSortByPrinterId[printer.id] ?? "path";
          const diagnosticFilter = diagnosticFilterByPrinterId[printer.id] ?? "all";
          const bambuDiagnostics = buildSettingsBambuLiveDiagnosticsModel({
            catalogRows,
            diagnosticFilter,
            diagnosticSession,
            diagnosticSort,
            formatDateTime: (value) => formatSettingsDateTime(value, locale),
            liveConfig,
            printerSlots,
            selectedChartFieldPath: diagnosticChartFieldByPrinterId[printer.id],
            spoolRows,
            t,
          });
          const isEditing = editPrinterId === printer.id;
          const editActions: SettingsPrinterEditActions = {
            onBambuLiveAccessCodeChange,
            onBambuLiveEnabledChange,
            onBambuLiveHostChange,
            onBambuLivePrinterSerialChange,
            onCancel: onCancelEditPrinter,
            onModelChange: onEditPrinterModelChange,
            onNameChange: onEditPrinterNameChange,
            onSave: onSavePrinterReconfigure,
            onSlotsPerUnitChange: onEditSlotsPerUnitChange,
            onStart: () => onStartEditPrinter(printer),
            onUnitsChange: onEditAmsUnitsChange,
          };
          const liveDiagnostics: SettingsPrinterLiveDiagnosticsState = {
            captureActive,
            diagnosticFilter,
            diagnosticSession,
            diagnosticSort,
            liveConfig,
            model: bambuDiagnostics,
          };
          const liveDiagnosticsActions: SettingsPrinterLiveDiagnosticsActions = {
            onCopyError,
            onCopySuccess,
            onDiagnosticFilterChange: (filter) =>
              onDiagnosticFilterChange((current) => ({
                ...current,
                [printer.id]: filter,
              })),
            onDiagnosticSortChange: (sort) =>
              onDiagnosticSortChange((current) => ({
                ...current,
                [printer.id]: sort,
              })),
            onSelectedChartFieldChange: (fieldPath) =>
              onDiagnosticChartFieldChange((current) => ({
                ...current,
                [printer.id]: fieldPath,
              })),
            onToggleCapture: () => onToggleBambuLiveCapture(printer.id, captureActive),
            onToggleDetails: () => onToggleBambuLiveDetails(printer.id),
          };

          return (
            <SettingsPrinterCard
              key={printer.id}
              confirmDelete={confirmDeletePrinterId === printer.id}
              editActions={editActions}
              editDraft={editDraft}
              expanded={expandedBambuDetailsPrinterId === printer.id}
              isEditing={isEditing}
              liveDiagnostics={liveDiagnostics}
              liveDiagnosticsActions={liveDiagnosticsActions}
              printer={printer}
              printerSlots={printerSlots}
              settingsClientReadOnly={settingsClientReadOnly}
              busy={busy}
              tauri={tauri}
              onRemove={() => onDeletePrinter(printer)}
            />
          );
        })}
      </div>
    </SettingsSurfaceCard>
  );
}
