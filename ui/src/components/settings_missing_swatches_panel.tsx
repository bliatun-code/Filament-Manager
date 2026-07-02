import {
  normalizeSwatchValue,
  suggestHexFromColor,
  toSwatchColor,
} from "../lib/color_utils";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import type { MasterCatalogRow } from "../lib/tauri_client";
import { SettingsMetricTile } from "./settings_ui";
import {
  chipButtonClass,
  settingsActionButtonClass,
  settingsCompactFormControlClass,
} from "../lib/settings_ui_classes";
import { InventorySwatchChip } from "./inventory_swatch_chip";

type SettingsMissingSwatchesPanelProps = {
  busy: boolean;
  catalogRefreshBusy: boolean;
  confirmBulkSwatch: boolean;
  missingSwatchCount: number;
  swatchBusy: boolean;
  swatchDraftById: Record<string, string>;
  swatchVendorFilter: string;
  swatchVendorOptions: string[];
  tauri: boolean;
  t: (key: string, fallback: string) => string;
  visibleMissingSwatchMasters: MasterCatalogRow[];
  visibleMissingSwatchVendorCount: number;
  onBulkAutoFill: () => void;
  onRefresh: () => void;
  onSaveMissingSwatch: (master: MasterCatalogRow) => void;
  onSwatchDraftChange: (masterId: string, value: string) => void;
  onVendorFilterChange: (vendor: string) => void;
};

export function SettingsMissingSwatchesPanel({
  busy,
  catalogRefreshBusy,
  confirmBulkSwatch,
  missingSwatchCount,
  swatchBusy,
  swatchDraftById,
  swatchVendorFilter,
  swatchVendorOptions,
  tauri,
  t,
  visibleMissingSwatchMasters,
  visibleMissingSwatchVendorCount,
  onBulkAutoFill,
  onRefresh,
  onSaveMissingSwatch,
  onSwatchDraftChange,
  onVendorFilterChange,
}: SettingsMissingSwatchesPanelProps) {
  const disabled = !tauri || busy || swatchBusy || catalogRefreshBusy;

  return (
    <div className="surface-subtle mt-6 overflow-hidden p-0">
      <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <div className="section-eyebrow">{t("settings.swatchQuality", "Swatch quality")}</div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t(
                "settings.swatchQualityHelp",
                "Review missing swatches here, then save manual fixes or fill the visible list in bulk.",
              )}
            </div>
          </div>
          <div className={inlineStatusSignalClass("neutral", "text-sm")}>
            {t("settings.missingSwatches", "Missing swatches")}: {missingSwatchCount}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SettingsMetricTile
            label={t("settings.missingSwatches", "Missing swatches")}
            value={missingSwatchCount}
          />
          <SettingsMetricTile
            label={t("settings.visibleMissing", "Visible missing")}
            value={visibleMissingSwatchMasters.length}
          />
          <SettingsMetricTile
            label={t("inventory.vendorGroup", "Vendor")}
            value={visibleMissingSwatchVendorCount}
            hint={t("settings.missingSwatches", "Missing swatches")}
          />
        </div>
      </div>

      <div className="p-5">
        <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            {swatchVendorOptions.map((vendor) => (
              <button
                key={vendor}
                type="button"
                onClick={() => onVendorFilterChange(vendor)}
                className={chipButtonClass(swatchVendorFilter === vendor)}
              >
                {vendor === "ALL" ? t("common.all", "All") : vendor}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={settingsActionButtonClass()}
              onClick={onRefresh}
              disabled={disabled}
            >
              {t("common.refresh", "Refresh")}
            </button>
            <button
              type="button"
              className={settingsActionButtonClass("accent")}
              onClick={onBulkAutoFill}
              disabled={disabled || visibleMissingSwatchMasters.length === 0}
            >
              {swatchBusy
                ? t("settings.updatingSwatches", "Updating swatches...")
                : confirmBulkSwatch
                  ? t("settings.confirmBulkSwatchAction", "Confirm auto-fill")
                  : t("settings.autofillVisibleSwatches", "Auto-fill visible missing swatches")}
            </button>
          </div>
          {confirmBulkSwatch ? (
            <div className="mt-3 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              {t(
                "settings.confirmBulkSwatchTapAgain",
                "Click Auto-fill visible missing swatches again to confirm.",
              )}
            </div>
          ) : null}
        </div>

        {visibleMissingSwatchMasters.length === 0 ? (
          <div className="surface-subtle mt-4 border-dashed px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-300">
            {t("settings.noMissingSwatches", "No missing swatches to fill.")}
          </div>
        ) : (
          <div className="mt-4 max-h-[460px] space-y-3 overflow-auto pr-1">
            {visibleMissingSwatchMasters.map((master) => {
              const draftHex = swatchDraftById[master.id] ?? suggestHexFromColor(master);
              const normalizedDraft =
                normalizeSwatchValue(draftHex, { uppercase: true }) ?? suggestHexFromColor(master);

              return (
                <div
                  key={master.id}
                  className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <InventorySwatchChip
                        className="mt-0.5 h-11 w-11 rounded-lg"
                        swatchColor={normalizedDraft}
                        title={normalizedDraft}
                        tone="soft"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatFilamentDisplayTitle(
                            master.material,
                            master.filament_name,
                            master.color_name,
                          )}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                          {master.vendor} / ID: {master.id}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[120px_56px_auto] xl:min-w-[308px]">
                      <input
                        type="text"
                        value={draftHex}
                        onChange={(event) => onSwatchDraftChange(master.id, event.target.value)}
                        className={settingsCompactFormControlClass}
                        placeholder="#RRGGBB / gradient(...) / multi(...)"
                        disabled={disabled}
                      />
                      <input
                        type="color"
                        value={toSwatchColor(normalizedDraft)}
                        onChange={(event) => onSwatchDraftChange(master.id, event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-900/70"
                        disabled={disabled}
                      />
                      <button
                        type="button"
                        className={settingsActionButtonClass()}
                        onClick={() => onSaveMissingSwatch(master)}
                        disabled={disabled}
                      >
                        {t("common.save", "Save")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
