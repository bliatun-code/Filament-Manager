import type { ComponentProps } from "react";
import { SettingsLibraryClientPanel } from "./settings_library_client_panel";

type SettingsLibraryClientPanelProps = ComponentProps<typeof SettingsLibraryClientPanel>;

type AsyncClientActionKeys =
  | "onClearClientAuth"
  | "onFetchSnapshot"
  | "onPairHost"
  | "onRenewClientAuth";

type BuildSettingsLibraryClientPanelPropsInput = Omit<
  SettingsLibraryClientPanelProps,
  AsyncClientActionKeys
> & {
  onClearClientAuth: () => Promise<void> | void;
  onFetchSnapshot: () => Promise<void> | void;
  onPairHost: () => Promise<void> | void;
  onRenewClientAuth: () => Promise<void> | void;
};

export function buildSettingsLibraryClientPanelProps({
  onClearClientAuth,
  onFetchSnapshot,
  onPairHost,
  onRenewClientAuth,
  ...props
}: BuildSettingsLibraryClientPanelPropsInput): SettingsLibraryClientPanelProps {
  return {
    ...props,
    onClearClientAuth: () => void onClearClientAuth(),
    onFetchSnapshot: () => void onFetchSnapshot(),
    onPairHost: () => void onPairHost(),
    onRenewClientAuth: () => void onRenewClientAuth(),
  };
}
