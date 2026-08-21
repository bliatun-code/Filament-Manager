import { useState } from "react";
import { AppModal } from "./app_modal";
import {
  inventoryDetailEyebrowClassName,
  inventoryDetailPanelClassName,
  inventoryDetailSaveButtonClassName,
} from "./inventory_detail_panel_class";
import { InventoryCatalogMetadataPanel } from "./inventory_catalog_metadata_panel";
import { InventoryDangerZonePanel } from "./inventory_danger_zone_panel";
import {
  inventoryModalOverlayClassName,
  inventoryTwoColumnModalGridClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { InventoryRollHistoryPanel } from "./inventory_roll_history_panel";
import { InventorySpoolQrRfidPanel } from "./inventory_spool_qr_rfid_panel";
import { InventorySpoolDetailContextActions } from "./inventory_spool_detail_context_actions";
import { ModalFooter, ModalNotice } from "./modal_chrome";
import {
  InventorySpoolDetailHeader,
  InventorySpoolIdentityPanel,
  type InventorySpoolDetailAssignedSlot,
} from "./inventory_spool_detail_summary";
import {
  InventorySpoolHomeLocationPanel,
  InventorySpoolLostStatusPanel,
  InventorySpoolOwnershipPanel,
  InventorySpoolTarePanel,
} from "./inventory_spool_maintenance_panels";
import { RollUsageChart } from "./roll_usage_chart";
import { WeightInput } from "./weight_input";
import { useI18n } from "../lib/i18n";
import type { FilamentLabelSize } from "../lib/filament_label_profiles";
import type {
  InventorySemanticTone,
  InventorySpool,
  OwnershipType,
} from "../lib/inventory_list_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { SpoolHistoryEventRow, SpoolUsagePointRow } from "../lib/tauri_client";
import { appSoftButtonClassName, joinClassNames } from "./ui_class_names";

type InventorySpoolDetailModalProps = {
  assignedSlot: InventorySpoolDetailAssignedSlot | null;
  colorName: string;
  confirmDelete: boolean;
  confirmPurge: boolean;
  deterministicLabelPreferences?: boolean;
  displayTitle: string;
  error: string | null;
  filamentName: string;
  formatHistoryEventDetails: (event: SpoolHistoryEventRow) => string;
  formatHistoryEventType: (eventType: string) => string;
  hasHiddenHistoryRows: boolean;
  hexColor: string;
  historyLoading: boolean;
  hasCommonChanges: boolean;
  hasUnsavedChanges: boolean;
  initialLabelPanelOpen?: boolean;
  rfidBindingMeta: { className: string; hint: string; label: string };
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
  onChangeOwnerContact: (value: string) => void;
  onChangeOwnerName: (value: string) => void;
  onChangeOwnershipNote: (value: string) => void;
  onChangeOwnershipType: (value: OwnershipType) => void;
  onChangeTare: (value: string) => void;
  onChangeVendor: (value: string) => void;
  onCancelDangerZoneConfirmation: () => void;
  onClose: () => void;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onLoadInPrinter: () => void;
  onLoanOut: () => void;
  onPrintLabel: (labelSize: FilamentLabelSize, pngDataUrl: string) => Promise<void>;
  onPurge: () => void;
  onRefill: () => void;
  onSaveCommonDetails: () => void;
  onSaveMasterMetadata: () => void;
  onStartRfidCapture: () => void;
  onSubmitWeight: (grams: number) => void;
  onToggleEditUnlocked: () => void;
  onToggleLostStatus: () => void;
  onToggleRollHistory: () => void;
  open: boolean;
  ownershipLabel: string;
  ownershipNoteDraft: string;
  ownershipTone: InventorySemanticTone;
  ownershipTypeDraft: OwnershipType;
  ownerContactDraft: string;
  ownerNameDraft: string;
  qrCompanionAvailable: boolean;
  qrDataUrl: string | null;
  qrLoading: boolean;
  qrTarget: string | null;
  resolvedTheme: ResolvedTheme;
  runtimeAvailable: boolean;
  canLoadInPrinter: boolean;
  canLoanOut: boolean;
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
  deterministicLabelPreferences = false,
  displayTitle,
  error,
  filamentName,
  formatHistoryEventDetails,
  formatHistoryEventType,
  hasHiddenHistoryRows,
  hexColor,
  historyLoading,
  hasCommonChanges,
  hasUnsavedChanges,
  initialLabelPanelOpen = false,
  rfidBindingMeta,
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
  onChangeOwnerContact,
  onChangeOwnerName,
  onChangeOwnershipNote,
  onChangeOwnershipType,
  onChangeTare,
  onChangeVendor,
  onCancelDangerZoneConfirmation,
  onClose,
  onDelete,
  onMarkEmpty,
  onLoadInPrinter,
  onLoanOut,
  onPrintLabel,
  onPurge,
  onRefill,
  onSaveCommonDetails,
  onSaveMasterMetadata,
  onStartRfidCapture,
  onSubmitWeight,
  onToggleEditUnlocked,
  onToggleLostStatus,
  onToggleRollHistory,
  open,
  ownershipLabel,
  ownershipNoteDraft,
  ownershipTone,
  ownershipTypeDraft,
  ownerContactDraft,
  ownerNameDraft,
  qrCompanionAvailable,
  qrDataUrl,
  qrLoading,
  qrTarget,
  resolvedTheme,
  runtimeAvailable,
  canLoadInPrinter,
  canLoanOut,
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
  const [labelPanelRequestId, setLabelPanelRequestId] = useState(0);

  if (!open || !spool) {
    return null;
  }

  return (
    <AppModal
      ariaLabel={`${t("inventory.selectedRoll", "Selected roll")}: ${displayTitle}`}
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

        <InventorySpoolDetailContextActions
          loadDisabled={!runtimeAvailable || manageBusy || !canLoadInPrinter}
          loanDisabled={!runtimeAvailable || manageBusy || !canLoanOut}
          onLoadInPrinter={onLoadInPrinter}
          onLoanOut={onLoanOut}
          onPrintLabel={() => setLabelPanelRequestId((current) => current + 1)}
          printDisabled={
            !runtimeAvailable || manageBusy || !qrCompanionAvailable || !qrDataUrl
          }
        />

        <div
          className="overflow-y-auto px-4 pb-4 pt-4 sm:p-5"
          data-inventory-detail-scroll
        >
          <div className={inventoryTwoColumnModalGridClassName}>
            <div
              className={inventoryDetailPanelClassName}
              style={inventorySwatchPanelStyle(spool.hexColor, resolvedTheme)}
            >
              <div className="space-y-5 text-sm text-slate-700 dark:text-slate-200">
                {error ? (
                  <ModalNotice className="px-3 py-2 text-xs" tone="danger">
                    {error}
                  </ModalNotice>
                ) : null}
                {!error && infoMessage ? (
                  <ModalNotice tone="success">{infoMessage}</ModalNotice>
                ) : null}

                <InventorySpoolIdentityPanel
                  assignedSlot={assignedSlot}
                  locationValue={locationValue}
                  rfidBindingMeta={rfidBindingMeta}
                  resolvedTheme={resolvedTheme}
                  spool={spool}
                />

                <InventorySpoolQrRfidPanel
                  companionAvailable={qrCompanionAvailable}
                  dataUrl={qrDataUrl}
                  deterministicLabelPreferences={deterministicLabelPreferences}
                  loading={qrLoading}
                  initialLabelPanelOpen={initialLabelPanelOpen}
                  labelPanelRequestId={labelPanelRequestId}
                  onPrintLabel={onPrintLabel}
                  onStartRfidCapture={onStartRfidCapture}
                  resolvedTheme={resolvedTheme}
                  runtimeAvailable={runtimeAvailable}
                  spoolHexColor={spool.hexColor}
                  spool={spool}
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
                onSave={onSaveCommonDetails}
                resolvedTheme={resolvedTheme}
                showSaveAction={false}
                spoolHexColor={spool.hexColor}
                value={tareDraft}
              />

              <InventorySpoolHomeLocationPanel
                assignedToPrinter={Boolean(assignedSlot)}
                disabled={!runtimeAvailable || manageBusy}
                onChange={onChangeLocation}
                onSave={onSaveCommonDetails}
                resolvedTheme={resolvedTheme}
                showSaveAction={false}
                spoolHexColor={spool.hexColor}
                value={locationDraft}
              />

              <InventorySpoolOwnershipPanel
                contactValue={ownerContactDraft}
                disabled={!runtimeAvailable || manageBusy}
                noteValue={ownershipNoteDraft}
                onChangeContact={onChangeOwnerContact}
                onChangeName={onChangeOwnerName}
                onChangeNote={onChangeOwnershipNote}
                onChangeType={onChangeOwnershipType}
                onSave={onSaveCommonDetails}
                ownerNameValue={ownerNameDraft}
                resolvedTheme={resolvedTheme}
                showSaveAction={false}
                spoolHexColor={spool.hexColor}
                typeValue={ownershipTypeDraft}
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
                <div className={inventoryDetailEyebrowClassName}>
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
                onCancelConfirmation={onCancelDangerZoneConfirmation}
                onDelete={onDelete}
                onMarkEmpty={onMarkEmpty}
                onPurge={onPurge}
                onRefill={onRefill}
                rollLabel={displayTitle}
                runtimeAvailable={runtimeAvailable}
                status={spool.status}
              />
            </div>
          </div>
        </div>

        <ModalFooter className="flex flex-wrap items-center justify-between gap-3 bg-white/95 px-4 py-3 dark:bg-slate-900/95 sm:px-5">
          <div className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {hasUnsavedChanges
              ? t("inventory.unsavedChanges", "You have unsaved changes.")
              : t("inventory.allChangesSaved", "All changes are saved.")}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={joinClassNames(appSoftButtonClassName, "px-4 py-2 text-sm")}
              disabled={manageBusy}
              onClick={onClose}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className={inventoryDetailSaveButtonClassName}
              disabled={!runtimeAvailable || manageBusy || !hasCommonChanges}
              onClick={onSaveCommonDetails}
            >
              {manageBusy
                ? t("inventory.updatingRoll", "Updating selected roll...")
                : t("inventory.saveRollChanges", "Save roll changes")}
            </button>
          </div>
        </ModalFooter>
      </>
    </AppModal>
  );
}
