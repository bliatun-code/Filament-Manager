import type { ReactNode } from "react";
import { InventorySwatchChip } from "./inventory_swatch_chip";

type SwatchSelectionPreviewHeaderSize = "compact" | "large";

type SwatchSelectionPreviewHeaderProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  eyebrow: string;
  size?: SwatchSelectionPreviewHeaderSize;
  swatchColor?: string | null;
};

function previewSwatchClassName(
  hasSwatch: boolean,
  size: SwatchSelectionPreviewHeaderSize,
): string {
  const base =
    size === "large"
      ? "h-full w-full rounded-xl border shadow-inner"
      : "mt-0.5 h-12 w-12 shrink-0 rounded-xl border";
  if (hasSwatch) {
    return `${base} border-white/80 shadow-black/5 dark:border-white/10 dark:shadow-none`;
  }
  return `${base} border-dashed border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900`;
}

export function SwatchSelectionPreviewHeader({
  children,
  className,
  contentClassName,
  eyebrow,
  size = "compact",
  swatchColor,
}: SwatchSelectionPreviewHeaderProps) {
  const hasSwatch = Boolean(swatchColor);
  const swatch = hasSwatch ? (
    <InventorySwatchChip
      className={previewSwatchClassName(hasSwatch, size)}
      swatchColor={swatchColor}
    />
  ) : (
    <span className={previewSwatchClassName(hasSwatch, size)} />
  );

  return (
    <div className={["flex items-start gap-3", className ?? ""].filter(Boolean).join(" ")}>
      {size === "large" ? (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/75 bg-white/65 p-2 shadow-sm shadow-slate-200/25 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
          {swatch}
        </span>
      ) : (
        swatch
      )}
      <div className={["min-w-0 flex-1", contentClassName ?? ""].filter(Boolean).join(" ")}>
        <div
          className={[
            "text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400",
            size === "large" ? "tracking-[0.24em]" : "tracking-[0.16em]",
          ].join(" ")}
        >
          {eyebrow}
        </div>
        {children}
      </div>
    </div>
  );
}
