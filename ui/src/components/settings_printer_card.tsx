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

export type SettingsPrinterEditDraft = {
  bambuLiveAccessCode: string;
  bambuLiveEnabled: boolean;
  bambuLiveHost: string;
  bambuLivePrinterSerial: string;
  model: string;
  modelProfile: PrinterModelProfile;
  name: string;
  slotsPerUnit: string;
  units: string;
};

export type SettingsPrinterEditActions = {
  onBambuLiveAccessCodeChange: (value: string) => void;
  onBambuLiveEnabledChange: (value: boolean) => void;
  onBambuLiveHostChange: (value: string) => void;
  onBambuLivePrinterSerialChange: (value: string) => void;
  onCancel: () => void;
  onModelChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSlotsPerUnitChange: (value: string) => void;
  onStart: () => void;
  onUnitsChange: (value: string) => void;
};

type SettingsPrinterCardProps = {
  bambuDiagnostics: SettingsBambuLiveDiagnosticsModel;
  captureActive: boolean;
  confirmDelete: boolean;
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  editActions: SettingsPrinterEditActions;
  editDraft: SettingsPrinterEditDraft;
  expanded: boolean;
  isEditing: boolean;
  liveConfig: BambuLiveIntegrationSettings | null;
  printer: PrinterRow;
  printerSlots: PrinterAmsSlotRow[];
  settingsClientReadOnly: boolean;
  busy: boolean;
  tauri: boolean;
  onCopyError: (message: string) => void;
  onCopySuccess: (message: string) => void;
  onDiagnosticFilterChange: (filter: DiagnosticFilterKey) => void;
  onDiagnosticSortChange: (sort: DiagnosticSortKey) => void;
  onRemove: () => void;
  onSelectedChartFieldChange: (fieldPath: string) => void;
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
  editActions,
  editDraft,
  expanded,
  isEditing,
  liveConfig,
  printer,
  printerSlots,
  settingsClientReadOnly,
  busy,
  tauri,
  onCopyError,
  onCopySuccess,
  onDiagnosticFilterChange,
  onDiagnosticSortChange,
  onRemove,
  onSelectedChartFieldChange,
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
        onToggleEdit={isEditing ? editActions.onCancel : editActions.onStart}
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
          bambuLiveAccessCode={editDraft.bambuLiveAccessCode}
          bambuLiveEnabled={editDraft.bambuLiveEnabled}
          bambuLiveHost={editDraft.bambuLiveHost}
          bambuLivePrinterSerial={editDraft.bambuLivePrinterSerial}
          busy={busy}
          model={editDraft.model}
          modelProfile={editDraft.modelProfile}
          name={editDraft.name}
          settingsClientReadOnly={settingsClientReadOnly}
          slotsPerUnit={editDraft.slotsPerUnit}
          supportsBambuLive={isBambuLabPrinter(printer.model)}
          tauri={tauri}
          t={t}
          units={editDraft.units}
          onBambuLiveAccessCodeChange={editActions.onBambuLiveAccessCodeChange}
          onBambuLiveEnabledChange={editActions.onBambuLiveEnabledChange}
          onBambuLiveHostChange={editActions.onBambuLiveHostChange}
          onBambuLivePrinterSerialChange={editActions.onBambuLivePrinterSerialChange}
          onModelChange={(nextModel) => {
            editActions.onModelChange(nextModel);
            const exactProfile = findPrinterModelProfileExact(nextModel);
            if (exactProfile) {
              editActions.onUnitsChange(String(exactProfile.defaultUnits));
              editActions.onSlotsPerUnitChange(String(exactProfile.defaultSlotsPerUnit));
            }
          }}
          onNameChange={editActions.onNameChange}
          onSave={editActions.onSave}
          onSlotsPerUnitChange={editActions.onSlotsPerUnitChange}
          onUnitsChange={editActions.onUnitsChange}
        />
      ) : null}
    </div>
  );
}
