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
  BambuAccessCodeAction,
  BambuPrinterDiscoveryCandidate,
  BambuLiveIntegrationEntry,
  BambuTlsTrustAction,
  BambuTlsTrustState,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterRow,
  TrustedLanInterfaceOption,
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
  editBambuLiveAccessCodeAction: BambuAccessCodeAction;
  editBambuLiveAccessCodeConfigured: boolean;
  editBambuLiveEnabled: boolean;
  editBambuLiveHost: string;
  editBambuLivePrinterSerial: string;
  editBambuLiveTlsCertificateFingerprint: string | null;
  editBambuLiveTlsSpkiFingerprint: string | null;
  editBambuLiveTlsTrustAction: BambuTlsTrustAction;
  editBambuLiveTlsTrustState: BambuTlsTrustState;
  bambuDiscoveryCandidates: BambuPrinterDiscoveryCandidate[];
  bambuDiscoveryHasScanned: boolean;
  bambuDiscoveryInterfaceAddress: string;
  bambuDiscoveryScanning: boolean;
  editModelProfile: PrinterModelProfile;
  editPrinterDirty: boolean;
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
  trustedLanInterfaces: TrustedLanInterfaceOption[];
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
  editBambuLiveAccessCodeAction,
  editBambuLiveAccessCodeConfigured,
  editBambuLiveEnabled,
  editBambuLiveHost,
  editBambuLivePrinterSerial,
  editBambuLiveTlsCertificateFingerprint,
  editBambuLiveTlsSpkiFingerprint,
  editBambuLiveTlsTrustAction,
  editBambuLiveTlsTrustState,
  bambuDiscoveryCandidates,
  bambuDiscoveryHasScanned,
  bambuDiscoveryInterfaceAddress,
  bambuDiscoveryScanning,
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
  trustedLanInterfaces,
  onBambuLiveAccessCodeChange,
  onBambuLiveAccessCodeActionChange,
  onBambuLiveEnabledChange,
  onBambuLiveHostChange,
  onBambuLiveIdentityCheck,
  onBambuLivePrinterSerialChange,
  onBambuLiveTlsTrustActionChange,
  onBambuDiscoveryInterfaceAddressChange,
  onFindBambuPrinters,
  onRecoverBambuLiveAddress,
  onUseDiscoveredBambuPrinter,
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
    bambuLiveAccessCodeAction: editBambuLiveAccessCodeAction,
    bambuLiveAccessCodeConfigured: editBambuLiveAccessCodeConfigured,
    bambuLiveEnabled: editBambuLiveEnabled,
    bambuLiveHost: editBambuLiveHost,
    bambuLivePrinterSerial: editBambuLivePrinterSerial,
    bambuLiveTlsCertificateFingerprint: editBambuLiveTlsCertificateFingerprint,
    bambuLiveTlsSpkiFingerprint: editBambuLiveTlsSpkiFingerprint,
    bambuLiveTlsTrustAction: editBambuLiveTlsTrustAction,
    bambuLiveTlsTrustState: editBambuLiveTlsTrustState,
    bambuDiscoveryCandidates,
    bambuDiscoveryHasScanned,
    bambuDiscoveryInterfaceAddress,
    bambuDiscoveryScanning,
    model: editPrinterModel,
    modelProfile: editModelProfile,
    name: editPrinterName,
    slotsPerUnit: editSlotsPerUnit,
    units: editAmsUnits,
    trustedLanInterfaces,
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
            locale,
            printerSlots,
            selectedChartFieldPath: diagnosticChartFieldByPrinterId[printer.id],
            spoolRows,
            t,
          });
          const isEditing = editPrinterId === printer.id;
          const editActions: SettingsPrinterEditActions = {
            onBambuLiveAccessCodeChange,
            onBambuLiveAccessCodeActionChange,
            onBambuLiveEnabledChange,
            onBambuLiveHostChange,
            onBambuLiveIdentityCheck,
            onBambuLivePrinterSerialChange,
            onBambuLiveTlsTrustActionChange,
            onBambuDiscoveryInterfaceAddressChange,
            onFindBambuPrinters,
            onRecoverBambuLiveAddress,
            onUseDiscoveredBambuPrinter,
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
              actionsLocked={editPrinterId !== null}
              confirmDelete={confirmDeletePrinterId === printer.id}
              editActions={editActions}
              editDraft={editDraft}
              expanded={expandedBambuDetailsPrinterId === printer.id}
              editDirty={isEditing && editPrinterDirty}
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
