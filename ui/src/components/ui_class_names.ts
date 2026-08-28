export type ClassNameValue = string | false | null | undefined;

export function joinClassNames(...classNames: ClassNameValue[]): string {
  return classNames.filter(Boolean).join(" ");
}

export const appFormControlClassName = "app-form-control";

export const appControlGroupClassName = "app-control-group";

export const appControlFocusClassName =
  "app-control-focus focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

export const appSubtleControlFocusClassName =
  "app-control-focus-subtle focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

export const appControlDisabledClassName =
  "disabled:cursor-not-allowed disabled:opacity-50";

export const appSoftControlChromeClassName =
  "app-soft-control rounded-lg border backdrop-blur-sm";

export const appSoftButtonClassName = joinClassNames(
  "inline-flex items-center justify-center font-semibold outline-none transition",
  appSoftControlChromeClassName,
  appControlFocusClassName,
);
