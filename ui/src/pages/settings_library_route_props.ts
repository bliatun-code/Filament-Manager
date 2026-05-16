import type { ComponentProps } from "react";
import { SettingsLibraryTab } from "./settings_library_tab";

type SettingsLibraryRouteProps = ComponentProps<typeof SettingsLibraryTab>;

export function buildSettingsLibraryRouteProps(
  props: SettingsLibraryRouteProps,
): SettingsLibraryRouteProps {
  return props;
}
