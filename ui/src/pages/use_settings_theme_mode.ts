import { useEffect, useState } from "react";
import {
  getThemeMode,
  onThemeModeChange,
  setThemeMode,
  type ThemeMode,
} from "../lib/theme_mode";

export function useSettingsThemeMode() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());

  useEffect(() => {
    const unlisten = onThemeModeChange((mode) => setThemeModeState(mode));
    return () => {
      unlisten();
    };
  }, []);

  const updateThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    setThemeModeState(mode);
  };

  return { themeMode, updateThemeMode };
}
