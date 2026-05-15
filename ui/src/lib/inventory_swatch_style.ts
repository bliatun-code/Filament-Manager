import {
  blendSwatchColor,
  hexToRgb,
  swatchRgba,
  swatchTextColor,
} from "./color_utils";
import type { ResolvedTheme } from "./theme_mode";

export function inventorySwatchBorderColor(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return resolvedTheme === "dark"
      ? "rgba(100, 116, 139, 0.42)"
      : "rgba(148, 163, 184, 0.28)";
  }
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (brightness >= 228) {
    return resolvedTheme === "dark"
      ? "rgba(255, 255, 255, 0.4)"
      : "rgba(148, 163, 184, 0.34)";
  }
  if (brightness <= 42) {
    return resolvedTheme === "dark"
      ? "rgba(148, 163, 184, 0.34)"
      : "rgba(71, 85, 105, 0.34)";
  }
  return swatchRgba(raw, resolvedTheme === "dark" ? 0.4 : 0.28);
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

  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${swatchRgba(raw, strength.top)} 0%, ${swatchRgba(
      raw,
      strength.mid,
    )} ${darkTheme ? "24%" : "38%"}, ${swatchRgba(
      raw,
      strength.bottom,
    )} ${darkTheme ? "66%" : "74%"}, ${strength.base} 100%)`,
    borderColor: inventorySwatchBorderColor(raw, resolvedTheme),
    boxShadow: `inset 0 1px 0 ${strength.inset}, 0 18px 38px -34px ${swatchRgba(raw, strength.shadow)}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
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
    return {
      ...base,
      borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.54 : 0.34),
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(226, 232, 240, 0.12)"
          : "rgba(15, 23, 42, 0.08)"
      }, 0 16px 30px -26px ${swatchRgba(raw, resolvedTheme === "dark" ? 0.42 : 0.3)}`,
    } as const;
  }
  if (emphasis === "recent") {
    return {
      ...base,
      borderColor:
        resolvedTheme === "dark"
          ? "rgba(52, 211, 153, 0.42)"
          : "rgba(16, 185, 129, 0.36)",
      boxShadow: `${base.boxShadow}, 0 0 0 1px ${
        resolvedTheme === "dark"
          ? "rgba(52, 211, 153, 0.16)"
          : "rgba(16, 185, 129, 0.12)"
      }, 0 16px 30px -26px ${
        resolvedTheme === "dark"
          ? "rgba(16, 185, 129, 0.28)"
          : "rgba(16, 185, 129, 0.22)"
      }`,
    } as const;
  }
  return base;
}

export function inventoryCatalogRowStyle(
  raw: string | null | undefined,
  selected: boolean,
  resolvedTheme: ResolvedTheme,
) {
  const base = inventorySwatchInsetStyle(raw, resolvedTheme);
  if (!selected) {
    return base;
  }
  return {
    ...base,
    borderColor:
      resolvedTheme === "dark"
        ? "rgba(226, 232, 240, 0.54)"
        : "rgba(15, 23, 42, 0.16)",
    boxShadow: `${base.boxShadow}, 0 0 0 2px ${
      resolvedTheme === "dark"
        ? "rgba(226, 232, 240, 0.12)"
        : "rgba(15, 23, 42, 0.08)"
    }, 0 14px 28px -24px ${
      resolvedTheme === "dark" ? "rgba(2, 6, 23, 0.54)" : "rgba(15, 23, 42, 0.18)"
    }`,
  } as const;
}

export function inventorySwatchActionButtonStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
) {
  return {
    background:
      resolvedTheme === "dark"
        ? `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.04)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.42,
          )} 100%)`
        : `linear-gradient(135deg, ${blendSwatchColor(raw, [255, 255, 255], 0.08)} 0%, ${blendSwatchColor(
            raw,
            [15, 23, 42],
            0.2,
          )} 100%)`,
    borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.6 : 0.48),
    color: swatchTextColor(raw),
    boxShadow:
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${swatchRgba(raw, 0.74)}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
        : `0 18px 36px -24px ${swatchRgba(raw, 0.62)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
    } as const;
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
    borderColor: swatchRgba(raw, resolvedTheme === "dark" ? 0.42 : 0.28),
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
