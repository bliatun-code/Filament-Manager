import { AppModal } from "./app_modal";
import { inventoryDetailPanelClassName } from "./inventory_detail_panel_class";
import { FeedbackBanner } from "./feedback_banner";
import { InventoryCatalogMetadataPanel } from "./inventory_catalog_metadata_panel";
import { InventoryDangerZonePanel } from "./inventory_danger_zone_panel";
import {
  inventoryModalOverlayClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { InventoryRollHistoryPanel } from "./inventory_roll_history_panel";
import { InventorySpoolQrRfidPanel } from "./inventory_spool_qr_rfid_panel";
import {
  InventorySpoolDetailHeader,
  InventorySpoolIdentityPanel,
} from "./inventory_spool_detail_summary";
import {
  InventorySpoolHomeLocationPanel,
  InventorySpoolLostStatusPanel,
  InventorySpoolTarePanel,
} from "./inventory_spool_maintenance_panels";
import { RollUsageChart } from "./roll_usage_chart";
import { WeightInput } from "./weight_input";
import { useI18n } from "../lib/i18n";
import type { InventorySemanticTone, InventorySpool } from "../lib/inventory_list_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { SpoolHistoryEventRow, SpoolUsagePointRow } from "../lib/tauri_client";

type InventorySpoolDetailModalProps = {
  assignedSlot: { printerName: string } | null;
  colorName: string;
  confirmDelete: boolean;
  confirmPurge: boolean;
  displayTitle: string;
  error: string | null;
  filamentName: string;
  formatHistoryEventDetails: (event: SpoolHistoryEventRow) => string;
  formatHistoryEventType: (eventType: string) => string;
  hasHiddenHistoryRows: boolean;
  hexColor: string;
  historyLoading: boolean;
  identityFreshnessMeta: { className: string; label: string };
  infoMessage: string | null;
  locationDraft: string;
  locationValue: string;
  manageBusy: boolean;
  masterEditUnlocked: boolean;
  material: string;
  measuredTotal: number;
  onChangeColorName: (value: string) => void;
  onChangeFilamentName: (value: string) => void;
  onChangeHexColor: (value: string) => void;
  onChangeLocation: (value: string) => void;
  onChangeMaterial: (value: string) => void;
  onChangeTare: (value: string) => void;
  onChangeVendor: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onPrintLabel: () => void;
  onPurge: () => void;
  onRefill: () => void;
  onSaveLocation: () => void;
  onSaveMasterMetadata: () => void;
  onSaveTareWeight: () => void;
  onStartRfidCapture: () => void;
  onSubmitWeight: (grams: number) => void;
  onToggleEditUnlocked: () => void;
  onToggleLostStatus: () => void;
  onToggleRollHistory: () => void;
  open: boolean;
  ownershipLabel: string;
  ownershipTone: InventorySemanticTone;
  qrCompanionAvailable: boolean;
  qrDataUrl: string | null;
  qrLoading: boolean;
  qrTarget: string | null;
  resolvedTheme: ResolvedTheme;
  runtimeAvailable: boolean;
  showRollHistory: boolean;
  spool: InventorySpool | null;
  statusLabel: string;
  statusTone: InventorySemanticTone;
  supportsRfidCapture: boolean;
  tareDraft: string;
  usageLoading: boolean;
  usagePoints: SpoolUsagePointRow[];
  vendor: string;
  visibleHistoryRows: SpoolHistoryEventRow[];
};

export function InventorySpoolDetailModal({
  assignedSlot,
  colorName,
  confirmDelete,
  confirmPurge,
  displayTitle,
  error,
  filamentName,
  formatHistoryEventDetails,
  formatHistoryEventType,
  hasHiddenHistoryRows,
  hexColor,
  historyLoading,
  identityFreshnessMeta,
  infoMessage,
  locationDraft,
  locationValue,
  manageBusy,
  masterEditUnlocked,
  material,
  measuredTotal,
  onChangeColorName,
  onChangeFilamentName,
  onChangeHexColor,
  onChangeLocation,
  onChangeMaterial,
  onChangeTare,
  onChangeVendor,
  onClose,
  onDelete,
  onMarkEmpty,
  onPrintLabel,
  onPurge,
  onRefill,
  onSaveLocation,
  onSaveMasterMetadata,
  onSaveTareWeight,
  onStartRfidCapture,
  onSubmitWeight,
  onToggleEditUnlocked,
  onToggleLostStatus,
  onToggleRollHistory,
  open,
  ownershipLabel,
  ownershipTone,
  qrCompanionAvailable,
  qrDataUrl,
  qrLoading,
  qrTarget,
  resolvedTheme,
  runtimeAvailable,
  showRollHistory,
  spool,
  statusLabel,
  statusTone,
  supportsRfidCapture,
  tareDraft,
  usageLoading,
  usagePoints,
  vendor,
  visibleHistoryRows,
}: InventorySpoolDetailModalProps) {
  const { t } = useI18n();

  if (!open || !spool) {
    return null;
  }

  return (
    <AppModal
      zIndex={50}
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={inventoryWideModalPanelClassName}
    >
      <>
        <InventorySpoolDetailHeader
          displayTitle={displayTitle}
          onClose={onClose}
          ownershipLabel={ownershipLabel}
          ownershipTone={ownershipTone}
          spool={spool}
          statusLabel={statusLabel}
          statusTone={statusTone}
        />

        <div className="overflow-y-auto px-4 pb-4 pt-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div
              className={inventoryDetailPanelClassName}
              style={inventorySwatchPanelStyle(spool.hexColor, resolvedTheme)}
            >
              <div className="space-y-5 text-sm text-slate-700 dark:text-slate-200">
                {error ? (
                  <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200">
                    {error}
                  </div>
                ) : null}
                {!error && infoMessage ? (
                  <FeedbackBanner tone="success">{infoMessage}</FeedbackBanner>
                ) : null}

                <InventorySpoolIdentityPanel
                  assignedSlot={assignedSlot}
                  identityFreshnessMeta={identityFreshnessMeta}
                  locationValue={locationValue}
                  resolvedTheme={resolvedTheme}
                  spool={spool}
                />

                <InventorySpoolQrRfidPanel
                  companionAvailable={qrCompanionAvailable}
                  dataUrl={qrDataUrl}
                  loading={qrLoading}
                  onPrintLabel={onPrintLabel}
                  onStartRfidCapture={onStartRfidCapture}
                  resolvedTheme={resolvedTheme}
                  runtimeAvailable={runtimeAvailable}
                  spoolHexColor={spool.hexColor}
                  supportsRfidCapture={supportsRfidCapture}
                  target={qrTarget}
                />

                <InventoryCatalogMetadataPanel
                  colorName={colorName}
                  disabled={!runtimeAvailable || manageBusy}
                  editUnlocked={masterEditUnlocked}
                  filamentName={filamentName}
                  hexColor={hexColor}
                  material={material}
                  onChangeColorName={onChangeColorName}
                  onChangeFilamentName={onChangeFilamentName}
                  onChangeHexColor={onChangeHexColor}
                  onChangeMaterial={onChangeMaterial}
                  onChangeVendor={onChangeVendor}
                  onSave={onSaveMasterMetadata}
                  onToggleEditUnlocked={onToggleEditUnlocked}
                  resolvedTheme={resolvedTheme}
                  spoolHexColor={spool.hexColor}
                  vendor={vendor}
                />
              </div>
            </div>

            <div className="space-y-4">
              <WeightInput
                label={t("inventory.measuredTotalWeight", "Measured total weight (g)")}
                value={measuredTotal}
                onSubmit={onSubmitWeight}
                style={inventorySwatchPanelStyle(spool.hexColor, resolvedTheme)}
              />

              <InventorySpoolTarePanel
                disabled={!runtimeAvailable || manageBusy}
                onChange={onChangeTare}
                onSave={onSaveTareWeight}
                resolvedTheme={resolvedTheme}
                spoolHexColor={spool.hexColor}
                value={tareDraft}
              />

              <InventorySpoolHomeLocationPanel
                assignedToPrinter={Boolean(assignedSlot)}
                disabled={!runtimeAvailable || manageBusy}
                onChange={onChangeLocation}
                onSave={onSaveLocation}
                resolvedTheme={resolvedTheme}
                spoolHexColor={spool.hexColor}
                value={locationDraft}
              />

              <InventorySpoolLostStatusPanel
                disabled={!runtimeAvailable || manageBusy}
                onToggle={onToggleLostStatus}
                resolvedTheme={resolvedTheme}
                spoolHexColor={spool.hexColor}
                status={spool.status}
              />

              <div
                className={inventoryDetailPanelClassName}
                style={inventorySwatchPanelStyle(spool.hexColor, resolvedTheme)}
              >
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("inventory.usageDiagram", "Usage diagram")}
                </div>
                <RollUsageChart
                  points={usagePoints}
                  loading={usageLoading}
                  initialWeight={spool.initialWeightGrams}
                />
              </div>

              <InventoryRollHistoryPanel
                formatHistoryEventDetails={formatHistoryEventDetails}
                formatHistoryEventType={formatHistoryEventType}
                hasHiddenHistoryRows={hasHiddenHistoryRows}
                historyLoading={historyLoading}
                onToggle={onToggleRollHistory}
                resolvedTheme={resolvedTheme}
                showRollHistory={showRollHistory}
                spoolHexColor={spool.hexColor}
                visibleHistoryRows={visibleHistoryRows}
              />

              <InventoryDangerZonePanel
                confirmDelete={confirmDelete}
                confirmPurge={confirmPurge}
                manageBusy={manageBusy}
                onDelete={onDelete}
                onMarkEmpty={onMarkEmpty}
                onPurge={onPurge}
                onRefill={onRefill}
                runtimeAvailable={runtimeAvailable}
                status={spool.status}
              />
            </div>
          </div>
        </div>
      </>
    </AppModal>
  );
}
