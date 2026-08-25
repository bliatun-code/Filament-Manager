import type { ComponentProps } from "react";
import type { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";

type SettingsLibraryBrowsersPanelProps = ComponentProps<typeof SettingsTrustedLanBrowsersPanel>;

type AsyncBrowserActionKeys = "onRevokeAllBrowsers" | "onRevokeBrowser";

type BuildSettingsLibraryBrowsersPanelPropsInput = Omit<
  SettingsLibraryBrowsersPanelProps,
  AsyncBrowserActionKeys
> & {
  onRevokeAllBrowsers: () => Promise<void> | void;
  onRevokeBrowser: (
    ...args: Parameters<SettingsLibraryBrowsersPanelProps["onRevokeBrowser"]>
  ) => Promise<void> | void;
};

export function buildSettingsLibraryBrowsersPanelProps({
  onRevokeAllBrowsers,
  onRevokeBrowser,
  ...props
}: BuildSettingsLibraryBrowsersPanelPropsInput): SettingsLibraryBrowsersPanelProps {
  return {
    ...props,
    onRevokeAllBrowsers: () => void onRevokeAllBrowsers(),
    onRevokeBrowser: (...args) => void onRevokeBrowser(...args),
  };
}
