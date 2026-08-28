import {
  SettingsMetricTile,
  SettingsNotice,
  SettingsSectionBody,
  SettingsSectionControls,
  SettingsSectionHeader,
  SettingsSectionPanel,
} from "../components/settings_ui";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import { formatDisplayInteger } from "../lib/number_display";
import {
  chipButtonClass,
  settingsActionButtonClass,
} from "../lib/settings_ui_classes";
import type {
  CatalogRefreshResult,
  CatalogSourceAuditResult,
} from "../lib/tauri_client";
import {
  settingsCatalogRefreshSummaryGridClass,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

type TranslateFn = ReturnType<typeof useI18n>["t"];

type SettingsCatalogRefreshPanelProps = {
  activeCatalogMasterCount: number;
  activeCatalogMaterialOptions: string[];
  activeCatalogRefreshMaterial: string | null;
  busy: boolean;
  catalogCount: number;
  catalogRefreshBusy: boolean;
  catalogRefreshElapsedSeconds: number;
  catalogRefreshLog: string;
  catalogRefreshPhase: string;
  catalogRefreshProgressMessage: string;
  catalogRefreshSummary: CatalogRefreshResult | null;
  catalogSourceAuditSummary: CatalogSourceAuditResult | null;
  catalogRefreshVendor: SettingsCatalogVendor;
  catalogVendor: SettingsCatalogVendor;
  showCatalogRefreshLog: boolean;
  settingsClientReadOnly: boolean;
  swatchBusy: boolean;
  tauri: boolean;
  t: TranslateFn;
  onAuditVendorCatalog: (vendor: SettingsCatalogVendor) => void;
  onRefreshVendorCatalog: (vendor: SettingsCatalogVendor) => void;
  onSetCatalogVendor: (vendor: SettingsCatalogVendor) => void;
  onToggleCatalogRefreshLog: () => void;
  onSelectCatalogRefreshMaterial: (vendor: SettingsCatalogVendor, material: string) => void;
};

export function SettingsCatalogRefreshPanel({
  activeCatalogMasterCount,
  activeCatalogMaterialOptions,
  activeCatalogRefreshMaterial,
  busy,
  catalogCount,
  catalogRefreshBusy,
  catalogRefreshElapsedSeconds,
  catalogRefreshLog,
  catalogRefreshPhase,
  catalogRefreshProgressMessage,
  catalogRefreshSummary,
  catalogSourceAuditSummary,
  catalogRefreshVendor,
  catalogVendor,
  showCatalogRefreshLog,
  settingsClientReadOnly,
  swatchBusy,
  tauri,
  t,
  onAuditVendorCatalog,
  onRefreshVendorCatalog,
  onSetCatalogVendor,
  onToggleCatalogRefreshLog,
  onSelectCatalogRefreshMaterial,
}: SettingsCatalogRefreshPanelProps) {
  const { locale } = useI18n();
  const refreshActionLabel = activeCatalogRefreshMaterial
    ? t(
        "settings.refreshSelectedMaterial",
        "Refresh {material}",
        { material: activeCatalogRefreshMaterial },
      )
    : t("settings.selectOneMaterial", "Select one material type");
  const discovering = catalogRefreshBusy && catalogRefreshPhase === "DISCOVER";

  return (
    <SettingsSectionPanel className="mt-4">
      <SettingsSectionHeader
        eyebrow={t("settings.catalogRefreshTitle", "Vendor catalog updates")}
        description={t(
          "settings.catalogDiscoveryHelp",
          "Check the store to update which material types can be fetched. This check does not download products or change the filament catalog.",
        )}
        status={
          <div className={inlineStatusSignalClass("neutral", "text-sm")}>
            {t("settings.totalCatalog", "Catalog")}:{" "}
            {formatDisplayInteger(catalogCount, locale)}
          </div>
        }
        metrics={
          <>
            <SettingsMetricTile label={t("settings.totalCatalog", "Catalog")} value={catalogCount} />
            <SettingsMetricTile label={catalogVendor} value={activeCatalogMasterCount} />
            <SettingsMetricTile
              label={t("inventory.materialGroup", "Material")}
              value={activeCatalogMaterialOptions.length}
              hint={
                activeCatalogRefreshMaterial ??
                t("settings.selectOneMaterial", "Select one material type")
              }
            />
          </>
        }
      >
        {settingsClientReadOnly ? (
          <SettingsNotice className="mt-3" tone="info">
            {t(
              "settings.catalogRefreshClientHostOnly",
              "Vendor catalog updates run on the host. This client still shows the host catalog and can save swatch fixes there.",
            )}
          </SettingsNotice>
        ) : null}
      </SettingsSectionHeader>

      <SettingsSectionBody>
        <SettingsSectionControls>
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
                {t("settings.availableCatalogMaterials", "Available for refresh")}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activeCatalogMaterialOptions.map((material) => (
                  <button
                    key={`${catalogVendor}-${material}`}
                    type="button"
                    onClick={() => onSelectCatalogRefreshMaterial(catalogVendor, material)}
                    className={chipButtonClass(activeCatalogRefreshMaterial === material)}
                    aria-pressed={activeCatalogRefreshMaterial === material}
                  >
                    {material}
                  </button>
                ))}
              </div>
              {activeCatalogMaterialOptions.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t(
                    "settings.catalogDiscoveryEmpty",
                    "No checked material types yet. Check the vendor source to create the list.",
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={settingsActionButtonClass()}
              onClick={() => onAuditVendorCatalog(catalogVendor)}
              disabled={!tauri || busy || swatchBusy || catalogRefreshBusy}
            >
              {discovering && catalogRefreshVendor === catalogVendor
                ? t(
                    "settings.discoveringCatalogMaterials",
                    "Finding available material types...",
                  )
                : t(
                    "settings.discoverCatalogMaterials",
                    "Find available material types",
                  )}
            </button>
            <button
              type="button"
              className={settingsActionButtonClass("accent")}
              onClick={() => onRefreshVendorCatalog(catalogVendor)}
              disabled={
                !tauri ||
                busy ||
                swatchBusy ||
                catalogRefreshBusy ||
                !activeCatalogRefreshMaterial
              }
            >
              {catalogRefreshBusy && !discovering && catalogRefreshVendor === catalogVendor
                ? t("wishlist.refreshing", "Refreshing")
                : refreshActionLabel}
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
        </SettingsSectionControls>

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
              <div className={inlineStatusSignalClass("neutral", "text-xs")}>
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
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
              role="progressbar"
              aria-label={catalogRefreshProgressMessage}
            >
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-slate-400/35 via-slate-900 to-slate-400/35 dark:from-slate-600/45 dark:via-slate-100 dark:to-slate-600/45" />
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

        {catalogSourceAuditSummary ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950 shadow-sm shadow-emerald-200/30 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:shadow-none">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsMetricTile
                label={t("settings.discoveredMaterials", "Discovered materials")}
                value={catalogSourceAuditSummary.discovered_materials.length}
                className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
              />
              <SettingsMetricTile
                label={t("settings.detailFetches", "Detail fetches")}
                value={catalogSourceAuditSummary.detail_fetches}
                className="border-emerald-200/80 bg-white/75 text-inherit dark:border-emerald-400/30 dark:bg-emerald-950/20"
              />
            </div>
            <div className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
              {catalogSourceAuditSummary.detected_store}
              {catalogSourceAuditSummary.detected_collection
                ? ` / ${catalogSourceAuditSummary.detected_collection}`
                : ""}
            </div>
            <div className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
              <span className="font-semibold">
                {t("settings.availableCatalogMaterials", "Available for refresh")}:
              </span>{" "}
              {catalogSourceAuditSummary.discovered_materials.join(", ")}
            </div>
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
      </SettingsSectionBody>
    </SettingsSectionPanel>
  );
}
