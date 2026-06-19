import { useState, type CSSProperties } from "react";
import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import { InventoryBambuBatchModal } from "./inventory_bambu_batch_modal";
import { InventoryCreateActionsPanel } from "./inventory_create_actions_panel";
import {
  inventoryModalOverlayClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { InventoryStockSourcePanel } from "./inventory_stock_source_panel";
import { WishlistQueuePanel } from "./wishlist_queue_panel";
import { useI18n } from "../lib/i18n";
import type { BambuFilamentCodeLookup } from "../lib/bambu_filament_code_lookup";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import type { InventoryCreateMode } from "../lib/inventory_create_model";
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
  bambuBatchInput: string;
  bambuBatchCreateState: BambuFilamentCodeBatchCreateState;
  bambuCodeBatch: BambuFilamentCodeBatch;
  bambuCodeLookup: BambuFilamentCodeLookup;
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
  bambuBatchInput,
  bambuBatchCreateState,
  bambuCodeBatch,
  bambuCodeLookup,
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

  if (!open) {
    return null;
  }

  const openBambuBatchModal = () => {
    if (createMode !== "bambu") {
      onCreateModeChange("bambu");
    }
    setBambuBatchModalOpen(true);
  };

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={inventoryWideModalPanelClassName}
    >
      <>
        <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/88">
          <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t("inventory.stockEntry", "Stock entry")}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">
                {t("inventory.addFilament", "Add filament")}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t(
                  "inventory.addFilamentSubtitle",
                  "Add directly to stock, or keep the wishlist → on order → stock workflow.",
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-start gap-2">
              <button
                type="button"
                onClick={openBambuBatchModal}
                className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 bg-white/85 px-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-900/5 backdrop-blur-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-black/30 dark:hover:bg-slate-800/60 sm:text-sm"
                aria-label={t("inventory.bambuBatchHeaderAction", "Batch add from boxes")}
                title={t("inventory.bambuBatchHeaderAction", "Batch add from boxes")}
              >
                <span className="hidden sm:inline">
                  {t("inventory.bambuBatchHeaderAction", "Batch add from boxes")}
                </span>
                <span className="sm:hidden">
                  {t("inventory.bambuBatchHeaderActionShort", "Batch")}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-base leading-none text-slate-600 shadow-sm shadow-slate-900/5 backdrop-blur-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/30 dark:hover:bg-slate-800/60"
                aria-label={t("common.close", "Close")}
                title={t("common.close", "Close")}
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          {error ? (
            <FeedbackBanner tone="danger" className="mb-4">
              {error}
            </FeedbackBanner>
          ) : null}

          {!error && infoMessage ? (
            <FeedbackBanner tone="success" className="mb-4">
              {infoMessage}
            </FeedbackBanner>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] xl:gap-5">
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

            <div className="space-y-4 self-start lg:sticky lg:top-0">
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
                tauriAvailable={tauriAvailable}
              />

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
        <InventoryBambuBatchModal
          batch={bambuCodeBatch}
          createState={bambuBatchCreateState}
          disabledCreate={disabledBambuBatchCreate}
          input={bambuBatchInput}
          lookup={bambuCodeLookup}
          onClose={() => setBambuBatchModalOpen(false)}
          onCreateBatch={onCreateBambuCodeBatch}
          onInputChange={onBambuBatchInputChange}
          open={bambuBatchModalOpen}
          tauriAvailable={tauriAvailable}
        />
      </>
    </AppModal>
  );
}
