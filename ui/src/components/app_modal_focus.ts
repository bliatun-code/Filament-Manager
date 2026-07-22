export const APP_MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "summary",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type AppModalTabTarget = "first" | "last" | "panel" | null;

export function resolveAppModalTabTarget({
  activeIndex,
  focusableCount,
  shiftKey,
}: {
  activeIndex: number;
  focusableCount: number;
  shiftKey: boolean;
}): AppModalTabTarget {
  if (focusableCount <= 0) {
    return "panel";
  }
  if (shiftKey) {
    return activeIndex <= 0 ? "last" : null;
  }
  return activeIndex < 0 || activeIndex >= focusableCount - 1 ? "first" : null;
}

export function modalFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(APP_MODAL_FOCUSABLE_SELECTOR)).filter(
    (element) => {
      const style = window.getComputedStyle(element);
      return (
        element.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
      );
    },
  );
}
