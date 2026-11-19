import {
  getLibrarySyncPageStatus,
  type LibrarySyncPageStatus,
} from "./tauri_client";

export type LibrarySyncPageState = {
  clientReadOnly: boolean;
  clientHostWritePaired: boolean;
  clientHostDeviceName: string | null;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
};

export function deriveLibrarySyncPageState(
  syncSettings: LibrarySyncPageStatus,
): LibrarySyncPageState {
  const isClientMode = syncSettings.mode === "CLIENT";

  return {
    clientReadOnly: isClientMode,
    clientHostWritePaired: syncSettings.client_auth_paired ?? false,
    clientHostDeviceName: syncSettings.host_device_name ?? null,
    clientHostBaseUrl: syncSettings.host_base_url ?? null,
    clientLibraryId: syncSettings.library_id ?? null,
    clientTargetGeneration:
      typeof syncSettings.target_generation === "number"
        ? syncSettings.target_generation
        : null,
  };
}

export async function loadLibrarySyncPageState(
  dependencies: {
    loadSyncSettings?: typeof getLibrarySyncPageStatus;
  } = {},
): Promise<LibrarySyncPageState> {
  const loadPageStatus = dependencies.loadSyncSettings ?? getLibrarySyncPageStatus;
  return deriveLibrarySyncPageState(await loadPageStatus());
}
