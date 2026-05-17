import { useEffect, useState } from "react";

import { loadLibrarySyncPageState } from "../lib/library_sync_state";

export type LibrarySyncUiState = {
  clientReadOnly: boolean;
  clientHostWritePaired: boolean;
  clientHostDeviceName: string | null;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  librarySyncReady: boolean;
};

export function useLibrarySyncState(tauri: boolean): LibrarySyncUiState {
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [librarySyncReady, setLibrarySyncReady] = useState(!tauri);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const syncState = await loadLibrarySyncPageState();
        if (cancelled) {
          return;
        }
        setClientReadOnly(syncState.clientReadOnly);
        setClientHostWritePaired(syncState.clientHostWritePaired);
        setClientHostDeviceName(syncState.clientHostDeviceName);
        setClientHostBaseUrl(syncState.clientHostBaseUrl);
        setClientLibraryId(syncState.clientLibraryId);
      } catch (syncError) {
        console.error(syncError);
      } finally {
        if (!cancelled) {
          setLibrarySyncReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  return {
    clientReadOnly,
    clientHostWritePaired,
    clientHostDeviceName,
    clientHostBaseUrl,
    clientLibraryId,
    librarySyncReady,
  };
}
