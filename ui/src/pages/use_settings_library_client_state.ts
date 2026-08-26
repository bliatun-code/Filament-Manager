import type {
  LibrarySyncHostValidationResult,
  LibrarySyncSettings,
} from "../lib/tauri_client";
import { buildLibrarySyncClientState } from "./settings_library_sync_model";

type UseSettingsLibraryClientStateOptions = {
  librarySyncSettings: LibrarySyncSettings | null;
  librarySyncValidation: LibrarySyncHostValidationResult | null;
};

export function useSettingsLibraryClientState({
  librarySyncSettings,
  librarySyncValidation,
}: UseSettingsLibraryClientStateOptions) {
  const librarySyncClientState = buildLibrarySyncClientState({
    mode: librarySyncSettings?.mode,
    hostBaseUrl: librarySyncSettings?.host_base_url,
    libraryId: librarySyncSettings?.library_id,
    clientAuthPaired: librarySyncSettings?.client_auth_paired,
    pairingChecked: librarySyncValidation?.pairing_checked,
    pairingValid: librarySyncValidation?.pairing_valid,
  });

  return {
    librarySyncSavedMode: librarySyncClientState.savedMode,
    settingsClientHostBaseUrl: librarySyncClientState.hostBaseUrl,
    settingsClientHostNeedsRepair: librarySyncClientState.hostNeedsRepair,
    settingsClientHostPairingValid: librarySyncClientState.hostPairingValid,
    settingsClientHostWritePaired: librarySyncClientState.hostWritePaired,
    settingsClientLibraryId: librarySyncClientState.libraryId,
    settingsClientReadOnly: librarySyncClientState.readOnly,
    settingsClientTargetGeneration:
      librarySyncSettings?.target_generation ?? null,
  };
}
