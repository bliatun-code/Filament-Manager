import { useEffect, useRef } from "react";
import type { SettingsTabKey } from "../App";
import type { LibrarySyncSettings } from "../lib/tauri_client";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type UseSettingsLibraryAutoValidationInput = {
  activeTab: SettingsTabKey;
  handleValidateLibrarySyncHost: () => void;
  librarySyncBusy: boolean;
  librarySyncHostBaseUrlDraft: string;
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncSettings: LibrarySyncSettings | null;
  librarySyncValidationBusy: boolean;
  loading: boolean;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostWritePaired: boolean;
  tauri: boolean;
};

export function useSettingsLibraryAutoValidation({
  activeTab,
  handleValidateLibrarySyncHost,
  librarySyncBusy,
  librarySyncHostBaseUrlDraft,
  librarySyncModeDraft,
  librarySyncSettings,
  librarySyncValidationBusy,
  loading,
  settingsClientHostBaseUrl,
  settingsClientHostWritePaired,
  tauri,
}: UseSettingsLibraryAutoValidationInput) {
  const librarySyncAutoValidationRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab !== "LIBRARY") {
      librarySyncAutoValidationRef.current = null;
      return;
    }
    if (
      !tauri ||
      loading ||
      librarySyncBusy ||
      librarySyncValidationBusy ||
      librarySyncModeDraft !== "CLIENT" ||
      !settingsClientHostWritePaired ||
      !(settingsClientHostBaseUrl || librarySyncHostBaseUrlDraft.trim())
    ) {
      return;
    }
    const autoValidationKey = [
      activeTab,
      librarySyncModeDraft,
      settingsClientHostBaseUrl ?? librarySyncHostBaseUrlDraft.trim(),
      librarySyncSettings?.client_auth_paired_at ?? "",
      librarySyncSettings?.client_auth_expires_at ?? "",
    ].join("|");
    if (librarySyncAutoValidationRef.current === autoValidationKey) {
      return;
    }
    librarySyncAutoValidationRef.current = autoValidationKey;
    handleValidateLibrarySyncHost();
  }, [
    activeTab,
    handleValidateLibrarySyncHost,
    librarySyncBusy,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncSettings?.client_auth_expires_at,
    librarySyncSettings?.client_auth_paired_at,
    librarySyncValidationBusy,
    loading,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    tauri,
  ]);
}
