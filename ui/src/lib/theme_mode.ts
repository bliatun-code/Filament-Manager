import { useEffect, useState } from "react";
import { DESKTOP_VISUAL_QA_QUERY_KEY } from "./desktop_visual_qa_scenario";

export const THEME_MODES = ["auto", "dark", "dark-deep", "blue", "light"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light" | "dark";
export type NativeWindowColor = readonly [number, number, number, number];

export type NativeWindowTheme = {
  appearance: ResolvedTheme | null;
  backgroundColor: NativeWindowColor | null;
};

export type ThemeDefinition = {
  id: ThemeMode;
  colorScheme: ResolvedTheme | "system";
  nativeWindowBackground: NativeWindowColor | null;
};

export const THEME_DEFINITIONS: Readonly<Record<ThemeMode, ThemeDefinition>> = {
  auto: { id: "auto", colorScheme: "system", nativeWindowBackground: null },
  light: { id: "light", colorScheme: "light", nativeWindowBackground: [245, 247, 249, 255] },
  dark: { id: "dark", colorScheme: "dark", nativeWindowBackground: [34, 45, 53, 255] },
  "dark-deep": { id: "dark-deep", colorScheme: "dark", nativeWindowBackground: [18, 25, 30, 255] },
  blue: { id: "blue", colorScheme: "dark", nativeWindowBackground: [14, 23, 40, 255] },
};

const STORAGE_KEY = "bfm-theme-mode";
const CHANGE_EVENT = "bfm-theme-mode-change";
const DESKTOP_VISUAL_QA_THEME_QUERY_KEY = "bfm_visual_qa_theme";

let mediaListenerAttached = false;

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.some((mode) => mode === value);
}

function desktopVisualQaThemeMode(): ThemeMode | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.has(DESKTOP_VISUAL_QA_QUERY_KEY)) {
      return null;
    }
    const requestedMode = String(params.get(DESKTOP_VISUAL_QA_THEME_QUERY_KEY) ?? "")
      .trim()
      .toLowerCase();
    if (isThemeMode(requestedMode)) {
      return requestedMode;
    }
    return "dark";
  } catch {
    return null;
  }
}

function resolveSystemDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveThemeMode(
  mode: ThemeMode,
  systemDark: boolean = resolveSystemDark(),
): ResolvedTheme {
  const configuredScheme = THEME_DEFINITIONS[mode].colorScheme;
  if (configuredScheme === "system") {
    return systemDark ? "dark" : "light";
  }
  return configuredScheme;
}

function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const resolvedTheme = resolveThemeMode(mode);
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.dataset.theme = mode;
  root.dataset.themeMode = mode;
  root.dataset.resolvedTheme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

function ensureMediaListener() {
  if (mediaListenerAttached) {
    return;
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (typeof media.addEventListener !== "function") {
    return;
  }
  const onChange = () => {
    if (getThemeMode() === "auto") {
      applyThemeMode("auto");
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: "auto" }));
    }
  };
  media.addEventListener("change", onChange);
  mediaListenerAttached = true;
}

export function getResolvedTheme(mode: ThemeMode = getThemeMode()): ResolvedTheme {
  return resolveThemeMode(mode);
}

export function getNativeWindowTheme(mode: ThemeMode = getThemeMode()): NativeWindowTheme {
  const definition = THEME_DEFINITIONS[mode];
  return {
    appearance: definition.colorScheme === "system" ? null : definition.colorScheme,
    backgroundColor: definition.nativeWindowBackground,
  };
}

export function getThemeMode(): ThemeMode {
  const visualQaThemeMode = desktopVisualQaThemeMode();
  if (visualQaThemeMode) {
    return visualQaThemeMode;
  }
  let stored: string | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      stored = localStorage.getItem(STORAGE_KEY);
    }
  } catch {
    stored = null;
  }
  // Retired brand themes move to the neutral default without changing library data.
  if (stored === "bambu" || stored === "prusa") return "dark";
  if (isThemeMode(stored)) {
    return stored;
  }
  return "auto";
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {
    // Theme persistence is best-effort; the active document theme still updates.
  }
  applyThemeMode(mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
  }
}

export function onThemeModeChange(handler: (mode: ThemeMode) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ThemeMode>).detail;
    if (isThemeMode(detail)) {
      handler(detail);
      return;
    }
    handler(getThemeMode());
  };
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function useResolvedTheme(): ResolvedTheme {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getResolvedTheme());

  useEffect(() => {
    const updateResolvedTheme = () => {
      setResolvedTheme(getResolvedTheme());
    };

    updateResolvedTheme();
    return onThemeModeChange(() => {
      updateResolvedTheme();
    });
  }, []);

  return resolvedTheme;
}

export function initThemeMode() {
  ensureMediaListener();
  applyThemeMode(getThemeMode());
}
