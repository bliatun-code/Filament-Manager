export function createCompanionWishlistMutations({
  state,
  refreshOverview,
  setBusy,
  setStatus,
  render,
  setDetailFeedback,
  setDetailReturnContext,
  tr,
  normalizeAddSpoolValues,
  postJson,
}) {
  async function submitWishlistCreate(values) {
    const draft = normalizeAddSpoolValues(values);
    const quantity = Number.parseInt(String(values.quantity || "").trim(), 10);
    if (draft.source !== "manual" && !draft.master) {
      setStatus(tr("status.wishlistCatalogRequired", "Choose a catalog filament before adding it to wishlist."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && (!draft.material || !draft.filamentName || !draft.colorName)) {
      setStatus(tr("status.wishlistManualIncomplete", "Finish the manual filament details before adding to wishlist."), "error");
      render();
      return;
    }

    setBusy(true);
    setStatus(tr("status.wishlistAdding", "Adding filament to wishlist..."), "default");
    try {
      await postJson("/api/v1/wishlist", {
        master_id: draft.master?.id || null,
        material: draft.material,
        filament_name: draft.filamentName,
        color_name: draft.colorName,
        vendor: draft.vendor || null,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        note: String(values.note || "").trim() || null,
      });
      state.borrowedInDraft.wishlistQuantity = "1";
      state.borrowedInDraft.wishlistNote = "";
      await refreshOverview();
      setStatus(tr("status.wishlistAdded", "Wishlist item added."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistAddFailed", "Failed to add wishlist item."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitWishlistStatus(itemIdValue, statusValue) {
    const itemId = String(itemIdValue || "").trim();
    const status = String(statusValue || "").trim().toUpperCase();
    if (!itemId) {
      setStatus(tr("status.wishlistSelectBeforeStatus", "Choose a wishlist item before changing its status."), "error");
      render();
      return;
    }
    if (!["WISHLIST", "ON_ORDER", "RECEIVED"].includes(status)) {
      setStatus(tr("status.wishlistStatusInvalid", "Choose a valid wishlist status."), "error");
      render();
      return;
    }

    setBusy(true);
    setStatus(tr("status.wishlistStatusUpdating", "Updating wishlist status..."), "default");
    try {
      await postJson(`/api/v1/wishlist/${encodeURIComponent(itemId)}/status`, { status });
      await refreshOverview();
      setStatus(tr("status.wishlistStatusUpdated", "Wishlist status updated."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistStatusUpdateFailed", "Failed to update wishlist status."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitWishlistStock(itemIdValue) {
    const itemId = String(itemIdValue || "").trim();
    const item = Array.isArray(state.wishlistItems)
      ? state.wishlistItems.find((row) => String(row?.id || "").trim() === itemId)
      : null;
    if (!item) {
      setStatus(tr("status.wishlistSelectBeforeStock", "Choose a wishlist item before stocking it."), "error");
      render();
      return;
    }

    const linkedMaster = item.master_id
      ? (Array.isArray(state.catalogMasters)
          ? state.catalogMasters.find((master) => master?.id === item.master_id)
          : null)
      : null;

    setBusy(true);
    setStatus(tr("status.wishlistStocking", "Adding wishlist spool to inventory..."), "default");
    try {
      const payload = await postJson("/api/v1/spools/owned", linkedMaster
        ? {
            master_id: linkedMaster.id,
            initial_weight_g: linkedMaster.default_weight,
          }
        : {
            material: item.material,
            filament_name: item.filament_name,
            color_name: item.color_name,
            vendor: item.vendor,
            initial_weight_g: 1000,
            hex_color: null,
          });
      const spoolId = String(payload?.spool_id || "").trim();
      await postJson(`/api/v1/wishlist/${encodeURIComponent(item.id)}/status`, {
        status: "RECEIVED",
      });
      state.activeTaskSheet = null;
      await refreshOverview();
      if (spoolId) {
        state.selectedSpoolId = spoolId;
        setDetailReturnContext("storage");
        state.detailOpen = true;
        setDetailFeedback(spoolId, tr("status.wishlistStockedJustNow", "Wishlist spool stocked just now."));
      }
      setStatus(tr("status.wishlistStocked", "Wishlist spool added to inventory."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistStockFailed", "Failed to stock spool from wishlist."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function submitWishlistDelete(itemIdValue) {
    const itemId = String(itemIdValue || "").trim();
    if (!itemId) {
      setStatus(tr("status.wishlistSelectBeforeDelete", "Choose a wishlist item before removing it."), "error");
      render();
      return;
    }

    setBusy(true);
    setStatus(tr("status.wishlistDeleting", "Removing wishlist item..."), "default");
    try {
      await postJson(`/api/v1/wishlist/${encodeURIComponent(itemId)}/delete`, {});
      await refreshOverview();
      setStatus(tr("status.wishlistDeleted", "Wishlist item removed."), "success");
    } catch (error) {
      setStatus(error.message || tr("status.wishlistDeleteFailed", "Failed to remove wishlist item."), "error");
      render();
    } finally {
      setBusy(false);
    }
  }

  return {
    submitWishlistCreate,
    submitWishlistStatus,
    submitWishlistStock,
    submitWishlistDelete,
  };
}
