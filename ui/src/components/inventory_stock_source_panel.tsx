import { SegmentedChoiceRow } from "./segmented_choice_row";
import { VendorBadge } from "./vendor_badge";
import { neutralChipClass } from "../lib/chip_styles";
import { swatchCssBackground, toSwatchColor } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import { formatMasterDisplayTitle } from "../lib/inventory_list_model";
import { inventoryCatalogRowStyle } from "../lib/inventory_swatch_style";
import type { InventoryCreateMode } from "../lib/inventory_create_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { MasterCatalogRow } from "../lib/tauri_client";

type InventoryStockSourcePanelProps = {
  activeCatalogMasters: MasterCatalogRow[];
  catalogQuery: string;
  createMode: InventoryCreateMode;
  isCatalogCreateMode: boolean;
  manualColorName: string;
  manualFilamentName: string;
  manualHexColor: string;
  manualMaterial: string;
  manualVendor: string;
  onCatalogQueryChange: (value: string) => void;
  onCreateModeChange: (value: InventoryCreateMode) => void;
  onManualColorNameChange: (value: string) => void;
  onManualFilamentNameChange: (value: string) => void;
  onManualHexColorChange: (value: string) => void;
  onManualMaterialChange: (value: string) => void;
  onManualVendorChange: (value: string) => void;
  onSelectCatalogMaster: (master: MasterCatalogRow) => void;
  onUseManualFromCatalog: () => void;
  resolvedTheme: ResolvedTheme;
  selectedCatalogMasterId: string | null;
  tauriAvailable: boolean;
};

export function InventoryStockSourcePanel({
  activeCatalogMasters,
  catalogQuery,
  createMode,
  isCatalogCreateMode,
  manualColorName,
  manualFilamentName,
  manualHexColor,
  manualMaterial,
  manualVendor,
  onCatalogQueryChange,
  onCreateModeChange,
  onManualColorNameChange,
  onManualFilamentNameChange,
  onManualHexColorChange,
  onManualMaterialChange,
  onManualVendorChange,
  onSelectCatalogMaster,
  onUseManualFromCatalog,
  resolvedTheme,
  selectedCatalogMasterId,
  tauriAvailable,
}: InventoryStockSourcePanelProps) {
  const { t } = useI18n();

  return (
    <div className="surface-card space-y-4">
      <div className="surface-subtle px-4 py-4">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SegmentedChoiceRow
              className="min-w-0 flex-1"
              label={t("inventory.vendorSource", "Vendor source")}
              labelWidthClassName="min-[920px]:w-32"
              value={createMode}
              onChange={onCreateModeChange}
              options={[
                {
                  value: "bambu",
                  label: t("vendor.bambu", "Bambu"),
                },
                {
                  value: "esun",
                  label: t("vendor.esun", "eSUN"),
                },
                {
                  value: "manual",
                  label: t("vendor.generic", "Generic"),
                },
              ]}
            />
            {isCatalogCreateMode ? (
              <span className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200">
                {activeCatalogMasters.length}
              </span>
            ) : null}
          </div>

          {isCatalogCreateMode ? (
            <input
              type="search"
              value={catalogQuery}
              onChange={(event) => onCatalogQueryChange(event.target.value)}
              placeholder={
                createMode === "bambu"
                  ? t("wishlist.searchBambu", "Search Bambu material/color")
                  : t("wishlist.searchEsun", "Search eSUN material/color")
              }
              className="page-header-search !w-full"
              disabled={!tauriAvailable}
            />
          ) : null}
        </div>
      </div>

      {isCatalogCreateMode ? (
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950/70 lg:max-h-[26rem] lg:overflow-y-auto">
            {activeCatalogMasters.map((master) => {
              const selected = selectedCatalogMasterId === master.id;
              return (
                <button
                  key={master.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectCatalogMaster(master)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                    selected
                      ? "border-slate-900/20 ring-1 ring-slate-900/10 dark:border-slate-400/50 dark:ring-slate-400/20"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500"
                  }`}
                  style={inventoryCatalogRowStyle(
                    master.hex_color ?? null,
                    selected,
                    resolvedTheme,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-8 w-8 shrink-0 rounded-md border border-slate-200 dark:border-slate-600"
                      style={{
                        background: swatchCssBackground(master.hex_color),
                      }}
                    />
                    <span className="min-w-0">
                      <span
                        className="block overflow-hidden break-words font-semibold leading-tight text-slate-900 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                        title={formatMasterDisplayTitle(master)}
                      >
                        {formatMasterDisplayTitle(master)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <VendorBadge vendor={master.vendor} compact />
                        <span>{master.default_weight} g</span>
                        {master.is_discontinued ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-200">
                            {t("common.discontinued", "Discontinued")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>

                  {selected ? (
                    <span className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm dark:border-slate-500 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-none">
                      ✓ {t("common.selected", "Selected")}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {activeCatalogMasters.length === 0 ? (
              <div className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.noCatalogMatches",
                  "No catalog entries match the current vendor filters.",
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80"
            onClick={onUseManualFromCatalog}
          >
            {t("wishlist.addMissingFilamentManual", "Missing filament? Add it manually")}
          </button>
        </div>
      ) : null}

      {createMode === "manual" ? (
        <div className="surface-subtle p-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {t("inventory.manualDetails", "Manual details")}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              "inventory.manualDetailsHelp",
              "Use this when a filament is missing from the vendor catalog or you want a fully manual entry.",
            )}
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {["Bambu", "eSUN", "Generic"].map((vendorPreset) => (
                <button
                  key={vendorPreset}
                  type="button"
                  onClick={() => onManualVendorChange(vendorPreset)}
                  className={neutralChipClass(
                    manualVendor.trim().toLowerCase() === vendorPreset.toLowerCase(),
                    "px-3 py-1 text-[11px]",
                  )}
                >
                  {vendorPreset}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={manualVendor}
                onChange={(event) => onManualVendorChange(event.target.value)}
                placeholder={t("wishlist.vendorPlaceholder", "Vendor")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="text"
                value={manualMaterial}
                onChange={(event) => onManualMaterialChange(event.target.value)}
                placeholder={t("wishlist.materialPlaceholder", "Material")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="text"
                value={manualFilamentName}
                onChange={(event) => onManualFilamentNameChange(event.target.value)}
                placeholder={t("wishlist.filamentName", "Filament name")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="text"
                value={manualColorName}
                onChange={(event) => onManualColorNameChange(event.target.value)}
                placeholder={t("wishlist.colorName", "Color name")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualHexColor}
                onChange={(event) => onManualHexColorChange(event.target.value)}
                placeholder={t("wishlist.hexOptional", "Hex color")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="color"
                value={toSwatchColor(manualHexColor)}
                onChange={(event) => onManualHexColorChange(event.target.value)}
                className="h-10 w-12 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950/80"
                disabled={!tauriAvailable}
              />
              <span
                className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-600"
                style={{ background: swatchCssBackground(manualHexColor) }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
