import { useEffect, useState } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { normalizeSettingsInitialTab } from "./settings_page_model";

export function useSettingsActiveTab(initialTab: SettingsTabKey) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(
    normalizeSettingsInitialTab(initialTab),
  );

  useEffect(() => {
    setActiveTab(normalizeSettingsInitialTab(initialTab));
  }, [initialTab]);

  return { activeTab, setActiveTab };
}
