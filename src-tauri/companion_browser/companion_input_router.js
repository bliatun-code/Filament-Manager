export function routeCompanionInputChange(name, value, handlers) {
  const normalizedName = String(name || "").trim();

  if (normalizedName === "inventory-search") {
    handlers.setInventorySearch(String(value || ""));
    return true;
  }

  if (normalizedName === "loan-search") {
    handlers.setLoanSearch(String(value || ""));
    return true;
  }

  if (normalizedName === "printer-spool-search") {
    handlers.setPrinterSpoolSearch(String(value || ""));
    return true;
  }

  if (normalizedName === "app-locale") {
    handlers.setLocale(String(value || "en"));
    return true;
  }

  if (handlers.setBorrowedInDraftField(normalizedName, String(value || ""))) {
    handlers.render();
    return true;
  }

  return false;
}
