import { useEffect, useRef, type ComponentProps } from "react";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
import { SettingsSurfaceCard } from "../components/settings_ui";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
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

  return (
    <SettingsSurfaceCard className="xl:col-span-2">
      <div className="text-sm text-slate-700 dark:text-slate-300">{helpText}</div>

      <SettingsCatalogRefreshPanel {...refreshPanel} />
      <div
        id="settings-catalog-swatch-review-panel"
        ref={missingSwatchesRef}
        className="scroll-mt-24"
      >
        <SettingsMissingSwatchesPanel {...missingSwatchesPanel} />
      </div>
    </SettingsSurfaceCard>
  );
}
