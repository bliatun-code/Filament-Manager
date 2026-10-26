import { useEffect, useRef, useState, useId, type ComponentProps } from "react";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
import { SettingsSurfaceCard, SettingsNotice } from "../components/settings_ui";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import { useI18n } from "../lib/i18n";
import { formatDisplayInteger } from "../lib/number_display";
import { formatSettingsDateTime } from "../lib/settings_utils";
import { settingsCatalogProgressCopy } from "./settings_catalog_progress_copy";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";

export type SettingsCatalogTabProps = {
  helpText: string;
  missingSwatchesPanel: ComponentProps<typeof SettingsMissingSwatchesPanel>;
  refreshPanel: ComponentProps<typeof SettingsCatalogRefreshPanel>;
};

export function SettingsCatalogTab({
  helpText,
  missingSwatchesPanel,
  refreshPanel,
}: SettingsCatalogTabProps) {
  const { t, locale } = useI18n();
  const [activeSection, setActiveSection] = useState(() => resolveDesktopVisualQaScenario() === "settings-catalog-swatch-review" ? "SWATCHES" : "REFRESH");
  const panelId = useId();
  const missingSwatchesRef = useRef<HTMLDivElement>(null);
  const desktopVisualQaScenarioRef = useRef(resolveDesktopVisualQaScenario());
  const desktopVisualQaScrollAppliedRef = useRef(false);
  const visibleMissingSwatchCount = missingSwatchesPanel.visibleMissingSwatchMasters.length;

  useEffect(() => {
    if (
      desktopVisualQaScenarioRef.current !== "settings-catalog-swatch-review" ||
      desktopVisualQaScrollAppliedRef.current ||
      visibleMissingSwatchCount === 0
    ) {
      return;
    }
    setActiveSection("SWATCHES");
    const frame = window.requestAnimationFrame(() => {
      const target = missingSwatchesRef.current;
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: "auto", block: "start" });
      desktopVisualQaScrollAppliedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleMissingSwatchCount]);

  const [completion, setCompletion] = useState({ phase: refreshPanel.catalogRefreshPhase, confirmedAt: null as string | null });
  if (completion.phase !== refreshPanel.catalogRefreshPhase) {
    setCompletion({ phase: refreshPanel.catalogRefreshPhase, confirmedAt: refreshPanel.catalogRefreshPhase === "SUCCEEDED" ? new Date().toISOString() : null });
  }
  const succeeded = refreshPanel.catalogRefreshPhase === "SUCCEEDED";
  const showOperationStatus = activeSection === "SWATCHES" && (succeeded || refreshPanel.catalogRefreshBusy || refreshPanel.catalogRefreshPhase === "FAILED" || refreshPanel.catalogRefreshPhase === "INTERRUPTED" || refreshPanel.catalogRefreshUnavailable);
  const progress = settingsCatalogProgressCopy({phase:refreshPanel.catalogRefreshPhase,kind:refreshPanel.catalogRefreshKind,unavailable:refreshPanel.catalogRefreshUnavailable,vendor:refreshPanel.catalogRefreshVendor,t});

  return (
    <SettingsSurfaceCard className="settings-catalog-balanced">
      <p className="text-sm text-slate-600 dark:text-slate-300">{helpText}</p>
      <div className="settings-catalog-summary">
        <span>{t("settings.totalCatalog", "Catalog")}: <strong>{refreshPanel.catalogRowsAvailable ? formatDisplayInteger(refreshPanel.catalogCount,locale) : "—"}</strong></span>
        <span>{t("settings.missingSwatches", "Missing swatches")}: <strong>{missingSwatchesPanel.catalogRowsAvailable ? formatDisplayInteger(missingSwatchesPanel.missingSwatchCount,locale) : "—"}</strong></span>
      </div>
      <div className="settings-catalog-sections" role="group" aria-label={t("settings.tabCatalog", "Filament catalogue")}>
        <button type="button" aria-pressed={activeSection === "REFRESH"} aria-controls={`${panelId}-refresh`} onClick={() => setActiveSection("REFRESH")} className="app-control-focus">{t("settings.catalogRefreshTitle", "Vendor catalog updates")}</button>
        <button type="button" aria-pressed={activeSection === "SWATCHES"} aria-controls={`${panelId}-swatches`} onClick={() => setActiveSection("SWATCHES")} className="app-control-focus">{t("settings.swatchQuality", "Swatch quality")}</button>
      </div>
      {showOperationStatus ? <SettingsNotice tone={succeeded ? "success" : refreshPanel.catalogRefreshBusy ? "info" : "warning"}>
        <div className="flex flex-wrap items-center justify-between gap-3"><span role="status">{refreshPanel.catalogRefreshVendor} · {progress.message}{succeeded && completion.confirmedAt ? <> · <time dateTime={completion.confirmedAt}>{formatSettingsDateTime(completion.confirmedAt,locale)}</time></> : null}{succeeded && refreshPanel.catalogRefreshSummary ? <> · {t("inventory.imported", "Imported")}: {formatDisplayInteger(refreshPanel.catalogRefreshSummary.imported,locale)}</> : null}{succeeded && refreshPanel.catalogSourceAuditSummary ? <> · {t("settings.discoveredMaterials", "Discovered materials")}: {formatDisplayInteger(refreshPanel.catalogSourceAuditSummary.discovered_materials.length,locale)}</> : null}</span><button type="button" onClick={() => setActiveSection("REFRESH")} className="app-control-focus underline">{t("settings.catalogRefreshTitle", "Vendor catalog updates")}</button></div>
      </SettingsNotice> : null}
      <div id={`${panelId}-refresh`} hidden={activeSection !== "REFRESH"}>
        <SettingsCatalogRefreshPanel {...refreshPanel} compact />
      </div>
      <div id={`${panelId}-swatches`} hidden={activeSection !== "SWATCHES"}>
        <div id="settings-catalog-swatch-review-panel" ref={missingSwatchesRef} className="scroll-mt-24">
          <SettingsMissingSwatchesPanel {...missingSwatchesPanel} compact />
        </div>
      </div>
    </SettingsSurfaceCard>
  );
}
