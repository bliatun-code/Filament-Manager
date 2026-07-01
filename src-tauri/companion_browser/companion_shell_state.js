import { formatPrinterSlotLabelForModel } from "./printer_slot_labels.js";
import { resolveSpoolRowTareWeight } from "./companion_spool_weight.js";
import { normalizeOwnershipType } from "./companion_domain.js";

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

  function startLoanPicker() {
    state.activeRootFlow = ROOT_FLOW_LOANS;
    state.detailOpen = false;
    state.activeTaskSheet = { type: "loan-picker" };
    syncTaskSheetState();
    syncLegacySectionState();
    render();
  }

  function startLoanCreate(spoolId) {
    const normalizedSpoolId = String(spoolId || "").trim();
    if (!normalizedSpoolId) {
      return;
    }
    state.activeRootFlow = ROOT_FLOW_LOANS;
    state.selectedSpoolId = normalizedSpoolId;
    state.detailOpen = false;
    state.activeTaskSheet = {
      type: "loan-create",
      spoolId: normalizedSpoolId,
    };
    syncTaskSheetState();
    syncLegacySectionState();
    render();
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

  function startPrinterWeightUpdate(taskOptions = {}) {
    const normalizedMode = String(taskOptions.mode || "update").trim().toLowerCase();
    const normalizedPrinterId = String(taskOptions.printerId || "").trim();
    const normalizedSlotId = String(taskOptions.slotId || "").trim();
    const printers = Array.isArray(state.printers) ? state.printers : [];
    const printerRow =
      printers.find((row) => String(row?.printer?.id || "").trim() === normalizedPrinterId) || null;
    const slotRow =
      printerRow?.slots?.find((slot) => String(slot?.slot_id || "").trim() === normalizedSlotId) || null;
    const currentSpoolId = String(slotRow?.spool_id || taskOptions.spoolId || "").trim();
    const targetSpoolId = String(taskOptions.targetSpoolId || "").trim();
    if (!normalizedPrinterId || !normalizedSlotId) {
      return;
    }
    if (normalizedMode === "update" && !currentSpoolId) {
      return;
    }
    if (normalizedMode === "assign" && !targetSpoolId) {
      return;
    }
    if (normalizedMode === "clear" && !currentSpoolId) {
      return;
    }

    const spoolRows = Array.isArray(state.spools) ? state.spools : [];
    const currentSpoolRow =
      spoolRows.find((row) => String(row?.spool?.id || "").trim() === currentSpoolId) || null;
    const targetSpoolRow =
      spoolRows.find((row) => String(row?.spool?.id || "").trim() === targetSpoolId) || null;
    state.activeRootFlow = ROOT_FLOW_PRINTERS;
    state.activePrinterId = normalizedPrinterId;
    state.detailOpen = false;
    state.activeTaskSheet = {
      type: "printer-weight",
      mode: normalizedMode,
      printerId: normalizedPrinterId,
      printerName: String(taskOptions.printerName || printerRow?.printer?.name || "").trim(),
      slotId: normalizedSlotId,
      slotIndex: String(taskOptions.slotIndex || slotRow?.slot_index || "").trim(),
      slotLabel: String(
        taskOptions.slotLabel ||
          (slotRow
            ? formatPrinterSlotLabelForModel(slotRow, state.locale || "en", printerRow?.printer?.model || "")
            : ""),
      ).trim(),
      currentSpoolId,
      currentSpoolTitle: currentSpoolRow
        ? `${String(currentSpoolRow.master?.filament_name || "").trim()}${currentSpoolRow.master?.color_name ? ` · ${String(currentSpoolRow.master.color_name).trim()}` : ""}`
        : String(taskOptions.spoolTitle || "").trim(),
      currentVendor: String(currentSpoolRow?.master?.vendor || "").trim(),
      currentReference: currentSpoolId ? `#${currentSpoolId.replace(/^spool[-_]?/, "").slice(-6)}` : "",
      currentLocationId: String(currentSpoolRow?.spool?.location_id || "").trim(),
      currentRemainingWeight: String(currentSpoolRow?.spool?.remaining_g ?? slotRow?.spool_remaining_g ?? "").trim(),
      currentMeasuredWeight:
        currentSpoolRow?.spool?.remaining_g != null
          ? String(Math.max(0, currentSpoolRow.spool.remaining_g + resolveSpoolRowTareWeight(currentSpoolRow)))
          : "",
      currentTareWeight: String(resolveSpoolRowTareWeight(currentSpoolRow)).trim(),
      currentSwatchColor:
        String(currentSpoolRow?.master?.hex_color || slotRow?.spool_hex_color || taskOptions.swatchColor || "").trim(),
      targetSpoolId,
      targetSpoolTitle: targetSpoolRow
        ? `${String(targetSpoolRow.master?.filament_name || "").trim()}${targetSpoolRow.master?.color_name ? ` · ${String(targetSpoolRow.master.color_name).trim()}` : ""}`
        : "",
      targetVendor: String(targetSpoolRow?.master?.vendor || "").trim(),
      targetReference: targetSpoolId ? `#${targetSpoolId.replace(/^spool[-_]?/, "").slice(-6)}` : "",
      targetLocationId: String(targetSpoolRow?.spool?.location_id || "").trim(),
      targetRemainingWeight: String(targetSpoolRow?.spool?.remaining_g ?? "").trim(),
      targetMeasuredWeight:
        targetSpoolRow?.spool?.remaining_g != null
          ? String(Math.max(0, targetSpoolRow.spool.remaining_g + resolveSpoolRowTareWeight(targetSpoolRow)))
          : "",
      targetTareWeight: String(resolveSpoolRowTareWeight(targetSpoolRow)).trim(),
      targetSwatchColor: String(targetSpoolRow?.master?.hex_color || "").trim(),
    };
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
    startLoanPicker,
    startLoanCreate,
    startPrinterWeightUpdate,
    setWishlistQueueFilter,
    startPrinterSlotAssignment,
    setRootFlow,
    showAllLoans,
    syncLegacySectionState,
    toggleBorrowedInForm,
    toggleLoanReturn,
  };
}
