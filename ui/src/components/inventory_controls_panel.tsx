import type { ReactNode } from "react";
import { neutralChipClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import type { OwnershipFilter, StatusFilter } from "../lib/inventory_list_model";
import type { InventoryViewMode } from "../lib/inventory_page_preferences";
import { materialTone } from "../lib/material_theme";
import { PageHeaderButton } from "./page_header_button";

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

const advancedFilterLabelClassName =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-24";

function InventoryAdvancedFilterRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
      <div className={advancedFilterLabelClassName}>{label}</div>
      {children}
    </div>
  );
}

type InventoryHeaderActionsProps = {
  lowStockOnly: boolean;
  onAddSpool: () => void;
  onLoanOutRoll: () => void;
  onLowStockOnlyChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  primaryActionsDisabled: boolean;
  search: string;
  showStockFilters: boolean;
  statusFilter: StatusFilter;
};

type InventoryControlsPanelProps = {
  activeFilterCount: number;
  advancedFiltersOpen: boolean;
  inventoryView: InventoryViewMode;
  materialFilter: string;
  materialOptions: string[];
  onAdvancedFiltersOpenChange: (value: boolean) => void;
  onInventoryViewChange: (value: InventoryViewMode) => void;
  onMaterialFilterChange: (value: string) => void;
  onOwnershipFilterChange: (value: OwnershipFilter) => void;
  onResetFilters: () => void;
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
  showStockFilters,
  statusFilter,
}: InventoryHeaderActionsProps) {
  const { t } = useI18n();

  return (
    <div className="page-header-actions">
      <div className="page-header-tools">
        <PageHeaderButton
          onClick={onAddSpool}
          variant="primary"
          disabled={primaryActionsDisabled}
        >
          {t("inventory.addSpoolAction", "Add spool")}
        </PageHeaderButton>
        <PageHeaderButton
          onClick={onLoanOutRoll}
          disabled={primaryActionsDisabled}
        >
          {t("inventory.loanOutRoll", "Loan out roll")}
        </PageHeaderButton>
      </div>
      {showStockFilters ? (
        <div className="flex w-full flex-col gap-2 min-[920px]:items-end">
          <input
            type="search"
            aria-label={t(
              "inventory.searchPlaceholder",
              "Search by material, color, location or QR",
            )}
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
                  aria-pressed={lowStockOnly}
                  onClick={() => onLowStockOnlyChange(!lowStockOnly)}
                  className={neutralChipClass(lowStockOnly, "px-3.5 py-2 text-xs")}
                >
                  {t("inventory.lowStockOnly", "Low stock (<200 g)")}
                </button>
                {statuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={statusFilter === status}
                    onClick={() => onStatusFilterChange(status)}
                    className={neutralChipClass(
                      statusFilter === status,
                      "px-3.5 py-2 text-xs",
                    )}
                  >
                    {statusLabel(status, t)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InventoryControlsPanel({
  activeFilterCount,
  advancedFiltersOpen,
  inventoryView,
  materialFilter,
  materialOptions,
  onAdvancedFiltersOpenChange,
  onInventoryViewChange,
  onMaterialFilterChange,
  onOwnershipFilterChange,
  onResetFilters,
  onVendorFilterChange,
  ownershipFilter,
  vendorFilter,
  vendorOptions,
  visibleInventoryCount,
}: InventoryControlsPanelProps) {
  const { t } = useI18n();
  const resultLabel =
    visibleInventoryCount === 1
      ? t("inventory.spoolResult", "spool")
      : t("inventory.spoolResults", "spools");

  return (
      <div className="surface-subtle mt-4 px-3 py-2.5">
        <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center min-[920px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div
              className="text-sm font-semibold text-slate-800 dark:text-slate-100"
              aria-live="polite"
            >
              <span className="tabular-nums">{visibleInventoryCount}</span> {resultLabel}
            </div>
            {activeFilterCount > 0 ? (
              <span className="rounded-full border border-sky-300/65 bg-sky-50/70 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-200">
                {activeFilterCount} {t("inventory.activeFilters", "active")}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 min-[920px]:justify-end">
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={onResetFilters}
                className={neutralChipClass(false, "px-3 py-1.5 text-xs")}
              >
                {t("inventory.resetFilters", "Reset filters")}
              </button>
            ) : null}
            <button
              type="button"
              aria-controls="inventory-advanced-filters"
              aria-expanded={advancedFiltersOpen}
              onClick={() => onAdvancedFiltersOpenChange(!advancedFiltersOpen)}
              className={neutralChipClass(advancedFiltersOpen, "px-3 py-1.5 text-xs")}
            >
              {advancedFiltersOpen
                ? t("inventory.hideAdvancedFilters", "Hide details")
                : t("inventory.showAdvancedFilters", "More filters")}
            </button>
          </div>
        </div>

        {advancedFiltersOpen ? (
          <div
            id="inventory-advanced-filters"
            className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70"
          >
            <InventoryAdvancedFilterRow label={t("inventory.viewGroup", "View")}>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={inventoryView === "CARDS"}
                  onClick={() => onInventoryViewChange("CARDS")}
                  className={neutralChipClass(inventoryView === "CARDS", "px-3 py-1.5 text-xs")}
                >
                  {t("inventory.viewCards", "Card view")}
                </button>
                <button
                  type="button"
                  aria-pressed={inventoryView === "LIST"}
                  onClick={() => onInventoryViewChange("LIST")}
                  className={neutralChipClass(inventoryView === "LIST", "px-3 py-1.5 text-xs")}
                >
                  {t("inventory.viewList", "List view")}
                </button>
              </div>
            </InventoryAdvancedFilterRow>
            <InventoryAdvancedFilterRow label={t("inventory.ownershipGroup", "Ownership")}>
              <div className="flex flex-wrap gap-1.5">
                {ownershipFilters.map((ownership) => (
                  <button
                    key={ownership}
                    type="button"
                    aria-pressed={ownershipFilter === ownership}
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
            </InventoryAdvancedFilterRow>
            <InventoryAdvancedFilterRow label={t("inventory.vendorGroup", "Vendor")}>
              <div className="flex flex-wrap gap-1.5">
                {vendorOptions.map((vendor) => (
                  <button
                    key={vendor}
                    type="button"
                    aria-pressed={vendorFilter === vendor}
                    onClick={() => onVendorFilterChange(vendor)}
                    className={neutralChipClass(vendorFilter === vendor, "px-3 py-1.5 text-xs")}
                  >
                    {vendor === "ALL" ? t("inventory.vendorAll", "All") : vendor}
                  </button>
                ))}
              </div>
            </InventoryAdvancedFilterRow>
            <InventoryAdvancedFilterRow label={t("inventory.materialGroup", "Material")}>
              <div className="flex flex-wrap items-center gap-1.5">
                {materialOptions.map((material) => (
                  <button
                    key={material}
                    type="button"
                    aria-pressed={materialFilter === material}
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
            </InventoryAdvancedFilterRow>
          </div>
        ) : null}
      </div>
  );
}
