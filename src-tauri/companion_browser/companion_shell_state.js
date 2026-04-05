const ROOT_FLOW_STORAGE = "storage";
const ROOT_FLOW_PRINTERS = "printers";
const ROOT_FLOW_LOANS = "loans";
const ROOT_FLOW_SETTINGS = "settings";

function normalizeLayoutMode(nextMode) {
  return nextMode === "phone" || nextMode === "tablet" || nextMode === "desktop"
    ? nextMode
    : "desktop";
}

function normalizeRootFlow(nextFlow) {
  return nextFlow === ROOT_FLOW_PRINTERS || nextFlow === ROOT_FLOW_LOANS || nextFlow === ROOT_FLOW_SETTINGS
    ? nextFlow
    : ROOT_FLOW_STORAGE;
}

function normalizeLoanStatusFilter(nextFilter) {
  return nextFilter === "RETURNED" || nextFilter === "ALL" ? nextFilter : "ACTIVE";
}

function normalizeOwnershipType(nextOwnershipType) {
  return String(nextOwnershipType || "").trim().toUpperCase() === "BORROWED_IN"
    ? "BORROWED_IN"
    : "OWNED";
}

function normalizeAddSpoolSource(nextSource) {
  const normalized = String(nextSource || "").trim().toLowerCase();
  return normalized === "esun" || normalized === "manual" ? normalized : "bambu";
}

function normalizeCatalogStatusFilter(nextFilter) {
  const normalized = String(nextFilter || "").trim().toUpperCase();
  return normalized === "ALL" || normalized === "DISCONTINUED" ? normalized : "ACTIVE";
}

function normalizeWishlistFilter(nextFilter) {
  const normalized = String(nextFilter || "").trim().toUpperCase();
  return normalized === "WISHLIST" || normalized === "ON_ORDER" || normalized === "RECEIVED"
    ? normalized
    : "ALL";
}

function catalogMatchesSource(master, source) {
  const vendor = String(master?.vendor || "").trim().toLowerCase();
  if (source === "esun") {
    return vendor.includes("esun");
  }
  if (source === "manual") {
    return false;
  }
  return vendor.includes("bambu");
}

export function detectCompanionLayoutMode(viewportWidth) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 0;
  if (width < 768) {
    return "phone";
  }
  if (width < 1200) {
    return "tablet";
  }
  return "desktop";
}

