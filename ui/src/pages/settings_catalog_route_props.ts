import type { ComponentProps } from "react";
import type { SettingsCatalogTabProps } from "./settings_catalog_tab";
import { SettingsCatalogRefreshPanel } from "./settings_catalog_refresh_panel";
import { SettingsMissingSwatchesPanel } from "../components/settings_missing_swatches_panel";

type SettingsCatalogRouteProps = SettingsCatalogTabProps;
type CatalogRefreshPanelProps = ComponentProps<typeof SettingsCatalogRefreshPanel>;
type MissingSwatchesPanelProps = ComponentProps<typeof SettingsMissingSwatchesPanel>;

type BuildCatalogRefreshPanelPropsInput = Omit<
  CatalogRefreshPanelProps,
  "onRefreshVendorCatalog"
> & {
  onRefreshVendorCatalog: (
    ...args: Parameters<CatalogRefreshPanelProps["onRefreshVendorCatalog"]>
  ) => Promise<void> | void;
};

type BuildMissingSwatchesPanelPropsInput = Omit<
  MissingSwatchesPanelProps,
  "onBulkAutoFill" | "onRefresh" | "onSaveMissingSwatch"
> & {
  onBulkAutoFill: () => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
  onSaveMissingSwatch: (
    ...args: Parameters<MissingSwatchesPanelProps["onSaveMissingSwatch"]>
  ) => Promise<void> | void;
};

type BuildSettingsCatalogRoutePropsInput = {
  helpText: string;
  missingSwatchesPanel: BuildMissingSwatchesPanelPropsInput;
  refreshPanel: BuildCatalogRefreshPanelPropsInput;
};

export function buildSettingsCatalogRouteProps({
  helpText,
  missingSwatchesPanel,
  refreshPanel,
}: BuildSettingsCatalogRoutePropsInput): SettingsCatalogRouteProps {
  return {
    helpText,
    missingSwatchesPanel: {
      ...missingSwatchesPanel,
      onBulkAutoFill: () => void missingSwatchesPanel.onBulkAutoFill(),
      onRefresh: () => void missingSwatchesPanel.onRefresh(),
      onSaveMissingSwatch: (...args) =>
        void missingSwatchesPanel.onSaveMissingSwatch(...args),
    },
    refreshPanel: {
      ...refreshPanel,
      onRefreshVendorCatalog: (...args) =>
        void refreshPanel.onRefreshVendorCatalog(...args),
    },
  };
}
