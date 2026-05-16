import { semanticChipClass } from "../lib/chip_styles";

export type WishlistRefreshVendor = "Bambu" | "eSUN";
export type RefreshLogCopyState = "idle" | "copied" | "failed";
export type WishlistCreateMode = "bambu" | "esun" | "manual";

export const wishlistInputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-400";

export const wishlistSelectClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100";

export const wishlistSecondaryButtonClass =
  "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-900/80";

export function statusBadgeClasses(status: string): string {
  switch (status) {
    case "ON_ORDER":
      return semanticChipClass("warning", "px-2 py-1 text-[11px]");
    case "RECEIVED":
      return semanticChipClass("success", "px-2 py-1 text-[11px]");
    default:
      return semanticChipClass("neutral", "px-2 py-1 text-[11px]");
  }
}

export function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // no-op
  }
  return fallback;
}
