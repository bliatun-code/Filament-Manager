import { neutralChipClass } from "./chip_styles";

export const settingsSurfacePanelClass =
  "surface-subtle px-4 py-4 text-sm leading-6 text-slate-700 dark:text-slate-200";

export const settingsInfoPanelClass =
  "surface-subtle px-4 py-3 text-sm leading-6 text-slate-700 dark:text-slate-200";

export const settingsCompactInfoPanelClass =
  "surface-subtle px-3 py-3 text-sm leading-6 text-slate-700 dark:text-slate-200";

export const settingsSectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

export const settingsGroupLabelClass =
  "text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400";

export const settingsTinyLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";

export const settingsFormControlClass =
  "app-form-control app-control-focus w-full rounded-xl border px-3 py-2 text-sm outline-none transition";

export const settingsTextInputClass = settingsFormControlClass;

export const settingsCompactSelectClass =
  "app-form-control app-control-focus rounded-lg border px-2 py-1 text-xs outline-none transition disabled:opacity-50";

export const settingsCompactFormControlClass =
  "app-form-control app-control-focus rounded-xl border px-3 py-2 text-xs outline-none transition disabled:opacity-50";

export const settingsValueBoxClass =
  "app-form-control rounded-xl border px-3 py-2 text-sm";

export function tabButtonClass(active: boolean): string {
  if (active) {
    return "app-selected-control app-control-focus rounded-lg border px-3.5 py-2 text-sm font-semibold outline-none transition";
  }
  return "app-soft-control app-control-focus rounded-lg border px-3.5 py-2 text-sm font-semibold outline-none transition";
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

export type SettingsActionButtonVariant =
  | "neutral"
  | "accent"
  | "primary"
  | "warning"
  | "warningQuiet"
  | "danger"
  | "dangerQuiet";
export type SettingsActionButtonDensity = "default" | "compact" | "comfortable";

export function settingsActionButtonClass(
  variant: SettingsActionButtonVariant = "neutral",
  density: SettingsActionButtonDensity = "default",
): string {
  const sizeClass =
    density === "compact"
      ? "px-2 py-1 text-xs"
      : density === "comfortable"
        ? "px-4 py-3 text-sm"
        : "px-3 py-2 text-sm";
  const base =
    `app-control-focus inline-flex items-center justify-center rounded-lg border ${sizeClass} font-semibold outline-none transition disabled:opacity-50`;
  if (variant === "accent") {
    return `${base} app-accent-action`;
  }
  if (variant === "primary") {
    return `${base} app-primary-action`;
  }
  if (variant === "warning") {
    return `${base} border-amber-300 bg-amber-500 text-slate-950 shadow-sm shadow-amber-900/20 hover:bg-amber-400 dark:border-amber-400/40 dark:bg-amber-400 dark:hover:bg-amber-300`;
  }
  if (variant === "warningQuiet") {
    return `${base} border-amber-300 bg-transparent text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/10`;
  }
  if (variant === "danger") {
    return `${base} border-rose-500 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-400 dark:bg-rose-500 dark:text-slate-950 dark:hover:bg-rose-400`;
  }
  if (variant === "dangerQuiet") {
    return `${base} border-rose-200 bg-transparent text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-300 dark:hover:border-rose-400/70 dark:hover:bg-rose-500/10`;
  }
  return `${base} app-soft-control`;
}
