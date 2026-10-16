/** Shared overview typography and actions; keep the existing theme and brand colors. */
export const dashboardOverviewStyles = {
  "between": "flex flex-wrap items-center justify-between gap-3",
  "heading": "text-base font-semibold text-slate-950 dark:text-slate-50",
  "action": "text-xs font-semibold text-sky-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-sky-300",
  "muted": "text-slate-600 dark:text-slate-300",
  "subtle": "text-slate-500 dark:text-slate-400",
  "primary": "text-slate-950 dark:text-slate-50",
  "rows": "divide-y divide-slate-200/80 dark:divide-slate-700/70",
  "card": "surface-card min-w-0"
} as const;
