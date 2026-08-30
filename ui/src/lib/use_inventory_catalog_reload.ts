import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { loadCatalogMasters } from "./catalog_data_source";
import type { MasterCatalogRow } from "./tauri_client";

export type InventoryCatalogLoadState = "IDLE" | "LOADING" | "READY" | "ERROR";

type RunInventoryCatalogReloadInput = {
  isCurrent?: () => boolean;
  load: () => Promise<MasterCatalogRow[]>;
  onError: (error: unknown) => void;
  onLoading: () => void;
  onReady: (rows: MasterCatalogRow[]) => void;
};

export async function runInventoryCatalogReload({
  isCurrent = () => true,
  load,
  onError,
  onLoading,
  onReady,
}: RunInventoryCatalogReloadInput): Promise<boolean> {
  onLoading();
  try {
    const rows = await load();
    if (!isCurrent()) {
      return false;
    }
    onReady(rows);
    return true;
  } catch (error) {
    if (!isCurrent()) {
      return false;
    }
    onError(error);
    return false;
  }
}

type InventoryCatalogReloadInput = {
  applyCatalogDefaults: (catalogMasters: MasterCatalogRow[]) => void;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  librarySyncReady: boolean;
  reloadWishlist: () => Promise<void>;
  setMasters: Dispatch<SetStateAction<MasterCatalogRow[]>>;
  showAddModal: boolean;
  sidePanelMode: "MANAGE" | "ADD";
  tauriAvailable: boolean;
};

export function useInventoryCatalogReload({
  applyCatalogDefaults,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  librarySyncReady,
  reloadWishlist,
  setMasters,
  showAddModal,
  sidePanelMode,
  tauriAvailable,
}: InventoryCatalogReloadInput) {
  const catalogRequestRef = useRef(0);
  const [catalogLoadState, setCatalogLoadState] =
    useState<InventoryCatalogLoadState>("IDLE");
  const resetCatalogLoadState = useCallback(() => {
    catalogRequestRef.current += 1;
    setCatalogLoadState("IDLE");
  }, []);

  const reloadCatalog = useCallback(async (reportResult?: (successful: boolean) => void) => {
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    if (!tauriAvailable) {
      setCatalogLoadState("ERROR");
      reportResult?.(false);
      return;
    }
    if (clientReadOnly && (!clientHostBaseUrl?.trim() || !clientLibraryId?.trim())) {
      setCatalogLoadState("ERROR");
      reportResult?.(false);
      return;
    }
    const successful = await runInventoryCatalogReload({
      isCurrent: () => catalogRequestRef.current === requestId,
      load: () =>
        loadCatalogMasters({
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
        }),
      onError: (catalogError) => {
        console.error(catalogError);
        setCatalogLoadState("ERROR");
      },
      onLoading: () => setCatalogLoadState("LOADING"),
      onReady: (rows) => {
        setMasters(rows);
        applyCatalogDefaults(rows);
        setCatalogLoadState("READY");
      },
    });
    reportResult?.(successful);
  }, [
    applyCatalogDefaults,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    setMasters,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (
      !tauriAvailable ||
      !librarySyncReady ||
      !showAddModal ||
      sidePanelMode !== "ADD"
    ) {
      return;
    }

    void reloadCatalog();
    void reloadWishlist();
  }, [
    librarySyncReady,
    reloadCatalog,
    reloadWishlist,
    showAddModal,
    sidePanelMode,
    tauriAvailable,
  ]);

  return {
    catalogLoadState,
    reloadCatalog,
    resetCatalogLoadState,
  };
}
