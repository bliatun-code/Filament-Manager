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
import type { SemanticChipTone } from "../lib/chip_styles";
import type {
  BambuAccessCodeAction,
  BambuPrinterDiscoveryCandidate,
  BambuLiveIntegrationSettings,
  BambuTlsTrustAction,
  BambuTlsTrustState,
  PrinterAmsSlotRow,
  PrinterRow,
  TrustedLanInterfaceOption,
} from "../lib/tauri_client";
import type { SettingsBambuLiveDiagnosticsModel } from "../pages/settings_bambu_live_diagnostics_model";
import { isBambuLabPrinter } from "../pages/settings_printer_model";
import { SettingsBambuLiveObservedDetailsPanel } from "./settings_bambu_live_observed_details_panel";
import { settingsBambuLiveObservedPanelId } from "./settings_bambu_live_dom_ids";
import { SettingsPrinterCardHeader } from "./settings_printer_card_header";
import { SettingsPrinterEditForm } from "./settings_printer_edit_form";

export type SettingsPrinterEditDraft = {
  bambuLiveAccessCode: string;
  bambuLiveAccessCodeAction: BambuAccessCodeAction;
  bambuLiveAccessCodeConfigured: boolean;
  bambuLiveEnabled: boolean;
  bambuLiveHost: string;
  bambuLivePrinterSerial: string;
  bambuLiveTlsCertificateFingerprint: string | null;
  bambuLiveTlsSpkiFingerprint: string | null;
  bambuLiveTlsTrustAction: BambuTlsTrustAction;
  bambuLiveTlsTrustState: BambuTlsTrustState;
  bambuDiscoveryCandidates: BambuPrinterDiscoveryCandidate[];
  bambuDiscoveryHasScanned: boolean;
  bambuDiscoveryInterfaceAddress: string;
  bambuDiscoveryScanning: boolean;
  model: string;
  modelProfile: PrinterModelProfile;
  name: string;
  slotsPerUnit: string;
  units: string;
  trustedLanInterfaces: TrustedLanInterfaceOption[];
};

export type SettingsPrinterEditActions = {
  onBambuLiveAccessCodeChange: (value: string) => void;
  onBambuLiveAccessCodeActionChange: (value: BambuAccessCodeAction) => void;
  onBambuLiveEnabledChange: (value: boolean) => void;
  onBambuLiveHostChange: (value: string) => void;
  onBambuLiveIdentityCheck: () => void;
  onBambuLivePrinterSerialChange: (value: string) => void;
  onBambuLiveTlsTrustActionChange: (value: BambuTlsTrustAction) => void;
  onBambuDiscoveryInterfaceAddressChange: (value: string) => void;
  onFindBambuPrinters: () => void;
  onRecoverBambuLiveAddress: (candidate: BambuPrinterDiscoveryCandidate) => void;
  onUseDiscoveredBambuPrinter: (candidate: BambuPrinterDiscoveryCandidate) => void;
  onCancel: () => void;
  onModelChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSlotsPerUnitChange: (value: string) => void;
  onStart: () => void;
  onUnitsChange: (value: string) => void;
};

export type SettingsPrinterLiveDiagnosticsState = {
  captureActive: boolean;
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  liveConfig: BambuLiveIntegrationSettings | null;
  model: SettingsBambuLiveDiagnosticsModel;
};

export type SettingsPrinterLiveDiagnosticsActions = {
  onCopyError: (message: string) => void;
  onCopySuccess: (message: string) => void;
  onDiagnosticFilterChange: (filter: DiagnosticFilterKey) => void;
  onDiagnosticSortChange: (sort: DiagnosticSortKey) => void;
  onSelectedChartFieldChange: (fieldPath: string) => void;
  onToggleCapture: () => void;
  onToggleDetails: () => void;
};

type SettingsPrinterCardProps = {
  actionsLocked: boolean;
  confirmDelete: boolean;
  editActions: SettingsPrinterEditActions;
  editDraft: SettingsPrinterEditDraft;
  editDirty: boolean;
  expanded: boolean;
  isEditing: boolean;
  liveDiagnostics: SettingsPrinterLiveDiagnosticsState;
  liveDiagnosticsActions: SettingsPrinterLiveDiagnosticsActions;
  printer: PrinterRow;
  printerSlots: PrinterAmsSlotRow[];
  settingsClientReadOnly: boolean;
  busy: boolean;
  tauri: boolean;
  onRemove: () => void;
};

function settingsPrinterLiveStatusTone(
  liveConfig: BambuLiveIntegrationSettings | null,
): SemanticChipTone {
  if (!liveConfig?.enabled) {
    return "neutral";
  }

  if (liveConfig.observed_state?.mqtt_connected) {
    return "success";
  }

  return "warning";
}

