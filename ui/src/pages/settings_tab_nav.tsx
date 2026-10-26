import { Settings, Database, Globe, Printer, BookOpen, Wrench } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import {
  resolveSettingsTabNavigationIndex,
  settingsTabId,
  settingsTabPanelId,
} from "./settings_tab_accessibility";

const icons = { GENERAL: Settings, FILAMENT_DEFAULTS: Database, LIBRARY: Globe, PRINTERS: Printer, CATALOG: BookOpen, MAINTENANCE: Wrench };

type SettingsTabButton = {
  active: boolean;
  id: SettingsTabKey;
  label: string;
};

type SettingsTabNavProps = {
  label: string;
  onTabChange: (tab: SettingsTabKey) => void;
  tabs: SettingsTabButton[];
};

export function SettingsTabNav({ label, onTabChange, tabs }: SettingsTabNavProps) {
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = resolveSettingsTabNavigationIndex(currentIndex, tabs.length, event.key);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);
    event.currentTarget.ownerDocument.getElementById(settingsTabId(nextTab.id))?.focus();
  };

  return (
    <div className="settings-balanced-sidebar">
      <div
        className="settings-balanced-tabs"
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            id={settingsTabId(tab.id)}
            role="tab"
            aria-controls={settingsTabPanelId(tab.id)}
            aria-selected={tab.active}
            tabIndex={tab.active ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`settings-balanced-tab app-control-focus ${tab.active ? "settings-balanced-tab-active" : ""}`}
          >
            {(() => { const Icon = icons[tab.id]; return <Icon size={19} strokeWidth={1.7} aria-hidden="true" />; })()}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
