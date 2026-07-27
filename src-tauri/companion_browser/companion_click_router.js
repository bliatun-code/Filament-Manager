function readAttr(target, name) {
  return String(target?.getAttribute?.(name) || "").trim();
}

export function routeCompanionClickAction(action, target, handlers) {
  if (action === "refresh") {
    handlers.refresh();
    return true;
  }

  if (action === "show-more-inventory") {
    handlers.showMoreInventory();
    return true;
  }

  if (action === "show-more-loans") {
    handlers.showMoreLoans();
    return true;
  }

  if (action === "show-more-loan-picker") {
    handlers.showMoreLoanPicker();
    return true;
  }

  if (action === "set-root-flow") {
    handlers.setRootFlow(readAttr(target, "data-root-flow") || "storage");
    return true;
  }

  if (action === "start-printer-slot-assignment") {
    handlers.startPrinterSlotAssignment(
      readAttr(target, "data-printer-id"),
      readAttr(target, "data-printer-name"),
      readAttr(target, "data-slot-id"),
      readAttr(target, "data-slot-index"),
      readAttr(target, "data-slot-label"),
    );
    return true;
  }

  if (action === "start-printer-weight-update") {
    handlers.startPrinterWeightUpdate({
      mode: readAttr(target, "data-printer-task-mode") || "update",
      printerId: readAttr(target, "data-printer-id"),
      printerName: readAttr(target, "data-printer-name"),
      slotId: readAttr(target, "data-slot-id"),
      slotIndex: readAttr(target, "data-slot-index"),
      slotLabel: readAttr(target, "data-slot-label"),
      spoolId: readAttr(target, "data-spool-id"),
      spoolTitle: readAttr(target, "data-spool-title"),
      vendor: readAttr(target, "data-spool-vendor"),
      reference: readAttr(target, "data-spool-reference"),
      locationId: readAttr(target, "data-spool-location"),
      remainingWeight: readAttr(target, "data-spool-remaining-g"),
      currentWeight: readAttr(target, "data-spool-current-weight-g"),
      swatchColor: readAttr(target, "data-spool-swatch"),
    });
    return true;
  }

  if (action === "toggle-borrowed-in-form" || action === "toggle-add-spool-form") {
    handlers.toggleBorrowedInForm();
    return true;
  }

  if (action === "set-filament-ownership") {
    handlers.setFilamentOwnership(readAttr(target, "data-ownership-type") || "OWNED");
    return true;
  }

  if (action === "set-filament-source") {
    handlers.setAddSpoolSource(readAttr(target, "data-filament-source") || "bambu");
    return true;
  }

  if (action === "set-catalog-filter") {
    handlers.setCatalogStatusFilter(readAttr(target, "data-catalog-filter") || "ACTIVE");
    return true;
  }

  if (action === "select-master") {
    handlers.selectCatalogMaster(readAttr(target, "data-master-id"));
    return true;
  }

  if (action === "set-wishlist-filter") {
    handlers.setWishlistQueueFilter(readAttr(target, "data-wishlist-filter") || "ALL");
    return true;
  }

  if (action === "wishlist-update-status") {
    handlers.submitWishlistStatus(
      readAttr(target, "data-wishlist-id"),
      readAttr(target, "data-wishlist-status") || "WISHLIST",
    );
    return true;
  }

  if (action === "wishlist-stock-now") {
    handlers.submitWishlistStock(readAttr(target, "data-wishlist-id"));
    return true;
  }

  if (action === "wishlist-delete") {
    handlers.submitWishlistDelete(readAttr(target, "data-wishlist-id"));
    return true;
  }

  if (action === "set-theme-mode") {
    handlers.setThemeMode(readAttr(target, "data-theme-mode") || "auto");
    return true;
  }

  if (action === "set-locale") {
    handlers.setLocale(readAttr(target, "data-locale") || "en");
    return true;
  }

  if (action === "toggle-loan-return") {
    handlers.toggleLoanReturn(readAttr(target, "data-loan-id"));
    return true;
  }

  if (action === "start-loan-create") {
    handlers.startLoanCreate(readAttr(target, "data-spool-id"));
    return true;
  }

  if (action === "start-loan-picker") {
    handlers.startLoanPicker();
    return true;
  }

  if (action === "select-loan-spool") {
    handlers.startLoanCreate(readAttr(target, "data-spool-id"));
    return true;
  }

  if (action === "select-printer") {
    handlers.selectPrinter(readAttr(target, "data-printer-id"));
    return true;
  }

  if (action === "close-detail" || action === "return-from-detail") {
    handlers.closeDetailModal();
    return true;
  }

  if (action === "close-task-sheet") {
    handlers.closeActiveTaskSheet();
    return true;
  }

  if (action === "open-current-detail") {
    handlers.openCurrentDetail();
    return true;
  }

  if (action === "clear-inventory-search") {
    handlers.clearInventorySearch();
    return true;
  }

  if (action === "show-all-loans") {
    handlers.showAllLoans();
    return true;
  }

  if (action === "set-loan-status") {
    handlers.setLoanStatusFilter(readAttr(target, "data-loan-status") || "ACTIVE");
    return true;
  }

  if (action === "select-spool") {
    handlers.openStorageSpool(readAttr(target, "data-spool-id"));
    return true;
  }

  if (action === "inspect-slot-spool") {
    handlers.openPrinterSpool(readAttr(target, "data-spool-id"));
    return true;
  }

  if (action === "save-live-rfid-candidate") {
    handlers.submitLiveSlotCandidateRfidUpdate(
      readAttr(target, "data-spool-id"),
      readAttr(target, "data-printer-id"),
      readAttr(target, "data-slot-id"),
      readAttr(target, "data-rfid-tag"),
      readAttr(target, "data-rfid-observed-at"),
    );
    return true;
  }

  if (action === "open-loan-spool") {
    handlers.openLoanSpool(readAttr(target, "data-spool-id"));
    return true;
  }

  if (action === "assign-selected-spool") {
    handlers.startPrinterWeightUpdate({
      mode: "assign",
      printerId: readAttr(target, "data-printer-id"),
      printerName: readAttr(target, "data-printer-name"),
      slotId: readAttr(target, "data-slot-id"),
      slotIndex: readAttr(target, "data-slot-index"),
      slotLabel: readAttr(target, "data-slot-label"),
      targetSpoolId: readAttr(target, "data-spool-id"),
    });
    return true;
  }

  return false;
}
