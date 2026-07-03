import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  buildBambuFilamentCodeBatch,
  type BambuFilamentCodeBatch,
} from "./bambu_filament_code_batch";
import {
  bambuFilamentCodeLookupRequiresExplicitSelection,
  buildBambuFilamentCodeLookup,
  catalogMasterMatchesBambuFilamentCode,
} from "./bambu_filament_code_lookup";
import { resolveCatalogSelectionDefaults } from "./catalog_data_source";
import {
  activeCatalogMastersForMode,
  currentCreateSwatchHexForMode,
  isInventoryCatalogCreateMode,
  selectedCatalogMasterForMode,
  type InventoryCreateMode,
} from "./inventory_create_model";
import type { OwnershipType } from "./inventory_list_model";
import type { MasterCatalogRow } from "./tauri_client";

function createCatalogSortKey(master: MasterCatalogRow): string {
  return `${master.material} ${master.filament_name} ${master.color_name}`;
}

function createCatalogSearchText(master: MasterCatalogRow): string {
  return createCatalogSortKey(master).toLowerCase();
}

export function filterCreateCatalogMasters(
  masters: MasterCatalogRow[],
  vendorToken: string,
  query: string,
): MasterCatalogRow[] {
  const term = query.trim().toLowerCase();
  const bambuCode = vendorToken === "bambu" ? buildBambuFilamentCodeLookup(masters, query).code : null;
  return masters
    .filter((master) => master.vendor.toLowerCase().includes(vendorToken))
    .sort((left, right) => {
      if (left.is_discontinued !== right.is_discontinued) {
        return Number(left.is_discontinued) - Number(right.is_discontinued);
      }
      return createCatalogSortKey(left).localeCompare(createCatalogSortKey(right));
    })
    .filter(
      (master) =>
        term.length === 0 ||
        createCatalogSearchText(master).includes(term) ||
        catalogMasterMatchesBambuFilamentCode(master, bambuCode),
    );
}

export function selectedCreateCatalogMaster(
  masters: MasterCatalogRow[],
  selectedMasterId: string,
  options: { allowFallback?: boolean } = {},
): MasterCatalogRow | null {
  return (
    masters.find((master) => master.id === selectedMasterId) ??
    (options.allowFallback === false ? null : masters[0] ?? null)
  );
}

