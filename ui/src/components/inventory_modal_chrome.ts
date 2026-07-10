export const inventoryModalOverlayClassName =
  "fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-none bg-slate-950/30 px-4 py-6 backdrop-blur-md dark:bg-black/45";

export const inventoryWideModalWidthClassName =
  "w-[min(100%,72rem)] xl:w-[min(80vw,72rem)]";

export const inventoryWideModalPanelClassName =
  `flex h-[min(92vh,58rem)] min-w-0 ${inventoryWideModalWidthClassName} flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45`;

export const inventoryWideContentModalPanelClassName =
  `flex max-h-[min(92vh,58rem)] min-w-0 ${inventoryWideModalWidthClassName} flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45`;

export const inventoryTwoColumnModalGridClassName =
  "grid grid-cols-1 gap-4 min-[900px]:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] xl:gap-5";