export function createCompanionShellState(options) {
  const { state, render, resetSessionState } = options;

  function syncTaskSheetState() {
    const taskType = String(state.activeTaskSheet?.type || "").trim();
    state.showStorageQr = taskType === "storage-qr";
    state.showBorrowedInForm = taskType === "storage-add";
    state.expandedLoanReturnId =
      taskType === "loan-return" ? String(state.activeTaskSheet?.loanId || "").trim() : "";
    if (taskType !== "printer-picker") {
      state.pendingPrinterSlotTarget = null;
      state.printerSpoolSearch = "";
    }
  }

  function setActiveTaskSheet(nextTaskSheet, shouldRender = true) {
    state.activeTaskSheet = nextTaskSheet || null;
    syncTaskSheetState();
    if (shouldRender) {
      render();
    }
  }

  function syncLegacySectionState() {
    state.compactLayout = state.layoutMode === "phone";
    if (state.detailOpen) {
      state.activeSection = "detail";
      state.detailReturnSection =
        state.detailReturnRootFlow === ROOT_FLOW_PRINTERS
          ? ROOT_FLOW_PRINTERS
          : state.detailReturnRootFlow === ROOT_FLOW_LOANS
            ? ROOT_FLOW_LOANS
            : "inventory";
      return;
    }

    if (state.activeRootFlow === ROOT_FLOW_PRINTERS) {
      state.activeSection = ROOT_FLOW_PRINTERS;
      state.detailReturnSection = ROOT_FLOW_PRINTERS;
      return;
    }

    if (state.activeRootFlow === ROOT_FLOW_LOANS) {
      state.activeSection = ROOT_FLOW_LOANS;
      state.detailReturnSection = ROOT_FLOW_LOANS;
      return;
    }

    state.activeSection = "inventory";
    state.detailReturnSection = "inventory";
  }

  function applyLayoutMode(nextMode) {
    const normalized = normalizeLayoutMode(nextMode);
    if (state.layoutMode === normalized) {
      return;
    }
    state.layoutMode = normalized;
    state.compactLayout = normalized === "phone";
    syncLegacySectionState();
    render();
  }

  function ensureActivePrinterSelection() {
    const printers = Array.isArray(state.printers) ? state.printers : [];
    const hasActivePrinter = printers.some((row) => row?.printer?.id === state.activePrinterId);
    if (!hasActivePrinter) {
      state.activePrinterId = String(printers[0]?.printer?.id || "").trim();
    }
  }

  function setDetailReturnContext(rootFlow = state.activeRootFlow) {
    state.detailReturnRootFlow =
      rootFlow === ROOT_FLOW_PRINTERS || rootFlow === ROOT_FLOW_LOANS
        ? rootFlow
        : ROOT_FLOW_STORAGE;
    state.detailReturnSection =
      state.detailReturnRootFlow === ROOT_FLOW_PRINTERS
        ? ROOT_FLOW_PRINTERS
        : state.detailReturnRootFlow === ROOT_FLOW_LOANS
          ? ROOT_FLOW_LOANS
          : "inventory";
  }

  function setRootFlow(nextFlow) {
    state.activeRootFlow = normalizeRootFlow(nextFlow);
    if (state.activeRootFlow === ROOT_FLOW_PRINTERS) {
      ensureActivePrinterSelection();
    }
    state.detailOpen = false;
    state.activeTaskSheet = null;
    syncTaskSheetState();
    syncLegacySectionState();
    render();
  }

  function openDetailModal(rootFlow = state.activeRootFlow) {
    setDetailReturnContext(rootFlow);
    state.detailOpen = true;
    state.activeTaskSheet = null;
    syncTaskSheetState();
    syncLegacySectionState();
  }

  function closeDetailModal() {
    state.detailOpen = false;
    syncLegacySectionState();
    render();
  }

  function resetLocalSession(nextLayoutMode) {
    resetSessionState(state);
    state.layoutMode = normalizeLayoutMode(nextLayoutMode);
    state.compactLayout = state.layoutMode === "phone";
    syncLegacySectionState();
  }

  function toggleStorageQrSheet() {
    const nextTaskSheet = state.activeTaskSheet?.type === "storage-qr" ? null : { type: "storage-qr" };
    setActiveTaskSheet(nextTaskSheet);
  }

  function toggleBorrowedInForm() {
    const nextTaskSheet = state.activeTaskSheet?.type === "storage-add" ? null : { type: "storage-add" };
    setActiveTaskSheet(nextTaskSheet);
  }

  function setFilamentOwnership(nextOwnershipType) {
    state.borrowedInDraft.ownershipType = normalizeOwnershipType(nextOwnershipType);
    render();
  }

  function setAddSpoolSource(nextSource) {
    const normalizedSource = normalizeAddSpoolSource(nextSource);
    state.borrowedInDraft.source = normalizedSource;
    if (normalizedSource === "manual") {
      state.borrowedInDraft.selectedMasterId = "";
      render();
      return;
    }

    const selectedMaster = Array.isArray(state.catalogMasters)
      ? state.catalogMasters.find((master) => master?.id === state.borrowedInDraft.selectedMasterId)
      : null;
    if (!catalogMatchesSource(selectedMaster, normalizedSource)) {
      const replacement = (Array.isArray(state.catalogMasters) ? state.catalogMasters : []).find((master) =>
        catalogMatchesSource(master, normalizedSource),
      );
      state.borrowedInDraft.selectedMasterId = String(replacement?.id || "");
      if (replacement?.default_weight != null) {
        state.borrowedInDraft.initialWeight = String(replacement.default_weight);
      }
    }
    render();
  }

  function setCatalogStatusFilter(nextFilter) {
    state.borrowedInDraft.catalogStatusFilter = normalizeCatalogStatusFilter(nextFilter);
    render();
  }

  function selectCatalogMaster(masterId) {
    const normalizedMasterId = String(masterId || "").trim();
    state.borrowedInDraft.selectedMasterId = normalizedMasterId;
    const master = Array.isArray(state.catalogMasters)
      ? state.catalogMasters.find((row) => row?.id === normalizedMasterId)
      : null;
    if (master?.default_weight != null) {
      state.borrowedInDraft.initialWeight = String(master.default_weight);
    }
    render();
  }

  function setWishlistQueueFilter(nextFilter) {
    state.borrowedInDraft.wishlistFilter = normalizeWishlistFilter(nextFilter);
    render();
  }

  function toggleLoanReturn(loanId) {
    const normalizedLoanId = String(loanId || "").trim();
    if (!normalizedLoanId) {
      setActiveTaskSheet(null);
      return;
    }
    const nextTaskSheet =
      state.activeTaskSheet?.type === "loan-return" && state.activeTaskSheet.loanId === normalizedLoanId
        ? null
        : { type: "loan-return", loanId: normalizedLoanId };
    setActiveTaskSheet(nextTaskSheet);
  }

  function selectPrinter(printerId) {
    state.activeRootFlow = ROOT_FLOW_PRINTERS;
    state.activePrinterId = String(printerId || "").trim();
    state.pendingPrinterSlotTarget = null;
    state.detailOpen = false;
    state.activeTaskSheet = null;
    syncTaskSheetState();
    ensureActivePrinterSelection();
    syncLegacySectionState();
    render();
  }

  function startPrinterSlotAssignment(printerId, printerName, slotId, slotIndex, slotLabel = "") {
    const normalizedPrinterId = String(printerId || "").trim();
    const normalizedSlotId = String(slotId || "").trim();
    const normalizedSlotIndex = String(slotIndex || "").trim();
    const normalizedPrinterName = String(printerName || "").trim();
    const normalizedSlotLabel = String(slotLabel || "").trim();
    if (!normalizedPrinterId || !normalizedSlotId) {
      return;
    }
    state.activeRootFlow = ROOT_FLOW_PRINTERS;
    state.activePrinterId = normalizedPrinterId;
    state.pendingPrinterSlotTarget = {
      printerId: normalizedPrinterId,
      printerName: normalizedPrinterName,
      slotId: normalizedSlotId,
      slotIndex: normalizedSlotIndex,
      slotLabel: normalizedSlotLabel,
    };
    state.activeTaskSheet = {
      type: "printer-picker",
      printerId: normalizedPrinterId,
      printerName: normalizedPrinterName,
      slotId: normalizedSlotId,
      slotIndex: normalizedSlotIndex,
      slotLabel: normalizedSlotLabel,
    };
    state.detailOpen = false;
    syncTaskSheetState();
    ensureActivePrinterSelection();
    syncLegacySectionState();
    render();
  }

  function setPrinterSpoolSearch(value) {
    state.printerSpoolSearch = String(value || "");
    render();
  }

  function clearInventorySearch() {
    state.search = "";
    render();
  }

  function showAllLoans() {
    state.loanSearch = "";
    state.loanStatusFilter = "ALL";
    state.activeTaskSheet = null;
    syncTaskSheetState();
    render();
  }

  function setLoanStatusFilter(nextFilter) {
    state.loanStatusFilter = normalizeLoanStatusFilter(String(nextFilter || "").trim());
    state.activeTaskSheet = null;
    syncTaskSheetState();
    render();
  }

  function closeActiveTaskSheet() {
    if (!state.activeTaskSheet) {
      return;
    }
    setActiveTaskSheet(null);
  }

  function setBorrowedInDraftField(name, value) {
    switch (name) {
      case "filament-owner-name":
        state.borrowedInDraft.ownerName = value;
        return true;
      case "filament-owner-contact":
        state.borrowedInDraft.ownerContact = value;
        return true;
      case "filament-catalog-search":
        state.borrowedInDraft.catalogSearch = value;
        return true;
      case "filament-material":
        state.borrowedInDraft.material = value;
        return true;
      case "filament-name":
        state.borrowedInDraft.filamentName = value;
        return true;
      case "filament-color-name":
        state.borrowedInDraft.colorName = value;
        return true;
      case "filament-vendor":
      case "filament-manual-vendor":
        state.borrowedInDraft.manualVendor = value;
        return true;
      case "filament-hex-color":
        state.borrowedInDraft.hexColor = value;
        return true;
      case "filament-initial-weight":
        state.borrowedInDraft.initialWeight = value;
        return true;
      case "filament-location":
        state.borrowedInDraft.location = value;
        return true;
      case "filament-note":
        state.borrowedInDraft.note = value;
        return true;
      case "wishlist-quantity":
        state.borrowedInDraft.wishlistQuantity = value;
        return true;
      case "wishlist-note":
        state.borrowedInDraft.wishlistNote = value;
        return true;
      default:
        return false;
    }
  }

  return {
    applyLayoutMode,
    clearInventorySearch,
    closeDetailModal,
    closeActiveTaskSheet,
    ensureActivePrinterSelection,
    openDetailModal,
    resetLocalSession,
    selectPrinter,
    selectCatalogMaster,
    setAddSpoolSource,
    setCatalogStatusFilter,
    setFilamentOwnership,
    setBorrowedInDraftField,
    setDetailReturnContext,
    setLoanStatusFilter,
    setPrinterSpoolSearch,
    setWishlistQueueFilter,
    startPrinterSlotAssignment,
    setRootFlow,
    showAllLoans,
    syncLegacySectionState,
    toggleBorrowedInForm,
    toggleLoanReturn,
    toggleStorageQrSheet,
  };
}
