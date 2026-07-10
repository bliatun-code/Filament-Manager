import type { ResolvedTheme } from "./theme_mode";

export type PrinterBrandTone = "bambu" | "prusa" | "generic";

const PRINTER_BRAND_HEX: Record<PrinterBrandTone, string> = {
  bambu: "#00B140",
  prusa: "#F97316",
  generic: "#CBD5E1",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return null;
  }
  return [red, green, blue];
}

function brandRgba(brand: PrinterBrandTone, alpha: number): string {
  const rgb = hexToRgb(PRINTER_BRAND_HEX[brand]) ?? [203, 213, 225];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function resolvePrinterBrandTone(model?: string | null): PrinterBrandTone {
  const normalized = (model ?? "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return "bambu";
  }
  if (normalized.includes("prusa")) {
    return "prusa";
  }
  return "generic";
}

export function printerBrandSurfaceStyle(
  model: string | null | undefined,
  tone: "card" | "compact" = "card",
  resolvedTheme: ResolvedTheme = "light",
) {
  const brand = resolvePrinterBrandTone(model);
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? tone === "card"
        ? {
            top: brand === "generic" ? 0.11 : 0.14,
            mid: brand === "generic" ? 0.045 : 0.06,
            bottom: brand === "generic" ? 0.018 : 0.024,
            base: "rgb(10, 17, 31)",
            border: brand === "generic" ? 0.32 : 0.44,
            shadow: brand === "generic" ? 0.18 : 0.34,
            ambientShadow: "rgba(2, 6, 23, 0.52)",
            inset: "rgba(255, 255, 255, 0.03)",
          }
        : {
            top: brand === "generic" ? 0.09 : 0.11,
            mid: brand === "generic" ? 0.04 : 0.05,
            bottom: brand === "generic" ? 0.016 : 0.02,
            base: "rgb(14, 22, 40)",
            border: brand === "generic" ? 0.28 : 0.38,
            shadow: brand === "generic" ? 0.16 : 0.28,
            ambientShadow: "rgba(2, 6, 23, 0.46)",
            inset: "rgba(255, 255, 255, 0.028)",
          }
      : tone === "card"
        ? {
            top: brand === "generic" ? 0.08 : 0.12,
            mid: brand === "generic" ? 0.035 : 0.055,
            bottom: brand === "generic" ? 0.012 : 0.02,
            base: "rgba(252, 254, 255, 0.97)",
            border: brand === "generic" ? 0.18 : 0.22,
            shadow: brand === "generic" ? 0.16 : 0.22,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.82)",
          }
        : {
            top: brand === "generic" ? 0.06 : 0.09,
            mid: brand === "generic" ? 0.025 : 0.04,
            bottom: brand === "generic" ? 0.01 : 0.016,
            base: "rgba(253, 254, 255, 0.98)",
            border: brand === "generic" ? 0.15 : 0.18,
            shadow: brand === "generic" ? 0.12 : 0.16,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.82)",
          };

  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${brandRgba(brand, strength.top)} 0%, ${brandRgba(
      brand,
      strength.mid,
    )} ${darkTheme ? "24%" : "42%"}, ${brandRgba(
      brand,
      strength.bottom,
    )} ${darkTheme ? "66%" : "76%"}, ${strength.base} 100%)`,
    borderColor: brandRgba(brand, strength.border),
    boxShadow: `inset 0 1px 0 ${strength.inset}, 0 18px 38px -34px ${brandRgba(
      brand,
      strength.shadow,
    )}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
}
