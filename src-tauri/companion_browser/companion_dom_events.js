import { routeCompanionClickAction } from "./companion_click_router.js";
import { routeCompanionInputChange } from "./companion_input_router.js";
import { routeCompanionSubmitAction } from "./companion_submit_router.js";

const OVERLAY_OPENING_ACTIONS = new Set([
  "start-printer-slot-assignment",
  "start-printer-weight-update",
  "toggle-borrowed-in-form",
  "toggle-add-spool-form",
  "toggle-loan-return",
  "start-loan-create",
  "start-loan-picker",
  "select-loan-spool",
  "open-current-detail",
  "select-spool",
  "inspect-slot-spool",
  "open-loan-spool",
  "assign-selected-spool",
]);

function isNamedFormControl(target) {
  if (!target || typeof target.name !== "string") {
    return false;
  }

  const tagName = String(target.tagName || target.nodeName || "").toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function isFormElementLike(target) {
  if (!target || typeof target.getAttribute !== "function") {
    return false;
  }

  const tagName = String(target.tagName || target.nodeName || "").toUpperCase();
  return tagName === "FORM";
}

function focusRootFlowControl(documentRef, control) {
  const id = String(control?.getAttribute?.("id") || "").trim();
  const renderedControl = id ? documentRef?.getElementById?.(id) : null;
  const focusTarget = renderedControl || control;
  if (typeof focusTarget?.focus !== "function") {
    return;
  }
  try {
    focusTarget.focus({ preventScroll: true });
  } catch {
    focusTarget.focus();
  }
}

function handleRootFlowTabKeydown(event, options) {
  const key = String(event?.key || "");
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) {
    return false;
  }

  const currentTab = event?.target?.closest?.('[role="tab"][data-action="set-root-flow"]');
  const tablist = currentTab?.closest?.('[role="tablist"]');
  const tabs = Array.from(
    tablist?.querySelectorAll?.('[role="tab"][data-action="set-root-flow"]') || [],
  ).filter((tab) => !tab.disabled && tab.getAttribute?.("aria-disabled") !== "true");
  const currentIndex = tabs.indexOf(currentTab);
  if (currentIndex < 0 || tabs.length === 0) {
    return false;
  }

  const nextIndex =
    key === "Home"
      ? 0
      : key === "End"
        ? tabs.length - 1
        : key === "ArrowRight"
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  const nextFlow = String(nextTab?.getAttribute?.("data-root-flow") || "").trim();
  if (!nextFlow) {
    return false;
  }

  event.preventDefault?.();
  options.setRootFlow(nextFlow);
  focusRootFlowControl(options.documentRef, nextTab);
  return true;
}

export function handleCompanionKeydownEvent(event, options) {
  if (options.overlayFocusLifecycle?.handleKeydown?.(event)) {
    return true;
  }
  if (handleRootFlowTabKeydown(event, options)) {
    return true;
  }
  if (event?.key === "Escape" && options.state.detailOpen) {
    options.closeDetailModal();
    return true;
  }
  if (event?.key === "Escape" && options.state.activeTaskSheet) {
    options.closeActiveTaskSheet();
    return true;
  }
  return false;
}

export function handleCompanionClickEvent(event, options) {
  const target = event?.target?.closest?.("[data-action]");
  if (!target) {
    return false;
  }

  const action = target.getAttribute("data-action");
  if (OVERLAY_OPENING_ACTIONS.has(action)) {
    options.overlayFocusLifecycle?.rememberOpener?.(target);
  }
  return routeCompanionClickAction(action, target, {
    refresh: () => void options.refreshOverview(),
    showMoreInventory: options.showMoreInventory,
    showMoreLoans: options.showMoreLoans,
    showMoreLoanPicker: options.showMoreLoanPicker,
    setRootFlow: (nextFlow) => {
      options.setRootFlow(nextFlow);
      focusRootFlowControl(options.documentRef, target);
    },
    startPrinterSlotAssignment: options.startPrinterSlotAssignment,
    startPrinterWeightUpdate: options.startPrinterWeightUpdate,
    toggleBorrowedInForm: options.toggleBorrowedInForm,
    setAddSpoolSource: options.setAddSpoolSource,
    setCatalogStatusFilter: options.setCatalogStatusFilter,
    setFilamentOwnership: options.setFilamentOwnership,
    selectCatalogMaster: options.selectCatalogMaster,
    setThemeMode: options.setThemeMode,
    setLocale: options.setLocale,
    startLoanPicker: options.startLoanPicker,
    toggleLoanReturn: options.toggleLoanReturn,
    startLoanCreate: options.startLoanCreate,
    selectPrinter: options.selectPrinter,
    closeDetailModal: options.closeDetailModal,
    closeActiveTaskSheet: options.closeActiveTaskSheet,
    openCurrentDetail: () => {
      if (options.state.selectedSpoolId) {
        options.openSpoolDetail(options.state.selectedSpoolId, {
          rootFlow: options.state.activeRootFlow,
        });
      }
    },
    clearInventorySearch: options.clearInventorySearch,
    showAllLoans: options.showAllLoans,
    setLoanStatusFilter: options.setLoanStatusFilter,
    setWishlistQueueFilter: options.setWishlistQueueFilter,
    openStorageSpool: (spoolId) => {
      options.openSpoolDetail(spoolId, { rootFlow: "storage" });
    },
    openPrinterSpool: (spoolId) => {
      options.openSpoolDetail(spoolId, { rootFlow: "printers" });
    },
    openLoanSpool: (spoolId) => {
      options.openSpoolDetail(spoolId, { rootFlow: "loans" });
    },
    submitPrinterSlotAssignment: (...args) => void options.submitPrinterSlotAssignment(...args),
    submitLiveSlotCandidateRfidUpdate: (...args) => void options.submitLiveSlotCandidateRfidUpdate(...args),
    submitWishlistStatus: (...args) => void options.submitWishlistStatus(...args),
    submitWishlistStock: (...args) => void options.submitWishlistStock(...args),
    submitWishlistDelete: (...args) => void options.submitWishlistDelete(...args),
  });
}

