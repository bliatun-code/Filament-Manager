import {
  buildSwatchActionButtonStyle,
  buildSwatchSurfaceStyle,
  hexToRgb,
  swatchRgba,
  type SwatchSurfaceStrength,
} from "./color_utils";
import type { ResolvedTheme } from "./theme_mode";

const LIGHT_SWATCH_BORDER = "rgba(71, 85, 105, 0.68)";
const LIGHT_SWATCH_HOVER_BORDER = "rgba(2, 132, 199, 0.86)";
const LIGHT_SWATCH_SELECTED_BORDER = "rgba(2, 132, 199, 0.94)";

export function inventorySwatchBorderColor(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
): string {
  if (resolvedTheme === "light") {
    return LIGHT_SWATCH_BORDER;
  }
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "rgba(100, 116, 139, 0.42)";
  }
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (brightness >= 228) {
    return "rgba(255, 255, 255, 0.4)";
  }
  if (brightness <= 42) {
    return "rgba(148, 163, 184, 0.34)";
  }
  return swatchRgba(raw, 0.4);
}

function inventorySwatchSurfaceBorderColor(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
): string {
  if (resolvedTheme === "dark") {
    return inventorySwatchBorderColor(raw, resolvedTheme);
  }
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "rgba(148, 163, 184, 0.28)";
  }
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (brightness >= 228) {
    return "rgba(148, 163, 184, 0.34)";
  }
  if (brightness <= 42) {
    return "rgba(71, 85, 105, 0.34)";
  }
  return swatchRgba(raw, 0.28);
}

type InventorySwatchSurfaceTone = "card" | "panel" | "inset";

function inventorySwatchSurfaceStyle(
  raw: string | null | undefined,
  tone: InventorySwatchSurfaceTone,
  resolvedTheme: ResolvedTheme,
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? tone === "panel"
        ? {
            top: 0.34,
            mid: 0.18,
            bottom: 0.08,
            base: "rgb(8, 15, 29)",
            shadow: 0.42,
            ambientShadow: "rgba(2, 6, 23, 0.54)",
            inset: "rgba(255, 255, 255, 0.03)",
          }
        : tone === "inset"
          ? {
              top: 0.28,
              mid: 0.14,
              bottom: 0.06,
              base: "rgb(13, 21, 39)",
              shadow: 0.34,
              ambientShadow: "rgba(2, 6, 23, 0.46)",
              inset: "rgba(255, 255, 255, 0.028)",
            }
          : {
              top: 0.3,
              mid: 0.15,
              bottom: 0.07,
              base: "rgb(10, 17, 31)",
              shadow: 0.38,
              ambientShadow: "rgba(2, 6, 23, 0.5)",
              inset: "rgba(255, 255, 255, 0.03)",
            }
      : tone === "panel"
        ? {
            top: 0.15,
            mid: 0.075,
            bottom: 0.025,
            base: "rgba(252, 254, 255, 0.96)",
            shadow: 0.28,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          }
        : tone === "inset"
          ? {
              top: 0.11,
              mid: 0.055,
              bottom: 0.02,
              base: "rgba(253, 254, 255, 0.97)",
              shadow: 0.22,
              ambientShadow: "rgba(148, 163, 184, 0.08)",
              inset: "rgba(255, 255, 255, 0.8)",
            }
          : {
              top: 0.125,
              mid: 0.06,
              bottom: 0.022,
              base: "rgba(252, 254, 255, 0.95)",
              shadow: 0.26,
              ambientShadow: "rgba(148, 163, 184, 0.08)",
              inset: "rgba(255, 255, 255, 0.8)",
            };

  return buildSwatchSurfaceStyle(raw, strength satisfies SwatchSurfaceStrength, {
    midStop: darkTheme ? "24%" : "38%",
    bottomStop: darkTheme ? "66%" : "74%",
    borderColor: inventorySwatchSurfaceBorderColor(raw, resolvedTheme),
  });
}

export function inventorySwatchCardStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return inventorySwatchSurfaceStyle(raw, "card", resolvedTheme);
}

export function inventorySwatchPanelStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return inventorySwatchSurfaceStyle(raw, "panel", resolvedTheme);
}

export function inventorySwatchInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return inventorySwatchSurfaceStyle(raw, "inset", resolvedTheme);
}

export function inventorySwatchInteractiveInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
  emphasis: "default" | "selected" | "recent" = "default",
) {
  const base = inventorySwatchInsetStyle(raw, resolvedTheme);
  if (emphasis === "selected") {
    if (resolvedTheme === "light") {
      return {
        ...base,
        borderColor: LIGHT_SWATCH_SELECTED_BORDER,
        boxShadow: `${base.boxShadow}, 0 0 0 2px rgba(14, 165, 233, 0.24), 0 16px 30px -24px rgba(2, 132, 199, 0.3)`,
      } as const;
    }
    return {
      ...base,
      borderColor: swatchRgba(raw, 0.54),
      boxShadow: `${base.boxShadow}, 0 0 0 1px rgba(226, 232, 240, 0.12), 0 16px 30px -26px ${swatchRgba(raw, 0.42)}`,
    } as const;
  }
  if (emphasis === "recent") {
    return {
      ...base,
      borderColor:
        resolvedTheme === "dark"
          ? "rgba(52, 211, 153, 0.42)"
          : "rgba(4, 120, 87, 0.82)",
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(52, 211, 153, 0.16)"
          : "rgba(4, 120, 87, 0.2)"
      }, 0 16px 30px -26px ${
        resolvedTheme === "dark"
          ? "rgba(16, 185, 129, 0.28)"
          : "rgba(4, 120, 87, 0.24)"
      }`,
    } as const;
  }
  return base;
}

export function inventoryCatalogRowStyle(
  raw: string | null | undefined,
  selected: boolean,
  resolvedTheme: ResolvedTheme,
  hovered = false,
) {
  const base = inventorySwatchInsetStyle(raw, resolvedTheme);
  if (!selected) {
    if (!hovered) {
      return base;
    }
    return {
      ...base,
      borderColor:
        resolvedTheme === "dark" ? "rgba(248, 250, 252, 0.68)" : LIGHT_SWATCH_HOVER_BORDER,
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(248, 250, 252, 0.38)"
          : "rgba(14, 165, 233, 0.22)"
      }, 0 12px 22px -24px ${
        resolvedTheme === "dark" ? "rgba(2, 6, 23, 0.5)" : "rgba(2, 132, 199, 0.24)"
      }`,
    } as const;
  }
  if (hovered) {
    return {
      ...base,
      borderColor:
        resolvedTheme === "dark" ? "rgba(248, 250, 252, 0.72)" : LIGHT_SWATCH_SELECTED_BORDER,
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(248, 250, 252, 0.42)"
          : "rgba(14, 165, 233, 0.34)"
      }, 0 12px 22px -24px ${
        resolvedTheme === "dark" ? "rgba(2, 6, 23, 0.54)" : "rgba(2, 132, 199, 0.3)"
      }`,
    } as const;
  }
  return {
    ...base,
    borderColor:
      resolvedTheme === "dark"
        ? "rgba(226, 232, 240, 0.54)"
        : LIGHT_SWATCH_SELECTED_BORDER,
    boxShadow: `${base.boxShadow}, 0 0 0 2px ${
      resolvedTheme === "dark"
        ? "rgba(226, 232, 240, 0.12)"
        : "rgba(14, 165, 233, 0.24)"
    }, 0 14px 28px -24px ${
      resolvedTheme === "dark" ? "rgba(2, 6, 23, 0.54)" : "rgba(2, 132, 199, 0.28)"
    }`,
  } as const;
}

export function inventorySwatchActionButtonStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return buildSwatchActionButtonStyle(raw, resolvedTheme);
}

export function inventoryCreatePreviewPanelStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  if (!raw) {
    return undefined;
  }
  return {
    ...inventorySwatchPanelStyle(raw, resolvedTheme),
    borderColor:
      resolvedTheme === "dark" ? swatchRgba(raw, 0.42) : inventorySwatchBorderColor(raw, "light"),
    boxShadow:
      resolvedTheme === "dark"
        ? `inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 36px -28px ${swatchRgba(
            raw,
            0.42,
          )}, 0 3px 10px rgba(2, 6, 23, 0.32)`
        : `inset 0 1px 0 rgba(255,255,255,0.86), 0 18px 36px -28px ${swatchRgba(
            raw,
            0.34,
          )}`,
  } as const;
}
