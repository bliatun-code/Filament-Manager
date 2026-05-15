import { useMemo, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "./error_text";
import {
  buildInventoryCreateSpoolRequest,
  type InventoryCreateMode,
} from "./inventory_create_model";
import { formatInventoryDisplayTitle, type OwnershipType } from "./inventory_list_model";
import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
} from "./spool_writes";
import type { useI18n } from "./i18n";
import type { MasterCatalogRow, WishlistItemRow } from "./tauri_client";
import {
  buildWishlistDraft,
  createWishlistEntry,
  deleteWishlistEntry,
  updateWishlistEntryStatus,
  type WishlistStatus,
} from "./wishlist_data_source";

type InventoryCreateActionsInput = {
  borrowedFromContact: string;
  borrowedFromName: string;
  borrowedInNote: string;
  busy: boolean;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  confirmWishlistRemoveId: string | null;
  createMode: InventoryCreateMode;
  ensureLocalWriteAllowed: () => boolean;
  manualColorName: string;
  manualFilamentName: string;
  manualHexColor: string;
  manualMaterial: string;
  manualVendor: string;
  masters: MasterCatalogRow[];
  newInitialWeight: string;
  newLocation: string;
  newOwnershipType: OwnershipType;
  reloadCatalog: () => Promise<void>;
  reloadSpools: () => Promise<void>;
  reloadWishlist: () => Promise<void>;
  resetAfterCreatedSpool: () => void;
  selectedBambuMaster: MasterCatalogRow | null;
  selectedEsunMaster: MasterCatalogRow | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setConfirmWishlistRemoveId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setRecentlyAddedSpoolId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpoolId: Dispatch<SetStateAction<string | null>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryCreateActions({
  borrowedFromContact,
  borrowedFromName,
  borrowedInNote,
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
}: InventoryCreateActionsInput) {
  const hostWriteTarget = { clientReadOnly, clientHostBaseUrl, clientLibraryId };
  const currentCreateDraft = useMemo(
    () =>
      buildWishlistDraft({
        source: createMode,
        selectedBambuMaster,
        selectedEsunMaster,
        manualVendor,
        manualMaterial,
        manualFilamentName,
        manualColorName,
      }),
    [
      createMode,
      manualColorName,
      manualFilamentName,
      manualMaterial,
      manualVendor,
      selectedBambuMaster,
      selectedEsunMaster,
    ],
  );

  function canStartWrite(): boolean {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return false;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return false;
    }
    return tauriAvailable && !busy;
  }

  async function handleCreateSpool() {
    if (!canStartWrite()) {
      return;
    }
    setBusy(true);
    setError(null);
    const id = `spool_${Date.now()}`;
    const createRequest = buildInventoryCreateSpoolRequest({
      id,
      mode: createMode,
      selectedBambuMaster,
      selectedEsunMaster,
      manualVendor,
      manualMaterial,
      manualFilamentName,
      manualColorName,
      manualHexColor,
      initialWeightRaw: newInitialWeight,
      ownershipType: newOwnershipType,
      borrowedFromName,
      borrowedFromContact,
      borrowedInNote,
      location: newLocation,
    });
    if (!createRequest.ok) {
      if (createRequest.error === "BORROWED_OWNER_REQUIRED") {
        setError(
          t(
            "inventory.error.borrowedInNeedsOwner",
            "Borrowed-in registration needs a name for who the spool is borrowed from.",
          ),
        );
      } else if (createRequest.error === "BAMBU_MASTER_REQUIRED") {
        setError(t("inventory.error.selectBambuFirst", "Select a Bambu filament first."));
      } else if (createRequest.error === "ESUN_MASTER_REQUIRED") {
        setError(t("inventory.error.selectEsunFirst", "Select an eSUN filament first."));
      } else {
        setError(
          t(
            "inventory.error.manualNeedsFields",
            "Manual create needs filament name and color.",
          ),
        );
      }
      setBusy(false);
      return;
    }

    try {
      const createdSpoolId =
        createRequest.kind === "catalog"
          ? await createInventorySpoolFromMaster(createRequest.input, hostWriteTarget)
          : await createManualInventorySpool(createRequest.input, hostWriteTarget);

      await reloadSpools();
      await reloadCatalog();
      setSelectedSpoolId(createdSpoolId);
      setRecentlyAddedSpoolId(createdSpoolId);
      setInfoMessage(
        `${
          newOwnershipType === "BORROWED_IN"
            ? t("inventory.borrowedInRegistered", "Borrowed-in spool registered")
            : t("inventory.addedToInventory", "Added to inventory")
        }: ${createRequest.addedLabel}`,
      );
      resetAfterCreatedSpool();
    } catch (createError) {
      console.error(createError);
      setError(
        commandErrorText(
          createError,
          t(
            "inventory.error.createSpool",
            "Failed to create spool. Check QR uniqueness and values.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCurrentToWishlist() {
    if (!canStartWrite()) {
      return;
    }
    if (!currentCreateDraft) {
      setError(
        t(
          "wishlist.error.invalidSelection",
          "Pick a valid filament setup before adding to wishlist.",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createWishlistEntry(
        {
          id: `wish_${Date.now()}`,
          master_id: currentCreateDraft.master_id ?? null,
          vendor: currentCreateDraft.vendor,
          material: currentCreateDraft.material,
          filament_name: currentCreateDraft.filament_name,
          color_name: currentCreateDraft.color_name,
          quantity: 1,
          note: null,
        },
        hostWriteTarget,
      );
      await reloadWishlist();
    } catch (wishlistError) {
      console.error(wishlistError);
      setError(t("wishlist.error.add", "Failed to add wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWishlistStatus(itemId: string, status: WishlistStatus) {
    if (!canStartWrite()) {
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    try {
      await updateWishlistEntryStatus(
        {
          item_id: itemId,
          status,
        },
        hostWriteTarget,
      );
      await reloadWishlist();
    } catch (statusError) {
      console.error(statusError);
      setError(t("wishlist.error.updateStatus", "Failed to update wishlist status."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWishlistItem(itemId: string) {
    if (!canStartWrite()) {
      return;
    }
    if (confirmWishlistRemoveId !== itemId) {
      setConfirmWishlistRemoveId(itemId);
      setInfoMessage(
        t(
          "wishlist.confirmRemoveTapAgain",
          "Click Remove again to confirm deleting this wishlist entry.",
        ),
      );
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    try {
      await deleteWishlistEntry(itemId, hostWriteTarget);
      await reloadWishlist();
    } catch (deleteError) {
      console.error(deleteError);
      setError(t("wishlist.error.delete", "Failed to delete wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleStockFromWishlist(item: WishlistItemRow) {
    if (!canStartWrite()) {
      return;
    }
    setConfirmWishlistRemoveId(null);
    setBusy(true);
    setError(null);
    const id = `spool_${Date.now()}`;
    try {
      const linkedMaster = item.master_id
        ? masters.find((master) => master.id === item.master_id) ?? null
        : null;
      const createdSpoolId = linkedMaster
        ? await createInventorySpoolFromMaster(
            {
              id,
              master_id: linkedMaster.id,
              qr_code: null,
              status: "IN_STOCK",
              initial_weight_g: linkedMaster.default_weight,
              current_weight_g: linkedMaster.default_weight,
              location_id: null,
              purchase_date: null,
              purchase_price: null,
              batch_code: null,
            },
            hostWriteTarget,
          )
        : await createManualInventorySpool(
            {
              id,
              vendor: item.vendor,
              material: item.material,
              filament_name: item.filament_name,
              color_name: item.color_name,
              hex_color: null,
              product_url: null,
              default_weight_g: 1000,
              qr_code: null,
              status: "IN_STOCK",
              initial_weight_g: 1000,
              location: null,
            },
            hostWriteTarget,
          );

      await updateWishlistEntryStatus(
        {
          item_id: item.id,
          status: "RECEIVED",
        },
        hostWriteTarget,
      );
      await reloadSpools();
      await reloadWishlist();
      setSelectedSpoolId(createdSpoolId);
      setRecentlyAddedSpoolId(createdSpoolId);
      setInfoMessage(
        `${t("inventory.addedFromWishlist", "Added from wishlist")}: ${formatInventoryDisplayTitle(
          item.material,
          item.filament_name,
          item.color_name,
        )}`,
      );
    } catch (stockError) {
      console.error(stockError);
      setError(t("inventory.error.stockFromWishlist", "Failed to stock roll from wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  return {
    currentCreateDraft,
    handleAddCurrentToWishlist,
    handleCreateSpool,
    handleDeleteWishlistItem,
    handleStockFromWishlist,
    handleWishlistStatus,
  };
}
