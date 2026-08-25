import type { ComponentProps } from "react";
import type { SettingsLibraryRoleModalRoute } from "./settings_library_role_modal_route";

type SettingsLibraryRoleModalRouteProps = ComponentProps<
  typeof SettingsLibraryRoleModalRoute
>;
type SettingsLibraryRoleModalProps = SettingsLibraryRoleModalRouteProps["modal"];

type AsyncModalActionKeys = "onConfirm" | "onExportFullBackup";

type BuildSettingsLibraryRoleModalRoutePropsInput = Omit<
  SettingsLibraryRoleModalProps,
  AsyncModalActionKeys
> & {
  onConfirm: () => Promise<void> | void;
  onExportFullBackup: () => Promise<void> | void;
};

export function buildSettingsLibraryRoleModalRouteProps({
  onConfirm,
  onExportFullBackup,
  ...modal
}: BuildSettingsLibraryRoleModalRoutePropsInput): SettingsLibraryRoleModalRouteProps {
  return {
    modal: {
      ...modal,
      onConfirm: () => void onConfirm(),
      onExportFullBackup: () => void onExportFullBackup(),
    },
  };
}
