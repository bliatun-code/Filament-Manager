import test from "node:test";
import assert from "node:assert/strict";

import {
  captureFocusedFormControl,
  renderMarkupPreservingFocus,
  restoreFocusedFormControl,
} from "./companion_render_focus.js";

function createForm(action, key = "") {
  return {
    getAttribute(name) {
      if (name === "data-action") {
        return action;
      }
      return name === "data-form-key" ? key : null;
    },
  };
}

function createInput({
  name = "filament-catalog-search",
  type = "search",
  value = "",
  defaultValue = value,
  formAction = "add-spool-form",
  formKey = "",
} = {}) {
  const form = createForm(formAction, formKey);
  return {
    tagName: "INPUT",
    name,
    type,
    value,
    defaultValue,
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

function createSelect({
  defaultValues = ["IN_STOCK"],
  formAction = "update-spool-details-form",
  formKey = "",
  multiple = false,
  name = "status",
  selectedValues = defaultValues,
  values = ["IN_STOCK", "EMPTY"],
} = {}) {
  const form = createForm(formAction, formKey);
  const options = values.map((value) => ({
    defaultSelected: defaultValues.includes(value),
    selected: selectedValues.includes(value),
    value,
  }));
  return {
    tagName: "SELECT",
    name,
    type: multiple ? "select-multiple" : "select-one",
    multiple,
    value: selectedValues[0] ?? "",
    options,
    form,
    disabled: false,
    focusCalls: [],
    closest(selector) {
      return selector === "form" ? form : null;
    },
    getAttribute(name) {
      return name === "type" ? this.type : null;
    },
    focus(options) {
      this.focusCalls.push(options);
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
      const normalizedSelector = String(selector || "").trim().toUpperCase();
      return elements.filter((element) => {
        const tag = String(element.tagName || "").toUpperCase();
        return tag === normalizedSelector;
      });
    },
    set innerHTML(value) {
      this.markup = value;
      elements = [...afterElements];
    },
  };
}

function createDetails(key, open = false) {
  return {
    tagName: "DETAILS",
    open,
    getAttribute(name) {
      return name === "data-collapsible" ? key : null;
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
    formKey: "",
    matchIndex: 0,
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

test("renderMarkupPreservingFocus preserves dirty form values across unrelated rerenders", () => {
  const oldInput = createInput({
    defaultValue: "913",
    formAction: "update-weight-form",
    name: "grams",
    type: "number",
    value: "777",
  });
  const replacementInput = createInput({
    defaultValue: "913",
    formAction: "update-weight-form",
    name: "grams",
    type: "number",
    value: "913",
  });
  const root = createRoot([oldInput], [replacementInput]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: oldInput },
    markup: "<input />",
  });

  assert.equal(replacementInput.value, "777");
  assert.deepEqual(replacementInput.selectionCalls, [[3, 3, "none"]]);
});

test("renderMarkupPreservingFocus does not revive a dirty search after an explicit reset", () => {
  const oldInput = createInput({
    defaultValue: "ABS",
    formAction: "inventory-search-form",
    name: "inventory-search",
    value: "ABS Blue",
  });
  const replacementInput = createInput({
    defaultValue: "",
    formAction: "inventory-search-form",
    name: "inventory-search",
    value: "",
  });
  const root = createRoot([oldInput], [replacementInput]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: oldInput },
    markup: "<input />",
  });

  assert.equal(replacementInput.value, "");
});

test("renderMarkupPreservingFocus lets pristine controls receive fresh rendered values", () => {
  const oldInput = createInput({ value: "913" });
  const replacementInput = createInput({ value: "900" });
  const root = createRoot([oldInput], [replacementInput]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: null },
    markup: "<input />",
  });

  assert.equal(replacementInput.value, "900");
});

test("renderMarkupPreservingFocus preserves a dirty select value", () => {
  const oldSelect = createSelect({ selectedValues: ["EMPTY"] });
  const replacementSelect = createSelect();
  const root = createRoot([oldSelect], [replacementSelect]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: oldSelect },
    markup: "<select></select>",
  });

  assert.equal(replacementSelect.value, "EMPTY");
  assert.deepEqual(
    replacementSelect.options.map(({ selected }) => selected),
    [false, true],
  );
});

