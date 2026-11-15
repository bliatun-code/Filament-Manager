import {
  emptyPurchaseReceiptMetadataDraft,
  parsePurchaseReceiptMetadataDraft,
  purchaseReceiptMetadataHasValues,
  purchaseReceiptMetadataValidationMessage,
} from "./companion_domain.js";
import { localizedAppError, parseAppError } from "./app_error.js";
import {
  createWishlistReceiptAttempts,
  isConfirmedWishlistReceipt,
  MAX_WISHLIST_RECEIPT_QUANTITY,
  WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY,
} from "./wishlist_receipt_attempt.js";

export function createCompanionWishlistMutations({
  state,
  fetchJson,
  refreshOverview,
  setBusy,
  setStatus,
  render,
  setDetailFeedback,
  setDetailReturnContext,
  tr,
  normalizeAddSpoolValues,
  postJson,
  receiptAttempts = createWishlistReceiptAttempts(),
}) {
  let stockInFlight = false;

  function stockError(code) {
    return localizedAppError({ code }, tr, tr("status.wishlistStockFailed", "Failed to stock spool from wishlist."));
  }

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

  async function submitWishlistStock(
    itemIdValue,
    quantityValue = "1",
    receiptDraft = emptyPurchaseReceiptMetadataDraft(),
  ) {
    if (stockInFlight) return;
    const itemId = String(itemIdValue || "").trim();
    const item = Array.isArray(state.wishlistItems)
      ? state.wishlistItems.find((row) => String(row?.id || "").trim() === itemId)
      : null;
    if (!item) {
      setStatus(tr("status.wishlistSelectBeforeStock", "Choose a wishlist item before stocking it."), "error");
      render();
      return;
    }
    const quantity = Number(String(quantityValue || "").trim());
    const remainingQuantity = Math.max(0, Number.parseInt(String(item.quantity || "0"), 10) || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setStatus(tr("status.wishlistStockFailed", "Failed to stock spool from wishlist."), "error");
      render();
      return;
    }
    if (quantity > MAX_WISHLIST_RECEIPT_QUANTITY) {
      setStatus(stockError("wishlist.receive.quantity_too_large"), "error");
      render();
      return;
    }
    const parsedReceipt = parsePurchaseReceiptMetadataDraft(receiptDraft);
    if (!parsedReceipt.ok) {
      setStatus(
        purchaseReceiptMetadataValidationMessage(parsedReceipt.errors, tr),
        "error",
      );
      render();
      return;
    }

    const requestBody = { quantity };
    if (purchaseReceiptMetadataHasValues(parsedReceipt.value)) {
      requestBody.purchase_metadata = parsedReceipt.value;
    }
    stockInFlight = true;
    setBusy(true);
    setStatus(tr("status.wishlistStocking", "Adding wishlist spool to inventory..."), "default");
    try {
      const health = await fetchJson("/api/v1/health", { cache: "no-store" });
      const supportsRetries = Array.isArray(health?.capabilities) &&
        health.capabilities.includes(WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY);
      const scope = JSON.stringify([health?.library_id ?? null, itemId]);
      if (quantity > remainingQuantity && !receiptAttempts.get(scope)) {
        setStatus(tr("status.wishlistStockFailed", "Failed to stock spool from wishlist."), "error");
        return;
      }
      const attempt = receiptAttempts.begin(scope, JSON.stringify(requestBody), supportsRetries);
      if ("error" in attempt) {
        const pending = receiptAttempts.get(scope);
        if (pending?.requiresReview) {
          state.wishlistReceiptReviews.set(itemId, { scope, requestId: pending.requestId });
        }
        setStatus(stockError(attempt.error), "error");
        return;
      }
      let payload;
      try {
        const path = supportsRetries
          ? `/api/v1/wishlist/${encodeURIComponent(item.id)}/receive-idempotent`
          : `/api/v1/wishlist/${encodeURIComponent(item.id)}/receive`;
        payload = await postJson(
          path,
          supportsRetries ? { ...requestBody, request_id: attempt.requestId } : requestBody,
        );
        if (!isConfirmedWishlistReceipt(payload, quantity)) {
          throw { code: "wishlist.receive.outcome_unknown" };
        }
      } catch (error) {
        const code = parseAppError(error)?.code;
        receiptAttempts.reject(scope, attempt, code, supportsRetries);
        const pending = receiptAttempts.get(scope);
        let displayedCode = code;
        if (pending?.requiresReview) {
          state.wishlistReceiptReviews.set(itemId, { scope, requestId: pending.requestId });
          displayedCode = "wishlist.receive.outcome_unknown_legacy_host";
        }
        else if (pending && code !== "wishlist.receive.request_conflict") {
          displayedCode = "wishlist.receive.outcome_unknown";
        }
        setStatus(stockError(displayedCode), "error");
        return;
      }
      receiptAttempts.confirm(scope, attempt.requestId);
      const spoolId = Array.isArray(payload?.spool_ids)
        ? String(payload.spool_ids[0] || "").trim()
        : "";
      if (Number(payload?.remaining_quantity) === 0) {
        state.activeTaskSheet = null;
      }
      await Promise.resolve().then(refreshOverview).catch(() => {});
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
      stockInFlight = false;
      setBusy(false);
      render();
    }
  }

  async function reconcileWishlistStock(itemId) {
    if (stockInFlight) return;
    const review = state.wishlistReceiptReviews.get(itemId);
    if (!review || !receiptAttempts.reconcile(review.scope, review.requestId)) return;
    state.wishlistReceiptReviews.delete(itemId);
    stockInFlight = true;
    setBusy(true);
    setStatus("");
    try {
      await Promise.resolve().then(refreshOverview).catch(() => {});
    } finally {
      stockInFlight = false;
      setBusy(false);
      render();
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
    reconcileWishlistStock,
    submitWishlistDelete,
  };
}
