import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadLibrarySyncPageState,
  type LibrarySyncPageState,
} from "../lib/library_sync_state";

type LibrarySyncResolution = "LOADING" | "READY" | "ERROR";

type ResolvedLibrarySyncUiState = LibrarySyncPageState & {
  librarySyncResolution: LibrarySyncResolution;
};

type ResolveLibrarySyncUiStateDependencies = {
  loadPageState?: typeof loadLibrarySyncPageState;
};

function failClosedLibrarySyncState(
  resolution: LibrarySyncResolution,
): ResolvedLibrarySyncUiState {
  return {
    clientReadOnly: true,
    clientHostWritePaired: false,
    clientHostDeviceName: null,
    clientHostBaseUrl: null,
    clientLibraryId: null,
    clientTargetGeneration: null,
    librarySyncResolution: resolution,
  };
}

export async function resolveLibrarySyncUiState(
  tauri: boolean,
  dependencies: ResolveLibrarySyncUiStateDependencies = {},
): Promise<ResolvedLibrarySyncUiState> {
  if (!tauri) {
    return {
      ...failClosedLibrarySyncState("READY"),
      clientReadOnly: false,
    };
  }
  const loadPageState = dependencies.loadPageState ?? loadLibrarySyncPageState;
  try {
    return {
      ...(await loadPageState()),
      librarySyncResolution: "READY",
    };
  } catch (error) {
    console.error(error);
    return failClosedLibrarySyncState("ERROR");
  }
}

export type LibrarySyncUiState = {
  clientReadOnly: boolean;
  clientHostWritePaired: boolean;
  clientHostDeviceName: string | null;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
  librarySyncError: boolean;
  librarySyncReady: boolean;
  librarySyncResolving: boolean;
  retryLibrarySyncRole: () => void;
};

export function useLibrarySyncState(tauri: boolean): LibrarySyncUiState {
  const [state, setState] = useState<ResolvedLibrarySyncUiState>(() =>
    tauri
      ? failClosedLibrarySyncState("LOADING")
      : {
          ...failClosedLibrarySyncState("READY"),
          clientReadOnly: false,
        },
  );
  const requestRef = useRef(0);

  const resolveRole = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setState(
      tauri
        ? failClosedLibrarySyncState("LOADING")
        : {
            ...failClosedLibrarySyncState("READY"),
            clientReadOnly: false,
          },
    );
    const next = await resolveLibrarySyncUiState(tauri);
    if (requestRef.current === requestId) {
      setState(next);
    }
  }, [tauri]);

  useEffect(() => {
    void resolveRole();
    return () => {
      requestRef.current += 1;
    };
  }, [resolveRole]);

  return {
    clientReadOnly: state.clientReadOnly,
    clientHostWritePaired: state.clientHostWritePaired,
    clientHostDeviceName: state.clientHostDeviceName,
    clientHostBaseUrl: state.clientHostBaseUrl,
    clientLibraryId: state.clientLibraryId,
    clientTargetGeneration: state.clientTargetGeneration,
    librarySyncError: state.librarySyncResolution === "ERROR",
    librarySyncReady: state.librarySyncResolution === "READY",
    librarySyncResolving: state.librarySyncResolution === "LOADING",
    retryLibrarySyncRole: () => {
      if (state.librarySyncResolution !== "LOADING") {
        void resolveRole();
      }
    },
  };
}
