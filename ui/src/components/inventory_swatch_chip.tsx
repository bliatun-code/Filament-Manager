import type { CSSProperties } from "react";
import { swatchCssBackground } from "../lib/color_utils";

type InventorySwatchChipTone = "preview" | "soft" | "tiny" | "current";

type InventorySwatchChipProps = {
  className?: string;
  style?: CSSProperties;
  swatchColor?: string | null;
  title?: string;
  tone?: InventorySwatchChipTone;
};

const toneClassNames: Record<InventorySwatchChipTone, string> = {
  preview: "border-slate-600/70 shadow-black/5 dark:border-white/10 dark:shadow-none",
  soft: "border-slate-600/70 shadow-white/30 dark:border-white/10 dark:shadow-black/30",
  tiny: "border-slate-600/70 dark:border-slate-600",
  current: "border-slate-600/70 shadow-black/10 dark:border-white/10 dark:shadow-black/20",
};

export function InventorySwatchChip({
  className,
  style,
  swatchColor,
  title,
  tone = "preview",
}: InventorySwatchChipProps) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      className={["shrink-0 border shadow-inner", toneClassNames[tone], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: swatchCssBackground(swatchColor),
        ...style,
      }}
      title={title}
    />
  );
}
