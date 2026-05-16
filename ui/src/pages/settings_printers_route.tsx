import type { ComponentProps } from "react";
import { SettingsPrintersTab } from "../components/settings_printers_tab";

type SettingsPrintersRouteProps = {
  tab: ComponentProps<typeof SettingsPrintersTab>;
};

export function SettingsPrintersRoute({ tab }: SettingsPrintersRouteProps) {
  return <SettingsPrintersTab {...tab} />;
}