test("renderMarkupPreservingFocus preserves every dirty multi-select value", () => {
  const oldSelect = createSelect({
    defaultValues: ["IN_STOCK"],
    multiple: true,
    selectedValues: ["EMPTY", "LOST"],
    values: ["IN_STOCK", "EMPTY", "LOST"],
  });
  const replacementSelect = createSelect({
    defaultValues: ["IN_STOCK"],
    multiple: true,
    values: ["IN_STOCK", "EMPTY", "LOST"],
  });
  const root = createRoot([oldSelect], [replacementSelect]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: oldSelect },
    markup: "<select multiple></select>",
  });

  assert.deepEqual(
    replacementSelect.options.map(({ selected }) => selected),
    [false, true, true],
  );
});

test("renderMarkupPreservingFocus accepts an intentional rendered select change", () => {
  const oldSelect = createSelect({ selectedValues: ["EMPTY"] });
  const replacementSelect = createSelect({
    defaultValues: ["LOST"],
    selectedValues: ["LOST"],
    values: ["IN_STOCK", "EMPTY", "LOST"],
  });
  const root = createRoot([oldSelect], [replacementSelect]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: oldSelect },
    markup: "<select></select>",
  });

  assert.equal(replacementSelect.value, "LOST");
  assert.deepEqual(
    replacementSelect.options.map(({ selected }) => selected),
    [false, false, true],
  );
});

test("renderMarkupPreservingFocus preserves dirty values by stable form key after reorder", () => {
  const oldFirst = createInput({
    formAction: "wishlist-stock-form",
    formKey: "wishlist-stock:first",
    name: "received-quantity",
    type: "number",
    value: "1",
  });
  const oldSecond = createInput({
    defaultValue: "1",
    formAction: "wishlist-stock-form",
    formKey: "wishlist-stock:second",
    name: "received-quantity",
    type: "number",
    value: "3",
  });
  const newSecond = createInput({
    formAction: "wishlist-stock-form",
    formKey: "wishlist-stock:second",
    name: "received-quantity",
    type: "number",
    value: "1",
  });
  const newFirst = createInput({
    formAction: "wishlist-stock-form",
    formKey: "wishlist-stock:first",
    name: "received-quantity",
    type: "number",
    value: "1",
  });
  const root = createRoot([oldFirst, oldSecond], [newSecond, newFirst]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: null },
    markup: "<input /><input />",
  });

  assert.equal(newSecond.value, "3");
  assert.equal(newFirst.value, "1");
});

test("renderMarkupPreservingFocus restores focus to the same repeated control", () => {
  const oldFirst = createInput({ name: "received-quantity", value: "1" });
  const oldSecond = createInput({ name: "received-quantity", value: "2" });
  const newFirst = createInput({ name: "received-quantity", value: "1" });
  const newSecond = createInput({ name: "received-quantity", value: "2" });
  const root = createRoot([oldFirst, oldSecond], [newFirst, newSecond]);

  renderMarkupPreservingFocus({
    root,
    documentRef: { activeElement: oldSecond },
    markup: "<input /><input />",
  });

  assert.deepEqual(newFirst.focusCalls, []);
  assert.deepEqual(newSecond.focusCalls, [{ preventScroll: true }]);
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

test("renderMarkupPreservingFocus restores open collapsible details sections after rerender", () => {
  const oldDetails = createDetails("details", true);
  const oldHistory = createDetails("history", false);
  const newDetails = createDetails("details", false);
  const newHistory = createDetails("history", false);
  const root = createRoot([oldDetails, oldHistory], [newDetails, newHistory]);

  const restored = renderMarkupPreservingFocus({
    root,
    documentRef: {
      activeElement: null,
    },
    markup: "<details></details>",
  });

  assert.equal(restored, false);
  assert.equal(newDetails.open, true);
  assert.equal(newHistory.open, false);
});
