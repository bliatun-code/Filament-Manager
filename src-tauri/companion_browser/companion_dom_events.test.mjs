import test from "node:test";
import assert from "node:assert/strict";

import {
  handleCompanionClickEvent,
  handleCompanionChangeEvent,
  handleCompanionInputEvent,
  handleCompanionKeydownEvent,
  handleCompanionSubmitEvent,
  installCompanionDomEvents,
} from "./companion_dom_events.js";

function createActionTarget(attributes = {}) {
  return {
    tagName: "BUTTON",
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

function createBaseOptions(overrides = {}) {
  return {
    documentRef: {
      addEventListener() {},
    },
    root: {
      addEventListener() {},
    },
    state: {
      selectedSpoolId: "spool-1",
      activeRootFlow: "storage",
      detailOpen: true,
      search: "",
      loanSearch: "",
      expandedLoanReturnId: "",
    },
    closeDetailModal() {},
    setStatus() {},
    refreshOverview() {},
    setRootFlow() {},
    toggleBorrowedInForm() {},
    setFilamentOwnership() {},
    setThemeMode() {},
    toggleLoanReturn() {},
    selectPrinter() {},
    openSpoolDetail() {},
    clearInventorySearch() {},
    showAllLoans() {},
    setLoanStatusFilter() {},
    submitPrinterSlotAssignment() {},
    render() {},
    setBorrowedInDraftField() {
      return false;
    },
    submitWeightUpdate() {},
    submitSpoolDetailsUpdate() {},
    submitSpoolLoan() {},
    submitSpoolLoanReturn() {},
    submitManualSpoolRegistration() {},
    submitBorrowedInUpdate() {},
    submitBorrowedInHandBack() {},
    ...overrides,
  };
}

test("keydown handler closes the detail modal on Escape only while detail is open", () => {
  let closeCount = 0;
  const options = createBaseOptions({
    closeDetailModal() {
      closeCount += 1;
    },
  });

  assert.equal(handleCompanionKeydownEvent({ key: "Escape" }, options), true);
  assert.equal(closeCount, 1);
  options.state.detailOpen = false;
  assert.equal(handleCompanionKeydownEvent({ key: "Escape" }, options), false);
});

test("click handler refreshes current trusted-LAN companion data", async () => {
  let refreshCount = 0;
  const options = createBaseOptions({
    state: {
      selectedSpoolId: "spool-1",
      activeRootFlow: "storage",
      detailOpen: false,
      search: "",
      loanSearch: "",
      expandedLoanReturnId: "",
    },
    refreshOverview() {
      refreshCount += 1;
      return Promise.resolve();
    },
  });

  const handled = handleCompanionClickEvent(
    {
      target: createActionTarget({
        "data-action": "refresh",
      }),
    },
    options,
  );

  assert.equal(handled, true);
  await Promise.resolve();
  assert.equal(refreshCount, 1);
});

test("input handler updates loan search and collapses the expanded return state", () => {
  let renderCount = 0;
  const options = createBaseOptions({
    state: {
      selectedSpoolId: "spool-1",
      activeRootFlow: "storage",
      detailOpen: false,
      search: "",
      loanSearch: "",
      expandedLoanReturnId: "loan-1",
    },
    render() {
      renderCount += 1;
    },
  });

  const handled = handleCompanionInputEvent(
    {
      target: {
        tagName: "INPUT",
        name: "loan-search",
        value: "alice",
      },
    },
    options,
  );

  assert.equal(handled, true);
  assert.equal(options.state.loanSearch, "alice");
  assert.equal(options.state.expandedLoanReturnId, "");
  assert.equal(renderCount, 1);
});

test("submit handler dispatches spool detail updates from the detail form", () => {
  let prevented = false;
  const calls = [];
  const formData = {
    get(name) {
      return {
        "spool-id": "spool-12",
        status: "EMPTY",
        location: "Archive Bin",
      }[name] ?? "";
    },
  };
  const options = createBaseOptions({
    createFormData() {
      return formData;
    },
    submitSpoolDetailsUpdate(...args) {
      calls.push(args);
    },
  });

  const handled = handleCompanionSubmitEvent(
    {
      target: {
        tagName: "FORM",
        getAttribute(name) {
          return name === "data-action" ? "update-spool-details-form" : null;
        },
      },
      preventDefault() {
        prevented = true;
      },
    },
    options,
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.deepEqual(calls, [["spool-12", "EMPTY", "Archive Bin", ""]]);
});

test("installCompanionDomEvents registers the expected document and root listeners", () => {
  const documentEvents = [];
  const rootEvents = [];
  const options = createBaseOptions({
    documentRef: {
      addEventListener(type) {
        documentEvents.push(type);
      },
    },
    root: {
      addEventListener(type) {
        rootEvents.push(type);
      },
    },
  });

  const installed = installCompanionDomEvents(options);

  assert.deepEqual(documentEvents, ["keydown"]);
  assert.deepEqual(rootEvents, ["click", "input", "change", "submit"]);
  assert.equal(typeof installed.keydownHandler, "function");
  assert.equal(typeof installed.clickHandler, "function");
  assert.equal(typeof installed.inputHandler, "function");
  assert.equal(typeof installed.changeHandler, "function");
  assert.equal(typeof installed.submitHandler, "function");
});