export function SettingsPrinterCard({
  actionsLocked,
  confirmDelete,
  editActions,
  editDraft,
  editDirty,
  expanded,
  isEditing,
  liveDiagnostics,
  liveDiagnosticsActions,
  printer,
  printerSlots,
  settingsClientReadOnly,
  busy,
  tauri,
  onRemove,
}: SettingsPrinterCardProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const hasMultiMaterial = hasConfiguredMultiMaterial(printerSlots);
  const configuredSetup = describeConfiguredPrinterSetup(t, printer.model, printerSlots);
  const observedDetailsId = settingsBambuLiveObservedPanelId(printer.id);

  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50"
      style={printerBrandSurfaceStyle(printer.model, "compact", resolvedTheme)}
    >
      <SettingsPrinterCardHeader
        actionsLocked={actionsLocked}
        busy={busy}
        configuredSetup={configuredSetup}
        confirmDelete={confirmDelete}
        hasLiveIntegration={Boolean(liveDiagnostics.liveConfig?.enabled)}
        hasMultiMaterial={hasMultiMaterial}
        isEditing={isEditing}
        isExpanded={expanded}
        liveStatusTone={settingsPrinterLiveStatusTone(liveDiagnostics.liveConfig)}
        onRemove={onRemove}
        onToggleDetails={liveDiagnosticsActions.onToggleDetails}
        onToggleEdit={editActions.onStart}
        observedDetailsId={observedDetailsId}
        printer={printer}
        tauri={tauri}
      />

      {liveDiagnostics.liveConfig?.enabled ? (
        <div id={observedDetailsId} hidden={!expanded}>
          {expanded ? (
            <SettingsBambuLiveObservedDetailsPanel
              captureActive={liveDiagnostics.captureActive}
              diagnosticFilter={liveDiagnostics.diagnosticFilter}
              diagnosticSession={liveDiagnostics.diagnosticSession}
              diagnosticSort={liveDiagnostics.diagnosticSort}
              downloadName={`${printer.name.replace(/\s+/g, "-").toLowerCase()}-live-capture.csv`}
              liveConfig={liveDiagnostics.liveConfig}
              model={liveDiagnostics.model}
              onCopyError={liveDiagnosticsActions.onCopyError}
              onCopySuccess={liveDiagnosticsActions.onCopySuccess}
              onDiagnosticFilterChange={liveDiagnosticsActions.onDiagnosticFilterChange}
              onDiagnosticSortChange={liveDiagnosticsActions.onDiagnosticSortChange}
              onSelectedChartFieldChange={liveDiagnosticsActions.onSelectedChartFieldChange}
              onToggleCapture={liveDiagnosticsActions.onToggleCapture}
              printerId={printer.id}
            />
          ) : null}
        </div>
      ) : null}

      {isEditing ? (
        <SettingsPrinterEditForm
          bambuLiveAccessCode={editDraft.bambuLiveAccessCode}
          bambuLiveAccessCodeAction={editDraft.bambuLiveAccessCodeAction}
          bambuLiveAccessCodeConfigured={editDraft.bambuLiveAccessCodeConfigured}
          bambuLiveEnabled={editDraft.bambuLiveEnabled}
          bambuLiveHost={editDraft.bambuLiveHost}
          bambuLivePrinterSerial={editDraft.bambuLivePrinterSerial}
          bambuLiveTlsCertificateFingerprint={
            editDraft.bambuLiveTlsCertificateFingerprint
          }
          bambuLiveTlsSpkiFingerprint={editDraft.bambuLiveTlsSpkiFingerprint}
          bambuLiveTlsTrustAction={editDraft.bambuLiveTlsTrustAction}
          bambuLiveTlsTrustState={editDraft.bambuLiveTlsTrustState}
          bambuDiscoveryCandidates={editDraft.bambuDiscoveryCandidates}
          bambuDiscoveryHasScanned={editDraft.bambuDiscoveryHasScanned}
          bambuDiscoveryInterfaceAddress={editDraft.bambuDiscoveryInterfaceAddress}
          bambuDiscoveryScanning={editDraft.bambuDiscoveryScanning}
          busy={busy}
          dirty={editDirty}
          model={editDraft.model}
          modelProfile={editDraft.modelProfile}
          name={editDraft.name}
          printerId={printer.id}
          settingsClientReadOnly={settingsClientReadOnly}
          slotsPerUnit={editDraft.slotsPerUnit}
          supportsBambuLive={isBambuLabPrinter(printer.model)}
          tauri={tauri}
          t={t}
          trustedLanInterfaces={editDraft.trustedLanInterfaces}
          units={editDraft.units}
          onBambuLiveAccessCodeChange={editActions.onBambuLiveAccessCodeChange}
          onBambuLiveAccessCodeActionChange={
            editActions.onBambuLiveAccessCodeActionChange
          }
          onBambuLiveEnabledChange={editActions.onBambuLiveEnabledChange}
          onBambuLiveHostChange={editActions.onBambuLiveHostChange}
          onBambuLiveIdentityCheck={editActions.onBambuLiveIdentityCheck}
          onBambuLivePrinterSerialChange={editActions.onBambuLivePrinterSerialChange}
          onBambuLiveTlsTrustActionChange={
            editActions.onBambuLiveTlsTrustActionChange
          }
          onBambuDiscoveryInterfaceAddressChange={
            editActions.onBambuDiscoveryInterfaceAddressChange
          }
          onFindBambuPrinters={editActions.onFindBambuPrinters}
          onRecoverBambuLiveAddress={editActions.onRecoverBambuLiveAddress}
          onUseDiscoveredBambuPrinter={editActions.onUseDiscoveredBambuPrinter}
          onModelChange={(nextModel) => {
            editActions.onModelChange(nextModel);
            const exactProfile = findPrinterModelProfileExact(nextModel);
            if (exactProfile) {
              editActions.onUnitsChange(String(exactProfile.defaultUnits));
              editActions.onSlotsPerUnitChange(String(exactProfile.defaultSlotsPerUnit));
            }
          }}
          onNameChange={editActions.onNameChange}
          onCancel={editActions.onCancel}
          onSave={editActions.onSave}
          onSlotsPerUnitChange={editActions.onSlotsPerUnitChange}
          onUnitsChange={editActions.onUnitsChange}
        />
      ) : null}
    </div>
  );
}
