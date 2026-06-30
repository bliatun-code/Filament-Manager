export type ModalActionButtonVariant = "secondary" | "primary";

export function modalActionButtonClassName(
  variant: ModalActionButtonVariant = "secondary",
): string {
  const base =
    "rounded-lg border px-4 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (variant === "primary") {
    return `${base} border-sky-300 bg-sky-600 text-white hover:bg-sky-700 dark:border-sky-400/40 dark:bg-sky-500 dark:hover:bg-sky-400`;
  }

  return `${base} border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/60`;
}
