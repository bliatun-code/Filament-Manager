import { buildSwatchSurfaceStyle, type SwatchSurfaceStrength } from "../lib/color_utils";
import type { ResolvedTheme } from "../lib/theme_mode";

const swatchPanelStrengths: Record<ResolvedTheme, SwatchSurfaceStrength> = {
  dark: {
    top: 0.32,
    mid: 0.16,
    bottom: 0.08,
    base: "rgb(10, 17, 31)",
    shadow: 0.38,
    border: 0.44,
    ambientShadow: "rgba(2, 6, 23, 0.5)",
    inset: "rgba(255, 255, 255, 0.03)",
  },
  light: {
    top: 0.08,
    mid: 0.035,
    bottom: 0.012,
    base: "rgba(255, 255, 255, 0.985)",
    shadow: 0.14,
    border: 0.15,
    ambientShadow: "rgba(148, 163, 184, 0.06)",
    inset: "rgba(255, 255, 255, 0.92)",
  },
};

const swatchInsetStrengths: Record<ResolvedTheme, SwatchSurfaceStrength> = {
  dark: {
    top: 0.28,
    mid: 0.14,
    bottom: 0.06,
    base: "rgb(13, 21, 39)",
    shadow: 0.34,
    border: 0.4,
    ambientShadow: "rgba(2, 6, 23, 0.44)",
    inset: "rgba(255, 255, 255, 0.028)",
  },
  light: {
    top: 0.06,
    mid: 0.026,
    bottom: 0.01,
    base: "rgba(255, 255, 255, 0.992)",
    shadow: 0.1,
    border: 0.12,
    ambientShadow: "rgba(148, 163, 184, 0.05)",
    inset: "rgba(255, 255, 255, 0.94)",
  },
};

function buildLoanOutSwatchSurfaceStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme,
  strength: SwatchSurfaceStrength,
) {
  const darkTheme = resolvedTheme === "dark";
  return buildSwatchSurfaceStyle(raw, strength, {
    midStop: darkTheme ? "24%" : "38%",
    bottomStop: darkTheme ? "66%" : "74%",
  });
}

export function swatchPanelStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme = "light",
) {
  return buildLoanOutSwatchSurfaceStyle(raw, resolvedTheme, swatchPanelStrengths[resolvedTheme]);
}

export function swatchInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme = "light",
) {
  return buildLoanOutSwatchSurfaceStyle(raw, resolvedTheme, swatchInsetStrengths[resolvedTheme]);
}

export const formInputClassName =
  "mt-1.5 w-full rounded-2xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm shadow-slate-200/20 outline-none transition placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-slate-700/80 dark:bg-slate-950/45 dark:text-slate-100 dark:shadow-none dark:placeholder:text-slate-500 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";
export const panelCardClassName =
  "rounded-[1.75rem] border border-slate-200/85 bg-white/94 p-5 shadow-[0_18px_38px_-30px_rgba(71,85,105,0.16),0_4px_10px_rgba(148,163,184,0.08)] dark:border-slate-700/70 dark:bg-slate-950/45 dark:shadow-none";
export const panelTitleClassName = "text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50";
export const panelSubtitleClassName = "mt-1 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300";
export const countPillClassName =
  "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border border-slate-200/85 bg-white/85 px-3 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/20 dark:border-slate-700/75 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-none";
export const detailLabelClassName =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";
export const detailValueClassName = "mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50";

export function loanOutSpoolButtonClassName(active: boolean): string {
  const base =
    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (active) {
    return `${base} border-slate-300 shadow-sm dark:border-slate-500`;
  }

  return `${base} border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-950/40 dark:hover:border-slate-500`;
}
