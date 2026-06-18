import { routeCompanionClickAction } from "./companion_click_router.js";
import { routeCompanionInputChange } from "./companion_input_router.js";
import { routeCompanionSubmitAction } from "./companion_submit_router.js";

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

export function handleCompanionKeydownEvent(event, options) {
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
  return routeCompanionClickAction(action, target, {
    refresh: () => void options.refreshOverview(),
    setRootFlow: options.setRootFlow,
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
      options.render();
    },
    setLoanSearch: (value) => {
      options.state.loanSearch = value;
      if (options.state.activeTaskSheet?.type === "loan-return") {
        options.state.activeTaskSheet = null;
      }
      options.state.expandedLoanReturnId = "";
      options.render();
    },
    setPrinterSpoolSearch: options.setPrinterSpoolSearch,
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
