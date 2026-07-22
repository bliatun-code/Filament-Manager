function normalizeTagName(target) {
  return String(target?.tagName || target?.nodeName || "")
    .trim()
    .toUpperCase();
}

function normalizeControlType(target) {
  return String(target?.type || target?.getAttribute?.("type") || "")
    .trim()
    .toLowerCase();
}

function isNamedFormControl(target) {
  const tagName = normalizeTagName(target);
  if (!["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
    return false;
  }

  return String(target?.name || "").trim().length > 0;
}

function formControls(root) {
  if (typeof root?.querySelectorAll !== "function") {
    return [];
  }
  return ["input", "textarea", "select"].flatMap((selector) =>
    Array.from(root.querySelectorAll(selector)),
  );
}

function getOwningForm(target) {
  return target?.form || target?.closest?.("form") || null;
}

function getOwningFormAction(target) {
  const form = getOwningForm(target);
  if (!form || typeof form.getAttribute !== "function") {
    return "";
  }

  return String(form.getAttribute("data-action") || "").trim();
}

function getOwningFormKey(target) {
  const form = getOwningForm(target);
  if (!form || typeof form.getAttribute !== "function") {
    return "";
  }

  return String(form.getAttribute("data-form-key") || "").trim();
}

function hasTextSelection(target) {
  return (
    typeof target?.selectionStart === "number" &&
    typeof target?.selectionEnd === "number"
  );
}

function isCollapsibleDetails(target) {
  const tagName = normalizeTagName(target);
  if (tagName !== "DETAILS") {
    return false;
  }
  return typeof target?.getAttribute === "function" && String(target.getAttribute("data-collapsible") || "").trim().length > 0;
}

function captureOpenCollapsibles(root) {
  if (typeof root?.querySelectorAll !== "function") {
    return [];
  }
  return Array.from(root.querySelectorAll("details"))
    .filter((element) => isCollapsibleDetails(element) && Boolean(element.open))
    .map((element) => String(element.getAttribute("data-collapsible") || "").trim())
    .filter(Boolean);
}

function restoreOpenCollapsibles(root, openKeys) {
  if (!Array.isArray(openKeys) || !openKeys.length || typeof root?.querySelectorAll !== "function") {
    return;
  }
  const wanted = new Set(openKeys);
  Array.from(root.querySelectorAll("details")).forEach((element) => {
    if (!isCollapsibleDetails(element)) {
      return;
    }
    const key = String(element.getAttribute("data-collapsible") || "").trim();
    if (!key) {
      return;
    }
    element.open = wanted.has(key);
  });
}

function controlsShareIdentity(left, right) {
  return (
    normalizeTagName(left) === normalizeTagName(right) &&
    String(left?.name || "").trim() === String(right?.name || "").trim() &&
    normalizeControlType(left) === normalizeControlType(right) &&
    getOwningFormAction(left) === getOwningFormAction(right) &&
    getOwningFormKey(left) === getOwningFormKey(right)
  );
}

function matchingControlIndex(controls, target) {
  const targetIndex = controls.indexOf(target);
  if (targetIndex < 0) {
    return 0;
  }
  return controls
    .slice(0, targetIndex)
    .filter((candidate) => controlsShareIdentity(candidate, target)).length;
}

function selectValues(control, property) {
  return Array.from(control?.options || [])
    .filter((option) => Boolean(option?.[property]))
    .map((option) => String(option?.value ?? ""));
}

function defaultSelectValues(control) {
  const defaults = selectValues(control, "defaultSelected");
  if (defaults.length > 0 || control?.multiple) {
    return defaults;
  }
  const firstOption = Array.from(control?.options || [])[0];
  return firstOption ? [String(firstOption.value ?? "")] : [];
}

function stringArraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stringSetsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function captureDirtyFormControls(root) {
  const controls = formControls(root);
  const snapshots = [];
  for (const control of controls) {
    if (!isNamedFormControl(control) || normalizeControlType(control) === "file") {
      continue;
    }
    const type = normalizeControlType(control);
    const checkedControl = type === "checkbox" || type === "radio";
    const checked = checkedControl ? Boolean(control.checked) : null;
    const defaultChecked = checkedControl ? Boolean(control.defaultChecked) : null;
    const selectedValues = normalizeTagName(control) === "SELECT"
      ? selectValues(control, "selected")
      : null;
    const defaultSelectedValues = selectedValues ? defaultSelectValues(control) : null;
    const value = typeof control.value === "string" ? control.value : "";
    const defaultValue = typeof control.defaultValue === "string" ? control.defaultValue : value;
    const pristine = checkedControl
      ? checked === defaultChecked
      : selectedValues
        ? stringArraysEqual(selectedValues, defaultSelectedValues)
        : value === defaultValue;
    if (pristine) {
      continue;
    }
    snapshots.push({
      checked,
      defaultChecked,
      defaultSelectedValues,
      defaultValue,
      formAction: getOwningFormAction(control),
      formKey: getOwningFormKey(control),
      matchIndex: matchingControlIndex(controls, control),
      name: String(control.name || "").trim(),
      selectedValues,
      tagName: normalizeTagName(control),
      type,
      value,
    });
  }
  return snapshots;
}

function replacementKeepsPreviousDefault(control, snapshot) {
  if (snapshot.checked !== null) {
    return Boolean(control.defaultChecked) === snapshot.defaultChecked;
  }
  if (Array.isArray(snapshot.selectedValues)) {
    return stringSetsEqual(
      defaultSelectValues(control),
      snapshot.defaultSelectedValues || [],
    );
  }
  const defaultValue =
    typeof control.defaultValue === "string" ? control.defaultValue : control.value;
  return defaultValue === snapshot.defaultValue;
}

function restoreDirtyFormControls(root, snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return;
  }
  const controls = formControls(root);
  for (const snapshot of snapshots) {
    const matching = controls.filter((candidate) => {
      if (!isNamedFormControl(candidate)) {
        return false;
      }
      return (
        normalizeTagName(candidate) === snapshot.tagName &&
        String(candidate.name || "").trim() === snapshot.name &&
        normalizeControlType(candidate) === snapshot.type &&
        getOwningFormAction(candidate) === snapshot.formAction &&
        getOwningFormKey(candidate) === snapshot.formKey
      );
    });
    const control = matching[snapshot.matchIndex] || null;
    if (!control || control.disabled || !replacementKeepsPreviousDefault(control, snapshot)) {
      continue;
    }
    if (snapshot.checked !== null) {
      control.checked = snapshot.checked;
    } else if (Array.isArray(snapshot.selectedValues)) {
      const options = Array.from(control.options || []);
      const wanted = new Set(snapshot.selectedValues);
      if (wanted.size > 0 && !options.some((option) => wanted.has(String(option.value ?? "")))) {
        continue;
      }
      for (const option of options) {
        option.selected = wanted.has(String(option.value ?? ""));
      }
      if (!control.multiple && typeof control.value === "string") {
        control.value = snapshot.value;
      }
    } else if (typeof control.value === "string") {
      control.value = snapshot.value;
    }
  }
}

