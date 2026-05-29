import { swatchCssBackground, toSwatchColor } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";

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
    <div
      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
      style={inventorySwatchInsetStyle(spoolHexColor, resolvedTheme)}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
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
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
            disabled={disabled}
          />
          <input
            type="text"
            value={material}
            onChange={(event) => onChangeMaterial(event.target.value)}
            placeholder={t("wishlist.materialPlaceholder", "Material")}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
            disabled={disabled}
          />
          <input
            type="text"
            value={filamentName}
            onChange={(event) => onChangeFilamentName(event.target.value)}
            placeholder={t("wishlist.filamentName", "Filament name")}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
            disabled={disabled}
          />
          <input
            type="text"
            value={colorName}
            onChange={(event) => onChangeColorName(event.target.value)}
            placeholder={t("wishlist.colorName", "Color name")}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
            disabled={disabled}
          />
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <input
              type="text"
              value={hexColor}
              onChange={(event) => onChangeHexColor(event.target.value)}
              placeholder={t("wishlist.hexOptional", "Hex color")}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
              disabled={disabled}
            />
            <input
              type="color"
              value={toSwatchColor(hexColor)}
              onChange={(event) => onChangeHexColor(event.target.value)}
              className="h-7 w-10 rounded border border-slate-200 bg-white p-0.5"
              disabled={disabled}
            />
            <span
              className="h-7 w-7 rounded border border-slate-200"
              style={{ background: swatchCssBackground(hexColor) }}
            />
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
            onClick={onSave}
            disabled={disabled}
          >
            {t("inventory.saveMetadata", "Save metadata")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
