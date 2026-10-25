import { useI18n } from "../lib/i18n";

export type InventoryWorkspaceView = "STOCK" | "LOANS" | "PURCHASES" | "LOCATIONS";

type InventoryWorkspaceNavigationProps = {
  activeView: InventoryWorkspaceView;
  inventoryCount: number;
  locationCount: number;
  loanCount?: number;
  onViewChange: (view: InventoryWorkspaceView) => void;
  purchaseCount: number;
};

export function InventoryWorkspaceNavigation({ activeView, inventoryCount, locationCount, loanCount = 0, onViewChange, purchaseCount }: InventoryWorkspaceNavigationProps) {
  const { t } = useI18n();
  const views = [
    { view: "STOCK", id: "stock", label: t("inventory.title", "Spools"), count: inventoryCount },
    { view: "LOANS", id: "loans", label: t("inventory.loansTab", "Loans & borrowed-in"), count: loanCount },
    { view: "LOCATIONS", id: "locations", label: t("inventory.locationsTitle", "Locations"), count: locationCount },
    { view: "PURCHASES", id: "purchases", label: t("inventory.wishlistOrders", "Wishlist & orders"), count: purchaseCount },
  ] as const;
  return <div className="inventory-workspace-navigation" role="group" aria-label={t("app.navigation", "Navigation")}>
    {views.map(({view, id, label, count}) => <button key={view} type="button"
      id={`inventory-${id}-tab`} aria-controls={`inventory-${id}-panel`} aria-pressed={activeView === view}
      className="inventory-workspace-tab app-control-focus" onClick={() => onViewChange(view)}>
      <span>{label}</span><span className="inventory-workspace-count">{count}</span>
    </button>)}
  </div>;
}
