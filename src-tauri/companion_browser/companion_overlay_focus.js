export const COMPANION_OVERLAY_SELECTOR = "[data-companion-overlay]";

export const COMPANION_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

const IDENTITY_ATTRIBUTES = [
  "data-action",
  "data-root-flow",
  "data-spool-id",
  "data-loan-id",
  "data-printer-id",
  "data-slot-id",
  "data-slot-index",
  "data-master-id",
  "data-source",
  "data-mode",
  "data-status",
  "data-locale",
  "data-loan-status",
  "data-catalog-filter",
  "data-filament-source",
  "data-wishlist-filter",
  "data-ownership-type",
  "data-theme-mode",
  "data-wishlist-id",
  "data-printer-task-mode",
];

function normalizeValue(value) {
  return String(value ?? "").trim();
}

function elementTagName(element) {
  return normalizeValue(element?.tagName || element?.nodeName).toUpperCase();
}

function elementAttribute(element, name) {
  if (typeof element?.getAttribute !== "function") {
    return "";
  }
  return normalizeValue(element.getAttribute(name));
}

function focusWithoutScrolling(element) {
  if (!element || typeof element.focus !== "function") {
    return false;
  }
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
  return true;
}

function isElementUnavailable(element) {
  if (!element || element.disabled || element.hidden) {
    return true;
  }
  if (elementAttribute(element, "aria-hidden") === "true") {
    return true;
  }
  if (typeof element.closest === "function") {
    if (element.closest('[hidden], [aria-hidden="true"], [inert]')) {
      return true;
    }
    const closedDetails = element.closest("details:not([open])");
    if (closedDetails) {
      const isClosedDetailsSummary =
        elementTagName(element) === "SUMMARY" && element.parentElement === closedDetails;
      if (!isClosedDetailsSummary) {
        return true;
      }
      if (closedDetails.parentElement?.closest?.("details:not([open])")) {
        return true;
      }
    }
  }
  return false;
}

export function companionFocusableElements(container) {
  if (typeof container?.querySelectorAll !== "function") {
    return [];
  }
  return Array.from(container.querySelectorAll(COMPANION_FOCUSABLE_SELECTOR)).filter(
    (element) => !isElementUnavailable(element),
  );
}

function captureElementIdentity(element, container) {
  if (!element) {
    return null;
  }
  const focusableElements = companionFocusableElements(container);
  const focusableIndex = focusableElements.indexOf(element);
  const attributes = {};
  for (const name of IDENTITY_ATTRIBUTES) {
    const value = elementAttribute(element, name);
    if (value) {
      attributes[name] = value;
    }
  }
  return {
    tagName: elementTagName(element),
    id: normalizeValue(element.id || elementAttribute(element, "id")),
    name: normalizeValue(element.name || elementAttribute(element, "name")),
    attributes,
    focusableIndex,
  };
}

function isRestorableIdentity(snapshot) {
  return Boolean(
    snapshot &&
      (snapshot.focusableIndex >= 0 ||
        snapshot.id ||
        snapshot.name ||
        Object.keys(snapshot.attributes || {}).length),
  );
}

function elementMatchesIdentity(element, snapshot) {
  if (!snapshot || elementTagName(element) !== snapshot.tagName) {
    return false;
  }
  if (snapshot.id && normalizeValue(element.id || elementAttribute(element, "id")) !== snapshot.id) {
    return false;
  }
  if (snapshot.name && normalizeValue(element.name || elementAttribute(element, "name")) !== snapshot.name) {
    return false;
  }
  return Object.entries(snapshot.attributes || {}).every(
    ([name, value]) => elementAttribute(element, name) === value,
  );
}

function findElementByIdentity(container, snapshot) {
  if (!snapshot) {
    return null;
  }
  const focusableElements = companionFocusableElements(container);
  const hasStableIdentity = Boolean(
    snapshot.id || snapshot.name || Object.keys(snapshot.attributes || {}).length,
  );
  if (hasStableIdentity) {
    const matchingElement = focusableElements.find((element) => elementMatchesIdentity(element, snapshot));
    if (matchingElement) {
      return matchingElement;
    }
    return null;
  }
  if (snapshot.focusableIndex >= 0 && snapshot.focusableIndex < focusableElements.length) {
    return focusableElements[snapshot.focusableIndex];
  }
  return null;
}

function currentOverlay(documentRef) {
  return documentRef?.querySelector?.(COMPANION_OVERLAY_SELECTOR) || null;
}

function initialOverlayFocusTarget(overlay) {
  const explicitTarget = overlay?.querySelector?.("[data-overlay-initial-focus]");
  if (explicitTarget && !isElementUnavailable(explicitTarget)) {
    return explicitTarget;
  }
  const autofocusTarget = overlay?.querySelector?.("[autofocus]");
  if (autofocusTarget && !isElementUnavailable(autofocusTarget)) {
    return autofocusTarget;
  }
  return companionFocusableElements(overlay)[0] || overlay;
}

