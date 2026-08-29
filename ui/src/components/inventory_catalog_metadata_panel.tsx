import { useId } from "react";
import { toSwatchColor } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import {
  inventoryDetailCompactActionButtonClassName,
  inventoryDetailCompactFormControlClassName,
  inventoryDetailEyebrowClassName,
  inventoryDetailLabelClassName,
} from "./inventory_detail_panel_class";
import { InventoryDetailTintPanel } from "./inventory_detail_fact_card";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import { InventorySwatchChip } from "./inventory_swatch_chip";

type InventoryCatalogMetadataPanelProps = {
  colorName: string;
  disabled: boolean;
  editUnlocked: boolean;
  filamentName: string;
  hexColor: string;
  material: string;
  onChangeColorName: (value: string) => void;
  onChangeFilamentName: (value: string) => void;
  onChangeHexColor: (value: string) => void;
  onChangeMaterial: (value: string) => void;
  onChangeVendor: (value: string) => void;
  onSave: () => void;
  onToggleEditUnlocked: () => void;
  resolvedTheme: ResolvedTheme;
  spoolHexColor?: string | null;
  vendor: string;
};

export function InventoryCatalogMetadataPanel({
  colorName,
  disabled,
  editUnlocked,
  filamentName,
  hexColor,
  material,
  onChangeColorName,
  onChangeFilamentName,
  onChangeHexColor,
  onChangeMaterial,
  onChangeVendor,
  onSave,
  onToggleEditUnlocked,
  resolvedTheme,
  spoolHexColor,
  vendor,
}: InventoryCatalogMetadataPanelProps) {
  const { t } = useI18n();
  const generatedId = useId().replace(/:/g, "");
  const fieldIdPrefix = `inventory-catalog-metadata-${generatedId}`;
  const helpId = `${fieldIdPrefix}-help`;
  const vendorId = `${fieldIdPrefix}-vendor`;
  const materialId = `${fieldIdPrefix}-material`;
  const filamentNameId = `${fieldIdPrefix}-filament-name`;
  const colorNameId = `${fieldIdPrefix}-color-name`;
  const swatchColorId = `${fieldIdPrefix}-swatch-color`;
  const swatchPickerId = `${fieldIdPrefix}-swatch-picker`;

  return (
    <InventoryDetailTintPanel
      className="p-4"
      style={inventorySwatchInsetStyle(spoolHexColor, resolvedTheme)}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className={inventoryDetailEyebrowClassName}>
            {t("inventory.catalogDetails", "Catalog details")}
          </div>
          <div id={helpId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t(
              "inventory.metadataAppliesToFamily",
              "Changes apply to all rolls using this catalog filament.",
            )}
          </div>
        </div>
        <button
          type="button"
          className={`app-control-focus rounded border px-2 py-1 text-[10px] font-semibold outline-none transition disabled:opacity-50 ${
            editUnlocked
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "app-soft-control"
          }`}
          onClick={onToggleEditUnlocked}
          disabled={disabled}
        >
          {editUnlocked
            ? t("inventory.lockMetadata", "Lock metadata")
            : t("inventory.unlockMetadata", "Unlock metadata")}
        </button>
      </div>
      {editUnlocked ? (
        <fieldset
          className="mt-3 min-w-0 border-0 p-0"
          aria-describedby={helpId}
        >
          <legend className="sr-only">{t("inventory.catalogDetails", "Catalog details")}</legend>
          <div className="grid grid-cols-1 gap-2.5">
            <label htmlFor={vendorId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("wishlist.vendor", "Vendor")}
              </span>
              <input
                id={vendorId}
                type="text"
                value={vendor}
                onChange={(event) => onChangeVendor(event.target.value)}
                placeholder={t("wishlist.vendorPlaceholder", "Vendor")}
                className={`mt-1.5 ${inventoryDetailCompactFormControlClassName}`}
                aria-describedby={helpId}
                disabled={disabled}
              />
            </label>
            <label htmlFor={materialId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("inventory.material", "Material")}
              </span>
              <input
                id={materialId}
                type="text"
                value={material}
                onChange={(event) => onChangeMaterial(event.target.value)}
                placeholder={t("wishlist.materialPlaceholder", "Material")}
                className={`mt-1.5 ${inventoryDetailCompactFormControlClassName}`}
                aria-describedby={helpId}
                disabled={disabled}
              />
            </label>
            <label htmlFor={filamentNameId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("wishlist.filamentName", "Filament name")}
              </span>
              <input
                id={filamentNameId}
                type="text"
                value={filamentName}
                onChange={(event) => onChangeFilamentName(event.target.value)}
                placeholder={t("wishlist.filamentName", "Filament name")}
                className={`mt-1.5 ${inventoryDetailCompactFormControlClassName}`}
                aria-describedby={helpId}
                disabled={disabled}
              />
            </label>
            <label htmlFor={colorNameId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("wishlist.colorName", "Color name")}
              </span>
              <input
                id={colorNameId}
                type="text"
                value={colorName}
                onChange={(event) => onChangeColorName(event.target.value)}
                placeholder={t("wishlist.colorName", "Color name")}
                className={`mt-1.5 ${inventoryDetailCompactFormControlClassName}`}
                aria-describedby={helpId}
                disabled={disabled}
              />
            </label>
            <fieldset className="min-w-0 border-0 p-0">
              <legend className={inventoryDetailLabelClassName}>
                {t("wishlist.hexOptional", "Swatch color (optional)")}
              </legend>
              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                <label htmlFor={swatchColorId} className="block min-w-0">
                  <span className="sr-only">
                    {t("inventory.swatchColorCode", "Swatch color code")}
                  </span>
                  <input
                    id={swatchColorId}
                    type="text"
                    value={hexColor}
                    onChange={(event) => onChangeHexColor(event.target.value)}
                    placeholder={t("wishlist.hexOptional", "Swatch color (optional)")}
                    className={inventoryDetailCompactFormControlClassName}
                    aria-describedby={helpId}
                    disabled={disabled}
                  />
                </label>
                <label htmlFor={swatchPickerId} className="block">
                  <span className="sr-only">
                    {t("inventory.swatchColorPicker", "Swatch color picker")}
                  </span>
                  <input
                    id={swatchPickerId}
                    type="color"
                    value={toSwatchColor(hexColor)}
                    onChange={(event) => onChangeHexColor(event.target.value)}
                    className="app-modal-control app-control-focus h-7 w-10 rounded border p-0.5 outline-none"
                    aria-describedby={helpId}
                    disabled={disabled}
                  />
                </label>
                <InventorySwatchChip
                  className="h-7 w-7 rounded"
                  swatchColor={hexColor}
                  tone="tiny"
                />
              </div>
            </fieldset>
          </div>
          <button
            type="button"
            className={`mt-2.5 ${inventoryDetailCompactActionButtonClassName}`}
            onClick={onSave}
            disabled={disabled}
          >
            {t("inventory.saveMetadata", "Save metadata")}
          </button>
        </fieldset>
      ) : null}
    </InventoryDetailTintPanel>
  );
}
