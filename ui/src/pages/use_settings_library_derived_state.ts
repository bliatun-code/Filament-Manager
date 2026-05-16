import type {
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
} from "../lib/tauri_client";
import { useSettingsLibraryChrome } from "./use_settings_library_chrome";
import { useSettingsLibraryClientState } from "./use_settings_library_client_state";
import { useSettingsLibraryVisibility } from "./use_settings_library_visibility";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsLibraryDerivedStateInput = {
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncSettings: LibrarySyncSettings | null;
  librarySyncSnapshot: LibrarySyncRemoteSnapshot | null;
  librarySyncValidation: LibrarySyncHostValidationResult | null;
  pairedBrowserCount: number;
  showTrustedLanNetworkEditor: boolean;
  t: TranslateFn;
  trustedLanEnabledDraft: boolean;
  trustedLanPairingLink: string | null;
  trustedLanStatusEnabled: boolean;
};

export function useSettingsLibraryDerivedState({
  librarySyncModeDraft,
  librarySyncSettings,
  librarySyncSnapshot,
  librarySyncValidation,
  pairedBrowserCount,
  showTrustedLanNetworkEditor,
  t,
  trustedLanEnabledDraft,
  trustedLanPairingLink,
  trustedLanStatusEnabled,
}: UseSettingsLibraryDerivedStateInput) {
  const clientState = useSettingsLibraryClientState({
    librarySyncSettings,
    librarySyncValidation,
  });
  const chrome = useSettingsLibraryChrome(t);
  const libraryVisibility = useSettingsLibraryVisibility({
    librarySyncModeDraft,
    librarySyncSettings,
    librarySyncSnapshot,
    pairedBrowserCount,
    showTrustedLanNetworkEditor,
    trustedLanEnabledDraft,
    trustedLanStatusEnabled,
    trustedLanPairingLink,
  });

  return {
    ...clientState,
    ...chrome,
    libraryVisibility,
  };
}