function activeElementIsInside(container, documentRef) {
  const activeElement = documentRef?.activeElement;
  return Boolean(activeElement && typeof container?.contains === "function" && container.contains(activeElement));
}

export function companionOverlayKey(state) {
  if (state?.detailOpen) {
    return `detail:${normalizeValue(state.selectedSpoolId) || "pending"}`;
  }
  const taskSheet = state?.activeTaskSheet;
  if (!taskSheet) {
    return "";
  }
  return [
    "task",
    normalizeValue(taskSheet.type) || "unknown",
    normalizeValue(taskSheet.loanId),
    normalizeValue(taskSheet.spoolId),
    normalizeValue(taskSheet.printerId),
    normalizeValue(taskSheet.slotId),
    normalizeValue(taskSheet.mode),
  ].join(":");
}

export function createCompanionOverlayFocusLifecycle(options) {
  const { documentRef } = options;
  let renderedOverlayKey = "";
  let openerSnapshot = null;
  let overlayFocusSnapshot = null;

  function prepareForRender(nextOverlayKey = "") {
    const normalizedNextKey = normalizeValue(nextOverlayKey);
    const overlay = currentOverlay(documentRef);
    const activeElement = documentRef?.activeElement || null;

    if (!renderedOverlayKey && normalizedNextKey) {
      const activeElementSnapshot = captureElementIdentity(activeElement, documentRef);
      if (isRestorableIdentity(activeElementSnapshot)) {
        openerSnapshot = activeElementSnapshot;
      }
    }

    overlayFocusSnapshot = null;
    if (
      renderedOverlayKey &&
      normalizedNextKey === renderedOverlayKey &&
      overlay &&
      activeElementIsInside(overlay, documentRef)
    ) {
      overlayFocusSnapshot = captureElementIdentity(activeElement, overlay);
    }
  }

  function rememberOpener(element) {
    if (renderedOverlayKey || currentOverlay(documentRef)) {
      return false;
    }
    const snapshot = captureElementIdentity(element, documentRef);
    if (!isRestorableIdentity(snapshot)) {
      return false;
    }
    openerSnapshot = snapshot;
    return true;
  }

  function restoreAfterRender(nextOverlayKey = "") {
    const normalizedNextKey = normalizeValue(nextOverlayKey);
    const previousOverlayKey = renderedOverlayKey;
    renderedOverlayKey = normalizedNextKey;

    if (!normalizedNextKey) {
      const opener = findElementByIdentity(documentRef, openerSnapshot);
      openerSnapshot = null;
      overlayFocusSnapshot = null;
      return focusWithoutScrolling(opener);
    }

    const overlay = currentOverlay(documentRef);
    if (!overlay) {
      return false;
    }
    if (activeElementIsInside(overlay, documentRef)) {
      overlayFocusSnapshot = null;
      return true;
    }

    if (normalizedNextKey === previousOverlayKey && overlayFocusSnapshot) {
      const restoredTarget = findElementByIdentity(overlay, overlayFocusSnapshot);
      overlayFocusSnapshot = null;
      if (focusWithoutScrolling(restoredTarget)) {
        return true;
      }
    }

    overlayFocusSnapshot = null;
    return focusWithoutScrolling(initialOverlayFocusTarget(overlay));
  }

  function handleKeydown(event) {
    const overlay = currentOverlay(documentRef);
    if (!overlay) {
      return false;
    }

    if (event?.key === "Escape") {
      event.preventDefault?.();
      event.stopPropagation?.();
      options.closeOverlay?.();
      return true;
    }

    if (event?.key !== "Tab") {
      return false;
    }

    const focusableElements = companionFocusableElements(overlay);
    if (!focusableElements.length) {
      event.preventDefault?.();
      focusWithoutScrolling(overlay);
      return true;
    }

    const activeElement = documentRef?.activeElement;
    const activeIndex = focusableElements.indexOf(activeElement);
    const shouldWrapBackward = Boolean(event.shiftKey) && activeIndex <= 0;
    const shouldWrapForward = !event.shiftKey && activeIndex === focusableElements.length - 1;
    const focusIsOutside = activeIndex === -1;
    if (!shouldWrapBackward && !shouldWrapForward && !focusIsOutside) {
      return false;
    }

    event.preventDefault?.();
    const target = shouldWrapBackward
      ? focusableElements[focusableElements.length - 1]
      : focusableElements[0];
    focusWithoutScrolling(target);
    return true;
  }

  return {
    handleKeydown,
    prepareForRender,
    rememberOpener,
    restoreAfterRender,
  };
}
