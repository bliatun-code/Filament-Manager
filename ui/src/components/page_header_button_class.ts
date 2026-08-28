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
    return joinClassNames(base, "app-primary-action");
  }

  if (variant === "soft") {
    return joinClassNames(base, "app-soft-control backdrop-blur");
  }

  return joinClassNames(base, "app-soft-control");
}
