import type { ComponentProps } from "react";
import { SettingsCatalogTab } from "./settings_catalog_tab";
import { SettingsGeneralRoute } from "./settings_general_route";
import { SettingsLibraryTab } from "./settings_library_tab";
import { SettingsMaintenanceRoute } from "./settings_maintenance_route";
import { SettingsPrintersRoute } from "./settings_printers_route";
import { SettingsRouteOutlet } from "./settings_route_outlet";

type SettingsRouteOutletProps = ComponentProps<typeof SettingsRouteOutlet>;

type BuildSettingsRouteMapPropsInput = {
  catalog: ComponentProps<typeof SettingsCatalogTab>;
  general: ComponentProps<typeof SettingsGeneralRoute>;
  library: ComponentProps<typeof SettingsLibraryTab>;
  maintenance: ComponentProps<typeof SettingsMaintenanceRoute>;
  printers: ComponentProps<typeof SettingsPrintersRoute>;
};

export function buildSettingsRouteMapProps({
  catalog,
  general,
  library,
  maintenance,
  printers,
}: BuildSettingsRouteMapPropsInput): SettingsRouteOutletProps["routes"] {
  return {
    CATALOG: <SettingsCatalogTab {...catalog} />,
    GENERAL: <SettingsGeneralRoute {...general} />,
    LIBRARY: <SettingsLibraryTab {...library} />,
    MAINTENANCE: <SettingsMaintenanceRoute {...maintenance} />,
    PRINTERS: <SettingsPrintersRoute {...printers} />,
  };
}
