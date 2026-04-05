function readAttr(target, name) {
  return String(target?.getAttribute?.(name) || "").trim();
}

export function routeCompanionClickAction(action, target, handlers) {
  if (action === "refresh") {
    handlers.refresh();
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

  if (action === "toggle-qr-sheet") {
    handlers.toggleStorageQrSheet();
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

  if (action === "open-loan-spool") {
    handlers.openLoanSpool(readAttr(target, "data-spool-id"));
    return true;
  }

  if (action === "assign-selected-spool" || action === "clear-slot") {
    const printerId = readAttr(target, "data-printer-id");
    const printerName = readAttr(target, "data-printer-name");
    const slotId = readAttr(target, "data-slot-id");
    const slotIndex = readAttr(target, "data-slot-index");
    const slotLabel = readAttr(target, "data-slot-label");
    const spoolId = readAttr(target, "data-spool-id");
    const fallbackSlotLabel = slotIndex ? `Slot ${slotIndex}` : "";
    const feedbackLabel =
      printerName && (slotLabel || fallbackSlotLabel)
        ? `${printerName} · ${slotLabel || fallbackSlotLabel}`
        : "";
    handlers.submitPrinterSlotAssignment(printerId, slotId, action === "clear-slot" ? "" : spoolId, {
      feedbackSpoolId: spoolId,
      feedbackLabel,
    });
    return true;
  }

  return false;
}
