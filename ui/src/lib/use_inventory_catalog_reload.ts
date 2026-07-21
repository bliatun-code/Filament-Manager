import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { loadCatalogMasters } from "./catalog_data_source";
import type { MasterCatalogRow } from "./tauri_client";

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
  const reloadCatalog = useCallback(async (reportResult?: (successful: boolean) => void) => {
    if (!tauriAvailable) {
      reportResult?.(false);
      return;
    }
    if (clientReadOnly && (!clientHostBaseUrl?.trim() || !clientLibraryId?.trim())) {
      reportResult?.(false);
      return;
    }
    try {
      const rows = await loadCatalogMasters({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      setMasters(rows);
      applyCatalogDefaults(rows);
      reportResult?.(true);
    } catch (catalogError) {
      console.error(catalogError);
      reportResult?.(false);
    }
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
    reloadCatalog,
  };
}
