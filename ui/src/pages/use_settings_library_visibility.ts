import type {
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
} from "../lib/tauri_client";
import {
  buildLibrarySyncVisibilityState,
  type LibrarySyncMode,
} from "./settings_library_sync_model";

type UseSettingsLibraryVisibilityOptions = {
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncSettings: LibrarySyncSettings | null;
  librarySyncSnapshot: LibrarySyncRemoteSnapshot | null;
  pairedBrowserCount: number;
  showTrustedLanNetworkEditor: boolean;
  trustedLanEnabledDraft: boolean;
  trustedLanPairingLink: string | null;
  trustedLanStatusEnabled: boolean;
};

export function useSettingsLibraryVisibility({
  librarySyncModeDraft,
  librarySyncSettings,
  librarySyncSnapshot,
  pairedBrowserCount,
  showTrustedLanNetworkEditor,
  trustedLanEnabledDraft,
  trustedLanPairingLink,
  trustedLanStatusEnabled,
}: UseSettingsLibraryVisibilityOptions) {
  return buildLibrarySyncVisibilityState({
    draftMode: librarySyncModeDraft,
    trustedLanEnabledDraft,
    trustedLanStatusEnabled,
    showTrustedLanNetworkEditor,
    hasTrustedLanPairingLink: Boolean(trustedLanPairingLink),
    pairedBrowserCount,
    lastCheckedAt: librarySyncSettings?.last_checked_at,
    lastReachableAt: librarySyncSettings?.last_reachable_at,
    lastValidationMessage: librarySyncSettings?.last_validation_message,
    hasSnapshot: Boolean(librarySyncSnapshot),
  });
}
