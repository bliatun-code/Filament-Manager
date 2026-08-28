export type ClassNameValue = string | false | null | undefined;

export function joinClassNames(...classNames: ClassNameValue[]): string {
  return classNames.filter(Boolean).join(" ");
}

export const appFormControlClassName = "app-form-control";

export const appControlFocusClassName =
  "app-control-focus focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

export const appSubtleControlFocusClassName =
  "app-control-focus-subtle focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

export const appControlDisabledClassName =
  "disabled:cursor-not-allowed disabled:opacity-50";

export const appSoftControlChromeClassName =
  "app-soft-control rounded-lg border border-slate-200/80 bg-white/85 text-slate-700 shadow-sm shadow-slate-200/25 backdrop-blur-sm hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-800/70";

export const appSoftButtonClassName = joinClassNames(
  "inline-flex items-center justify-center font-semibold outline-none transition",
  appSoftControlChromeClassName,
  appControlFocusClassName,
);
