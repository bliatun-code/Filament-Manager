import {
  appControlDisabledClassName,
  appControlFocusClassName,
  appSoftControlChromeClassName,
  joinClassNames,
} from "./ui_class_names";

const closeButtonBaseClassName =
  joinClassNames(
    "inline-flex shrink-0 items-center justify-center leading-none text-slate-600 outline-none transition dark:text-slate-300",
    appSoftControlChromeClassName,
    appControlFocusClassName,
    appControlDisabledClassName,
  );

type CloseButtonProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  size?: "default" | "large";
};

export function CloseButton({
  disabled = false,
  label,
  onClick,
  size = "default",
}: CloseButtonProps) {
  const sizeClassName = size === "large" ? "h-11 w-11 text-[1.35rem]" : "h-10 w-10 text-base";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={joinClassNames(closeButtonBaseClassName, sizeClassName)}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
