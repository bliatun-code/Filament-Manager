import type { ReactNode } from "react";

type ModalPanelWidth = "md" | "lg" | "xl" | "wide";

const widthClassName: Record<ModalPanelWidth, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-3xl",
  wide: "max-w-5xl",
};

export function modalPanelClassName(
  width: ModalPanelWidth,
  extraClassName = "p-5",
): string {
  return [
    "w-full overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-2xl shadow-slate-300/22 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/94 dark:shadow-black/45",
    widthClassName[width],
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

type ModalHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose?: () => void;
  disabled?: boolean;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  aside?: ReactNode;
};

export function ModalHeader({
  eyebrow,
  title,
  subtitle,
  closeLabel,
  onClose,
  disabled = false,
  className,
  titleClassName,
  subtitleClassName,
  aside,
}: ModalHeaderProps) {
  return (
    <div
      className={[
        "border-b border-slate-200/80 bg-white/92 px-5 py-4 dark:border-slate-800/70 dark:bg-slate-950/55 sm:px-6",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {eyebrow}
            </div>
          ) : null}
          <div
            className={[
              "font-semibold tracking-tight text-slate-950 dark:text-slate-50",
              eyebrow ? "mt-1 text-xl" : "text-lg",
              titleClassName ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              className={[
                "mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300",
                subtitleClassName ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-2">
          {aside}
          {onClose ? (
            <button
              type="button"
              onClick={disabled ? undefined : onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-base leading-none text-slate-600 shadow-sm shadow-slate-200/30 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-800/70"
              aria-label={closeLabel}
              title={closeLabel}
              disabled={disabled}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
