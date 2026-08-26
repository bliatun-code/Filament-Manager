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
    submitWishlistCreate() {},
    submitWishlistStatus() {},
    submitWishlistStock() {},
    submitWishlistDelete() {},
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

test("keydown handler delegates overlay focus trapping and Escape handling to the lifecycle", () => {
  const calls = [];
  const event = { key: "Tab" };
  const options = createBaseOptions({
    overlayFocusLifecycle: {
      handleKeydown(receivedEvent) {
        calls.push(receivedEvent);
        return true;
      },
    },
  });

  assert.equal(handleCompanionKeydownEvent(event, options), true);
  assert.deepEqual(calls, [event]);
});

test("keydown handler cycles tablet tabs, switches flow and restores focus after render", () => {
  const flows = [];
  const focusCalls = [];
  const tablist = {
    querySelectorAll(selector) {
      assert.equal(selector, '[role="tab"][data-action="set-root-flow"]');
      return tabs;
    },
  };
  function createTab(flow) {
    return {
      disabled: false,
      closest(selector) {
        if (selector === '[role="tab"][data-action="set-root-flow"]') {
          return this;
        }
        return selector === '[role="tablist"]' ? tablist : null;
      },
      getAttribute(name) {
        if (name === "data-root-flow") {
          return flow;
        }
        if (name === "id") {
          return `companion-root-tab-${flow}`;
        }
        return null;
      },
      focus(options) {
        focusCalls.push([flow, options]);
      },
    };
  }
  const tabs = ["storage", "loans", "printers", "settings"].map(createTab);
  let prevented = false;
  const options = createBaseOptions({
    documentRef: {
      getElementById(id) {
        return tabs.find((tab) => tab.getAttribute("id") === id) || null;
      },
    },
    setRootFlow(flow) {
      flows.push(flow);
    },
  });

  const handled = handleCompanionKeydownEvent(
    {
      key: "ArrowRight",
      target: tabs[0],
      preventDefault() {
        prevented = true;
      },
    },
    options,
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.deepEqual(flows, ["loans"]);
  assert.deepEqual(focusCalls, [["loans", { preventScroll: true }]]);
});

test("keydown handler supports Home, End and wrapped ArrowLeft tab navigation", () => {
  const flows = [];
  const tablist = {
    querySelectorAll() {
      return tabs;
    },
  };
  function createTab(flow) {
    return {
      disabled: false,
      closest(selector) {
        return selector === '[role="tab"][data-action="set-root-flow"]'
          ? this
          : selector === '[role="tablist"]'
            ? tablist
            : null;
      },
      getAttribute(name) {
        return name === "data-root-flow" ? flow : "";
      },
      focus() {},
    };
  }
  const tabs = ["storage", "loans", "printers", "settings"].map(createTab);
  const options = createBaseOptions({
    setRootFlow(flow) {
      flows.push(flow);
    },
  });

  assert.equal(handleCompanionKeydownEvent({ key: "End", target: tabs[1] }, options), true);
  assert.equal(handleCompanionKeydownEvent({ key: "Home", target: tabs[2] }, options), true);
  assert.equal(handleCompanionKeydownEvent({ key: "ArrowLeft", target: tabs[0] }, options), true);
  assert.deepEqual(flows, ["settings", "storage", "settings"]);
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

test("click handler remembers pointer openers before an overlay-opening action rerenders", () => {
  const remembered = [];
  const target = createActionTarget({
    "data-action": "start-printer-slot-assignment",
    "data-printer-id": "printer-7",
    "data-slot-id": "slot-2",
  });
  const options = createBaseOptions({
    overlayFocusLifecycle: {
      rememberOpener(element) {
        remembered.push(element);
      },
    },
    startPrinterSlotAssignment() {},
  });

  assert.equal(handleCompanionClickEvent({ target }, options), true);
  assert.deepEqual(remembered, [target]);
});

test("click handler restores focus to a tablet tab after switching root flow", () => {
  const flows = [];
  const focusCalls = [];
  const renderedTab = {
    focus(options) {
      focusCalls.push(options);
    },
  };
  const target = createActionTarget({
    id: "companion-root-tab-loans",
    role: "tab",
    "data-action": "set-root-flow",
    "data-root-flow": "loans",
  });
  const options = createBaseOptions({
    documentRef: {
      getElementById(id) {
        return id === "companion-root-tab-loans" ? renderedTab : null;
      },
    },
    setRootFlow(flow) {
      flows.push(flow);
    },
  });

  assert.equal(handleCompanionClickEvent({ target }, options), true);
  assert.deepEqual(flows, ["loans"]);
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
});

test("click handler dispatches wishlist deletion from the rendered queue", () => {
  const calls = [];
  const options = createBaseOptions({
    submitWishlistDelete(itemId) {
      calls.push(itemId);
    },
  });

  const handled = handleCompanionClickEvent(
    {
      target: createActionTarget({
        "data-action": "wishlist-delete",
        "data-wishlist-id": "wish-7",
      }),
    },
    options,
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["wish-7"]);
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
        purchase_price: "120",
        purchase_currency: "NOK",
        purchase_date: "2026-08-21",
        batch_code: "LOT-12",
        supplier_reference: "PO-12",
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
  assert.deepEqual(calls, [[
    "spool-12",
    "EMPTY",
    "Archive Bin",
    "",
    {
      pricePerRoll: "120",
      currency: "NOK",
      purchaseDate: "2026-08-21",
      batchCode: "LOT-12",
      supplierReference: "PO-12",
    },
  ]]);
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
