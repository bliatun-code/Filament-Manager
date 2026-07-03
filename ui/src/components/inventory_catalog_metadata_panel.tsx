import { toSwatchColor } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import {
  inventoryDetailCompactActionButtonClassName,
  inventoryDetailCompactFormControlClassName,
  inventoryDetailEyebrowClassName,
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
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t(
              "inventory.metadataAppliesToFamily",
              "Changes apply to all rolls using this catalog filament.",
            )}
          </div>
        </div>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-[10px] font-semibold ${
            editUnlocked
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-white text-slate-700"
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
        <div className="mt-3 grid grid-cols-1 gap-2">
          <input
            type="text"
            value={vendor}
            onChange={(event) => onChangeVendor(event.target.value)}
            placeholder={t("wishlist.vendorPlaceholder", "Vendor")}
            className={inventoryDetailCompactFormControlClassName}
            disabled={disabled}
          />
          <input
            type="text"
            value={material}
            onChange={(event) => onChangeMaterial(event.target.value)}
            placeholder={t("wishlist.materialPlaceholder", "Material")}
            className={inventoryDetailCompactFormControlClassName}
            disabled={disabled}
          />
          <input
            type="text"
            value={filamentName}
            onChange={(event) => onChangeFilamentName(event.target.value)}
            placeholder={t("wishlist.filamentName", "Filament name")}
            className={inventoryDetailCompactFormControlClassName}
            disabled={disabled}
          />
          <input
            type="text"
            value={colorName}
            onChange={(event) => onChangeColorName(event.target.value)}
            placeholder={t("wishlist.colorName", "Color name")}
            className={inventoryDetailCompactFormControlClassName}
            disabled={disabled}
          />
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <input
              type="text"
              value={hexColor}
              onChange={(event) => onChangeHexColor(event.target.value)}
              placeholder={t("wishlist.hexOptional", "Hex color")}
              className={inventoryDetailCompactFormControlClassName}
              disabled={disabled}
            />
            <input
              type="color"
              value={toSwatchColor(hexColor)}
              onChange={(event) => onChangeHexColor(event.target.value)}
              className="h-7 w-10 rounded border border-slate-200 bg-white p-0.5"
              disabled={disabled}
            />
            <InventorySwatchChip
              className="h-7 w-7 rounded"
              swatchColor={hexColor}
              tone="tiny"
            />
          </div>
          <button
            type="button"
            className={inventoryDetailCompactActionButtonClassName}
            onClick={onSave}
            disabled={disabled}
          >
            {t("inventory.saveMetadata", "Save metadata")}
          </button>
        </div>
      ) : null}
    </InventoryDetailTintPanel>
  );
}
