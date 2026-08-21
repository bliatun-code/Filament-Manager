export function routeCompanionSubmitAction(action, data, handlers) {
  function purchaseReceiptDraftFromForm() {
    return {
      pricePerRoll: String(data.get("purchase_price") || ""),
      currency: String(data.get("purchase_currency") || ""),
      purchaseDate: String(data.get("purchase_date") || ""),
      batchCode: String(data.get("batch_code") || ""),
      supplierReference: String(data.get("supplier_reference") || ""),
    };
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function parseRfidSourcePayload(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return { rfidTag: "", observedAt: "" };
    }
    const [rfidTag = "", observedAt = ""] = raw
      .split("|")
      .map((part) => safeDecodeURIComponent(part || ""));
    return { rfidTag, observedAt };
  }

  if (action === "update-weight-form") {
    handlers.submitWeightUpdate(String(data.get("spool-id") || ""), String(data.get("grams") || ""));
    return true;
  }

  if (action === "printer-slot-operation-form") {
    handlers.submitPrinterSlotOperation(
      String(data.get("current-grams") || ""),
      String(data.get("incoming-grams") || ""),
      String(data.get("outgoing-grams") || ""),
    );
    return true;
  }

  if (action === "update-tare-weight-form") {
    handlers.submitTareWeightUpdate(
      String(data.get("spool-id") || ""),
      String(data.get("tare-grams") || ""),
    );
    return true;
  }

  if (action === "update-spool-details-form") {
    handlers.submitSpoolDetailsUpdate(
      String(data.get("spool-id") || ""),
      String(data.get("status") || ""),
      String(data.get("location") || ""),
      String(data.get("home-location") || ""),
      purchaseReceiptDraftFromForm(),
    );
    return true;
  }

  if (action === "update-spool-rfid-form") {
    const parsedSource = parseRfidSourcePayload(String(data.get("rfid-source") || ""));
    handlers.submitSpoolRfidUpdate(
      String(data.get("spool-id") || ""),
      String(data.get("rfid-tag") || parsedSource.rfidTag || ""),
      String(data.get("rfid-observed-at") || parsedSource.observedAt || ""),
    );
    return true;
  }

  if (action === "loan-spool-form") {
    handlers.submitSpoolLoan(
      String(data.get("spool-id") || ""),
      String(data.get("borrower-name") || ""),
      String(data.get("grams-out") || ""),
      String(data.get("loan-note") || ""),
    );
    return true;
  }

  if (action === "return-loan-form" || action === "return-loan-history-form") {
    handlers.submitSpoolLoanReturn(
      String(data.get("loan-id") || ""),
      String(data.get("spool-id") || ""),
      String(data.get("returned-grams") || ""),
      String(data.get("return-note") || ""),
    );
    return true;
  }

  if (action === "register-manual-spool-form" || action === "add-spool-form") {
    handlers.submitManualSpoolRegistration({
      source: String(data.get("filament-source") || "bambu"),
      masterId: String(data.get("filament-master-id") || ""),
      ownershipType: String(data.get("filament-ownership-type") || "OWNED"),
      ownerName: String(data.get("filament-owner-name") || ""),
      ownerContact: String(data.get("filament-owner-contact") || ""),
      material: String(data.get("filament-material") || ""),
      filamentName: String(data.get("filament-name") || ""),
      colorName: String(data.get("filament-color-name") || ""),
      vendor: String(data.get("filament-vendor") || data.get("filament-manual-vendor") || ""),
      hexColor: String(data.get("filament-hex-color") || ""),
      initialWeight: String(data.get("filament-initial-weight") || ""),
      location: String(data.get("filament-location") || ""),
      note: String(data.get("filament-note") || ""),
    });
    return true;
  }

  if (action === "wishlist-item-form") {
    handlers.submitWishlistCreate({
      source: String(data.get("filament-source") || "bambu"),
      masterId: String(data.get("filament-master-id") || ""),
      material: String(data.get("filament-material") || ""),
      filamentName: String(data.get("filament-name") || ""),
      colorName: String(data.get("filament-color-name") || ""),
      vendor: String(data.get("filament-vendor") || data.get("filament-manual-vendor") || ""),
      quantity: String(data.get("wishlist-quantity") || "1"),
      note: String(data.get("wishlist-note") || ""),
    });
    return true;
  }

  if (action === "wishlist-stock-form") {
    handlers.submitWishlistStock(
      String(data.get("wishlist-id") || ""),
      String(data.get("received-quantity") || "1"),
      purchaseReceiptDraftFromForm(),
    );
    return true;
  }

  if (action === "update-borrowed-in-form") {
    handlers.submitBorrowedInUpdate(
      String(data.get("spool-id") || ""),
      String(data.get("borrowed-edit-owner-name") || ""),
      String(data.get("borrowed-edit-owner-contact") || ""),
      String(data.get("borrowed-edit-note") || ""),
    );
    return true;
  }

  if (action === "hand-back-loan-form") {
    handlers.submitBorrowedInHandBack(
      String(data.get("loan-id") || ""),
      String(data.get("spool-id") || ""),
      String(data.get("returned-grams") || ""),
      String(data.get("return-note") || ""),
    );
    return true;
  }

  return false;
}
