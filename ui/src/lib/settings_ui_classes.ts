import { neutralChipClass } from "./chip_styles";

export const settingsSurfacePanelClass =
  "surface-subtle px-4 py-4 text-sm leading-6 text-slate-700 dark:text-slate-200";

export const settingsInfoPanelClass =
  "surface-subtle px-4 py-3 text-sm leading-6 text-slate-700 dark:text-slate-200";

export const settingsCompactInfoPanelClass =
  "surface-subtle px-3 py-3 text-sm leading-6 text-slate-700 dark:text-slate-200";

export const settingsTextInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400/50 dark:focus:ring-indigo-500/20";

export const settingsValueBoxClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200";

export function tabButtonClass(active: boolean): string {
  if (active) {
    return "rounded-lg border border-slate-300/80 bg-white/88 px-3.5 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-slate-300/20 outline-none transition focus-visible:border-sky-300/80 dark:border-slate-500/70 dark:bg-slate-800/86 dark:text-slate-50 dark:shadow-none";
  }
  return "rounded-lg border border-transparent px-3.5 py-2 text-sm font-semibold text-slate-600 outline-none transition hover:border-slate-300/70 hover:bg-white/66 hover:text-slate-900 focus-visible:border-sky-300/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900/62 dark:hover:text-slate-50";
}

export function chipButtonClass(active: boolean): string {
  return neutralChipClass(active, "px-3 py-1 text-xs");
}

export function settingsChoiceButtonClass(
  active: boolean,
  tone: "indigo" | "emerald" = "indigo",
): string {
  if (active) {
    if (tone === "emerald") {
      return "inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50/85 px-3.5 py-2.5 text-sm font-semibold text-emerald-900 outline-none transition focus-visible:border-sky-300/80 dark:border-emerald-400/40 dark:bg-emerald-500/14 dark:text-emerald-100";
    }
    return "inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50/86 px-3.5 py-2.5 text-sm font-semibold text-indigo-900 outline-none transition focus-visible:border-sky-300/80 dark:border-indigo-400/40 dark:bg-indigo-500/14 dark:text-indigo-100";
  }
  return "inline-flex items-center justify-center rounded-lg border border-slate-300/80 bg-white/72 px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-white focus-visible:border-sky-300/70 dark:border-slate-700 dark:bg-slate-950/42 dark:text-slate-200 dark:hover:bg-slate-900/72";
}

export function settingsLibraryRoleButtonClass(active: boolean): string {
  const activeClass = "settings-library-role-active";
  const idleClass =
    "border-slate-300/80 bg-white/72 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-950/42 dark:text-slate-200 dark:hover:bg-slate-900/72";
  return `inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold outline-none transition focus-visible:border-sky-300/80 disabled:opacity-70 ${active ? activeClass : idleClass}`;
}

export function settingsWebappStatusClass(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold outline-none transition ${active ? "settings-webapp-status-active" : "settings-webapp-status-warn"}`;
}

export function settingsWebappSwitchClass(active: boolean): string {
  const activeClass = "settings-webapp-switch-active";
  const idleClass =
    "border-slate-300/80 bg-white/72 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-950/42 dark:text-slate-200 dark:hover:bg-slate-900/72";
  return `inline-flex items-center gap-3 rounded-full border px-3 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300/80 disabled:opacity-70 ${active ? activeClass : idleClass}`;
}

export function settingsWebappSwitchTrackClass(active: boolean): string {
  return `relative h-7 w-12 rounded-full border transition ${
    active
      ? "settings-webapp-switch-track-active"
      : "border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-800"
  }`;
}

export function settingsWebappSwitchKnobClass(active: boolean): string {
  return `absolute top-1 h-5 w-5 rounded-full shadow-sm shadow-slate-900/30 transition ${
    active ? "left-6" : "left-1"
  } ${active ? "settings-webapp-switch-knob-active" : "bg-white dark:bg-slate-950"}`;
}

export function settingsActionButtonClass(variant: "neutral" | "accent" = "neutral"): string {
  const base =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300/70 disabled:opacity-50";
  if (variant === "accent") {
    return `${base} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25`;
  }
  return `${base} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/80`;
}
