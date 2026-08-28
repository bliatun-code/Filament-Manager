export const inventoryModalOverlayClassName =
  "app-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-none px-4 py-6 backdrop-blur-md";

export const inventoryWideModalWidthClassName =
  "w-[min(100%,72rem)] xl:w-[min(80vw,72rem)]";

export const inventoryWideModalPanelClassName =
  `app-modal-panel flex h-[min(calc(100dvh-3rem),58rem)] min-w-0 ${inventoryWideModalWidthClassName} flex-col overflow-hidden rounded-2xl border backdrop-blur-xl`;

export const inventoryWideContentModalPanelClassName =
  `app-modal-panel flex max-h-[min(calc(100dvh-3rem),58rem)] min-w-0 ${inventoryWideModalWidthClassName} flex-col overflow-hidden rounded-2xl border backdrop-blur-xl`;

export const inventoryTwoColumnModalGridClassName =
  "grid grid-cols-1 gap-4 min-[900px]:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] xl:gap-5";