export function captureFocusedFormControl(root, documentRef) {
  const activeElement = documentRef?.activeElement;
  if (!activeElement || typeof root?.contains !== "function" || !root.contains(activeElement)) {
    return null;
  }

  if (!isNamedFormControl(activeElement)) {
    return null;
  }

  const controls = formControls(root);
  return {
    tagName: normalizeTagName(activeElement),
    name: String(activeElement.name || "").trim(),
    type: normalizeControlType(activeElement),
    formAction: getOwningFormAction(activeElement),
    formKey: getOwningFormKey(activeElement),
    matchIndex: matchingControlIndex(controls, activeElement),
    selectionStart: hasTextSelection(activeElement) ? activeElement.selectionStart : null,
    selectionEnd: hasTextSelection(activeElement) ? activeElement.selectionEnd : null,
    selectionDirection: hasTextSelection(activeElement)
      ? String(activeElement.selectionDirection || "none")
      : "none",
  };
}

function findMatchingControl(root, snapshot) {
  if (!snapshot || typeof root?.querySelectorAll !== "function") {
    return null;
  }

  const candidates = Array.from(root.querySelectorAll(snapshot.tagName.toLowerCase()));
  const matching = candidates.filter((candidate) => {
      if (!isNamedFormControl(candidate)) {
        return false;
      }
      if (String(candidate.name || "").trim() !== snapshot.name) {
        return false;
      }

      const candidateType = normalizeControlType(candidate);
      if (snapshot.type && candidateType && candidateType !== snapshot.type) {
        return false;
      }

      if ((snapshot.formAction || "") !== getOwningFormAction(candidate)) {
        return false;
      }

      if ((snapshot.formKey || "") !== getOwningFormKey(candidate)) {
        return false;
      }

      return true;
    });
  return matching[snapshot.matchIndex || 0] || null;
}

function restoreSelection(target, snapshot) {
  if (
    !target ||
    typeof target.setSelectionRange !== "function" ||
    typeof target.value !== "string" ||
    typeof snapshot?.selectionStart !== "number" ||
    typeof snapshot?.selectionEnd !== "number"
  ) {
    return;
  }

  const valueLength = target.value.length;
  const start = Math.max(0, Math.min(snapshot.selectionStart, valueLength));
  const end = Math.max(start, Math.min(snapshot.selectionEnd, valueLength));

  try {
    target.setSelectionRange(start, end, snapshot.selectionDirection || "none");
  } catch {
    target.setSelectionRange(start, end);
  }
}

export function restoreFocusedFormControl(root, snapshot) {
  const control = findMatchingControl(root, snapshot);
  if (!control || control.disabled || typeof control.focus !== "function") {
    return false;
  }

  try {
    control.focus({ preventScroll: true });
  } catch {
    control.focus();
  }

  restoreSelection(control, snapshot);
  return true;
}

export function renderMarkupPreservingFocus({ root, documentRef, markup }) {
  const snapshot = captureFocusedFormControl(root, documentRef);
  const dirtyFormControls = captureDirtyFormControls(root);
  const openCollapsibles = captureOpenCollapsibles(root);
  root.innerHTML = markup;
  restoreOpenCollapsibles(root, openCollapsibles);
  restoreDirtyFormControls(root, dirtyFormControls);
  return restoreFocusedFormControl(root, snapshot);
}
