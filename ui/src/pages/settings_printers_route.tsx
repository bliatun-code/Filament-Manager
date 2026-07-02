import {
  SettingsPrintersTab,
  type SettingsPrintersTabProps,
} from "../components/settings_printers_tab";

export type SettingsPrintersRouteProps = {
  tab: SettingsPrintersTabProps;
};

export function SettingsPrintersRoute({ tab }: SettingsPrintersRouteProps) {
  return <SettingsPrintersTab {...tab} />;
}
