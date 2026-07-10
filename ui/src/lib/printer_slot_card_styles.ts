import type { CSSProperties } from "react";
import {
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
  isDropdownOpen: boolean;
  resolvedTheme: ResolvedTheme;
}): PrinterSlotCardStyles {
  const {
    slotSwatchHex,
    hasAssignedSpool,
    isDropdownOpen,
    resolvedTheme,
  } = options;
  const slotInnerShadow =
    resolvedTheme === "dark"
      ? "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.45)";
  const selectorStyle = slotSwatchHex
    ? (() => {
        const swatchStyle = printerSwatchInteractiveInsetStyle(
          slotSwatchHex,
          resolvedTheme,
          isDropdownOpen ? "selected" : "default",
        );
        return resolvedTheme === "dark"
          ? {
              ...swatchStyle,
              borderColor: "transparent",
              boxShadow: slotInnerShadow,
            }
          : {
              ...swatchStyle,
              borderColor: isDropdownOpen
                ? swatchStyle.borderColor
                : "rgba(71, 85, 105, 0.68)",
              borderWidth: 1,
            };
      })()
    : undefined;
  const currentRollStyle = hasAssignedSpool
    ? (() => {
        const swatchStyle = printerSwatchInteractiveInsetStyle(
          slotSwatchHex,
          resolvedTheme,
          resolvedTheme === "dark" ? "selected" : "default",
        );
        return resolvedTheme === "dark"
          ? {
              ...swatchStyle,
              borderColor: "transparent",
              boxShadow: slotInnerShadow,
            }
          : {
              ...swatchStyle,
              borderWidth: 1,
            };
      })()
    : undefined;
  // Filament color identifies the roll, not the meaning of the action. Keep
  // the weight action neutral so different colors do not imply different
  // success, warning, or danger semantics.
  const actionStyle = undefined;
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
