import type { ComponentProps } from "react";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";
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
  return (
    <section className="surface-card xl:col-span-2">
      <div className="text-sm text-slate-700 dark:text-slate-300">{helpText}</div>

      <SettingsCatalogRefreshPanel {...refreshPanel} />
      <SettingsMissingSwatchesPanel {...missingSwatchesPanel} />
    </section>
  );
}
