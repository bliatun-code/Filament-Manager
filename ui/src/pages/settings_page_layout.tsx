import type { ComponentProps } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { SettingsFeedbackStack } from "./settings_feedback_stack";
import { SettingsLibraryRoleModalRoute } from "./settings_library_role_modal_route";
import { SettingsPageHeader } from "./settings_page_header";
import type { SettingsPageTabButton } from "./settings_page_model";
import { SettingsRouteOutlet } from "./settings_route_outlet";
import { SettingsTabNav } from "./settings_tab_nav";

type SettingsPageLayoutProps = {
  activeTab: SettingsTabKey;
  desktopOnlyMessage: string;
  error: string | null;
  info: string | null;
  onTabChange: (tab: SettingsTabKey) => void;
  roleModal: ComponentProps<typeof SettingsLibraryRoleModalRoute>;
  routes: ComponentProps<typeof SettingsRouteOutlet>["routes"];
  subtitle: string;
  tabButtons: SettingsPageTabButton[];
  tauri: boolean;
  title: string;
};

export function SettingsPageLayout({
  activeTab,
  desktopOnlyMessage,
  error,
  info,
  onTabChange,
  roleModal,
  routes,
  subtitle,
  tabButtons,
  tauri,
  title,
}: SettingsPageLayoutProps) {
  return (
    <div className="page-shell">
      <SettingsPageHeader subtitle={subtitle} title={title} />

      <SettingsFeedbackStack
        desktopOnlyMessage={desktopOnlyMessage}
        error={error}
        info={info}
        tauri={tauri}
      />

      <SettingsTabNav onTabChange={onTabChange} tabs={tabButtons} />

      <SettingsRouteOutlet activeTab={activeTab} routes={routes} />
      <SettingsLibraryRoleModalRoute {...roleModal} />
    </div>
  );
}
