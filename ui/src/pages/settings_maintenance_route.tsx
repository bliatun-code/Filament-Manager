import type { ComponentProps } from "react";
import { SettingsMaintenanceTab } from "../components/settings_maintenance_tab";

type SettingsMaintenanceRouteProps = {
  tab: ComponentProps<typeof SettingsMaintenanceTab>;
};

export function SettingsMaintenanceRoute({ tab }: SettingsMaintenanceRouteProps) {
  return <SettingsMaintenanceTab {...tab} />;
}
