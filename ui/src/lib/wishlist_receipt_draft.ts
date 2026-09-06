import {
  emptyPurchaseReceiptMetadataDraft,
  type PurchaseReceiptMetadataDraft,
  type PurchaseReceiptMetadataValidationErrors,
} from "./purchase_receipt_metadata";

type WishlistReceiptDraft = {
  itemId: string | null;
  homeLocation: string;
  metadata: PurchaseReceiptMetadataDraft;
  errors: PurchaseReceiptMetadataValidationErrors;
};

type WishlistReceiptDraftAction =
  | { type: "open"; itemId: string }
  | { type: "close" }
  | { type: "homeLocation"; value: string }
  | { type: "metadata"; value: PurchaseReceiptMetadataDraft }
  | { type: "errors"; value: PurchaseReceiptMetadataValidationErrors };

export function emptyWishlistReceiptDraft(): WishlistReceiptDraft {
  return {
    itemId: null,
    homeLocation: "",
    metadata: emptyPurchaseReceiptMetadataDraft(),
    errors: {},
  };
}

export function wishlistReceiptDraftReducer(
  state: WishlistReceiptDraft,
  action: WishlistReceiptDraftAction,
): WishlistReceiptDraft {
  switch (action.type) {
    case "open":
      return { ...emptyWishlistReceiptDraft(), itemId: action.itemId };
    case "close":
      return emptyWishlistReceiptDraft();
    case "homeLocation":
      return { ...state, homeLocation: action.value };
    case "metadata":
      return { ...state, metadata: action.value };
    case "errors":
      return { ...state, errors: action.value };
  }
}
