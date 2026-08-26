import type { ComponentProps } from "react";
import type { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";

type SettingsLibraryServerPanelProps = ComponentProps<typeof SettingsTrustedLanServerPanel>;

type AsyncServerActionKeys = "onSaveNetwork";

type BuildSettingsLibraryServerPanelPropsInput = Omit<
  SettingsLibraryServerPanelProps,
  AsyncServerActionKeys
> & {
  onSaveNetwork: () => Promise<void> | void;
};

export function buildSettingsLibraryServerPanelProps({
  onSaveNetwork,
  ...props
}: BuildSettingsLibraryServerPanelPropsInput): SettingsLibraryServerPanelProps {
  return {
    ...props,
    onSaveNetwork: () => void onSaveNetwork(),
  };
}
