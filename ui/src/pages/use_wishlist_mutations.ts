import type { I18nContextValue } from "../lib/i18n";
import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
} from "../lib/spool_writes";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import {
  createWishlistEntry,
  deleteWishlistEntry,
  updateWishlistEntryStatus,
  type WishlistDraft,
  type WishlistStatus,
} from "../lib/wishlist_data_source";
import { formatUnknownError } from "./wishlist_helpers";

type Translate = I18nContextValue["t"];

type UseWishlistMutationsOptions = {
  busy: boolean;
  confirmDeleteWishlistId: string | null;
  currentDraft: WishlistDraft | null;
  masters: MasterCatalogRow[];
  reloadWishlist: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  setConfirmDeleteWishlistId: (itemId: string | null) => void;
  setError: (message: string | null) => void;
  setWishlistNote: (note: string) => void;
  tauri: boolean;
  t: Translate;
  wishlistNote: string;
  wishlistQuantity: string;
};

export function useWishlistMutations({
  busy,
  confirmDeleteWishlistId,
  currentDraft,
  masters,
  reloadWishlist,
  setBusy,
  setConfirmDeleteWishlistId,
  setError,
  setWishlistNote,
  tauri,
  t,
  wishlistNote,
  wishlistQuantity,
}: UseWishlistMutationsOptions) {
  async function handleAddCurrentToWishlist() {
    if (!tauri || busy) {
      return;
    }
    const draft = currentDraft;
    if (!draft) {
      setError(
        t(
          "wishlist.error.invalidSelection",
          "Pick a valid filament setup before adding to wishlist.",
        ),
      );
      return;
    }
    const quantity = Number.parseInt(wishlistQuantity, 10);

    setBusy(true);
    setError(null);
    try {
      await createWishlistEntry({
        id: `wish_${Date.now()}`,
        master_id: draft.master_id ?? null,
        vendor: draft.vendor,
        material: draft.material,
        filament_name: draft.filament_name,
        color_name: draft.color_name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        note: wishlistNote.trim() || null,
      });
      await reloadWishlist();
      setWishlistNote("");
    } catch (wishlistError) {
      console.error(wishlistError);
      setError(t("wishlist.error.add", "Failed to add wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWishlistStatus(itemId: string, status: WishlistStatus) {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateWishlistEntryStatus({
        item_id: itemId,
        status,
      });
      await reloadWishlist();
    } catch (statusError) {
      console.error(statusError);
      setError(t("wishlist.error.updateStatus", "Failed to update wishlist status."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWishlistItem(itemId: string) {
    if (!tauri || busy) {
      return;
    }
    if (confirmDeleteWishlistId !== itemId) {
      setConfirmDeleteWishlistId(itemId);
      return;
    }
    setConfirmDeleteWishlistId(null);
    setBusy(true);
    setError(null);
    try {
      await deleteWishlistEntry(itemId);
      await reloadWishlist();
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        formatUnknownError(
          deleteError,
          t("wishlist.error.delete", "Failed to delete wishlist item."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStockFromWishlist(item: WishlistItemRow) {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const linkedMaster = item.master_id
        ? masters.find((master) => master.id === item.master_id) ?? null
        : null;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      for (let index = 0; index < quantity; index += 1) {
        const id = `spool_${Date.now()}_${index}`;
        if (linkedMaster) {
          await createInventorySpoolFromMaster({
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
          });
        } else {
          await createManualInventorySpool({
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
          });
        }
      }

      await updateWishlistEntryStatus({
        item_id: item.id,
        status: "RECEIVED",
      });
      await reloadWishlist();
    } catch (stockError) {
      console.error(stockError);
      setError(t("wishlist.error.stock", "Failed to add roll(s) to inventory."));
    } finally {
      setBusy(false);
    }
  }

  return {
    handleAddCurrentToWishlist,
    handleDeleteWishlistItem,
    handleStockFromWishlist,
    handleWishlistStatus,
  };
}
