import type { ComponentProps } from "react";
import { SettingsLibraryRoleModal } from "../components/settings_library_role_modal";

type SettingsLibraryRoleModalRouteProps = {
  modal: ComponentProps<typeof SettingsLibraryRoleModal>;
};

export function SettingsLibraryRoleModalRoute({ modal }: SettingsLibraryRoleModalRouteProps) {
  return <SettingsLibraryRoleModal {...modal} />;
}