export function useInventoryCreateDraft(masters: MasterCatalogRow[]) {
  const [createMode, setCreateMode] = useState<InventoryCreateMode>("bambu");
  const [bambuCatalogQuery, setBambuCatalogQuery] = useState("");
  const [bambuBatchInput, setBambuBatchInput] = useState("");
  const [bambuBatchSelections, setBambuBatchSelections] = useState<Record<string, string>>(
    {},
  );
  const [newBambuMasterId, setNewBambuMasterId] = useState("");
  const [newInitialWeight, setNewInitialWeight] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newOwnershipType, setNewOwnershipType] = useState<OwnershipType>("OWNED");
  const [borrowedFromName, setBorrowedFromName] = useState("");
  const [borrowedFromContact, setBorrowedFromContact] = useState("");
  const [borrowedInNote, setBorrowedInNote] = useState("");
  const [manualVendor, setManualVendor] = useState("Generic");
  const [manualMaterial, setManualMaterial] = useState("PLA");
  const [manualFilamentName, setManualFilamentName] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualHexColor, setManualHexColor] = useState("");
  const [esunCatalogQuery, setEsunCatalogQuery] = useState("");
  const [newEsunMasterId, setNewEsunMasterId] = useState("");
  const deferredBambuCatalogQuery = useDeferredValue(bambuCatalogQuery);
  const deferredEsunCatalogQuery = useDeferredValue(esunCatalogQuery);

  const filteredBambuMasters = useMemo(
    () => filterCreateCatalogMasters(masters, "bambu", deferredBambuCatalogQuery),
    [deferredBambuCatalogQuery, masters],
  );
  const bambuCodeLookup = useMemo(
    () => buildBambuFilamentCodeLookup(masters, deferredBambuCatalogQuery),
    [deferredBambuCatalogQuery, masters],
  );
  const bambuCodeRequiresExplicitSelection =
    bambuFilamentCodeLookupRequiresExplicitSelection(bambuCodeLookup);
  const bambuCodeBatch: BambuFilamentCodeBatch = useMemo(
    () =>
      buildBambuFilamentCodeBatch({
        masters,
        rawInput: bambuBatchInput,
        selectedMasterIds: bambuBatchSelections,
      }),
    [bambuBatchInput, bambuBatchSelections, masters],
  );
  const selectedBambuMaster = useMemo(
    () =>
      selectedCreateCatalogMaster(filteredBambuMasters, newBambuMasterId, {
        allowFallback: !bambuCodeRequiresExplicitSelection,
      }),
    [bambuCodeRequiresExplicitSelection, filteredBambuMasters, newBambuMasterId],
  );

  useEffect(() => {
    if (createMode !== "bambu") {
      return;
    }
    if (filteredBambuMasters.length === 0) {
      setNewBambuMasterId("");
      return;
    }
    if (
      bambuCodeLookup.status === "single_active" &&
      bambuCodeLookup.activeMatches[0] &&
      newBambuMasterId !== bambuCodeLookup.activeMatches[0].id
    ) {
      setNewBambuMasterId(bambuCodeLookup.activeMatches[0].id);
      return;
    }
    const selectedMasterStillVisible = filteredBambuMasters.some(
      (master) => master.id === newBambuMasterId,
    );
    if (bambuCodeRequiresExplicitSelection) {
      if (!selectedMasterStillVisible) {
        setNewBambuMasterId("");
      }
      return;
    }
    if (!selectedMasterStillVisible) {
      setNewBambuMasterId(filteredBambuMasters[0].id);
    }
  }, [
    bambuCodeLookup,
    bambuCodeRequiresExplicitSelection,
    createMode,
    filteredBambuMasters,
    newBambuMasterId,
  ]);

  useEffect(() => {
    if (createMode === "bambu" && selectedBambuMaster) {
      setNewInitialWeight(String(selectedBambuMaster.default_weight));
    }
  }, [createMode, selectedBambuMaster]);

  const filteredEsunMasters = useMemo(
    () => filterCreateCatalogMasters(masters, "esun", deferredEsunCatalogQuery),
    [deferredEsunCatalogQuery, masters],
  );
  const selectedEsunMaster = useMemo(
    () => selectedCreateCatalogMaster(filteredEsunMasters, newEsunMasterId),
    [filteredEsunMasters, newEsunMasterId],
  );

  useEffect(() => {
    if (createMode !== "esun") {
      return;
    }
    if (filteredEsunMasters.length === 0) {
      setNewEsunMasterId("");
      return;
    }
    if (!filteredEsunMasters.some((master) => master.id === newEsunMasterId)) {
      setNewEsunMasterId(filteredEsunMasters[0].id);
    }
  }, [createMode, filteredEsunMasters, newEsunMasterId]);

  useEffect(() => {
    if (createMode === "esun" && selectedEsunMaster) {
      setNewInitialWeight(String(selectedEsunMaster.default_weight));
    }
  }, [createMode, selectedEsunMaster]);

  const activeCatalogMasters = activeCatalogMastersForMode(
    createMode,
    filteredBambuMasters,
    filteredEsunMasters,
  );
  const selectedCatalogMaster = selectedCatalogMasterForMode(
    createMode,
    selectedBambuMaster,
    selectedEsunMaster,
  );
  const currentCreateSwatchHex = currentCreateSwatchHexForMode({
    mode: createMode,
    manualHexColor,
    selectedCatalogMaster,
  });
  const catalogQuery = createMode === "bambu" ? bambuCatalogQuery : esunCatalogQuery;
  const isCatalogCreateMode = isInventoryCatalogCreateMode(createMode);

  const applyCatalogDefaults = useCallback((catalogMasters: MasterCatalogRow[]) => {
    const defaults = resolveCatalogSelectionDefaults(catalogMasters);
    setNewBambuMasterId((current) => current || defaults.bambuMasterId);
    setNewEsunMasterId((current) => current || defaults.esunMasterId);
  }, []);

  const resetBorrowedInDraft = useCallback(() => {
    setNewOwnershipType("OWNED");
    setBorrowedFromName("");
    setBorrowedFromContact("");
    setBorrowedInNote("");
  }, []);

  const resetAfterCreatedSpool = useCallback(() => {
    setNewLocation("");
    resetBorrowedInDraft();
  }, [resetBorrowedInDraft]);

  const resetBambuBatchInput = useCallback(() => {
    setBambuBatchInput("");
    setBambuBatchSelections({});
  }, []);

  const setBambuBatchRowSelection = useCallback(
    (rowKey: string, masterId: string | null) => {
      setBambuBatchSelections((current) => {
        const next = { ...current };
        if (masterId) {
          next[rowKey] = masterId;
        } else {
          delete next[rowKey];
        }
        return next;
      });
    },
    [],
  );

  const handleCatalogQueryChange = useCallback(
    (value: string) => {
      if (createMode === "bambu") {
        setBambuCatalogQuery(value);
        if (
          bambuFilamentCodeLookupRequiresExplicitSelection(
            buildBambuFilamentCodeLookup(masters, value),
          )
        ) {
          setNewBambuMasterId("");
        }
      } else {
        setEsunCatalogQuery(value);
      }
    },
    [createMode, masters],
  );

  const selectCatalogMaster = useCallback(
    (master: MasterCatalogRow) => {
      if (createMode === "bambu") {
        setNewBambuMasterId(master.id);
      } else {
        setNewEsunMasterId(master.id);
      }
      setNewInitialWeight(String(master.default_weight));
    },
    [createMode],
  );

  const useManualFromCatalog = useCallback(() => {
    setCreateMode("manual");
    setManualVendor(createMode === "bambu" ? "Bambu" : "eSUN");
    if (selectedCatalogMaster) {
      setManualMaterial(selectedCatalogMaster.material);
    }
  }, [createMode, selectedCatalogMaster]);

  return {
    activeCatalogMasters,
    applyCatalogDefaults,
    bambuBatchInput,
    bambuCodeBatch,
    bambuCodeLookup,
    borrowedFromContact,
    borrowedFromName,
    borrowedInNote,
    catalogQuery,
    createMode,
    currentCreateSwatchHex,
    filteredBambuMasters,
    filteredEsunMasters,
    handleCatalogQueryChange,
    isCatalogCreateMode,
    manualColorName,
    manualFilamentName,
    manualHexColor,
    manualMaterial,
    manualVendor,
    newInitialWeight,
    newLocation,
    newOwnershipType,
    resetAfterCreatedSpool,
    resetBambuBatchInput,
    resetBorrowedInDraft,
    selectCatalogMaster,
    selectedBambuMaster,
    selectedCatalogMaster,
    selectedEsunMaster,
    setBorrowedFromContact,
    setBorrowedFromName,
    setBorrowedInNote,
    setBambuBatchInput,
    setBambuBatchRowSelection,
    setCreateMode,
    setManualColorName,
    setManualFilamentName,
    setManualHexColor,
    setManualMaterial,
    setManualVendor,
    setNewInitialWeight,
    setNewLocation,
    setNewOwnershipType,
    useManualFromCatalog,
  };
}
