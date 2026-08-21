import type { SettingsGeneralRouteProps } from "./settings_general_route";
type SettingsGeneralTabProps = SettingsGeneralRouteProps["tab"];

type BuildSettingsGeneralRoutePropsInput = SettingsGeneralTabProps;

export function buildSettingsGeneralRouteProps(
  tab: BuildSettingsGeneralRoutePropsInput,
): SettingsGeneralRouteProps {
  return {
    tab,
  };
}
