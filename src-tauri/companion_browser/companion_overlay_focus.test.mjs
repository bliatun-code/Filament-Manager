import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPANION_FOCUSABLE_SELECTOR,
  companionFocusableElements,
  companionOverlayKey,
  createCompanionOverlayFocusLifecycle,
} from "./companion_overlay_focus.js";

function createHarness() {
  const documentRef = {
    activeElement: null,
    overlay: null,
    focusables: [],
    querySelector(selector) {
      return selector === "[data-companion-overlay]" ? this.overlay : null;
    },
    querySelectorAll(selector) {
      return selector === COMPANION_FOCUSABLE_SELECTOR ? this.focusables : [];
    },
  };

  function createElement(tagName, attributes = {}) {
    const element = {
      tagName: tagName.toUpperCase(),
      id: attributes.id || "",
      name: attributes.name || "",
      disabled: false,
      hidden: false,
      focusCalls: [],
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
      },
      closest() {
        return null;
      },
      focus(options) {
        this.focusCalls.push(options);
        documentRef.activeElement = this;
      },
    };
    return element;
  }

  function createOverlay(focusables, initialFocus = focusables[0] || null) {
    return {
      tagName: "SECTION",
      focusCalls: [],
      contains(element) {
        return focusables.includes(element);
      },
      querySelector(selector) {
        if (selector === "[data-overlay-initial-focus]") {
          return initialFocus;
        }
        return null;
      },
      querySelectorAll(selector) {
        return selector === COMPANION_FOCUSABLE_SELECTOR ? focusables : [];
      },
      getAttribute() {
        return null;
      },
      closest() {
        return null;
      },
      focus(options) {
        this.focusCalls.push(options);
        documentRef.activeElement = this;
      },
    };
  }

  return {
    createElement,
    createOverlay,
    documentRef,
  };
}

test("overlay keys distinguish detail records and task-sheet transitions", () => {
  assert.equal(companionOverlayKey({}), "");
  assert.equal(
    companionOverlayKey({ detailOpen: true, selectedSpoolId: "spool-8" }),
    "detail:spool-8",
  );
  assert.equal(
    companionOverlayKey({
      activeTaskSheet: {
        type: "printer-weight",
        printerId: "printer-2",
        slotId: "slot-3",
        mode: "update",
      },
    }),
    "task:printer-weight:::printer-2:slot-3:update",
  );
});

test("overlay lifecycle focuses initially, preserves focus on rerender, and restores the opener after transitions", () => {
  const harness = createHarness();
  const oldOpener = harness.createElement("button", {
    "data-action": "start-printer-slot-assignment",
    "data-printer-id": "printer-2",
    "data-slot-id": "slot-3",
  });
  harness.documentRef.activeElement = null;
  harness.documentRef.focusables = [oldOpener];

  const closeOne = harness.createElement("button", { "data-action": "close-task-sheet" });
  const summaryOne = harness.createElement("summary");
  const firstOverlay = harness.createOverlay([closeOne, summaryOne], closeOne);
  const lifecycle = createCompanionOverlayFocusLifecycle({
    documentRef: harness.documentRef,
  });

  assert.equal(lifecycle.rememberOpener(oldOpener), true);
  lifecycle.prepareForRender("task:printer-picker");
  harness.documentRef.overlay = firstOverlay;
  harness.documentRef.focusables = [closeOne, summaryOne];
  harness.documentRef.activeElement = null;
  assert.equal(lifecycle.restoreAfterRender("task:printer-picker"), true);
  assert.equal(harness.documentRef.activeElement, closeOne);

  summaryOne.focus();
  lifecycle.prepareForRender("task:printer-picker");
  const closeTwo = harness.createElement("button", { "data-action": "close-task-sheet" });
  const summaryTwo = harness.createElement("summary");
  harness.documentRef.overlay = harness.createOverlay([closeTwo, summaryTwo], closeTwo);
  harness.documentRef.focusables = [closeTwo, summaryTwo];
  harness.documentRef.activeElement = null;
  lifecycle.restoreAfterRender("task:printer-picker");
  assert.equal(harness.documentRef.activeElement, summaryTwo);

  lifecycle.prepareForRender("task:printer-weight");
  const transitionClose = harness.createElement("button", { "data-action": "close-task-sheet" });
  harness.documentRef.overlay = harness.createOverlay([transitionClose], transitionClose);
  harness.documentRef.focusables = [transitionClose];
  harness.documentRef.activeElement = null;
  lifecycle.restoreAfterRender("task:printer-weight");
  assert.equal(harness.documentRef.activeElement, transitionClose);

  lifecycle.prepareForRender("");
  const restoredOpener = harness.createElement("button", {
    "data-action": "start-printer-slot-assignment",
    "data-printer-id": "printer-2",
    "data-slot-id": "slot-3",
  });
  harness.documentRef.overlay = null;
  harness.documentRef.focusables = [restoredOpener];
  harness.documentRef.activeElement = null;
  assert.equal(lifecycle.restoreAfterRender(""), true);
  assert.equal(harness.documentRef.activeElement, restoredOpener);
});

