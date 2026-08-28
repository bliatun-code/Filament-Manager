import { appControlFocusClassName, joinClassNames } from "./ui_class_names";

export type PageHeaderButtonVariant = "primary" | "secondary" | "soft";

export function pageHeaderButtonClassName(
  variant: PageHeaderButtonVariant = "secondary",
): string {
  const base = joinClassNames(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold outline-none transition disabled:opacity-50",
    appControlFocusClassName,
  );

  if (variant === "primary") {
    return joinClassNames(
      base,
      "app-primary-action dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950 dark:shadow-none dark:hover:bg-white",
    );
  }

  if (variant === "soft") {
    return joinClassNames(
      base,
      "border-slate-300/70 bg-white/86 text-slate-700 shadow-sm shadow-slate-300/25 backdrop-blur hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-900",
    );
  }

  return joinClassNames(
    base,
    "border-slate-300/70 bg-white/96 text-slate-800 shadow-sm shadow-slate-300/20 hover:border-slate-400/70 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none dark:hover:border-slate-600 dark:hover:bg-slate-900",
  );
}
