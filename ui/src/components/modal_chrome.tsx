import type { ReactNode } from "react";
import { CloseButton } from "./close_button";

export const modalDetailLabelClassName =
  "text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";

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
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
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
            <CloseButton label={closeLabel} onClick={onClose} disabled={disabled} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
