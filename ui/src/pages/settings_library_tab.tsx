import type { ComponentProps } from "react";
import { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";
import { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";
import { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";
import { SettingsSurfaceCard } from "../components/settings_ui";
import { SettingsLibraryClientPanel, SettingsLibraryClientAdvanced } from "./settings_library_client_panel";
import { SettingsLibraryRolePanel } from "./settings_library_role_panel";
import { SettingsLibraryWebappControl } from "./settings_library_webapp_control";
import { SettingsCompanionAccessRequests } from "../components/settings_companion_access_requests";

export type SettingsLibraryTabProps = {
  browsersPanel: ComponentProps<typeof SettingsTrustedLanBrowsersPanel>;
  clientPanel: ComponentProps<typeof SettingsLibraryClientPanel>;
  libraryRolePanel: ComponentProps<typeof SettingsLibraryRolePanel>;
  pairingPanel: ComponentProps<typeof SettingsTrustedLanPairingPanel>;
  serverPanel: ComponentProps<typeof SettingsTrustedLanServerPanel>;
  showClientPanel: boolean;
  showHostPanels: boolean;
  showServerPanel: boolean;
  title: string;
  webappControl: ComponentProps<typeof SettingsLibraryWebappControl>;
};

export function SettingsLibraryTab({
  browsersPanel,
  clientPanel,
  libraryRolePanel,
  pairingPanel,
  serverPanel,
  showClientPanel,
  showHostPanels,
  showServerPanel,
  title,
  webappControl,
}: SettingsLibraryTabProps) {
  return (
    <SettingsSurfaceCard className="settings-library-balanced space-y-0">
      <span className="sr-only">{title}</span>
      {showClientPanel ? <SettingsLibraryClientPanel {...clientPanel} hideAdvanced /> : null}
      <section className="settings-library-section settings-library-role">
        <SettingsLibraryRolePanel {...libraryRolePanel} />
      </section>
      <section className="settings-library-section settings-library-webapp">
        <SettingsLibraryWebappControl {...webappControl} />
        {showServerPanel ? <SettingsTrustedLanServerPanel {...serverPanel} /> : null}
      </section>
      {showClientPanel ? <section className="settings-library-section settings-library-advanced"><SettingsLibraryClientAdvanced {...clientPanel} /></section> : null}

      {showHostPanels ? <SettingsCompanionAccessRequests /> : null}
      {showHostPanels ? <SettingsTrustedLanPairingPanel {...pairingPanel} /> : null}
      {showHostPanels ? <SettingsTrustedLanBrowsersPanel {...browsersPanel} /> : null}
    </SettingsSurfaceCard>
  );
}
