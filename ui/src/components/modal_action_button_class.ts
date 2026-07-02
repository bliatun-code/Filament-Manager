import { appControlFocusClassName, joinClassNames } from "./ui_class_names";

export type ModalActionButtonVariant =
  | "secondary"
  | "primary"
  | "solid"
  | "success"
  | "danger"
  | "dangerQuiet"
  | "critical";
export type ModalActionButtonSize = "default" | "roomy";

export function modalActionButtonClassName(
  variant: ModalActionButtonVariant = "secondary",
  size: ModalActionButtonSize = "default",
): string {
  const padding = size === "roomy" ? "px-4 py-3" : "px-4 py-2";
  const base = joinClassNames(
    "rounded-lg border text-sm font-semibold outline-none transition disabled:opacity-50",
    padding,
    appControlFocusClassName,
  );

  if (variant === "primary") {
    return `${base} border-sky-300 bg-sky-600 text-white hover:bg-sky-700 dark:border-sky-400/40 dark:bg-sky-500 dark:hover:bg-sky-400`;
  }
  if (variant === "solid") {
    return `${base} border-slate-900 bg-slate-900 text-white shadow-sm shadow-slate-300/30 hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white`;
  }
  if (variant === "success") {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-200/25 hover:bg-emerald-100 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none dark:hover:bg-emerald-500/25`;
  }
  if (variant === "danger") {
    return `${base} border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25`;
  }
  if (variant === "dangerQuiet") {
    return `${base} border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-400/35 dark:bg-slate-950/55 dark:text-rose-200 dark:hover:bg-rose-500/10`;
  }
  if (variant === "critical") {
    return `${base} border-red-400 bg-red-600 text-white hover:bg-red-700 dark:border-red-400/45 dark:bg-red-500/85 dark:text-white dark:hover:bg-red-500`;
  }

  return `${base} border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/60`;
}
