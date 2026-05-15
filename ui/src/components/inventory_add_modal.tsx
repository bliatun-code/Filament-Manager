import type { CSSProperties } from "react";
import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import { InventoryCreateActionsPanel } from "./inventory_create_actions_panel";
import { InventoryStockSourcePanel } from "./inventory_stock_source_panel";
import { WishlistQueuePanel } from "./wishlist_queue_panel";
import { useI18n } from "../lib/i18n";
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
  borrowedFromContact: string;
  borrowedFromName: string;
  borrowedInNote: string;
  busy: boolean;
  catalogMasterById: Map<string, MasterCatalogRow>;
  catalogQuery: string;
  confirmWishlistRemoveId: string | null;
  createMode: InventoryCreateMode;
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
  onCatalogQueryChange: (value: string) => void;
  onClose: () => void;
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
  borrowedFromContact,
  borrowedFromName,
  borrowedInNote,
  busy,
  catalogMasterById,
  catalogQuery,
  confirmWishlistRemoveId,
  createMode,
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
  onCatalogQueryChange,
  onClose,
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

  if (!open) {
    return null;
  }

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6 backdrop-blur-md dark:bg-black/45"
      panelClassName="flex max-h-[92vh] min-w-0 w-[min(100%,72rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
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
      </>
    </AppModal>
  );
}
