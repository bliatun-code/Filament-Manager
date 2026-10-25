import type { ComponentProps } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { SettingsFeedbackStack } from "./settings_feedback_stack";
import { SettingsLibraryRoleModalRoute } from "./settings_library_role_modal_route";
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
    <div className="page-shell settings-balanced-layout">
      <header className="settings-balanced-header">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="sr-only">{subtitle}</p>
      </header>
      <div className="settings-balanced-body">
        <SettingsTabNav label={title} onTabChange={onTabChange} tabs={tabButtons} />
        <div className="settings-balanced-content">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{tabButtons.find((tab) => tab.active)?.label}</h2>
          <SettingsFeedbackStack
            desktopOnlyMessage={desktopOnlyMessage}
            error={error}
            info={info}
            tauri={tauri}
          />
          <SettingsRouteOutlet activeTab={activeTab} routes={routes} />
        </div>
      </div>
      <SettingsLibraryRoleModalRoute {...roleModal} />
    </div>
  );
}
