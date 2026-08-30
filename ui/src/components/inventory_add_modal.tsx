import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AppModal } from "./app_modal";
import { InventoryBambuBatchModal } from "./inventory_bambu_batch_modal";
import { InventoryCreateActionsPanel } from "./inventory_create_actions_panel";
import {
  inventoryModalOverlayClassName,
  inventoryTwoColumnModalGridClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { InventoryStockSourcePanel } from "./inventory_stock_source_panel";
import { ModalBody, ModalHeader, ModalHeaderActionButton, ModalNotice } from "./modal_chrome";
import { useI18n } from "../lib/i18n";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import {
  buildInventoryCreateSelectionSummary,
  type InventoryCreateMode,
} from "../lib/inventory_create_model";
import type { InventoryCatalogLoadState } from "../lib/use_inventory_catalog_reload";
import type { OwnershipType } from "../lib/inventory_list_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { MasterCatalogRow } from "../lib/tauri_client";

export type InventoryEntryPurpose = "STOCK" | "PURCHASE";

export type InventoryAddModalProps = {
  actionStyle?: CSSProperties;
  activeCatalogMasters: MasterCatalogRow[];
  autoOpenBambuBatch?: boolean;
  bambuBatchInput: string;
  bambuBatchCreateState: BambuFilamentCodeBatchCreateState;
  bambuCodeBatch: BambuFilamentCodeBatch;
  borrowedFromContact: string;
  borrowedFromName: string;
  borrowedInNote: string;
  catalogLoadState: InventoryCatalogLoadState;
  catalogMasterById: Map<string, MasterCatalogRow>;
  catalogQuery: string;
  createMode: InventoryCreateMode;
  disabledBambuBatchCreate: boolean;
  disabledCreate: boolean;
  disabledWishlistCreate: boolean;
  error: string | null;
  infoMessage: string | null;
  initialWeight: string;
  isCatalogCreateMode: boolean;
  location: string;
  manualColorName: string;
  manualFilamentName: string;
  manualHexColor: string;
  manualMaterial: string;
  manualVendor: string;
  onAddCurrentToWishlist: () => void;
  onBorrowedFromContactChange: (value: string) => void;
  onBorrowedFromNameChange: (value: string) => void;
  onBorrowedInNoteChange: (value: string) => void;
  onBambuBatchInputChange: (value: string) => void;
  onBambuBatchRowSelectionChange: (rowKey: string, masterId: string | null) => void;
  onCatalogQueryChange: (value: string) => void;
  onClose: () => void;
  onCreateBambuCodeBatch: () => void;
  onCreateModeChange: (value: InventoryCreateMode) => void;
  onCreateSpool: () => void;
  onInitialWeightChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onManualColorNameChange: (value: string) => void;
  onManualFilamentNameChange: (value: string) => void;
  onManualHexColorChange: (value: string) => void;
  onManualMaterialChange: (value: string) => void;
  onManualVendorChange: (value: string) => void;
  onOwnershipTypeChange: (value: OwnershipType) => void;
  onRetryCatalog: () => void;
  onSelectCatalogMaster: (master: MasterCatalogRow) => void;
  onUseManualFromCatalog: () => void;
  open: boolean;
  ownershipType: OwnershipType;
  panelStyle?: CSSProperties;
  purpose: InventoryEntryPurpose;
  resolvedTheme: ResolvedTheme;
  returnFocusElement?: HTMLElement | null;
  selectedCatalogMasterId: string | null;
  tauriAvailable: boolean;
};

export function InventoryAddModal({
  actionStyle,
  activeCatalogMasters,
  autoOpenBambuBatch = false,
  bambuBatchInput,
  bambuBatchCreateState,
  bambuCodeBatch,
  borrowedFromContact,
  borrowedFromName,
  borrowedInNote,
  catalogLoadState,
  catalogMasterById,
  catalogQuery,
  createMode,
  disabledBambuBatchCreate,
  disabledCreate,
  disabledWishlistCreate,
  error,
  infoMessage,
  initialWeight,
  isCatalogCreateMode,
  location,
  manualColorName,
  manualFilamentName,
  manualHexColor,
  manualMaterial,
  manualVendor,
  onAddCurrentToWishlist,
  onBorrowedFromContactChange,
  onBorrowedFromNameChange,
  onBorrowedInNoteChange,
  onBambuBatchInputChange,
  onBambuBatchRowSelectionChange,
  onCatalogQueryChange,
  onClose,
  onCreateBambuCodeBatch,
  onCreateModeChange,
  onCreateSpool,
  onInitialWeightChange,
  onLocationChange,
  onManualColorNameChange,
  onManualFilamentNameChange,
  onManualHexColorChange,
  onManualMaterialChange,
  onManualVendorChange,
  onOwnershipTypeChange,
  onRetryCatalog,
  onSelectCatalogMaster,
  onUseManualFromCatalog,
  open,
  ownershipType,
  panelStyle,
  purpose,
  resolvedTheme,
  returnFocusElement,
  selectedCatalogMasterId,
  tauriAvailable,
}: InventoryAddModalProps) {
  const { t } = useI18n();
  const [bambuBatchModalOpen, setBambuBatchModalOpen] = useState(false);
  const [autoOpenedBambuBatch, setAutoOpenedBambuBatch] = useState(false);
  const selectedCatalogMaster = selectedCatalogMasterId
    ? (catalogMasterById.get(selectedCatalogMasterId) ?? null)
    : null;
  const selectionSummary = buildInventoryCreateSelectionSummary({
    mode: createMode,
    selectedBambuMaster: createMode === "bambu" ? selectedCatalogMaster : null,
    selectedEsunMaster: createMode === "esun" ? selectedCatalogMaster : null,
    manualVendor,
    manualMaterial,
    manualFilamentName,
    manualColorName,
    manualHexColor,
    initialWeightRaw: initialWeight,
  });

  const openBambuBatchModal = useCallback(() => {
    if (catalogLoadState !== "READY") {
      return;
    }
    if (createMode !== "bambu") {
      onCreateModeChange("bambu");
    }
    setBambuBatchModalOpen(true);
  }, [catalogLoadState, createMode, onCreateModeChange]);

  useEffect(() => {
    if (!open) {
      setBambuBatchModalOpen(false);
      setAutoOpenedBambuBatch(false);
      return;
    }
    if (
      !autoOpenBambuBatch ||
      autoOpenedBambuBatch ||
      catalogLoadState !== "READY"
    ) {
      return;
    }
    openBambuBatchModal();
    setAutoOpenedBambuBatch(true);
  }, [
    autoOpenBambuBatch,
    autoOpenedBambuBatch,
    catalogLoadState,
    open,
    openBambuBatchModal,
  ]);

  useEffect(() => {
    if (catalogLoadState !== "READY") {
      setBambuBatchModalOpen(false);
    }
  }, [catalogLoadState]);

  if (!open) {
    return null;
  }

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={inventoryWideModalPanelClassName}
      returnFocusElement={returnFocusElement}
    >
      <>
        <ModalHeader
          eyebrow={
            purpose === "PURCHASE"
              ? t("inventory.wishlistWorkflow", "Wishlist workflow")
              : t("inventory.stockEntry", "Stock entry")
          }
          title={
            purpose === "PURCHASE"
              ? t("inventory.addToWishlist", "Add to wishlist / order")
              : t("inventory.addFilament", "Add filament")
          }
          subtitle={
            purpose === "PURCHASE"
              ? t(
                  "inventory.wishlistQueueHelp",
                  "Keep planned purchases here, move them to on order, then stock them when they arrive.",
                )
              : t(
                  "inventory.stockEntryHelp",
                  "Choose a vendor flow, pick a filament, then confirm stock details below.",
                )
          }
          closeLabel={t("common.close", "Close")}
          onClose={onClose}
          className="sticky top-0 z-10 backdrop-blur-xl"
          aside={
            purpose === "STOCK" ? (
              <ModalHeaderActionButton
                onClick={openBambuBatchModal}
                disabled={catalogLoadState !== "READY"}
                aria-label={t("inventory.bambuBatchHeaderAction", "Batch add from boxes")}
                title={t("inventory.bambuBatchHeaderAction", "Batch add from boxes")}
              >
                <span className="hidden sm:inline">
                  {t("inventory.bambuBatchHeaderAction", "Batch add from boxes")}
                </span>
                <span className="sm:hidden">
                  {t("inventory.bambuBatchHeaderActionShort", "Batch")}
                </span>
              </ModalHeaderActionButton>
            ) : null
          }
        />

        <ModalBody
          className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6"
          data-inventory-add-scroll
        >
          {error ? (
            <ModalNotice tone="danger" className="mb-4">
              {error}
            </ModalNotice>
          ) : null}

          {!error && infoMessage ? (
            <ModalNotice tone="success" className="mb-4">
              {infoMessage}
            </ModalNotice>
          ) : null}

          <div className={inventoryTwoColumnModalGridClassName}>
            <div className="space-y-4">
              <InventoryStockSourcePanel
                activeCatalogMasters={activeCatalogMasters}
                autoFocusCatalogSearch
                catalogLoadState={catalogLoadState}
                catalogQuery={catalogQuery}
                createMode={createMode}
                isCatalogCreateMode={isCatalogCreateMode}
                manualColorName={manualColorName}
                manualFilamentName={manualFilamentName}
                manualHexColor={manualHexColor}
                manualMaterial={manualMaterial}
                manualVendor={manualVendor}
                onCatalogQueryChange={onCatalogQueryChange}
                onCreateModeChange={onCreateModeChange}
                onManualColorNameChange={onManualColorNameChange}
                onManualFilamentNameChange={onManualFilamentNameChange}
                onManualHexColorChange={onManualHexColorChange}
                onManualMaterialChange={onManualMaterialChange}
                onManualVendorChange={onManualVendorChange}
                onRetryCatalog={onRetryCatalog}
                onSelectCatalogMaster={onSelectCatalogMaster}
                onUseManualFromCatalog={onUseManualFromCatalog}
                resolvedTheme={resolvedTheme}
                selectedCatalogMasterId={selectedCatalogMasterId}
                tauriAvailable={tauriAvailable}
              />
            </div>

            <div className="space-y-4 self-start min-[900px]:sticky min-[900px]:top-0">
              <InventoryCreateActionsPanel
                actionStyle={actionStyle}
                borrowedFromContact={borrowedFromContact}
                borrowedFromName={borrowedFromName}
                borrowedInNote={borrowedInNote}
                disabledCreate={disabledCreate}
                disabledWishlistCreate={disabledWishlistCreate}
                initialWeight={initialWeight}
                location={location}
                onAddCurrentToWishlist={onAddCurrentToWishlist}
                onBorrowedFromContactChange={onBorrowedFromContactChange}
                onBorrowedFromNameChange={onBorrowedFromNameChange}
                onBorrowedInNoteChange={onBorrowedInNoteChange}
                onCreateSpool={onCreateSpool}
                onInitialWeightChange={onInitialWeightChange}
                onLocationChange={onLocationChange}
                onOwnershipTypeChange={onOwnershipTypeChange}
                ownershipType={ownershipType}
                panelStyle={panelStyle}
                purpose={purpose}
                selectionSummary={selectionSummary}
                tauriAvailable={tauriAvailable}
              />
            </div>
          </div>
        </ModalBody>
        <InventoryBambuBatchModal
          batch={bambuCodeBatch}
          createState={bambuBatchCreateState}
          disabledCreate={disabledBambuBatchCreate}
          input={bambuBatchInput}
          onClose={() => setBambuBatchModalOpen(false)}
          onCreateBatch={onCreateBambuCodeBatch}
          onInputChange={onBambuBatchInputChange}
          onRowSelectionChange={onBambuBatchRowSelectionChange}
          open={bambuBatchModalOpen}
          tauriAvailable={tauriAvailable}
        />
      </>
    </AppModal>
  );
}
