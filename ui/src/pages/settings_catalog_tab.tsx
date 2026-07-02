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

  useEffect(() => {
    if (desktopVisualQaScenarioRef.current !== "settings-catalog-swatch-review") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      missingSwatchesRef.current?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <SettingsSurfaceCard className="xl:col-span-2">
      <div className="text-sm text-slate-700 dark:text-slate-300">{helpText}</div>

      <SettingsCatalogRefreshPanel {...refreshPanel} />
      <div ref={missingSwatchesRef}>
        <SettingsMissingSwatchesPanel {...missingSwatchesPanel} />
      </div>
    </SettingsSurfaceCard>
  );
}
