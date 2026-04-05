import test from "node:test";
import assert from "node:assert/strict";

import {
  captureFocusedFormControl,
  renderMarkupPreservingFocus,
  restoreFocusedFormControl,
} from "./companion_render_focus.js";

function createForm(action) {
  return {
    getAttribute(name) {
      return name === "data-action" ? action : null;
    },
  };
}

function createInput({
  name = "filament-catalog-search",
  type = "search",
  value = "",
  formAction = "add-spool-form",
} = {}) {
  const form = createForm(formAction);
  return {
    tagName: "INPUT",
    name,
    type,
    value,
    form,
    disabled: false,
    selectionStart: value.length,
    selectionEnd: value.length,
    selectionDirection: "none",
    focusCalls: [],
    selectionCalls: [],
    closest(selector) {
      return selector === "form" ? form : null;
    },
    getAttribute(name) {
      return name === "type" ? type : null;
    },
    focus(options) {
      this.focusCalls.push(options);
    },
    setSelectionRange(start, end, direction) {
      this.selectionCalls.push([start, end, direction]);
    },
  };
}

function createRoot(beforeElements, afterElements = beforeElements) {
  let elements = [...beforeElements];
  return {
    contains(target) {
      return elements.includes(target);
    },
    querySelectorAll(selector) {
      const expectedTag = String(selector || "").trim().toUpperCase();
      return elements.filter((element) => String(element.tagName || "").toUpperCase() === expectedTag);
    },
    set innerHTML(value) {
      this.markup = value;
      elements = [...afterElements];
    },
  };
}

test("captureFocusedFormControl records the active named form control inside the app root", () => {
  const input = createInput({ value: "ABS" });
  input.selectionStart = 1;
  input.selectionEnd = 3;
  const root = createRoot([input]);

  const snapshot = captureFocusedFormControl(root, {
    activeElement: input,
  });

  assert.deepEqual(snapshot, {
    tagName: "INPUT",
    name: "filament-catalog-search",
    type: "search",
    formAction: "add-spool-form",
    selectionStart: 1,
    selectionEnd: 3,
    selectionDirection: "none",
  });
});

test("renderMarkupPreservingFocus restores focus and caret to a replacement search input", () => {
  const oldInput = createInput({ value: "ABS Blue" });
  oldInput.selectionStart = 4;
  oldInput.selectionEnd = 4;
  const replacementInput = createInput({ value: "ABS Blue" });
  const root = createRoot([oldInput], [replacementInput]);

  const restored = renderMarkupPreservingFocus({
    root,
    documentRef: {
      activeElement: oldInput,
    },
    markup: "<input />",
  });

  assert.equal(restored, true);
  assert.equal(root.markup, "<input />");
  assert.deepEqual(replacementInput.focusCalls, [{ preventScroll: true }]);
  assert.deepEqual(replacementInput.selectionCalls, [[4, 4, "none"]]);
});

test("restoreFocusedFormControl returns false when the replacement control is missing", () => {
  const root = createRoot([]);
  const restored = restoreFocusedFormControl(root, {
    tagName: "INPUT",
    name: "filament-catalog-search",
    type: "search",
    formAction: "add-spool-form",
    selectionStart: 0,
    selectionEnd: 0,
    selectionDirection: "none",
  });

  assert.equal(restored, false);
});
