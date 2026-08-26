import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type {
  InventoryAddModalProps,
  InventoryEntryPurpose,
} from "../components/inventory_add_modal";
import type { WishlistQueuePanelProps } from "../components/wishlist_queue_panel";
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
import { parsePositiveWeight } from "./weight_display";
import type { useI18n } from "./i18n";
import type { ResolvedTheme } from "./theme_mode";
import type { WishlistStatusFilter } from "./wishlist_data_source";
import type { MasterCatalogRow, WishlistItemRow } from "./tauri_client";

type SidePanelMode = "MANAGE" | "ADD";

type OpenAddModalOptions = {
  purpose?: InventoryEntryPurpose;
};

type InventoryAddWorkflowInput = {
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  defaultPurchaseCurrency: string;
  ensureLocalWriteAllowed: () => boolean;
  error: string | null;
  infoMessage: string | null;
  librarySyncReady: boolean;
  onOpenPurchaseQueue: () => void;
  purchaseActionsDisabled: boolean;
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
  defaultPurchaseCurrency,
  ensureLocalWriteAllowed,
  error,
  infoMessage,
  librarySyncReady,
  onOpenPurchaseQueue,
  purchaseActionsDisabled,
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
  const [entryPurpose, setEntryPurpose] = useState<InventoryEntryPurpose>("STOCK");

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

  const finishPurchaseEntry = useCallback(() => {
    setShowAddModal(false);
    setSidePanelMode("MANAGE");
    resetBorrowedInDraft();
    resetWishlistQueue("WISHLIST");
    onOpenPurchaseQueue();
  }, [onOpenPurchaseQueue, resetBorrowedInDraft, resetWishlistQueue]);

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
    onWishlistItemCreated: finishPurchaseEntry,
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
    setEntryPurpose(options.purpose ?? "STOCK");
    setSidePanelMode("ADD");
    resetBorrowedInDraft();
    setShowAddModal(true);
  }, [
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    resetBorrowedInDraft,
  ]);

  const openPurchaseModal = useCallback(() => {
    openAddModal({ purpose: "PURCHASE" });
  }, [openAddModal]);

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
    initialWeightRaw: newInitialWeight,
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
    initialWeightValid: parsePositiveWeight(newInitialWeight) !== null,
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
    catalogMasterById,
    catalogQuery,
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
    onClose: closeAddModal,
    onCreateBambuCodeBatch: handleCreateBambuCodeBatch,
    onCreateModeChange: setCreateMode,
    onCreateSpool: handleCreateSpool,
    onInitialWeightChange: setNewInitialWeight,
    onLocationChange: setNewLocation,
    onManualColorNameChange: setManualColorName,
    onManualFilamentNameChange: setManualFilamentName,
    onManualHexColorChange: setManualHexColor,
    onManualMaterialChange: setManualMaterial,
    onManualVendorChange: setManualVendor,
    onOwnershipTypeChange: setNewOwnershipType,
    onSelectCatalogMaster: selectCatalogMaster,
    onUseManualFromCatalog: useManualFromCatalog,
    open: addModalActive,
    ownershipType: newOwnershipType,
    panelStyle: currentCreatePanelStyle,
    purpose: entryPurpose,
    resolvedTheme,
    selectedCatalogMasterId: selectedCatalogMaster?.id ?? null,
    tauriAvailable,
  };

  const purchaseQueueProps: WishlistQueuePanelProps = {
    addPurchaseDisabled: !tauriAvailable || purchaseActionsDisabled || busy,
    busy,
    catalogMasterById,
    confirmWishlistRemoveId,
    defaultPurchaseCurrency,
    items: wishlistItems,
    loading: wishlistLoading,
    onAddPurchase: openPurchaseModal,
    onCancelDeleteItem: cancelWishlistRemove,
    onDeleteItem: handleDeleteWishlistItem,
    onFilterChange: handleWishlistFilterChange,
    onQueryChange: handleWishlistQueryChange,
    onRequestDeleteItem: requestWishlistRemove,
    onStatusChange: handleWishlistStatus,
    onStockItem: handleStockFromWishlist,
    query: wishlistQueueQuery,
    resolvedTheme,
    summary: wishlistQueueSummary,
    tauriAvailable,
    value: wishlistQueueFilter,
    visibleItems: visibleWishlistItems,
  };

  return {
    addModalActive,
    modalProps,
    openAddModal,
    purchaseQueueProps,
    reloadCatalog,
    resetPurchaseQueue: resetWishlistQueue,
    setMasters,
    switchToManageMode,
  };
}
