import { useI18n } from "../lib/i18n";

export type InventoryWorkspaceView = "STOCK" | "PURCHASES" | "LOCATIONS";

type InventoryWorkspaceNavigationProps = {
  activeView: InventoryWorkspaceView;
  inventoryCount: number;
  locationCount: number;
  onViewChange: (view: InventoryWorkspaceView) => void;
  purchaseCount: number;
};

function inventoryWorkspaceTabClassName(active: boolean): string {
  const base =
    "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 dark:focus-visible:ring-sky-500/50 sm:flex-none sm:min-w-52";
  return active
    ? `${base} bg-slate-950 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950`
    : `${base} text-slate-600 hover:bg-white/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white`;
}

export function InventoryWorkspaceNavigation({
  activeView,
  inventoryCount,
  locationCount,
  onViewChange,
  purchaseCount,
}: InventoryWorkspaceNavigationProps) {
  const { t } = useI18n();

  return (
    <div
      className="surface-subtle mt-4 flex flex-col gap-1.5 p-1.5 sm:flex-row"
      role="group"
      aria-label={t("app.navigation", "Navigation")}
    >
      <button
        type="button"
        id="inventory-stock-tab"
        aria-controls="inventory-stock-panel"
        aria-pressed={activeView === "STOCK"}
        className={inventoryWorkspaceTabClassName(activeView === "STOCK")}
        onClick={() => onViewChange("STOCK")}
      >
        <span>{t("nav.inventory", "Inventory")}</span>
        <span className="count-pill tabular-nums">{inventoryCount}</span>
      </button>
      <button
        type="button"
        id="inventory-locations-tab"
        aria-controls="inventory-locations-panel"
        aria-pressed={activeView === "LOCATIONS"}
        className={inventoryWorkspaceTabClassName(activeView === "LOCATIONS")}
        onClick={() => onViewChange("LOCATIONS")}
      >
        <span>{t("inventory.locationsTitle", "Locations")}</span>
        <span className="count-pill tabular-nums">{locationCount}</span>
      </button>
      <button
        type="button"
        id="inventory-purchases-tab"
        aria-controls="inventory-purchases-panel"
        aria-pressed={activeView === "PURCHASES"}
        className={inventoryWorkspaceTabClassName(activeView === "PURCHASES")}
        onClick={() => onViewChange("PURCHASES")}
      >
        <span>{t("inventory.wishlistOrders", "Wishlist & orders")}</span>
        <span className="count-pill tabular-nums">{purchaseCount}</span>
      </button>
    </div>
  );
}
