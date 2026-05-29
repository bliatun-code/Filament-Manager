import { SettingsMetricTile } from "../components/settings_ui";
import {
  chipButtonClass,
  settingsActionButtonClass,
} from "../lib/settings_ui_classes";
import type { CatalogRefreshResult } from "../lib/tauri_client";
import {
  settingsCatalogRefreshSummaryGridClass,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsCatalogRefreshPanelProps = {
  activeCatalogMasterCount: number;
  activeCatalogMaterialOptions: string[];
  activeCatalogRefreshMaterials: string[];
  busy: boolean;
  catalogCount: number;
  catalogRefreshBusy: boolean;
  catalogRefreshElapsedSeconds: number;
  catalogRefreshLog: string;
  catalogRefreshPhase: string;
  catalogRefreshProgressMessage: string;
  catalogRefreshSummary: CatalogRefreshResult | null;
  catalogRefreshVendor: SettingsCatalogVendor;
  catalogVendor: SettingsCatalogVendor;
  showCatalogRefreshLog: boolean;
  swatchBusy: boolean;
  tauri: boolean;
  t: TranslateFn;
  onClearCatalogRefreshMaterials: (vendor: SettingsCatalogVendor) => void;
  onRefreshVendorCatalog: (vendor: SettingsCatalogVendor) => void;
  onSetCatalogVendor: (vendor: SettingsCatalogVendor) => void;
  onToggleCatalogRefreshLog: () => void;
  onToggleCatalogRefreshMaterial: (vendor: SettingsCatalogVendor, material: string) => void;
};

export function SettingsCatalogRefreshPanel({
  activeCatalogMasterCount,
  activeCatalogMaterialOptions,
  activeCatalogRefreshMaterials,
  busy,
  catalogCount,
  catalogRefreshBusy,
  catalogRefreshElapsedSeconds,
  catalogRefreshLog,
  catalogRefreshPhase,
  catalogRefreshProgressMessage,
  catalogRefreshSummary,
  catalogRefreshVendor,
  catalogVendor,
  showCatalogRefreshLog,
  swatchBusy,
  tauri,
  t,
  onClearCatalogRefreshMaterials,
  onRefreshVendorCatalog,
  onSetCatalogVendor,
  onToggleCatalogRefreshLog,
  onToggleCatalogRefreshMaterial,
}: SettingsCatalogRefreshPanelProps) {
  return (
    <div className="surface-subtle mt-4 overflow-hidden p-0">
      <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <div className="section-eyebrow">
              {t("settings.catalogRefreshTitle", "Vendor catalog updates")}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t(
                "settings.catalogRefreshHelp",
                "Choose vendor and optionally limit the refresh to selected material families to reduce traffic and spread catalogue imports over time.",
              )}
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-none">
            {t("settings.totalCatalog", "Catalog")}: {catalogCount}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SettingsMetricTile label={t("settings.totalCatalog", "Catalog")} value={catalogCount} />
          <SettingsMetricTile label={catalogVendor} value={activeCatalogMasterCount} />
          <SettingsMetricTile
            label={t("inventory.materialGroup", "Material")}
            value={activeCatalogMaterialOptions.length}
            hint={
              activeCatalogRefreshMaterials.length > 0
                ? activeCatalogRefreshMaterials.join(", ")
                : t("settings.catalogAllTypes", "All types")
            }
          />
        </div>
      </div>

      <div className="p-5">
        <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
          <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {t("inventory.vendorGroup", "Vendor")}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["Bambu", "eSUN"] as const).map((vendor) => (
                  <button
                    key={vendor}
                    type="button"
                    onClick={() => onSetCatalogVendor(vendor)}
                    className={chipButtonClass(catalogVendor === vendor)}
                  >
                    {vendor}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {t("inventory.materialGroup", "Material")}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onClearCatalogRefreshMaterials(catalogVendor)}
                  className={chipButtonClass(activeCatalogRefreshMaterials.length === 0)}
                >
                  {t("settings.catalogAllTypes", "All types")}
                </button>
                {activeCatalogMaterialOptions.map((material) => (
                  <button
                    key={`${catalogVendor}-${material}`}
                    type="button"
                    onClick={() => onToggleCatalogRefreshMaterial(catalogVendor, material)}
                    className={chipButtonClass(activeCatalogRefreshMaterials.includes(material))}
                  >
                    {material}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={settingsActionButtonClass("accent")}
              onClick={() => onRefreshVendorCatalog(catalogVendor)}
              disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
            >
              {catalogRefreshBusy && catalogRefreshVendor === catalogVendor
                ? t("wishlist.refreshing", "Refreshing")
                : t("settings.refreshCurrentVendor", "Refresh current vendor catalog")}
            </button>
            <button
              type="button"
              className={settingsActionButtonClass()}
              onClick={onToggleCatalogRefreshLog}
              disabled={!catalogRefreshLog.trim()}
            >
              {showCatalogRefreshLog
                ? t("settings.hideRefreshLog", "Hide refresh log")
                : t("wishlist.viewRefreshLog", "View refresh log")}
            </button>
          </div>
        </div>

        {catalogRefreshBusy ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {catalogRefreshVendor} {t("wishlist.catalog", "catalog")}
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {catalogRefreshProgressMessage}
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                {catalogRefreshVendor}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SettingsMetricTile label={t("wishlist.phase", "Phase")} value={catalogRefreshPhase} />
              <SettingsMetricTile
                label={t("wishlist.elapsed", "Elapsed")}
                value={`${catalogRefreshElapsedSeconds}s`}
              />
            </div>
            <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-2 w-2/3 animate-pulse rounded-full bg-slate-900 dark:bg-slate-100" />
            </div>
          </div>
        ) : null}

        {catalogRefreshSummary ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950 shadow-sm shadow-emerald-200/30 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:shadow-none">
            <div
              className={`grid gap-3 ${settingsCatalogRefreshSummaryGridClass(
                catalogRefreshSummary,
              )}`}
            >
              <SettingsMetricTile
                label={t("inventory.imported", "Imported")}
                value={catalogRefreshSummary.imported}
                className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
              />
              <SettingsMetricTile
                label={t("inventory.reactivated", "Reactivated")}
                value={catalogRefreshSummary.reactivated_count}
                className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
              />
              <SettingsMetricTile
                label={t("inventory.discontinued", "Discontinued")}
                value={catalogRefreshSummary.discontinued_count}
                className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
              />
              {catalogRefreshSummary.reused_cached_products != null ? (
                <SettingsMetricTile
                  label={t("settings.cachedReused", "Cached reused")}
                  value={catalogRefreshSummary.reused_cached_products}
                  className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                />
              ) : null}
              {catalogRefreshSummary.detail_fetches != null ? (
                <SettingsMetricTile
                  label={t("settings.detailFetches", "Detail fetches")}
                  value={catalogRefreshSummary.detail_fetches}
                  className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
                />
              ) : null}
            </div>
            {catalogRefreshSummary.detected_store ? (
              <div className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
                {catalogRefreshSummary.detected_store} /{" "}
                {catalogRefreshSummary.detected_collection ??
                  t("inventory.unknownCollection", "unknown collection")}
              </div>
            ) : null}
            {catalogRefreshSummary.discovered_materials?.length ? (
              <div className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
                <span className="font-semibold">
                  {t("settings.discoveredMaterials", "Discovered materials")}:
                </span>{" "}
                {catalogRefreshSummary.discovered_materials.join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {showCatalogRefreshLog ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {catalogRefreshVendor} {t("wishlist.refreshLog", "refresh log")}
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
              {catalogRefreshLog ||
                t("wishlist.noRefreshOutput", "No refresh output available yet.")}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