export function handleCompanionInputEvent(event, options) {
  const target = event?.target;
  if (!isNamedFormControl(target)) {
    return false;
  }

  return routeCompanionInputChange(target.name, target.value, {
    setInventorySearch: (value) => {
      options.state.search = value;
      options.state.inventoryRenderLimit = 150;
      options.render();
    },
    setLoanSearch: (value) => {
      options.state.loanSearch = value;
      options.state.loanRenderLimit = 150;
      if (options.state.activeTaskSheet?.type === "loan-return") {
        options.state.activeTaskSheet = null;
      }
      options.state.expandedLoanReturnId = "";
      options.render();
    },
    setPrinterSpoolSearch: options.setPrinterSpoolSearch,
    setLocale: options.setLocale,
    setBorrowedInDraftField: options.setBorrowedInDraftField,
    render: options.render,
  });
}

export function handleCompanionChangeEvent(event, options) {
  const target = event?.target;
  if (!target || typeof target.name !== "string") {
    return false;
  }

  return false;
}

export function handleCompanionSubmitEvent(event, options) {
  const form = event?.target;
  if (!isFormElementLike(form)) {
    return false;
  }

  const action = form.getAttribute("data-action");
  event.preventDefault?.();
  const data = (options.createFormData ?? ((target) => new FormData(target)))(form);
  return routeCompanionSubmitAction(action, data, {
    submitWeightUpdate: (...args) => void options.submitWeightUpdate(...args),
    submitPrinterSlotOperation: (...args) => void options.submitPrinterSlotOperation(...args),
    submitSpoolDetailsUpdate: (...args) => void options.submitSpoolDetailsUpdate(...args),
    submitSpoolRfidUpdate: (...args) => void options.submitSpoolRfidUpdate(...args),
    submitSpoolLoan: (...args) => void options.submitSpoolLoan(...args),
    submitSpoolLoanReturn: (...args) => void options.submitSpoolLoanReturn(...args),
    submitManualSpoolRegistration: (...args) => void options.submitManualSpoolRegistration(...args),
    submitWishlistCreate: (...args) => void options.submitWishlistCreate(...args),
    submitWishlistStock: (...args) => void options.submitWishlistStock(...args),
    submitBorrowedInUpdate: (...args) => void options.submitBorrowedInUpdate(...args),
    submitBorrowedInHandBack: (...args) => void options.submitBorrowedInHandBack(...args),
  });
}

export function installCompanionDomEvents(options) {
  const keydownHandler = (event) => {
    handleCompanionKeydownEvent(event, options);
  };
  const clickHandler = (event) => {
    handleCompanionClickEvent(event, options);
  };
  const inputHandler = (event) => {
    handleCompanionInputEvent(event, options);
  };
  const changeHandler = (event) => {
    handleCompanionChangeEvent(event, options);
  };
  const submitHandler = (event) => {
    handleCompanionSubmitEvent(event, options);
  };

  options.documentRef.addEventListener("keydown", keydownHandler);
  options.root.addEventListener("click", clickHandler);
  options.root.addEventListener("input", inputHandler);
  options.root.addEventListener("change", changeHandler);
  options.root.addEventListener("submit", submitHandler);

  return {
    keydownHandler,
    clickHandler,
    inputHandler,
    changeHandler,
    submitHandler,
  };
}
