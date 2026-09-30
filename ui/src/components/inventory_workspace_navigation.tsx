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
    "app-control-focus flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold outline-none transition sm:flex-none sm:min-w-40";
  return active
    ? `${base} app-selected-control`
    : `${base} app-soft-control`;
}

function inventoryWorkspaceCountClassName(active: boolean): string {
  return `count-pill tabular-nums ${active ? "app-selected-count" : "app-idle-count"}`;
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
      className="flex flex-wrap gap-2"
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
        <span className={inventoryWorkspaceCountClassName(activeView === "STOCK")}>
          {inventoryCount}
        </span>
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
        <span className={inventoryWorkspaceCountClassName(activeView === "LOCATIONS")}>
          {locationCount}
        </span>
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
        <span className={inventoryWorkspaceCountClassName(activeView === "PURCHASES")}>
          {purchaseCount}
        </span>
      </button>
    </div>
  );
}
