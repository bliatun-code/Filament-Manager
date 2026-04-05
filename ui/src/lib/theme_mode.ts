import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "bfm-theme-mode";
const CHANGE_EVENT = "bfm-theme-mode-change";

let mediaListenerAttached = false;

function resolveSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyResolvedTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "auto" && resolveSystemDark());
  root.classList.toggle("dark", dark);
  root.dataset.themeMode = mode;
}

function ensureMediaListener() {
  if (mediaListenerAttached) {
    return;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemeMode() === "auto") {
      applyResolvedTheme("auto");
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: "auto" }));
    }
  };
  media.addEventListener("change", onChange);
  mediaListenerAttached = true;
}

export function getResolvedTheme(mode: ThemeMode = getThemeMode()): ResolvedTheme {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }
  return mode === "dark" ? "dark" : "light";
}

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }
  return "auto";
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyResolvedTheme(mode);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
}

export function onThemeModeChange(handler: (mode: ThemeMode) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ThemeMode>).detail;
    if (detail === "light" || detail === "dark" || detail === "auto") {
      handler(detail);
      return;
    }
    handler(getThemeMode());
  };
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
  applyResolvedTheme(getThemeMode());
}
