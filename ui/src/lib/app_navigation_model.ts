import { desktopVisualQaInitialPage } from "./desktop_visual_qa_scenario";

export const APP_PAGE_ORDER = [
  "dashboard",
  "inventory",
  "loans",
  "printers",
  "statistics",
  "settings",
] as const;

export type PageKey = (typeof APP_PAGE_ORDER)[number];

export const APP_PAGE_LABEL_FALLBACKS = {
  dashboard: "Dashboard",
  inventory: "Inventory",
  loans: "Loans",
  printers: "Printers",
  statistics: "Statistics",
  settings: "Settings",
} satisfies Record<PageKey, string>;

export type InventoryNavigationIntent =
  | {
      kind: "LOW_STOCK";
      seq: number;
    }
  | {
      kind: "ADD_SPOOL";
      seq: number;
    }
  | null;

export function resolveInitialPageFromSearch(
  search: string | URLSearchParams | null | undefined,
): PageKey {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  const visualQaPage = desktopVisualQaInitialPage(params);
  if (visualQaPage) {
    return visualQaPage;
  }
  return params.get("bfm_inventory_fixture") === "detail" ? "inventory" : "dashboard";
}
