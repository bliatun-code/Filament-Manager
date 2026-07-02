import {
  SettingsMaintenanceTab,
  type SettingsMaintenanceTabProps,
} from "../components/settings_maintenance_tab";

export type SettingsMaintenanceRouteProps = {
  tab: SettingsMaintenanceTabProps;
};

export function SettingsMaintenanceRoute({ tab }: SettingsMaintenanceRouteProps) {
  return <SettingsMaintenanceTab {...tab} />;
}
