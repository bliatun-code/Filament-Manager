import type { ReactNode } from "react";
import type { SettingsCatalogTabProps } from "./settings_catalog_tab";
import type { SettingsGeneralRouteProps } from "./settings_general_route";
import {
  SettingsCatalogTab,
  SettingsGeneralRoute,
  SettingsLibraryTab,
  SettingsMaintenanceRoute,
  SettingsPrintersRoute,
} from "./settings_lazy_routes";
import type { SettingsLibraryTabProps } from "./settings_library_tab";
import type { SettingsMaintenanceRouteProps } from "./settings_maintenance_route";
import type { SettingsTabKey } from "./settings_page_model";
import type { SettingsPrintersRouteProps } from "./settings_printers_route";

type BuildSettingsRouteMapPropsInput = {
  catalog: SettingsCatalogTabProps;
  general: SettingsGeneralRouteProps;
  library: SettingsLibraryTabProps;
  maintenance: SettingsMaintenanceRouteProps;
  printers: SettingsPrintersRouteProps;
};

export function buildSettingsRouteMapProps({
  catalog,
  general,
  library,
  maintenance,
  printers,
}: BuildSettingsRouteMapPropsInput): Record<SettingsTabKey, ReactNode> {
  return {
    CATALOG: <SettingsCatalogTab {...catalog} />,
    GENERAL: <SettingsGeneralRoute {...general} />,
    LIBRARY: <SettingsLibraryTab {...library} />,
    MAINTENANCE: <SettingsMaintenanceRoute {...maintenance} />,
    PRINTERS: <SettingsPrintersRoute {...printers} />,
  };
}
