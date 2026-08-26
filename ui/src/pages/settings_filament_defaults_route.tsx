import {
  SettingsFilamentDefaultsTab,
  type SettingsFilamentDefaultsTabProps,
} from "../components/settings_filament_defaults_tab";

export type SettingsFilamentDefaultsRouteProps = {
  tab: SettingsFilamentDefaultsTabProps;
};

export function SettingsFilamentDefaultsRoute({
  tab,
}: SettingsFilamentDefaultsRouteProps) {
  return <SettingsFilamentDefaultsTab {...tab} />;
}
