import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { CloseButton } from "./close_button";
import { appSoftButtonClassName, joinClassNames } from "./ui_class_names";

export const modalEyebrowClassName =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400";

export const modalDetailLabelClassName =
  "text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";

export const modalDetailValueClassName =
  "mt-1 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50";

export const modalFormLabelClassName =
  "block text-xs font-medium text-slate-600 dark:text-slate-300";

export const modalFormHintClassName =
  "mt-1 block text-[11px] leading-5 text-slate-500 dark:text-slate-400";

const modalHeaderActionButtonClassName =
  joinClassNames(appSoftButtonClassName, "h-10 whitespace-nowrap px-3 text-xs sm:text-sm");

export const modalFactCardClassName =
  "rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60";

export const modalNoticeClassName =
  "rounded-xl border px-4 py-3 text-sm leading-6";

type ModalNoticeTone = "danger" | "info" | "neutral" | "success" | "warning";

const modalNoticeToneClass: Record<ModalNoticeTone, string> = {
  danger:
    "border-rose-200/85 bg-rose-50/92 text-rose-900 dark:border-rose-400/40 dark:bg-rose-500/14 dark:text-rose-100",
  info:
    "border-sky-200/85 bg-sky-50/92 text-sky-900 dark:border-sky-400/40 dark:bg-sky-500/14 dark:text-sky-100",
  neutral:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
  success:
    "border-emerald-200/85 bg-emerald-50/92 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/14 dark:text-emerald-100",
  warning:
    "border-amber-200/80 bg-amber-50/90 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100",
};

type ModalHeaderActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

type ModalFormFieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
};

type ModalBodyProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  overscrollContain?: boolean;
  scroll?: boolean;
};

type ModalFooterProps = HTMLAttributes<HTMLDivElement> & {
  border?: boolean;
  children: ReactNode;
  shrink?: boolean;
};

export function ModalFormField({
  children,
  className,
  hint,
  label,
  ...labelProps
}: ModalFormFieldProps) {
  return (
    <label
      {...labelProps}
      className={joinClassNames(modalFormLabelClassName, className)}
    >
      <span>{label}</span>
      {hint ? (
        <span className={modalFormHintClassName}>
          {hint}
        </span>
      ) : null}
      {children}
    </label>
  );
}

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
      className={joinClassNames(modalHeaderActionButtonClassName, className)}
    >
      {children}
    </button>
  );
}

export function ModalBody({
  children,
  className,
  overscrollContain = false,
  scroll = true,
  ...divProps
}: ModalBodyProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(
        "min-h-0 flex-1",
        scroll ? "overflow-y-auto" : "overflow-hidden",
        overscrollContain ? "overscroll-contain" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ModalFooter({
  border = true,
  children,
  className,
  shrink = true,
  ...divProps
}: ModalFooterProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames(
        shrink ? "shrink-0" : "",
        border ? "border-t border-slate-200/80 dark:border-slate-800/70" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ModalFactCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  compact?: boolean;
};

export function ModalFactCard({
  children,
  className,
  compact = false,
  ...divProps
}: ModalFactCardProps) {
  return (
    <div
      {...divProps}
      className={[
        modalFactCardClassName,
        compact ? "px-3 py-3" : "px-4 py-3",
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

type ModalNoticeProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: ModalNoticeTone;
};

export function ModalNotice({
  children,
  className,
  tone = "neutral",
  ...divProps
}: ModalNoticeProps) {
  return (
    <div
      {...divProps}
      className={[
        modalNoticeClassName,
        modalNoticeToneClass[tone],
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

type ModalDetailGridProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function ModalDetailGrid({
  children,
  className,
  ...divProps
}: ModalDetailGridProps) {
  return (
    <div
      {...divProps}
      className={[
        "grid grid-cols-1 gap-2 text-sm sm:grid-cols-2",
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

type ModalDetailItemProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  label: ReactNode;
  valueClassName?: string;
  valueStyle?: CSSProperties;
};

export function ModalDetailItem({
  children,
  className,
  label,
  style,
  valueClassName,
  valueStyle,
  ...divProps
}: ModalDetailItemProps) {
  return (
    <div
      {...divProps}
      className={joinClassNames("min-w-0", className)}
      style={style}
    >
      <div className={modalDetailLabelClassName}>{label}</div>
      <div
        className={[
          modalDetailValueClassName,
          valueClassName ?? "",
        ].filter(Boolean).join(" ")}
        style={valueStyle}
      >
        {children}
      </div>
    </div>
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
      className={joinClassNames(
        "border-b border-slate-200/80 bg-white/92 px-5 py-4 dark:border-slate-800/70 dark:bg-slate-950/55 sm:px-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className={modalEyebrowClassName}>
              {eyebrow}
            </div>
          ) : null}
          <div
            className={joinClassNames(
              "font-semibold tracking-tight text-slate-950 dark:text-slate-50",
              eyebrow ? "mt-1 text-xl" : "text-lg",
              titleClassName,
            )}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              className={joinClassNames(
                "mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300",
                subtitleClassName,
              )}
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
