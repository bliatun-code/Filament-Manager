import { neutralChipClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import type { OwnershipFilter, StatusFilter } from "../lib/inventory_list_model";
import type { InventoryViewMode } from "../lib/use_inventory_filters";
import { materialTone } from "../lib/material_theme";

export type { InventoryViewMode };

const statuses: ReadonlyArray<StatusFilter> = [
  "ALL",
  "IN_STOCK",
  "ASSIGNED",
  "BORROWED",
  "EMPTY",
  "LOST",
];

const ownershipFilters: ReadonlyArray<OwnershipFilter> = [
  "ALL",
  "OWNED",
  "BORROWED_IN",
];

type InventoryHeaderActionsProps = {
  lowStockOnly: boolean;
  onAddSpool: () => void;
  onLoanOutRoll: () => void;
  onLowStockOnlyChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  primaryActionsDisabled: boolean;
  search: string;
  statusFilter: StatusFilter;
};

type InventoryControlsPanelProps = {
  activeAdvancedFilterCount: number;
  advancedFiltersOpen: boolean;
  inventoryView: InventoryViewMode;
  materialFilter: string;
  materialOptions: string[];
  onAdvancedFiltersOpenChange: (value: boolean) => void;
  onInventoryViewChange: (value: InventoryViewMode) => void;
  onMaterialFilterChange: (value: string) => void;
  onOwnershipFilterChange: (value: OwnershipFilter) => void;
  onVendorFilterChange: (value: string) => void;
  ownershipFilter: OwnershipFilter;
  vendorFilter: string;
  vendorOptions: string[];
  visibleInventoryCount: number;
};

function statusLabel(status: StatusFilter, t: ReturnType<typeof useI18n>["t"]) {
  if (status === "ALL") {
    return t("common.all", "All");
  }
  if (status === "IN_STOCK") {
    return t("inventory.statusInStock", "In stock");
  }
  if (status === "ASSIGNED") {
    return t("inventory.statusAssigned", "Assigned");
  }
  if (status === "BORROWED") {
    return t("inventory.statusBorrowed", "Loaned out");
  }
  if (status === "EMPTY") {
    return t("inventory.statusEmpty", "Empty");
  }
  return t("inventory.statusLost", "Lost");
}

function ownershipLabel(ownership: OwnershipFilter, t: ReturnType<typeof useI18n>["t"]) {
  if (ownership === "ALL") {
    return t("inventory.ownershipAll", "All");
  }
  if (ownership === "OWNED") {
    return t("inventory.ownedByUs", "Owned");
  }
  return t("inventory.borrowedIn", "Borrowed in");
}

export function InventoryHeaderActions({
  lowStockOnly,
  onAddSpool,
  onLoanOutRoll,
  onLowStockOnlyChange,
  onSearchChange,
  onStatusFilterChange,
  primaryActionsDisabled,
  search,
  statusFilter,
}: InventoryHeaderActionsProps) {
  const { t } = useI18n();

  return (
    <div className="page-header-actions">
      <div className="page-header-tools">
        <button
          type="button"
          onClick={onAddSpool}
          className="header-button-primary w-full min-[920px]:w-auto"
          disabled={primaryActionsDisabled}
        >
          {t("inventory.addSpoolAction", "Add spool")}
        </button>
        <button
          type="button"
          onClick={onLoanOutRoll}
          className="header-button-secondary w-full min-[920px]:w-auto"
          disabled={primaryActionsDisabled}
        >
          {t("inventory.loanOutRoll", "Loan out roll")}
        </button>
      </div>
      <div className="flex w-full flex-col gap-2 min-[920px]:items-end">
        <input
          type="search"
          placeholder={t(
            "inventory.searchPlaceholder",
            "Search by material, color, location or QR",
          )}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="page-header-search"
        />
        <div className="page-header-filter-surface">
          <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-20">
              {t("inventory.status", "Status")}
            </div>
            <div className="flex flex-wrap gap-1.5 min-[920px]:justify-end">
              <button
                type="button"
                onClick={() => onLowStockOnlyChange(!lowStockOnly)}
                className={neutralChipClass(lowStockOnly, "px-3.5 py-2 text-xs")}
              >
                {t("inventory.lowStockOnly", "Low stock (<200 g)")}
              </button>
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onStatusFilterChange(status)}
                  className={neutralChipClass(statusFilter === status, "px-3.5 py-2 text-xs")}
                >
                  {statusLabel(status, t)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InventoryControlsPanel({
  activeAdvancedFilterCount,
  advancedFiltersOpen,
  inventoryView,
  materialFilter,
  materialOptions,
  onAdvancedFiltersOpenChange,
  onInventoryViewChange,
  onMaterialFilterChange,
  onOwnershipFilterChange,
  onVendorFilterChange,
  ownershipFilter,
  vendorFilter,
  vendorOptions,
  visibleInventoryCount,
}: InventoryControlsPanelProps) {
  const { t } = useI18n();

  return (
      <div className="surface-subtle mt-4 px-3 py-2.5">
        <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center min-[920px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("inventory.filters", "Filters")}
            </div>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200 dark:shadow-none">
              {visibleInventoryCount}
            </span>
            {activeAdvancedFilterCount > 0 ? (
              <span className="rounded-full border border-sky-300/65 bg-sky-50/70 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-200">
                {activeAdvancedFilterCount} {t("inventory.activeFilters", "active")}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onAdvancedFiltersOpenChange(!advancedFiltersOpen)}
            className={neutralChipClass(advancedFiltersOpen, "px-3 py-1.5 text-xs")}
          >
            {advancedFiltersOpen
              ? t("inventory.hideAdvancedFilters", "Hide details")
              : t("inventory.showAdvancedFilters", "More filters")}
          </button>
        </div>

        {advancedFiltersOpen ? (
          <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.viewGroup", "View")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onInventoryViewChange("CARDS")}
                  className={neutralChipClass(inventoryView === "CARDS", "px-3 py-1.5 text-xs")}
                >
                  {t("inventory.viewCards", "Card view")}
                </button>
                <button
                  type="button"
                  onClick={() => onInventoryViewChange("LIST")}
                  className={neutralChipClass(inventoryView === "LIST", "px-3 py-1.5 text-xs")}
                >
                  {t("inventory.viewList", "List view")}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.ownershipGroup", "Ownership")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ownershipFilters.map((ownership) => (
                  <button
                    key={ownership}
                    type="button"
                    onClick={() => onOwnershipFilterChange(ownership)}
                    className={neutralChipClass(
                      ownershipFilter === ownership,
                      "px-3 py-1.5 text-xs",
                    )}
                  >
                    {ownershipLabel(ownership, t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.vendorGroup", "Vendor")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vendorOptions.map((vendor) => (
                  <button
                    key={vendor}
                    type="button"
                    onClick={() => onVendorFilterChange(vendor)}
                    className={neutralChipClass(vendorFilter === vendor, "px-3 py-1.5 text-xs")}
                  >
                    {vendor === "ALL" ? t("inventory.vendorAll", "All") : vendor}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24">
                {t("inventory.materialGroup", "Material")}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {materialOptions.map((material) => (
                  <button
                    key={material}
                    type="button"
                    onClick={() => onMaterialFilterChange(material)}
                    className={
                      material === "ALL"
                        ? neutralChipClass(materialFilter === material, "px-3 py-1.5 text-xs")
                        : `rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            materialFilter === material
                              ? materialTone(material).filterActive
                              : materialTone(material).filterInactive
                          }`
                    }
                  >
                    {material === "ALL" ? t("inventory.typeAll", "All") : material}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
  );
}
