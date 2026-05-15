import { useEffect, useState } from "react";
import type { SettingsTabKey } from "../App";
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
