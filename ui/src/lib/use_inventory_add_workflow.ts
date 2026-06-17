import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { InventoryAddModalProps } from "../components/inventory_add_modal";
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
import type { MasterCatalogRow, WishlistItemRow } from "./tauri_client";

type SidePanelMode = "MANAGE" | "ADD";

type InventoryAddWorkflowInput = {
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  ensureLocalWriteAllowed: () => boolean;
  error: string | null;
  infoMessage: string | null;
  librarySyncReady: boolean;
  reloadActiveLoans: () => Promise<void>;
  reloadPrinterOverview: () => Promise<void>;
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
  reloadActiveLoans,
  reloadPrinterOverview,
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
    bambuCodeLookup,
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
    visibleWishlistItems,
    wishlistQueueFilter,
    wishlistQueueSummary,
  } = useWishlistQueue(wishlistItems);

  const switchToManageMode = useCallback(() => {
    setSidePanelMode("MANAGE");
  }, []);

  const { reloadCatalog } = useInventoryCatalogReload({
    applyCatalogDefaults,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    librarySyncReady,
    reloadActiveLoans,
    reloadPrinterOverview,
    reloadSpools,
    reloadWishlist,
    setError,
    setMasters,
    showAddModal,
    sidePanelMode,
    tauriAvailable,
    t,
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
    masters,
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

  const openAddModal = useCallback(() => {
    if (clientReadOnly) {
      if (!canUseClientHostWrite()) {
        return;
      }
    } else if (!ensureLocalWriteAllowed()) {
      return;
    }
    setSidePanelMode("ADD");
    resetWishlistQueue();
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
  const disableBambuBatchCreate =
    !tauriAvailable ||
    busy ||
    createMode !== "bambu" ||
    bambuCodeBatch.creatableRows.length === 0 ||
    (newOwnershipType === "BORROWED_IN" && !borrowedFromName.trim());
  const addModalActive = showAddModal && sidePanelMode === "ADD";

  const modalProps: InventoryAddModalProps = {
    actionStyle: currentCreateActionStyle,
    activeCatalogMasters,
    bambuBatchInput,
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
    disabledBambuBatchCreate: disableBambuBatchCreate,
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
    onCatalogQueryChange: handleCatalogQueryChange,
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
    onSelectCatalogMaster: selectCatalogMaster,
    onStockWishlistItem: handleStockFromWishlist,
    onUseManualFromCatalog: useManualFromCatalog,
    onWishlistFilterChange: setWishlistQueueFilter,
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
