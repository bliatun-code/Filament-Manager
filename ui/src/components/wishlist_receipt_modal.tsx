import { createPortal } from "react-dom";
import type {
  PurchaseReceiptMetadataDraft,
  PurchaseReceiptMetadataValidationErrors,
} from "../lib/purchase_receipt_metadata";
import { useI18n } from "../lib/i18n";
import { formInputChromeClassName } from "./form_control_class";
import { purchaseReceiptMetadataFieldsCopy } from "../lib/purchase_receipt_metadata_copy";
import { PurchaseReceiptMetadataFields } from "./purchase_receipt_metadata_fields";
import { SaveOnlyModal } from "./save_only_modal";
import { INVENTORY_LOCATION_DATALIST_ID } from "./inventory_location_datalist";

export type WishlistReceiptModalProps = Readonly<{
  busy: boolean;
  defaultPurchaseCurrency?: string;
  errors: PurchaseReceiptMetadataValidationErrors;
  homeLocation: string;
  itemTitle: string;
  locked?: boolean;
  maxQuantity: number;
  metadataDraft: PurchaseReceiptMetadataDraft;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onHomeLocationChange: (value: string) => void;
  onMetadataDraftChange: (draft: PurchaseReceiptMetadataDraft) => void;
  onQuantityChange: (value: string) => void;
  onReconcile?: () => void | Promise<void>;
  pendingMessage?: string;
  quantity: number;
  quantityValue: string;
  retryDisabled?: boolean;
}>;

export function WishlistReceiptModal({
  busy,
  defaultPurchaseCurrency = "",
  errors,
  homeLocation,
  itemTitle,
  locked = false,
  maxQuantity,
  metadataDraft,
  onCancel,
  onConfirm,
  onHomeLocationChange,
  onMetadataDraftChange,
  onQuantityChange,
  onReconcile,
  pendingMessage,
  quantity,
  quantityValue,
  retryDisabled = false,
}: WishlistReceiptModalProps) {
  const { t } = useI18n();

  const modal = (
    <SaveOnlyModal
      cancelDisabled={busy}
      onCancel={onCancel}
      onSave={onConfirm}
      saveDisabled={busy || retryDisabled}
      saveLabel={t(
        "wishlist.receiveQuantity",
        "{count, plural, one {Receive # roll} other {Receive # rolls}}",
        { count: quantity },
      )}
      subtitle={itemTitle}
      title={t("wishlist.receivePurchase", "Receive purchase")}
    >
      <div className="space-y-4">
        {pendingMessage ? <p role="status" className="text-sm">{pendingMessage}</p> : null}
        {onReconcile ? (
          <button
            type="button"
            className={`px-3 py-2 ${formInputChromeClassName}`}
            disabled={busy}
            onClick={() => { void onReconcile(); }}
          >
            {t("errors.wishlistReceiptReviewed", "I checked the order on the Host")}
          </button>
        ) : null}
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("wishlist.receivedQuantity", "Received quantity")}
          </span>
          <input
            type="number"
            min={1}
            max={Math.max(1, maxQuantity)}
            value={quantityValue}
            onChange={(event) => onQuantityChange(event.target.value)}
            className={`mt-1.5 w-full ${formInputChromeClassName}`}
            disabled={busy || locked}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("inventory.homeLocationOptional", "Home location (optional)")}
          </span>
          <input
            type="text"
            name="home_location"
            list={INVENTORY_LOCATION_DATALIST_ID}
            value={homeLocation}
            onChange={(event) => onHomeLocationChange(event.target.value)}
            className={`mt-1.5 w-full ${formInputChromeClassName}`}
            disabled={busy || locked}
          />
        </label>

        <PurchaseReceiptMetadataFields
          copy={purchaseReceiptMetadataFieldsCopy(t)}
          defaultCurrency={defaultPurchaseCurrency}
          disabled={busy || locked}
          draft={metadataDraft}
          errors={errors}
          onChange={onMetadataDraftChange}
          selectedQuantity={quantity}
        />
      </div>
    </SaveOnlyModal>
  );

  // Purchase queue surfaces use backdrop blur, which would otherwise anchor
  // this fixed overlay to the card instead of the viewport.
  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}
