import type { ComponentProps } from "react";
import type { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";

type SettingsLibraryPairingPanelProps = ComponentProps<typeof SettingsTrustedLanPairingPanel>;

type AsyncPairingActionKeys = "onCopyPairingLink" | "onCreatePairingLink";

type BuildSettingsLibraryPairingPanelPropsInput = Omit<
  SettingsLibraryPairingPanelProps,
  AsyncPairingActionKeys
> & {
  onCopyPairingLink: () => Promise<void> | void;
  onCreatePairingLink: () => Promise<void> | void;
};

export function buildSettingsLibraryPairingPanelProps({
  onCopyPairingLink,
  onCreatePairingLink,
  ...props
}: BuildSettingsLibraryPairingPanelPropsInput): SettingsLibraryPairingPanelProps {
  return {
    ...props,
    onCopyPairingLink: () => void onCopyPairingLink(),
    onCreatePairingLink: () => void onCreatePairingLink(),
  };
}
