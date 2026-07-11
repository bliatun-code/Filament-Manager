import type { SettingsGeneralRouteProps } from "./settings_general_route";
type SettingsGeneralTabProps = SettingsGeneralRouteProps["tab"];

type BuildSettingsGeneralRoutePropsInput = Omit<
  SettingsGeneralTabProps,
  "onOpenInventoryLabelSheet"
> & {
  onOpenInventoryLabelSheet: () => Promise<void> | void;
};

export function buildSettingsGeneralRouteProps({
  onOpenInventoryLabelSheet,
  ...tab
}: BuildSettingsGeneralRoutePropsInput): SettingsGeneralRouteProps {
  return {
    tab: {
      ...tab,
      onOpenInventoryLabelSheet: () => void onOpenInventoryLabelSheet(),
    },
  };
}
