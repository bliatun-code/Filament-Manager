import {
  SettingsGeneralTab,
  type SettingsGeneralTabProps,
} from "../components/settings_general_tab";

export type SettingsGeneralRouteProps = {
  tab: SettingsGeneralTabProps;
};

export function SettingsGeneralRoute({ tab }: SettingsGeneralRouteProps) {
  return <SettingsGeneralTab {...tab} />;
}
