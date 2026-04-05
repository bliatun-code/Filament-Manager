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

function getOwningFormAction(target) {
  const form = target?.form || target?.closest?.("form");
  if (!form || typeof form.getAttribute !== "function") {
    return "";
  }

  return String(form.getAttribute("data-action") || "").trim();
}

function hasTextSelection(target) {
  return (
    typeof target?.selectionStart === "number" &&
    typeof target?.selectionEnd === "number"
  );
}

export function captureFocusedFormControl(root, documentRef) {
  const activeElement = documentRef?.activeElement;
  if (!activeElement || typeof root?.contains !== "function" || !root.contains(activeElement)) {
    return null;
  }

  if (!isNamedFormControl(activeElement)) {
    return null;
  }

  return {
    tagName: normalizeTagName(activeElement),
    name: String(activeElement.name || "").trim(),
    type: normalizeControlType(activeElement),
    formAction: getOwningFormAction(activeElement),
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
  return (
    candidates.find((candidate) => {
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

      if (snapshot.formAction && getOwningFormAction(candidate) !== snapshot.formAction) {
        return false;
      }

      return true;
    }) || null
  );
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
  root.innerHTML = markup;
  return restoreFocusedFormControl(root, snapshot);
}
