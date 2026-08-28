type ModalPanelWidth = "md" | "lg" | "xl" | "wide";

const widthClassName: Record<ModalPanelWidth, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-3xl",
  wide: "max-w-[72rem] xl:w-[min(80vw,72rem)]",
};

export function modalPanelClassName(
  width: ModalPanelWidth,
  extraClassName = "p-5",
): string {
  return [
    "app-modal-panel max-h-[calc(100dvh-3rem)] w-full overflow-y-auto overscroll-contain rounded-xl border backdrop-blur-xl",
    widthClassName[width],
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}
