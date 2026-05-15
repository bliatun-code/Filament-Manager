import type { SettingsTabKey } from "../App";
import { tabButtonClass } from "../lib/settings_ui_classes";

type SettingsTabButton = {
  active: boolean;
  id: SettingsTabKey;
  label: string;
};

type SettingsTabNavProps = {
  onTabChange: (tab: SettingsTabKey) => void;
  tabs: SettingsTabButton[];
};

export function SettingsTabNav({ onTabChange, tabs }: SettingsTabNavProps) {
  return (
    <div className="mt-6 rounded-lg border border-slate-300/50 bg-white/44 p-1.5 dark:border-slate-700/70 dark:bg-slate-950/24">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={tabButtonClass(tab.active)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
