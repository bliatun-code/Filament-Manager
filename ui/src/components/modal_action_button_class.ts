export type ModalActionButtonVariant = "secondary" | "primary" | "solid" | "success";

export function modalActionButtonClassName(
  variant: ModalActionButtonVariant = "secondary",
): string {
  const base =
    "rounded-lg border px-4 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (variant === "primary") {
    return `${base} border-sky-300 bg-sky-600 text-white hover:bg-sky-700 dark:border-sky-400/40 dark:bg-sky-500 dark:hover:bg-sky-400`;
  }
  if (variant === "solid") {
    return `${base} border-slate-900 bg-slate-900 text-white shadow-sm shadow-slate-300/30 hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white`;
  }
  if (variant === "success") {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-200/25 hover:bg-emerald-100 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none dark:hover:bg-emerald-500/25`;
  }

  return `${base} border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/60`;
}
