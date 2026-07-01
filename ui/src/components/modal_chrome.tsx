import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CloseButton } from "./close_button";

export const modalEyebrowClassName =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400";

export const modalDetailLabelClassName =
  "text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";

export const modalHeaderActionButtonClassName =
  "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200/80 bg-white/85 px-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-200/25 outline-none backdrop-blur-sm transition hover:bg-slate-50 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-800/70 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20 sm:text-sm";

type ModalHeaderActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function ModalHeaderActionButton({
  children,
  className,
  type = "button",
  ...buttonProps
}: ModalHeaderActionButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={[modalHeaderActionButtonClassName, className ?? ""].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
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
            <div className={modalEyebrowClassName}>
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
