import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { loadCatalogMasters } from "./catalog_data_source";
import type { useI18n } from "./i18n";
import type { MasterCatalogRow } from "./tauri_client";

type InventoryCatalogReloadInput = {
  applyCatalogDefaults: (catalogMasters: MasterCatalogRow[]) => void;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  librarySyncReady: boolean;
  reloadActiveLoans: () => Promise<void>;
  reloadPrinterOverview: () => Promise<void>;
  reloadSpools: () => Promise<void>;
  reloadWishlist: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setMasters: Dispatch<SetStateAction<MasterCatalogRow[]>>;
  showAddModal: boolean;
  sidePanelMode: "MANAGE" | "ADD";
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryCatalogReload({
  applyCatalogDefaults,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  librarySyncReady,
  reloadActiveLoans,
  reloadPrinterOverview,
  reloadSpools,
  reloadWishlist,
  setError,
  setMasters,
  showAddModal,
  sidePanelMode,
  tauriAvailable,
  t,
}: InventoryCatalogReloadInput) {
  const reloadCatalog = useCallback(async () => {
    if (!tauriAvailable) {
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
    } catch (catalogError) {
      console.error(catalogError);
      if (clientReadOnly) {
        setMasters([]);
        return;
      }
      setError(t("wishlist.error.loadCatalog", "Could not load master catalog."));
    }
  }, [
    applyCatalogDefaults,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    setError,
    setMasters,
    t,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (!tauriAvailable || !librarySyncReady) {
      return;
    }
    reloadSpools();
    reloadCatalog();
    reloadWishlist();
    reloadActiveLoans();
    reloadPrinterOverview();
  }, [
    librarySyncReady,
    reloadActiveLoans,
    reloadCatalog,
    reloadPrinterOverview,
    reloadSpools,
    reloadWishlist,
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
