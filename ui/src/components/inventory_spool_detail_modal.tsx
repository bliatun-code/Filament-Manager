import type { FilamentLabelExportResult } from "../lib/tauri_label_file_client";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppModal } from "./app_modal";
import {
  inventoryDetailActionButtonClassName,
} from "./inventory_detail_panel_class";
import { InventoryCatalogMetadataPanel } from "./inventory_catalog_metadata_panel";
import { InventoryDangerZonePanel } from "./inventory_danger_zone_panel";
import {
  inventoryModalOverlayClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { InventoryRollHistoryPanel } from "./inventory_roll_history_panel";
import { InventorySpoolQrRfidPanel } from "./inventory_spool_qr_rfid_panel";
import { InventorySpoolDetailContextActions } from "./inventory_spool_detail_context_actions";
import { ModalNotice } from "./modal_chrome";
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
import { WeightInput } from "./weight_input";
import { useI18n } from "../lib/i18n";
import type { FilamentLabelSize } from "../lib/filament_label_profiles";
import type {
  InventorySemanticTone,
  InventorySpool,
  OwnershipType,
} from "../lib/inventory_list_model";
import { formatGrams } from "../lib/weight_display";
import { formatDateTime } from "../lib/date_time";
import { resolveSpoolTareWeight } from "../lib/spool_weight";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { SpoolHistoryEventRow, SpoolUsagePointRow } from "../lib/tauri_client";
import {
  purchaseReceiptMetadataKeepsLegacyCurrencylessPrice,
  type PurchaseReceiptMetadataDraft,
  type PurchaseReceiptMetadataValidationErrors,
} from "../lib/purchase_receipt_metadata";
import { purchaseReceiptMetadataFieldsCopy } from "../lib/purchase_receipt_metadata_copy";
import { PurchaseReceiptMetadataFields } from "./purchase_receipt_metadata_fields";
import { InventoryPurchasePriceProtectionControl } from "./inventory_purchase_price_protection_control";
import { InventorySpoolDetailFooter } from "./inventory_spool_detail_footer";

const RollUsageChart = lazy(() => import("./roll_usage_chart").then(module => ({default:module.RollUsageChart})));

/*
 * Keep the legacy exception visible to assistive technology only while the
 * exact pre-currency price remains unchanged. Validation stays strict as soon
 * as the user changes that price or enters a new one.
 */
function keepsLegacyCurrencylessPurchasePrice(
  spool: InventorySpool,
  draft: PurchaseReceiptMetadataDraft,
): boolean {
  return purchaseReceiptMetadataKeepsLegacyCurrencylessPrice(
    {
      purchase_price: spool.purchasePrice ?? null,
      purchase_currency: spool.purchaseCurrency ?? null,
    },
    draft,
  );
}

type InventorySpoolDetailModalProps = {
  clientDataWarning?: string | null;
  detailUnavailable?: boolean;
  onRefreshData?: () => void;
  refreshingData?: boolean;
  assignedSlot: InventorySpoolDetailAssignedSlot | null;
  colorName: string;
  confirmDelete: boolean;
  confirmPurge: boolean;
  deterministicLabelPreferences?: boolean;
  defaultPurchaseCurrency?: string;
  discardConfirmationOpen: boolean;
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
  homeLocationLocked: boolean;
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
  onChangePurchasePriceBatchLocked: (value: boolean) => void;
  onChangePurchaseMetadata: (value: PurchaseReceiptMetadataDraft) => void;
  onChangeTare: (value: string) => void;
  onChangeVendor: (value: string) => void;
  onCancelDangerZoneConfirmation: () => void;
  onCancelDiscardConfirmation: () => void;
  onClose: () => void;
  onConfirmDiscard: () => void;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onLoadInPrinter: () => void;
  onOpenPrinters?: () => void;
  onLoanOut: () => void;
  onRetryQr?: () => void;
  onPrintLabel: (labelSize: FilamentLabelSize, pngDataUrl: string) => Promise<FilamentLabelExportResult | void>;
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
  purchasePriceBatchLockedDraft: boolean;
  purchaseMetadataDraft: PurchaseReceiptMetadataDraft;
  purchaseMetadataErrors: PurchaseReceiptMetadataValidationErrors;
  qrCompanionAvailable: boolean;
  qrAuthorityKey?: string | null;
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
  clientDataWarning,
  detailUnavailable = false,
  onRefreshData,
  refreshingData = false,
  assignedSlot,
  colorName,
  confirmDelete,
  confirmPurge,
  deterministicLabelPreferences = false,
  defaultPurchaseCurrency = "",
  discardConfirmationOpen,
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
  homeLocationLocked,
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
  onChangePurchasePriceBatchLocked,
  onChangePurchaseMetadata,
  onChangeTare,
  onChangeVendor,
  onCancelDangerZoneConfirmation,
  onCancelDiscardConfirmation,
  onClose,
  onConfirmDiscard,
  onDelete,
  onMarkEmpty,
  onLoadInPrinter,
  onOpenPrinters,
  onLoanOut,
  onRetryQr,
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
  purchasePriceBatchLockedDraft,
  purchaseMetadataDraft,
  purchaseMetadataErrors,
  qrCompanionAvailable,
  qrAuthorityKey,
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
  const { t, locale } = useI18n();
  const [labelPanelRequestId, setLabelPanelRequestId] = useState(0);
  const [activityExpanded, setActivityExpanded] = useState(false);
  useEffect(() => { setActivityExpanded(false); }, [open, spool?.id]);

  if (!open || !spool) {
    return null;
  }

  const savedTare = resolveSpoolTareWeight(spool.spoolTareWeightGrams, spool.vendor);
  const tareUnsaved = tareDraft.trim() === "" || Number(tareDraft) !== savedTare;
  const latestEvent = !historyLoading && !detailUnavailable ? visibleHistoryRows[0] : null;

  return (
    <AppModal
      ariaLabel={`${t("inventory.selectedRoll", "Selected roll")}: ${displayTitle}`}
      zIndex={50}
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={`${inventoryWideModalPanelClassName} inventory-balanced-dialog`}
    >
      <>
        <InventorySpoolDetailHeader
          assignedSlot={assignedSlot}
          displayTitle={displayTitle}
          onClose={onClose}
          ownershipLabel={ownershipLabel}
          ownershipTone={ownershipTone}
          spool={spool}
          statusLabel={statusLabel}
          statusTone={statusTone}
        />

        <InventorySpoolDetailContextActions
          assigned={Boolean(assignedSlot)}
          onOpenPrinters={onOpenPrinters}
          openPrintersDisabled={!runtimeAvailable || manageBusy}
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
          className="inventory-balanced-scroll overflow-y-auto"
          data-inventory-detail-scroll
        >
          {clientDataWarning || detailUnavailable ? (
            <ModalNotice tone="warning" className="mb-4">
              <div role="status">
                {clientDataWarning ?? t("errors.requestFailed", "The request could not be completed.")}
              </div>
              <button type="button" className="mt-2 underline" onClick={onRefreshData} disabled={refreshingData}>
                {refreshingData ? t("common.loading", "Loading...") : t("common.refresh", "Refresh")}
              </button>
            </ModalNotice>
          ) : null}
          {error || infoMessage ? <div className="mb-4 space-y-3">
                {error ? (
                  <ModalNotice className="px-3 py-2 text-xs" tone="danger">
                    {error}
                  </ModalNotice>
                ) : null}
                {!error && infoMessage ? (
                  <ModalNotice tone="success">{infoMessage}</ModalNotice>
                ) : null}

          </div> : null}
          <div className="inventory-balanced-grid">
            <div className="inventory-balanced-main">
              <section className="inventory-balanced-section" aria-labelledby="inventory-balanced-weight-heading">
                <h2 id="inventory-balanced-weight-heading">{t("inventory.detailWeight", "Weight")}</h2>
                <div className="inventory-balanced-weight-summary">
                  <div><strong>{formatGrams(spool.remainingGrams, "dash", locale)}</strong><span>{t("inventory.remainingWeight", "Remaining weight (g)")}</span></div>
                  <div><span>{t("inventory.initialWeight", "Initial weight (g)")}</span><b>{formatGrams(spool.initialWeightGrams, "dash", locale)}</b></div>
                </div>
                <WeightInput compact label={t("inventory.measuredTotalWeight", "Measured total weight (g)")}
                  value={measuredTotal} onSubmit={onSubmitWeight}
                  max={Math.max(1500, measuredTotal, spool.initialWeightGrams + savedTare)}
                  disabled={!runtimeAvailable || manageBusy || homeLocationLocked || detailUnavailable}
                  submitDisabled={tareUnsaved} tareWeight={savedTare}
                  secondaryControl={<InventorySpoolTarePanel neutral compact
                disabled={!runtimeAvailable || manageBusy}
                onChange={onChangeTare}
                onSave={onSaveCommonDetails}
                resolvedTheme={resolvedTheme}
                showSaveAction={false}
                value={tareDraft}
              />} />
                {tareUnsaved ? <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{t("inventory.detailSaveTareFirst", "Save changes to empty spool weight before updating measured total.")}</p> : null}
              </section>
              <section className="inventory-balanced-section inventory-balanced-placement" aria-labelledby="inventory-balanced-placement-heading">
                <h2 id="inventory-balanced-placement-heading">{t("inventory.detailPlacementOwnership", "Placement and ownership")}</h2>
                <InventorySpoolHomeLocationPanel neutral
                assignedToPrinter={Boolean(assignedSlot)}
                disabled={!runtimeAvailable || manageBusy || homeLocationLocked}
                loanedOut={homeLocationLocked}
                onChange={onChangeLocation}
                onSave={onSaveCommonDetails}
                resolvedTheme={resolvedTheme}
                showSaveAction={false}
                value={locationDraft}
              />
                <InventorySpoolOwnershipPanel compact neutral
                contactValue={ownerContactDraft}
                disabled={!runtimeAvailable || manageBusy || homeLocationLocked}
                loanedOut={homeLocationLocked}
                noteValue={ownershipNoteDraft}
                onChangeContact={onChangeOwnerContact}
                onChangeName={onChangeOwnerName}
                onChangeNote={onChangeOwnershipNote}
                onChangeType={onChangeOwnershipType}
                onSave={onSaveCommonDetails}
                ownerNameValue={ownerNameDraft}
                resolvedTheme={resolvedTheme}
                showSaveAction={false}
                typeValue={ownershipTypeDraft}
              />
              </section>
            </div>
            <div className="inventory-balanced-secondary">
              <section className="inventory-balanced-section"><PurchaseReceiptMetadataFields className="inventory-balanced-purchase"
                copy={purchaseReceiptMetadataFieldsCopy(t)}
                defaultCurrency={defaultPurchaseCurrency}
                disabled={!runtimeAvailable || manageBusy}
                draft={purchaseMetadataDraft}
                errors={purchaseMetadataErrors}
                legacyCurrencylessPriceUnchanged={keepsLegacyCurrencylessPurchasePrice(
                  spool,
                  purchaseMetadataDraft,
                )}
                onChange={onChangePurchaseMetadata}
                selectedQuantity={1}
               renderAdditionalFields={fields => <details className="inventory-balanced-purchase-more" open={purchaseMetadataErrors.batchCode || purchaseMetadataErrors.supplierReference ? true : undefined}>
                  <summary className="app-control-focus">{t("inventory.detailMorePurchase", "More purchase details")}</summary>
                  <div className="mt-3 grid gap-3">{fields}<InventoryPurchasePriceProtectionControl
                checked={purchasePriceBatchLockedDraft}
                disabled={!runtimeAvailable || manageBusy}
                onChange={onChangePurchasePriceBatchLocked}
              /></div>
                </details>} /></section>
              <section className="inventory-balanced-section inventory-balanced-identity" aria-labelledby="inventory-balanced-identity-heading">
                <h2 id="inventory-balanced-identity-heading">{t("inventory.detailIdentityLabel", "Identity and label")}</h2>
                <InventorySpoolQrRfidPanel compact showRfidControls={false}
                  companionAvailable={qrCompanionAvailable}
                  authorityKey={qrAuthorityKey}
                  dataUrl={qrDataUrl}
                  deterministicLabelPreferences={deterministicLabelPreferences}
                  loading={qrLoading}
                  initialLabelPanelOpen={initialLabelPanelOpen}
                  labelPanelRequestId={labelPanelRequestId}
                  onRetryQr={onRetryQr}
                  onPrintLabel={onPrintLabel}
                  onStartRfidCapture={onStartRfidCapture}
                  resolvedTheme={resolvedTheme}
                  runtimeAvailable={runtimeAvailable}
                  spool={spool}
                  supportsRfidCapture={supportsRfidCapture}
                  target={qrTarget}
                />
                <details className="inventory-balanced-disclosure">
                  <summary className="app-control-focus">{t("inventory.rfidButton", "RFID")} · {rfidBindingMeta.label}</summary>
                  <div className="inventory-balanced-reference"><InventorySpoolIdentityPanel neutral
                  assignedSlot={assignedSlot}
                  locationValue={locationValue}
                  rfidBindingMeta={rfidBindingMeta}
                  resolvedTheme={resolvedTheme}
                  spool={spool}
                />
                    <button type="button" className={inventoryDetailActionButtonClassName} onClick={onStartRfidCapture} disabled={!runtimeAvailable || manageBusy || !supportsRfidCapture}>{t("inventory.rfidButton", "RFID")}</button>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{supportsRfidCapture ? t("inventory.rfidHintReady", "Capture AMS slot identity data, review it, and save the observed RFID tag when it looks correct.") : t("inventory.rfidHintNeedsLive", "RFID capture needs a printer with Live Bambu status enabled and at least one AMS slot available.")}</p>
                  </div>
                </details>
                <details className="inventory-balanced-disclosure" open={masterEditUnlocked ? true : undefined}>
                  <summary className="app-control-focus">{t("inventory.catalogDetails", "Catalog details")}</summary>
                  <InventoryCatalogMetadataPanel neutral
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
                  vendor={vendor}
                />
                </details>
              </section>
            </div>
          </div>
          <section className="inventory-balanced-activity">
            <details className="inventory-balanced-disclosure" onToggle={event => { setActivityExpanded(event.currentTarget.open); if (event.currentTarget.open && !showRollHistory) onToggleRollHistory(); }}>
              <summary className="app-control-focus">
                <span><strong>{t("inventory.detailUsageHistory", "Usage and history")}</strong><small>{detailUnavailable ? t("errors.requestFailed", "The request could not be completed.") : historyLoading ? t("inventory.loadingHistory", "Loading history...") : t("inventory.historyEventCount", "{count, plural, one {# event} other {# events}}", {count:visibleHistoryRows.length})}</small></span>
                <span className="text-sm">{t("inventory.detailShowUsageHistory", "Show chart and history")}</span>
              </summary>
              <div className="inventory-balanced-activity-content">
                <h3>{t("inventory.usageDiagram", "Usage diagram")}</h3>
                {detailUnavailable ? <div role="status">{t("errors.requestFailed", "The request could not be completed.")}</div> : activityExpanded ? <Suspense fallback={<div role="status">{t("common.loading", "Loading...")}</div>}><RollUsageChart
                  points={usagePoints}
                  loading={usageLoading}
                  initialWeight={spool.initialWeightGrams}
                /></Suspense> : null}
                <InventoryRollHistoryPanel neutral
                unavailable={detailUnavailable}
                formatHistoryEventDetails={formatHistoryEventDetails}
                formatHistoryEventType={formatHistoryEventType}
                hasHiddenHistoryRows={hasHiddenHistoryRows}
                historyLoading={historyLoading}
                onToggle={onToggleRollHistory}
                resolvedTheme={resolvedTheme}
                showRollHistory={showRollHistory}
                visibleHistoryRows={visibleHistoryRows}
              />
              </div>
            </details>
            {latestEvent ? <div className="inventory-balanced-latest-event"><span>{formatHistoryEventType(latestEvent.event_type)} · <time dateTime={latestEvent.created_at}>{formatDateTime(latestEvent.created_at, locale)}</time></span><span>{formatHistoryEventDetails(latestEvent)}</span></div> : null}
          </section>
          <InventoryDangerZonePanel heading={t("inventory.detailAdvancedActions", "Advanced actions")} leadingContent={<InventorySpoolLostStatusPanel neutral
                disabled={!runtimeAvailable || manageBusy || homeLocationLocked}
                loanedOut={homeLocationLocked}
                onToggle={onToggleLostStatus}
                resolvedTheme={resolvedTheme}
                status={spool.status}
              />}
                confirmDelete={confirmDelete}
                confirmPurge={confirmPurge}
                manageBusy={manageBusy}
                loanedOut={homeLocationLocked}
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

        <InventorySpoolDetailFooter
          showSavedStatus={!error && !clientDataWarning && !detailUnavailable}
          discardConfirmationOpen={discardConfirmationOpen}
          hasCommonChanges={hasCommonChanges}
          hasUnsavedChanges={hasUnsavedChanges}
          manageBusy={manageBusy}
          onCancel={onClose}
          onCancelDiscardConfirmation={onCancelDiscardConfirmation}
          onConfirmDiscard={onConfirmDiscard}
          onSaveCommonDetails={onSaveCommonDetails}
          runtimeAvailable={runtimeAvailable}
        />
      </>
    </AppModal>
  );
}
