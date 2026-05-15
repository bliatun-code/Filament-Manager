import type { ComponentProps } from "react";
import { SettingsGeneralTab } from "../components/settings_general_tab";

type SettingsGeneralRouteProps = {
  tab: ComponentProps<typeof SettingsGeneralTab>;
};

export function SettingsGeneralRoute({ tab }: SettingsGeneralRouteProps) {
  return <SettingsGeneralTab {...tab} />;
}
