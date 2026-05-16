import type { ComponentProps } from "react";
import { SettingsGeneralRoute } from "./settings_general_route";

type SettingsGeneralRouteProps = ComponentProps<typeof SettingsGeneralRoute>;
type SettingsGeneralTabProps = SettingsGeneralRouteProps["tab"];

type BuildSettingsGeneralRoutePropsInput = Omit<
  SettingsGeneralTabProps,
  "onPrintInventoryOverviewA4"
> & {
  onPrintInventoryOverviewA4: () => Promise<void> | void;
};

export function buildSettingsGeneralRouteProps({
  onPrintInventoryOverviewA4,
  ...tab
}: BuildSettingsGeneralRoutePropsInput): SettingsGeneralRouteProps {
  return {
    tab: {
      ...tab,
      onPrintInventoryOverviewA4: () => void onPrintInventoryOverviewA4(),
    },
  };
}
