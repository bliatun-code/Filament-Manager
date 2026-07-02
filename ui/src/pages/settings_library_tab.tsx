import type { ComponentProps } from "react";
import { SettingsTrustedLanBrowsersPanel } from "../components/settings_trusted_lan_browsers_panel";
import { SettingsTrustedLanPairingPanel } from "../components/settings_trusted_lan_pairing_panel";
import { SettingsTrustedLanServerPanel } from "../components/settings_trusted_lan_server_panel";
import { SettingsSurfaceCard } from "../components/settings_ui";
import { SettingsLibraryClientPanel } from "./settings_library_client_panel";
import { SettingsLibraryRolePanel } from "./settings_library_role_panel";
import { SettingsLibraryWebappControl } from "./settings_library_webapp_control";

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
    <SettingsSurfaceCard className="xl:col-span-2 space-y-4" eyebrow={title}>
      <div className="surface-subtle space-y-5 p-4">
        <SettingsLibraryRolePanel {...libraryRolePanel} />
        <SettingsLibraryWebappControl {...webappControl} />
        {showServerPanel ? <SettingsTrustedLanServerPanel {...serverPanel} /> : null}
        {showClientPanel ? <SettingsLibraryClientPanel {...clientPanel} /> : null}
      </div>

      {showHostPanels ? <SettingsTrustedLanPairingPanel {...pairingPanel} /> : null}
      {showHostPanels ? <SettingsTrustedLanBrowsersPanel {...browsersPanel} /> : null}
    </SettingsSurfaceCard>
  );
}
