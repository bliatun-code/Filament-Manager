import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { InventoryAddModalProps } from "../components/inventory_add_modal";
import { buildBambuFilamentCodeBatchCreateState } from "./bambu_filament_code_batch";
import { isBorrowedInOwnership } from "./inventory_domain";
import { isInventoryCreateDisabled } from "./inventory_create_model";
import {
  inventoryCreatePreviewPanelStyle,
  inventorySwatchActionButtonStyle,
} from "./inventory_swatch_style";
import { useInventoryCatalogReload } from "./use_inventory_catalog_reload";
import { useInventoryCreateActions } from "./use_inventory_create_actions";
import { useInventoryCreateDraft } from "./use_inventory_create_draft";
import { useWishlistQueue } from "./use_wishlist_queue";
import type { useI18n } from "./i18n";
import type { ResolvedTheme } from "./theme_mode";
import type { WishlistStatusFilter } from "./wishlist_data_source";
import type { MasterCatalogRow, WishlistItemRow } from "./tauri_client";

type SidePanelMode = "MANAGE" | "ADD";

type OpenAddModalOptions = {
  wishlistFilter?: WishlistStatusFilter;
};

type InventoryAddWorkflowInput = {
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  ensureLocalWriteAllowed: () => boolean;
  error: string | null;
  infoMessage: string | null;
  librarySyncReady: boolean;
  reloadSpools: () => Promise<void>;
  reloadWishlist: () => Promise<void>;
  resolvedTheme: ResolvedTheme;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setRecentlyAddedSpoolId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpoolId: Dispatch<SetStateAction<string | null>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
  wishlistItems: WishlistItemRow[];
  wishlistLoading: boolean;
};

