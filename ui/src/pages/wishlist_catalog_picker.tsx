import { neutralChipClass } from "../lib/chip_styles";
import type { I18nContextValue } from "../lib/i18n";
import type { WishlistCatalogFilter as CatalogFilter } from "../lib/wishlist_data_source";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  wishlistInputClass,
  wishlistSecondaryButtonClass,
  wishlistSelectClass,
} from "./wishlist_helpers";

type Translate = I18nContextValue["t"];

const catalogFilters: ReadonlyArray<CatalogFilter> = [
  "ALL",
  "ACTIVE",
  "DISCONTINUED",
];

type WishlistCatalogPickerProps = {
  catalogFilter: CatalogFilter;
  catalogQuery: string;
  filteredMasters: MasterCatalogRow[];
  missingAction?: {
    label: string;
    onClick: () => void;
  };
  onCatalogFilterChange: (filter: CatalogFilter) => void;
  onCatalogQueryChange: (query: string) => void;
  onMasterChange: (masterId: string) => void;
  selectedMasterId: string;
  tauri: boolean;
  t: Translate;
  vendor: "bambu" | "esun";
};

export function WishlistCatalogPicker({
  catalogFilter,
  catalogQuery,
  filteredMasters,
  missingAction,
  onCatalogFilterChange,
  onCatalogQueryChange,
  onMasterChange,
  selectedMasterId,
  tauri,
  t,
  vendor,
}: WishlistCatalogPickerProps) {
  const placeholder =
    vendor === "bambu"
      ? t("wishlist.searchBambu", "Search Bambu material/color")
      : t("wishlist.searchEsun", "Search eSUN material/color");

  return (
    <div className="surface-subtle p-4">
      <input
        type="search"
        value={catalogQuery}
        onChange={(event) => onCatalogQueryChange(event.target.value)}
        placeholder={placeholder}
        className={wishlistInputClass}
        disabled={!tauri}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {catalogFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onCatalogFilterChange(filter)}
            className={neutralChipClass(
              catalogFilter === filter,
              "px-3 py-1 text-[11px]",
            )}
          >
            {filter === "ALL"
              ? t("common.all", "All")
              : filter === "ACTIVE"
                ? t("common.active", "Active")
                : t("common.discontinued", "Discontinued")}
          </button>
        ))}
      </div>
      <select
        value={selectedMasterId}
        onChange={(event) => onMasterChange(event.target.value)}
        className={`mt-3 ${wishlistSelectClass}`}
        disabled={!tauri || filteredMasters.length === 0}
      >
        {filteredMasters.map((master) => (
          <option key={master.id} value={master.id}>
            {master.material} · {master.filament_name} · {master.color_name}
            {master.is_discontinued
              ? ` · ${t("common.discontinued", "Discontinued")}`
              : ""}
          </option>
        ))}
      </select>
      {missingAction ? (
        <button
          type="button"
          className={`mt-3 w-full ${wishlistSecondaryButtonClass}`}
          onClick={missingAction.onClick}
        >
          {missingAction.label}
        </button>
      ) : null}
    </div>
  );
}
