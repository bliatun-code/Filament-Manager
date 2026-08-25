import { lazy } from "react";

export const SettingsCatalogTab = lazy(() =>
  import("./settings_catalog_tab").then((module) => ({
    default: module.SettingsCatalogTab,
  })),
);

export const SettingsGeneralRoute = lazy(() =>
  import("./settings_general_route").then((module) => ({
    default: module.SettingsGeneralRoute,
  })),
);

export const SettingsFilamentDefaultsRoute = lazy(() =>
  import("./settings_filament_defaults_route").then((module) => ({
    default: module.SettingsFilamentDefaultsRoute,
  })),
);

export const SettingsLibraryTab = lazy(() =>
  import("./settings_library_tab").then((module) => ({
    default: module.SettingsLibraryTab,
  })),
);

export const SettingsMaintenanceRoute = lazy(() =>
  import("./settings_maintenance_route").then((module) => ({
    default: module.SettingsMaintenanceRoute,
  })),
);

export const SettingsPrintersRoute = lazy(() =>
  import("./settings_printers_route").then((module) => ({
    default: module.SettingsPrintersRoute,
  })),
);
