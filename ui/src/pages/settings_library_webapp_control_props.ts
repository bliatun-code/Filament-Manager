import type { ComponentProps } from "react";
import { SettingsLibraryWebappControl } from "./settings_library_webapp_control";

type SettingsLibraryWebappControlProps = ComponentProps<typeof SettingsLibraryWebappControl>;

type BuildSettingsLibraryWebappControlPropsInput = Omit<
  SettingsLibraryWebappControlProps,
  "onToggleTrustedLanEnabled"
> & {
  onToggleTrustedLanEnabled: (
    ...args: Parameters<SettingsLibraryWebappControlProps["onToggleTrustedLanEnabled"]>
  ) => Promise<void> | void;
};

export function buildSettingsLibraryWebappControlProps({
  onToggleTrustedLanEnabled,
  ...props
}: BuildSettingsLibraryWebappControlPropsInput): SettingsLibraryWebappControlProps {
  return {
    ...props,
    onToggleTrustedLanEnabled: (...args) => void onToggleTrustedLanEnabled(...args),
  };
}
