import type { CSSProperties } from "react";
import {
  printerSwatchActionButtonStyle,
  printerSwatchInteractiveInsetStyle,
  printerSwatchSurfaceStyle,
} from "./printer_live_display";
import type { ResolvedTheme } from "./theme_mode";

export type PrinterSlotCardStyles = {
  selectorStyle: CSSProperties | undefined;
  currentRollStyle: CSSProperties | undefined;
  actionStyle: CSSProperties | undefined;
  panelStyle: CSSProperties | undefined;
};

export function buildPrinterSlotCardStyles(options: {
  slotSwatchHex: string | null;
  hasAssignedSpool: boolean;
  hasSelectedTargetSpool: boolean;
  resolvedTheme: ResolvedTheme;
}): PrinterSlotCardStyles {
  const {
    slotSwatchHex,
    hasAssignedSpool,
    hasSelectedTargetSpool,
    resolvedTheme,
  } = options;
  const slotInnerShadow =
    resolvedTheme === "dark"
      ? "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.45)";
  const selectorStyle = slotSwatchHex
    ? {
        ...printerSwatchInteractiveInsetStyle(
          slotSwatchHex,
          resolvedTheme,
          hasSelectedTargetSpool ? "selected" : "default",
        ),
        borderColor: "transparent",
        boxShadow: slotInnerShadow,
      }
    : undefined;
  const currentRollStyle = hasAssignedSpool
    ? {
        ...printerSwatchInteractiveInsetStyle(slotSwatchHex, resolvedTheme, "selected"),
        borderColor: "transparent",
        boxShadow: slotInnerShadow,
      }
    : undefined;
  const actionStyle = slotSwatchHex
    ? printerSwatchActionButtonStyle(slotSwatchHex, resolvedTheme)
    : undefined;
  const panelStyle = slotSwatchHex
    ? printerSwatchSurfaceStyle(slotSwatchHex, "panel", resolvedTheme)
    : undefined;

  return {
    selectorStyle,
    currentRollStyle,
    actionStyle,
    panelStyle,
  };
}
