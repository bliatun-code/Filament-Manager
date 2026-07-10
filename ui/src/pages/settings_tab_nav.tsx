import type { KeyboardEvent } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { tabButtonClass } from "../lib/settings_ui_classes";
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
    <div className="mt-6 rounded-lg border border-slate-300/50 bg-white/44 p-1.5 dark:border-slate-700/70 dark:bg-slate-950/24">
      <div
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 min-[1050px]:grid-cols-5"
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
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
            className={`${tabButtonClass(tab.active)} min-w-0 w-full`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
