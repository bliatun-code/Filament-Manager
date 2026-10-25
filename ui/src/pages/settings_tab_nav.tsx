import type { KeyboardEvent } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import {
  resolveSettingsTabNavigationIndex,
  settingsTabId,
  settingsTabPanelId,
} from "./settings_tab_accessibility";

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
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
