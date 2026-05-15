import type {
  DiagnosticCaptureSession,
  DiagnosticFilterKey,
  DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import {
  describeConfiguredPrinterSetup,
  findPrinterModelProfileExact,
  hasConfiguredMultiMaterial,
  type PrinterModelProfile,
} from "../lib/printer_profiles";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import { useI18n } from "../lib/i18n";
import { useResolvedTheme } from "../lib/theme_mode";
import type {
  BambuLiveIntegrationSettings,
  PrinterAmsSlotRow,
  PrinterRow,
} from "../lib/tauri_client";
import type { SettingsBambuLiveDiagnosticsModel } from "../pages/settings_bambu_live_diagnostics_model";
import { isBambuLabPrinter } from "../pages/settings_printer_model";
import { SettingsBambuLiveObservedDetailsPanel } from "./settings_bambu_live_observed_details_panel";
import { SettingsPrinterCardHeader } from "./settings_printer_card_header";
import { SettingsPrinterEditForm } from "./settings_printer_edit_form";

type SettingsPrinterCardProps = {
  bambuDiagnostics: SettingsBambuLiveDiagnosticsModel;
  captureActive: boolean;
  confirmDelete: boolean;
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  editBambuLiveAccessCode: string;
  editBambuLiveEnabled: boolean;
  editBambuLiveHost: string;
  editBambuLivePrinterSerial: string;
  editModel: string;
  editModelProfile: PrinterModelProfile;
  editName: string;
  editSlotsPerUnit: string;
  editUnits: string;
  expanded: boolean;
  isEditing: boolean;
  liveConfig: BambuLiveIntegrationSettings | null;
  printer: PrinterRow;
  printerSlots: PrinterAmsSlotRow[];
  settingsClientReadOnly: boolean;
  busy: boolean;
  tauri: boolean;
  onBambuLiveAccessCodeChange: (value: string) => void;
  onBambuLiveEnabledChange: (value: boolean) => void;
  onBambuLiveHostChange: (value: string) => void;
  onBambuLivePrinterSerialChange: (value: string) => void;
  onCancelEdit: () => void;
  onCopyError: (message: string) => void;
  onCopySuccess: (message: string) => void;
  onDiagnosticFilterChange: (filter: DiagnosticFilterKey) => void;
  onDiagnosticSortChange: (sort: DiagnosticSortKey) => void;
  onEditModelChange: (value: string) => void;
  onEditNameChange: (value: string) => void;
  onEditSlotsPerUnitChange: (value: string) => void;
  onEditUnitsChange: (value: string) => void;
  onRemove: () => void;
  onSaveEdit: () => void;
  onSelectedChartFieldChange: (fieldPath: string) => void;
  onStartEdit: () => void;
  onToggleCapture: () => void;
  onToggleDetails: () => void;
};

export function SettingsPrinterCard({
  bambuDiagnostics,
  captureActive,
  confirmDelete,
  diagnosticFilter,
  diagnosticSession,
  diagnosticSort,
  editBambuLiveAccessCode,
  editBambuLiveEnabled,
  editBambuLiveHost,
  editBambuLivePrinterSerial,
  editModel,
  editModelProfile,
  editName,
  editSlotsPerUnit,
  editUnits,
  expanded,
  isEditing,
  liveConfig,
  printer,
  printerSlots,
  settingsClientReadOnly,
  busy,
  tauri,
  onBambuLiveAccessCodeChange,
  onBambuLiveEnabledChange,
  onBambuLiveHostChange,
  onBambuLivePrinterSerialChange,
  onCancelEdit,
  onCopyError,
  onCopySuccess,
  onDiagnosticFilterChange,
  onDiagnosticSortChange,
  onEditModelChange,
  onEditNameChange,
  onEditSlotsPerUnitChange,
  onEditUnitsChange,
  onRemove,
  onSaveEdit,
  onSelectedChartFieldChange,
  onStartEdit,
  onToggleCapture,
  onToggleDetails,
}: SettingsPrinterCardProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const hasMultiMaterial = hasConfiguredMultiMaterial(printerSlots);
  const configuredSetup = describeConfiguredPrinterSetup(t, printer.model, printerSlots);
  const { reviewTrayCount } = bambuDiagnostics;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50"
      style={printerBrandSurfaceStyle(printer.model, "compact", resolvedTheme)}
    >
      <SettingsPrinterCardHeader
        busy={busy}
        configuredSetup={configuredSetup}
        confirmDelete={confirmDelete}
        hasLiveIntegration={Boolean(liveConfig?.enabled)}
        hasMultiMaterial={hasMultiMaterial}
        isEditing={isEditing}
        isExpanded={expanded}
        onRemove={onRemove}
        onToggleDetails={onToggleDetails}
        onToggleEdit={isEditing ? onCancelEdit : onStartEdit}
        printer={printer}
        reviewTrayCount={reviewTrayCount}
        tauri={tauri}
      />

      {expanded && liveConfig?.enabled ? (
        <SettingsBambuLiveObservedDetailsPanel
          captureActive={captureActive}
          diagnosticFilter={diagnosticFilter}
          diagnosticSession={diagnosticSession}
          diagnosticSort={diagnosticSort}
          downloadName={`${printer.name.replace(/\s+/g, "-").toLowerCase()}-live-capture.csv`}
          liveConfig={liveConfig}
          model={bambuDiagnostics}
          onCopyError={onCopyError}
          onCopySuccess={onCopySuccess}
          onDiagnosticFilterChange={onDiagnosticFilterChange}
          onDiagnosticSortChange={onDiagnosticSortChange}
          onSelectedChartFieldChange={onSelectedChartFieldChange}
          onToggleCapture={onToggleCapture}
          printerId={printer.id}
        />
      ) : null}

      {isEditing ? (
        <SettingsPrinterEditForm
          bambuLiveAccessCode={editBambuLiveAccessCode}
          bambuLiveEnabled={editBambuLiveEnabled}
          bambuLiveHost={editBambuLiveHost}
          bambuLivePrinterSerial={editBambuLivePrinterSerial}
          busy={busy}
          model={editModel}
          modelProfile={editModelProfile}
          name={editName}
          settingsClientReadOnly={settingsClientReadOnly}
          slotsPerUnit={editSlotsPerUnit}
          supportsBambuLive={isBambuLabPrinter(printer.model)}
          tauri={tauri}
          t={t}
          units={editUnits}
          onBambuLiveAccessCodeChange={onBambuLiveAccessCodeChange}
          onBambuLiveEnabledChange={onBambuLiveEnabledChange}
          onBambuLiveHostChange={onBambuLiveHostChange}
          onBambuLivePrinterSerialChange={onBambuLivePrinterSerialChange}
          onModelChange={(nextModel) => {
            onEditModelChange(nextModel);
            const exactProfile = findPrinterModelProfileExact(nextModel);
            if (exactProfile) {
              onEditUnitsChange(String(exactProfile.defaultUnits));
              onEditSlotsPerUnitChange(String(exactProfile.defaultSlotsPerUnit));
            }
          }}
          onNameChange={onEditNameChange}
          onSave={onSaveEdit}
          onSlotsPerUnitChange={onEditSlotsPerUnitChange}
          onUnitsChange={onEditUnitsChange}
        />
      ) : null}
    </div>
  );
}