export function useInventoryAddWorkflow({
  canUseClientHostWrite,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  ensureLocalWriteAllowed,
  error,
  infoMessage,
  librarySyncReady,
  reloadSpools,
  reloadWishlist,
  resolvedTheme,
  setError,
  setInfoMessage,
  setRecentlyAddedSpoolId,
  setSelectedSpoolId,
  tauriAvailable,
  t,
  wishlistItems,
  wishlistLoading,
}: InventoryAddWorkflowInput) {
  const [busy, setBusy] = useState(false);
  const [masters, setMasters] = useState<MasterCatalogRow[]>([]);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("MANAGE");
  const [showAddModal, setShowAddModal] = useState(false);

  const {
    activeCatalogMasters,
    applyCatalogDefaults,
    bambuBatchInput,
    bambuCodeBatch,
    borrowedFromContact,
    borrowedFromName,
    borrowedInNote,
    catalogQuery,
    createMode,
    currentCreateSwatchHex,
    handleCatalogQueryChange,
    isCatalogCreateMode,
    manualColorName,
    manualFilamentName,
    manualHexColor,
    manualMaterial,
    manualVendor,
    newInitialWeight,
    newLocation,
    newOwnershipType,
    resetAfterCreatedSpool,
    resetBambuBatchInput,
    resetBorrowedInDraft,
    selectCatalogMaster,
    selectedBambuMaster,
    selectedCatalogMaster,
    selectedEsunMaster,
    setBorrowedFromContact,
    setBorrowedFromName,
    setBorrowedInNote,
    setBambuBatchInput,
    setBambuBatchRowSelection,
    setCreateMode,
    setManualColorName,
    setManualFilamentName,
    setManualHexColor,
    setManualMaterial,
    setManualVendor,
    setNewInitialWeight,
    setNewLocation,
    setNewOwnershipType,
    useManualFromCatalog,
  } = useInventoryCreateDraft(masters);

  const {
    confirmWishlistRemoveId,
    resetWishlistQueue,
    setConfirmWishlistRemoveId,
    setWishlistQueueFilter,
    setWishlistQueueQuery,
    visibleWishlistItems,
    wishlistQueueFilter,
    wishlistQueueQuery,
    wishlistQueueSummary,
  } = useWishlistQueue(wishlistItems);

  const cancelWishlistRemove = useCallback(() => {
    setConfirmWishlistRemoveId(null);
    setInfoMessage(null);
  }, [setConfirmWishlistRemoveId, setInfoMessage]);

  const requestWishlistRemove = useCallback((itemId: string) => {
    setConfirmWishlistRemoveId(itemId);
    setInfoMessage(null);
  }, [setConfirmWishlistRemoveId, setInfoMessage]);

  const handleWishlistFilterChange = useCallback((filter: WishlistStatusFilter) => {
    setWishlistQueueFilter(filter);
    if (confirmWishlistRemoveId) {
      cancelWishlistRemove();
    }
  }, [cancelWishlistRemove, confirmWishlistRemoveId, setWishlistQueueFilter]);

  const handleWishlistQueryChange = useCallback((query: string) => {
    setWishlistQueueQuery(query);
    if (confirmWishlistRemoveId) {
      cancelWishlistRemove();
    }
  }, [cancelWishlistRemove, confirmWishlistRemoveId, setWishlistQueueQuery]);

  const switchToManageMode = useCallback(() => {
    setSidePanelMode("MANAGE");
  }, []);

  const { reloadCatalog } = useInventoryCatalogReload({
    applyCatalogDefaults,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    librarySyncReady,
    reloadWishlist,
    setMasters,
    showAddModal,
    sidePanelMode,
    tauriAvailable,
  });

  const catalogMasterById = useMemo(
    () => new Map(masters.map((master) => [master.id, master])),
    [masters],
  );

  const {
    currentCreateDraft,
    handleAddCurrentToWishlist,
    handleCreateBambuCodeBatch,
    handleCreateSpool,
    handleDeleteWishlistItem,
    handleStockFromWishlist,
    handleWishlistStatus,
  } = useInventoryCreateActions({
    borrowedFromContact,
    borrowedFromName,
    borrowedInNote,
    bambuCodeBatch,
    busy,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    confirmWishlistRemoveId,
    createMode,
    ensureLocalWriteAllowed,
    manualColorName,
    manualFilamentName,
    manualHexColor,
    manualMaterial,
    manualVendor,
    newInitialWeight,
    newLocation,
    newOwnershipType,
    reloadCatalog,
    reloadSpools,
    reloadWishlist,
    resetAfterCreatedSpool,
    resetBambuBatchInput,
    selectedBambuMaster,
    selectedEsunMaster,
    setBusy,
    setConfirmWishlistRemoveId,
    setError,
    setInfoMessage,
    setRecentlyAddedSpoolId,
    setSelectedSpoolId,
    tauriAvailable,
    t,
  });

  const openAddModal = useCallback((options: OpenAddModalOptions = {}) => {
    if (clientReadOnly) {
      if (!canUseClientHostWrite()) {
        return;
      }
    } else if (!ensureLocalWriteAllowed()) {
      return;
    }
    setSidePanelMode("ADD");
    resetWishlistQueue(options.wishlistFilter);
    resetBorrowedInDraft();
    setShowAddModal(true);
  }, [
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    resetBorrowedInDraft,
    resetWishlistQueue,
  ]);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setSidePanelMode("MANAGE");
    resetBorrowedInDraft();
  }, [resetBorrowedInDraft]);

  const disableCreate = isInventoryCreateDisabled({
    tauriAvailable,
    busy,
    mode: createMode,
    selectedBambuMaster,
    selectedEsunMaster,
    manualFilamentName,
    manualColorName,
    ownershipType: newOwnershipType,
    borrowedFromName,
  });

  const currentCreatePanelStyle = inventoryCreatePreviewPanelStyle(
    currentCreateSwatchHex,
    resolvedTheme,
  );
  const currentCreateActionStyle = currentCreateSwatchHex
    ? inventorySwatchActionButtonStyle(currentCreateSwatchHex, resolvedTheme)
    : undefined;
  const disableWishlistCreate = !tauriAvailable || busy || !currentCreateDraft;
  const newSpoolBorrowedIn = isBorrowedInOwnership(newOwnershipType);
  const bambuBatchCreateState = buildBambuFilamentCodeBatchCreateState({
    batch: bambuCodeBatch,
    tauriAvailable,
    busy,
    isBambuMode: createMode === "bambu",
    borrowedOwnerRequired: newSpoolBorrowedIn && !borrowedFromName.trim(),
  });
  const addModalActive = showAddModal && sidePanelMode === "ADD";

  const modalProps: InventoryAddModalProps = {
    actionStyle: currentCreateActionStyle,
    activeCatalogMasters,
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
    disabledBambuBatchCreate: bambuBatchCreateState.disabled,
    disabledCreate: disableCreate,
    disabledWishlistCreate: disableWishlistCreate,
    error,
    infoMessage,
    initialWeight: newInitialWeight,
    isCatalogCreateMode,
    location: newLocation,
    manualColorName,
    manualFilamentName,
    manualHexColor,
    manualMaterial,
    manualVendor,
    onAddCurrentToWishlist: handleAddCurrentToWishlist,
    onBorrowedFromContactChange: setBorrowedFromContact,
    onBorrowedFromNameChange: setBorrowedFromName,
    onBorrowedInNoteChange: setBorrowedInNote,
    onBambuBatchInputChange: setBambuBatchInput,
    onBambuBatchRowSelectionChange: setBambuBatchRowSelection,
    onCatalogQueryChange: handleCatalogQueryChange,
    onCancelWishlistRemove: cancelWishlistRemove,
    onClose: closeAddModal,
    onCreateBambuCodeBatch: handleCreateBambuCodeBatch,
    onCreateModeChange: setCreateMode,
    onCreateSpool: handleCreateSpool,
    onDeleteWishlistItem: handleDeleteWishlistItem,
    onInitialWeightChange: setNewInitialWeight,
    onLocationChange: setNewLocation,
    onManualColorNameChange: setManualColorName,
    onManualFilamentNameChange: setManualFilamentName,
    onManualHexColorChange: setManualHexColor,
    onManualMaterialChange: setManualMaterial,
    onManualVendorChange: setManualVendor,
    onOwnershipTypeChange: setNewOwnershipType,
    onRequestWishlistRemove: requestWishlistRemove,
    onSelectCatalogMaster: selectCatalogMaster,
    onStockWishlistItem: handleStockFromWishlist,
    onUseManualFromCatalog: useManualFromCatalog,
    onWishlistFilterChange: handleWishlistFilterChange,
    onWishlistQueryChange: handleWishlistQueryChange,
    onWishlistStatusChange: handleWishlistStatus,
    open: addModalActive,
    ownershipType: newOwnershipType,
    panelStyle: currentCreatePanelStyle,
    resolvedTheme,
    selectedCatalogMasterId: selectedCatalogMaster?.id ?? null,
    tauriAvailable,
    visibleWishlistItems,
    wishlistItems,
    wishlistLoading,
    wishlistQuery: wishlistQueueQuery,
    wishlistSummary: wishlistQueueSummary,
    wishlistValue: wishlistQueueFilter,
  };

  return {
    addModalActive,
    modalProps,
    openAddModal,
    reloadCatalog,
    setMasters,
    switchToManageMode,
  };
}
