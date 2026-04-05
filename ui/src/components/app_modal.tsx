import { type ReactNode } from "react";

type AppModalProps = {
  children: ReactNode;
  zIndex?: number;
  closeOnBackdrop?: boolean;
  onBackdropClose?: () => void;
  overlayClassName?: string;
  panelClassName?: string;
};

export function AppModal({
  children,
  zIndex = 50,
  closeOnBackdrop = false,
  onBackdropClose,
  overlayClassName,
  panelClassName,
}: AppModalProps) {
  const overlayClasses =
    overlayClassName ??
    "fixed inset-0 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-md dark:bg-black/50";
  const panelClasses =
    panelClassName ??
    "w-full max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45";

  return (
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
    >
      <div className={panelClasses} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
