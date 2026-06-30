export const closeButtonBaseClassName =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white/85 leading-none text-slate-600 shadow-sm shadow-slate-200/25 outline-none transition hover:bg-slate-50 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-800/70 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

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
      className={`${closeButtonBaseClassName} ${sizeClassName}`}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
