import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { isSettingsTabKey, normalizeSettingsInitialTab } from "./settings_page_model";
import {
  resolveSettingsActiveTab,
  writeSettingsPagePreferences,
} from "./settings_page_preferences";

type UseSettingsActiveTabOptions = {
  persistenceEnabled?: boolean;
};

export function useSettingsActiveTab(
  initialTab: SettingsTabKey | null,
  { persistenceEnabled = true }: UseSettingsActiveTabOptions = {},
) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(() =>
    resolveSettingsActiveTab(initialTab, { deterministic: !persistenceEnabled }),
  );
  const activeTabRef = useRef(activeTab);

  const setPersistentActiveTab: Dispatch<SetStateAction<SettingsTabKey>> = useCallback(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === "function" ? nextValue(activeTabRef.current) : nextValue;
      const nextTab = normalizeSettingsInitialTab(resolvedValue);
      activeTabRef.current = nextTab;
      setActiveTab(nextTab);
      writeSettingsPagePreferences(
        { activeTab: nextTab },
        { deterministic: !persistenceEnabled },
      );
    },
    [persistenceEnabled],
  );

  useEffect(() => {
    if (!isSettingsTabKey(initialTab)) {
      return;
    }
    setPersistentActiveTab(initialTab);
  }, [initialTab, setPersistentActiveTab]);

  return { activeTab, setActiveTab: setPersistentActiveTab };
}
