import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
import { WishlistQueuePanel } from "./wishlist_queue_panel";
import { useI18n } from "../lib/i18n";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import {
  buildInventoryCreateSelectionSummary,
  type InventoryCreateMode,
} from "../lib/inventory_create_model";
import type { OwnershipType } from "../lib/inventory_list_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import type {
  WishlistQueueSummary,
  WishlistStatus,
  WishlistStatusFilter,
} from "../lib/wishlist_data_source";

export type InventoryAddModalProps = {
  actionStyle?: CSSProperties;
  activeCatalogMasters: MasterCatalogRow[];
  autoFocusWishlistQueue?: boolean;
  autoOpenBambuBatch?: boolean;
  bambuBatchInput: string;
  bambuBatchCreateState: BambuFilamentCodeBatchCreateState;
  bambuCodeBatch: BambuFilamentCodeBatch;
  borrowedFromContact: string;
  borrowedFromName: string;
  borrowedInNote: string;
  busy: boolean;
  catalogMasterById: Map<string, MasterCatalogRow>;
  catalogQuery: string;
  confirmWishlistRemoveId: string | null;
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
  onDeleteWishlistItem: (itemId: string) => void;
  onInitialWeightChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onManualColorNameChange: (value: string) => void;
  onManualFilamentNameChange: (value: string) => void;
  onManualHexColorChange: (value: string) => void;
  onManualMaterialChange: (value: string) => void;
  onManualVendorChange: (value: string) => void;
  onOwnershipTypeChange: (value: OwnershipType) => void;
  onSelectCatalogMaster: (master: MasterCatalogRow) => void;
  onStockWishlistItem: (item: WishlistItemRow) => void;
  onUseManualFromCatalog: () => void;
  onWishlistFilterChange: (filter: WishlistStatusFilter) => void;
  onWishlistStatusChange: (itemId: string, status: WishlistStatus) => void;
  open: boolean;
  ownershipType: OwnershipType;
  panelStyle?: CSSProperties;
  resolvedTheme: ResolvedTheme;
  selectedCatalogMasterId: string | null;
  tauriAvailable: boolean;
  visibleWishlistItems: WishlistItemRow[];
  wishlistItems: WishlistItemRow[];
  wishlistLoading: boolean;
  wishlistSummary: WishlistQueueSummary;
  wishlistValue: WishlistStatusFilter;
};

export function InventoryAddModal({
  actionStyle,
  activeCatalogMasters,
  autoFocusWishlistQueue = false,
  autoOpenBambuBatch = false,
  bambuBatchInput,
  bambuBatchCreateState,
  bambuCodeBatch,
  borrowedFromContact,
  borrowedFromName,
  borrowedInNote,
  busy,
  catalogMasterById,
  catalogQuery,
  confirmWishlistRemoveId,
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
  onDeleteWishlistItem,
  onInitialWeightChange,
  onLocationChange,
  onManualColorNameChange,
  onManualFilamentNameChange,
  onManualHexColorChange,
  onManualMaterialChange,
  onManualVendorChange,
  onOwnershipTypeChange,
  onSelectCatalogMaster,
  onStockWishlistItem,
  onUseManualFromCatalog,
  onWishlistFilterChange,
  onWishlistStatusChange,
  open,
  ownershipType,
  panelStyle,
  resolvedTheme,
  selectedCatalogMasterId,
  tauriAvailable,
  visibleWishlistItems,
  wishlistItems,
  wishlistLoading,
  wishlistSummary,
  wishlistValue,
}: InventoryAddModalProps) {
  const { t } = useI18n();
  const [bambuBatchModalOpen, setBambuBatchModalOpen] = useState(false);
  const [autoOpenedBambuBatch, setAutoOpenedBambuBatch] = useState(false);
  const wishlistQueueRef = useRef<HTMLDivElement | null>(null);
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
    if (createMode !== "bambu") {
      onCreateModeChange("bambu");
    }
    setBambuBatchModalOpen(true);
  }, [createMode, onCreateModeChange]);

  useEffect(() => {
    if (!open) {
      setBambuBatchModalOpen(false);
      setAutoOpenedBambuBatch(false);
      return;
    }
    if (!autoOpenBambuBatch || autoOpenedBambuBatch) {
      return;
    }
    openBambuBatchModal();
    setAutoOpenedBambuBatch(true);
  }, [autoOpenBambuBatch, autoOpenedBambuBatch, open, openBambuBatchModal]);

  useEffect(() => {
    if (!open || !autoFocusWishlistQueue || wishlistLoading) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      wishlistQueueRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusWishlistQueue, open, visibleWishlistItems.length, wishlistItems.length, wishlistLoading]);

  if (!open) {
    return null;
  }

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={inventoryWideModalPanelClassName}
    >
      <>
        <ModalHeader
          eyebrow={t("inventory.stockEntry", "Stock entry")}
          title={t("inventory.addFilament", "Add filament")}
          subtitle={t(
            "inventory.addFilamentSubtitle",
            "Add directly to stock, or keep the wishlist → on order → stock workflow.",
          )}
          closeLabel={t("common.close", "Close")}
          onClose={onClose}
          className="sticky top-0 z-10 bg-white/88 backdrop-blur-xl dark:bg-slate-950/88"
          aside={
            <>
              <ModalHeaderActionButton
                onClick={openBambuBatchModal}
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
            </>
          }
        />

        <ModalBody className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
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
                selectionSummary={selectionSummary}
                tauriAvailable={tauriAvailable}
              />

              <div ref={wishlistQueueRef}>
                <WishlistQueuePanel
                  busy={busy}
                  catalogMasterById={catalogMasterById}
                  confirmWishlistRemoveId={confirmWishlistRemoveId}
                  items={wishlistItems}
                  loading={wishlistLoading}
                  onDeleteItem={onDeleteWishlistItem}
                  onFilterChange={onWishlistFilterChange}
                  onStatusChange={onWishlistStatusChange}
                  onStockItem={onStockWishlistItem}
                  resolvedTheme={resolvedTheme}
                  summary={wishlistSummary}
                  tauriAvailable={tauriAvailable}
                  value={wishlistValue}
                  visibleItems={visibleWishlistItems}
                />
              </div>
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