test("overlay keydown traps Tab across buttons and summary controls and closes on Escape", () => {
  const harness = createHarness();
  const closeButton = harness.createElement("button", { "data-action": "close-detail" });
  const summary = harness.createElement("summary");
  harness.documentRef.overlay = harness.createOverlay([closeButton, summary], closeButton);
  harness.documentRef.focusables = [closeButton, summary];
  let closeCount = 0;
  const lifecycle = createCompanionOverlayFocusLifecycle({
    documentRef: harness.documentRef,
    closeOverlay() {
      closeCount += 1;
    },
  });

  assert.match(COMPANION_FOCUSABLE_SELECTOR, /summary/);

  harness.documentRef.activeElement = summary;
  let prevented = 0;
  assert.equal(
    lifecycle.handleKeydown({
      key: "Tab",
      preventDefault() {
        prevented += 1;
      },
    }),
    true,
  );
  assert.equal(harness.documentRef.activeElement, closeButton);

  assert.equal(
    lifecycle.handleKeydown({
      key: "Tab",
      shiftKey: true,
      preventDefault() {
        prevented += 1;
      },
    }),
    true,
  );
  assert.equal(harness.documentRef.activeElement, summary);

  let stopped = 0;
  assert.equal(
    lifecycle.handleKeydown({
      key: "Escape",
      preventDefault() {
        prevented += 1;
      },
      stopPropagation() {
        stopped += 1;
      },
    }),
    true,
  );
  assert.equal(closeCount, 1);
  assert.equal(prevented, 3);
  assert.equal(stopped, 1);
});

test("focusable collection keeps a closed details summary but excludes its hidden controls", () => {
  const closedDetails = {};
  const summary = {
    tagName: "SUMMARY",
    parentElement: closedDetails,
    getAttribute() {
      return null;
    },
    closest(selector) {
      return selector === "details:not([open])" ? closedDetails : null;
    },
  };
  const hiddenButton = {
    tagName: "BUTTON",
    getAttribute() {
      return null;
    },
    closest(selector) {
      return selector === "details:not([open])" ? closedDetails : null;
    },
  };
  const container = {
    querySelectorAll() {
      return [summary, hiddenButton];
    },
  };

  assert.deepEqual(companionFocusableElements(container), [summary]);
});

test("focusable collection excludes a nested summary hidden by an outer closed details", () => {
  const outerClosedDetails = {
    closest(selector) {
      return selector === "details:not([open])" ? this : null;
    },
  };
  const innerClosedDetailsParent = {
    closest(selector) {
      return selector === "details:not([open])" ? outerClosedDetails : null;
    },
  };
  const innerClosedDetails = {
    parentElement: innerClosedDetailsParent,
  };
  const hiddenNestedSummary = {
    tagName: "SUMMARY",
    parentElement: innerClosedDetails,
    getAttribute() {
      return null;
    },
    closest(selector) {
      return selector === "details:not([open])" ? innerClosedDetails : null;
    },
  };
  const container = {
    querySelectorAll() {
      return [hiddenNestedSummary];
    },
  };

  assert.deepEqual(companionFocusableElements(container), []);
});
