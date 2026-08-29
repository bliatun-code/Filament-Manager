import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { AppModalTitleIdContext } from "./app_modal_context";
import { modalFocusableElements, resolveAppModalTabTarget } from "./app_modal_focus";

type AppModalProps = {
  ariaLabel?: string;
  children: ReactNode;
  zIndex?: number;
  closeOnBackdrop?: boolean;
  onBackdropClose?: () => void;
  overlayClassName?: string;
  panelClassName?: string;
};

export function AppModal({
  ariaLabel,
  children,
  zIndex = 50,
  closeOnBackdrop = false,
  onBackdropClose,
  overlayClassName,
  panelClassName,
}: AppModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const overlayClasses =
    overlayClassName ??
    "app-modal-overlay fixed inset-0 flex items-center justify-center px-4 py-6 backdrop-blur-md";
  const panelClasses =
    panelClassName ??
    "app-modal-panel max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border p-5 backdrop-blur-xl";

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    if (!panel.contains(document.activeElement)) {
      (modalFocusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
    }

    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (onBackdropClose) {
        event.preventDefault();
        onBackdropClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    event.stopPropagation();
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const focusableElements = modalFocusableElements(panel);
    const activeIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
    const target = resolveAppModalTabTarget({
      activeIndex,
      focusableCount: focusableElements.length,
      shiftKey: event.shiftKey,
    });
    if (!target) {
      return;
    }

    event.preventDefault();
    if (target === "panel") {
      panel.focus({ preventScroll: true });
    } else if (target === "first") {
      focusableElements[0]?.focus({ preventScroll: true });
    } else {
      focusableElements.at(-1)?.focus({ preventScroll: true });
    }
  };

  return (
    <AppModalTitleIdContext.Provider value={titleId}>
      <div
        className={overlayClasses}
        style={{ zIndex }}
        onClick={
          closeOnBackdrop && onBackdropClose
            ? () => {
                onBackdropClose();
              }
            : undefined
        }
        onKeyDown={handleKeyDown}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : titleId}
          tabIndex={-1}
          className={panelClasses}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </AppModalTitleIdContext.Provider>
  );
}
