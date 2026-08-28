import { useCallback, useEffect, useRef, useState } from "react";
import {
  selectSettingsCatalogRefreshMaterial,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";
import {
  readCatalogSourcePreferences,
  replaceCatalogSourceMaterials,
  writeCatalogSourcePreferences,
} from "../lib/catalog_source_preferences";

type UseSettingsCatalogRefreshMaterialsOptions = {
  cacheScope: string | null;
};

export function useSettingsCatalogRefreshMaterials({
  cacheScope,
}: UseSettingsCatalogRefreshMaterialsOptions) {
  const cacheScopeRef = useRef(cacheScope);
  const [catalogVendor, setCatalogVendor] = useState<SettingsCatalogVendor>("Bambu");
  const [catalogSourcePreferences, setCatalogSourcePreferences] = useState(() =>
    readCatalogSourcePreferences({ cacheScope }),
  );
  const [bambuRefreshMaterial, setBambuRefreshMaterial] = useState<string | null>(null);
  const [esunRefreshMaterial, setEsunRefreshMaterial] = useState<string | null>(null);

  useEffect(() => {
    cacheScopeRef.current = cacheScope;
    setCatalogSourcePreferences(readCatalogSourcePreferences({ cacheScope }));
    setBambuRefreshMaterial(null);
    setEsunRefreshMaterial(null);
  }, [cacheScope]);

  const selectCatalogRefreshMaterial = useCallback(
    (vendor: SettingsCatalogVendor, material: string) => {
      const selectedMaterial = selectSettingsCatalogRefreshMaterial(material);
      const setter = vendor === "Bambu" ? setBambuRefreshMaterial : setEsunRefreshMaterial;
      setter(selectedMaterial);
    },
    [],
  );

  const getCatalogRefreshMaterial = useCallback(
    (vendor: SettingsCatalogVendor) =>
      vendor === "Bambu" ? bambuRefreshMaterial : esunRefreshMaterial,
    [bambuRefreshMaterial, esunRefreshMaterial],
  );

  const saveDiscoveredCatalogMaterials = useCallback(
    (vendor: SettingsCatalogVendor, materials: string[]) => {
      if (cacheScopeRef.current !== cacheScope) {
        return false;
      }
      const availableMaterials = replaceCatalogSourceMaterials(
        { Bambu: [], eSUN: [] },
        vendor,
        materials,
      )[vendor];
      setCatalogSourcePreferences((current) => {
        const next = replaceCatalogSourceMaterials(current, vendor, availableMaterials);
        writeCatalogSourcePreferences(next, { cacheScope });
        return next;
      });
      const selectedSetter =
        vendor === "Bambu" ? setBambuRefreshMaterial : setEsunRefreshMaterial;
      selectedSetter((selected) =>
        selected && availableMaterials.includes(selected) ? selected : null,
      );
      return true;
    },
    [cacheScope],
  );

  return {
    bambuDiscoveredMaterials: catalogSourcePreferences.Bambu,
    bambuRefreshMaterial,
    catalogVendor,
    esunDiscoveredMaterials: catalogSourcePreferences.eSUN,
    esunRefreshMaterial,
    getCatalogRefreshMaterial,
    saveDiscoveredCatalogMaterials,
    selectCatalogRefreshMaterial,
    setCatalogVendor,
  };
}
