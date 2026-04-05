export function neutralChipClass(
  active: boolean,
  sizeClasses = "px-3 py-1 text-xs",
): string {
  return `rounded-full border ${sizeClasses} font-semibold transition ${
    active
      ? "border-slate-800 bg-slate-800 text-white shadow-sm shadow-slate-300/35 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none"
      : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-white dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-900/75"
  }`;
}

type SemanticChipTone = "neutral" | "info" | "success" | "warning" | "danger";

const semanticToneClassByTone: Record<SemanticChipTone, string> = {
  neutral:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700/60 dark:text-slate-200",
  info: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-400/50 dark:bg-sky-500/20 dark:text-sky-200",
  success:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-200",
  warning:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200",
  danger:
    "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-200",
};

export function semanticChipClass(
  tone: SemanticChipTone,
  sizeClasses = "px-3 py-1 text-xs",
): string {
  return `rounded-full border ${sizeClasses} font-semibold ${semanticToneClassByTone[tone]}`;
}
