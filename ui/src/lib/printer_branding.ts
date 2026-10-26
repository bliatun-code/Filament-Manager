import type { ResolvedTheme } from "./theme_mode";

export type PrinterBrandTone = "bambu" | "prusa" | "generic";

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
  // Preserve the public signature for existing call sites; styling follows the active theme.
  void model; void tone; void resolvedTheme;
  return {
    backgroundColor: "var(--app-theme-data-card-base)",
    backgroundImage: "none",
    borderColor: "var(--app-theme-subtle-border)",
    boxShadow: "none",
  } as const;
}
