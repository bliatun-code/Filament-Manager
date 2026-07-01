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
