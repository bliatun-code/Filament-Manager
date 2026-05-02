type ModalPanelWidth = "md" | "lg" | "xl" | "wide";

const widthClassName: Record<ModalPanelWidth, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-3xl",
  wide: "max-w-5xl",
};

export function modalPanelClassName(
  width: ModalPanelWidth,
  extraClassName = "p-5",
): string {
  return [
    "w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-300/18 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/94 dark:shadow-black/38",
    widthClassName[width],
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}
