import {
  getLibrarySyncSettings,
  type LibrarySyncSettings,
} from "./tauri_client";

export type LibrarySyncPageState = {
  clientReadOnly: boolean;
  clientHostWritePaired: boolean;
  clientHostDeviceName: string | null;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
};

export type LibrarySyncPageStateOptions = {
  requireHostForClientReadOnly?: boolean;
};

export function deriveLibrarySyncPageState(
  syncSettings: LibrarySyncSettings,
  options: LibrarySyncPageStateOptions = {},
): LibrarySyncPageState {
  const isClientMode = syncSettings.mode === "CLIENT";
  const hasHostDetails = Boolean(syncSettings.host_base_url) && Boolean(syncSettings.library_id);

  return {
    clientReadOnly: options.requireHostForClientReadOnly
      ? isClientMode && hasHostDetails
      : isClientMode,
    clientHostWritePaired: syncSettings.client_auth_paired ?? false,
    clientHostDeviceName: syncSettings.host_device_name ?? null,
    clientHostBaseUrl: syncSettings.host_base_url ?? null,
    clientLibraryId: syncSettings.library_id ?? null,
  };
}

export async function loadLibrarySyncPageState(
  options: LibrarySyncPageStateOptions = {},
  dependencies: {
    loadSyncSettings?: typeof getLibrarySyncSettings;
  } = {},
): Promise<LibrarySyncPageState> {
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  return deriveLibrarySyncPageState(await loadSyncSettings(), options);
}
