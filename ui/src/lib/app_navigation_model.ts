export const APP_PAGE_ORDER = [
  "dashboard",
  "inventory",
  "loans",
  "printers",
  "statistics",
  "settings",
] as const;

export type PageKey = (typeof APP_PAGE_ORDER)[number];

export type InventoryNavigationIntent =
  | {
      kind: "LOW_STOCK";
      seq: number;
    }
  | null;

export function resolveInitialPageFromSearch(
  search: string | URLSearchParams | null | undefined,
): PageKey {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
  return params.get("bfm_inventory_fixture") === "detail" ? "inventory" : "dashboard";
}
