import { useState } from "react";
import { AppModal } from "../components/app_modal";
import { ModalHeader } from "../components/modal_chrome";
import { WishlistReceiptModal } from "../components/wishlist_receipt_modal";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { emptyPurchaseReceiptMetadataDraft } from "../lib/purchase_receipt_metadata";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

const APP_MODAL_ACCESSIBILITY_DIALOG_NAME = "AppModal accessibility test";
const receiptI18n: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

export function AppModalAccessibilityHarness() {
  const [open, setOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [homeLocation, setHomeLocation] = useState("");
  const [metadataDraft, setMetadataDraft] = useState(emptyPurchaseReceiptMetadataDraft);

  return (
    <main className="min-h-screen bg-slate-100 p-8 text-slate-950">
      <button
        type="button"
        data-testid="modal-opener"
        className="rounded-lg border border-slate-400 bg-white px-4 py-2 font-semibold"
        onClick={() => setOpen(true)}
      >
        Open accessibility test dialog
      </button>

      <section className="surface-card mt-40 h-[35rem]">
        <button
          type="button"
          data-testid="receipt-opener"
          onClick={() => setReceiptOpen(true)}
        >
          Open receipt inside purchase queue surface
        </button>
        {receiptOpen ? (
          <I18nContext.Provider value={receiptI18n}>
            <WishlistReceiptModal
              busy={false}
              errors={{}}
              homeLocation={homeLocation}
              itemTitle="PLA Basic · Jade White"
              maxQuantity={2}
              metadataDraft={metadataDraft}
              onCancel={() => setReceiptOpen(false)}
              onConfirm={() => setReceiptOpen(false)}
              onHomeLocationChange={setHomeLocation}
              onMetadataDraftChange={setMetadataDraft}
              onQuantityChange={() => {}}
              quantity={1}
              quantityValue="1"
            />
          </I18nContext.Provider>
        ) : null}
      </section>

      {open ? (
        <AppModal closeOnBackdrop onBackdropClose={() => setOpen(false)}>
          <ModalHeader
            title={APP_MODAL_ACCESSIBILITY_DIALOG_NAME}
            subtitle="Keyboard and zoom behavior test fixture"
            closeLabel="Close dialog"
          />

          <div className="space-y-4 p-5">
            <button
              type="button"
              data-testid="initial-action"
              className="rounded-lg border border-slate-400 bg-white px-4 py-2 font-semibold"
            >
              Initial action
            </button>

            <details className="rounded-lg border border-slate-300 bg-white p-3">
              <summary data-testid="details-summary" className="cursor-pointer font-semibold">
                Advanced details
              </summary>
              <p className="mt-2">The summary must participate in the modal focus order.</p>
            </details>

            <div data-testid="overflow-content" className="space-y-3" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <p key={index}>
                  Zoom overflow fixture row {index + 1}: modal content remains reachable without
                  moving the page horizontally.
                </p>
              ))}
            </div>

            <button
              type="button"
              data-testid="last-action"
              className="rounded-lg border border-slate-400 bg-white px-4 py-2 font-semibold"
              onClick={() => setOpen(false)}
            >
              Close dialog
            </button>
          </div>
        </AppModal>
      ) : null}
    </main>
  );
}
