import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { resolveCatalogSelectionDefaults } from "../lib/catalog_data_source";
import {
  buildWishlistDraft,
  filterWishlistCatalogMasters,
  listWishlistCatalogMastersByVendor,
  selectWishlistCatalogMaster,
  type WishlistCatalogFilter as CatalogFilter,
} from "../lib/wishlist_data_source";
import type { MasterCatalogRow } from "../lib/tauri_client";
import type { WishlistCreateMode } from "./wishlist_helpers";

export function useWishlistCreateForm(masters: MasterCatalogRow[]) {
  const [createMode, setCreateMode] = useState<WishlistCreateMode>("bambu");
  const [bambuCatalogQuery, setBambuCatalogQuery] = useState("");
  const [bambuCatalogFilter, setBambuCatalogFilter] =
    useState<CatalogFilter>("ALL");
  const [newBambuMasterId, setNewBambuMasterId] = useState("");
  const [esunCatalogQuery, setEsunCatalogQuery] = useState("");
  const [esunCatalogFilter, setEsunCatalogFilter] =
    useState<CatalogFilter>("ALL");
  const [newEsunMasterId, setNewEsunMasterId] = useState("");
  const deferredBambuCatalogQuery = useDeferredValue(bambuCatalogQuery);
  const deferredEsunCatalogQuery = useDeferredValue(esunCatalogQuery);
  const [wishlistQuantity, setWishlistQuantity] = useState("1");
  const [wishlistNote, setWishlistNote] = useState("");

  const [manualVendor, setManualVendor] = useState("Generic");
  const [manualMaterial, setManualMaterial] = useState("PLA");
  const [manualFilamentName, setManualFilamentName] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualHexColor, setManualHexColor] = useState("");

  const applyCatalogSelectionDefaults = useCallback((rows: MasterCatalogRow[]) => {
    const defaults = resolveCatalogSelectionDefaults(rows);
    setNewBambuMasterId((current) => current || defaults.bambuMasterId);
    setNewEsunMasterId((current) => current || defaults.esunMasterId);
  }, []);

  const bambuMasters = useMemo(
    () => listWishlistCatalogMastersByVendor(masters, "bambu"),
    [masters],
  );

  const filteredBambuMasters = useMemo(
    () =>
      filterWishlistCatalogMasters(
        bambuMasters,
        bambuCatalogFilter,
        deferredBambuCatalogQuery,
      ),
    [bambuCatalogFilter, deferredBambuCatalogQuery, bambuMasters],
  );

  const selectedBambuMaster = useMemo(() => {
    return selectWishlistCatalogMaster(filteredBambuMasters, newBambuMasterId);
  }, [filteredBambuMasters, newBambuMasterId]);

  useEffect(() => {
    if (createMode !== "bambu") {
      return;
    }
    if (filteredBambuMasters.length === 0) {
      setNewBambuMasterId("");
      return;
    }
    const exists = filteredBambuMasters.some(
      (master) => master.id === newBambuMasterId,
    );
    if (!exists) {
      setNewBambuMasterId(filteredBambuMasters[0].id);
    }
  }, [createMode, filteredBambuMasters, newBambuMasterId]);

  const esunMasters = useMemo(
    () => listWishlistCatalogMastersByVendor(masters, "esun"),
    [masters],
  );

  const filteredEsunMasters = useMemo(
    () =>
      filterWishlistCatalogMasters(
        esunMasters,
        esunCatalogFilter,
        deferredEsunCatalogQuery,
      ),
    [deferredEsunCatalogQuery, esunCatalogFilter, esunMasters],
  );

  const selectedEsunMaster = useMemo(() => {
    return selectWishlistCatalogMaster(filteredEsunMasters, newEsunMasterId);
  }, [filteredEsunMasters, newEsunMasterId]);

  useEffect(() => {
    if (createMode !== "esun") {
      return;
    }
    if (filteredEsunMasters.length === 0) {
      setNewEsunMasterId("");
      return;
    }
    const exists = filteredEsunMasters.some(
      (master) => master.id === newEsunMasterId,
    );
    if (!exists) {
      setNewEsunMasterId(filteredEsunMasters[0].id);
    }
  }, [createMode, filteredEsunMasters, newEsunMasterId]);

  const currentDraft = useMemo(() => {
    return buildWishlistDraft({
      source: createMode,
      selectedBambuMaster,
      selectedEsunMaster,
      manualVendor,
      manualMaterial,
      manualFilamentName,
      manualColorName,
    });
  }, [
    createMode,
    manualColorName,
    manualFilamentName,
    manualMaterial,
    manualVendor,
    selectedBambuMaster,
    selectedEsunMaster,
  ]);

  const activeCatalogCount = useMemo(() => {
    if (createMode === "bambu") {
      return bambuMasters.length;
    }
    if (createMode === "esun") {
      return esunMasters.length;
    }
    return masters.length;
  }, [bambuMasters.length, createMode, esunMasters.length, masters.length]);

  const activeCatalogMatches = useMemo(() => {
    if (createMode === "bambu") {
      return filteredBambuMasters.length;
    }
    if (createMode === "esun") {
      return filteredEsunMasters.length;
    }
    return 0;
  }, [createMode, filteredBambuMasters.length, filteredEsunMasters.length]);

  const currentSelectionHex = useMemo(() => {
    if (createMode === "bambu") {
      return selectedBambuMaster?.hex_color ?? null;
    }
    if (createMode === "esun") {
      return selectedEsunMaster?.hex_color ?? null;
    }
    return manualHexColor || null;
  }, [
    createMode,
    manualHexColor,
    selectedBambuMaster?.hex_color,
    selectedEsunMaster?.hex_color,
  ]);

  const currentSelectionDiscontinued = useMemo(() => {
    if (createMode === "bambu") {
      return selectedBambuMaster?.is_discontinued ?? false;
    }
    if (createMode === "esun") {
      return selectedEsunMaster?.is_discontinued ?? false;
    }
    return false;
  }, [
    createMode,
    selectedBambuMaster?.is_discontinued,
    selectedEsunMaster?.is_discontinued,
  ]);

  return {
    activeCatalogCount,
    activeCatalogMatches,
    applyCatalogSelectionDefaults,
    bambuCatalogFilter,
    bambuCatalogQuery,
    createMode,
    currentDraft,
    currentSelectionDiscontinued,
    currentSelectionHex,
    esunCatalogFilter,
    esunCatalogQuery,
    filteredBambuMasters,
    filteredEsunMasters,
    manualColorName,
    manualFilamentName,
    manualHexColor,
    manualMaterial,
    manualVendor,
    newBambuMasterId,
    newEsunMasterId,
    selectedBambuMaster,
    setBambuCatalogFilter,
    setBambuCatalogQuery,
    setCreateMode,
    setEsunCatalogFilter,
    setEsunCatalogQuery,
    setManualColorName,
    setManualFilamentName,
    setManualHexColor,
    setManualMaterial,
    setManualVendor,
    setNewBambuMasterId,
    setNewEsunMasterId,
    setWishlistNote,
    setWishlistQuantity,
    wishlistNote,
    wishlistQuantity,
  };
}
