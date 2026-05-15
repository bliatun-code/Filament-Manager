import { useState } from "react";
import {
  toggleSettingsCatalogRefreshMaterial,
  type SettingsCatalogVendor,
} from "./settings_catalog_model";

export function useSettingsCatalogRefreshMaterials() {
  const [catalogVendor, setCatalogVendor] = useState<SettingsCatalogVendor>("Bambu");
  const [bambuRefreshMaterials, setBambuRefreshMaterials] = useState<string[]>([]);
  const [esunRefreshMaterials, setEsunRefreshMaterials] = useState<string[]>([]);

  function toggleCatalogRefreshMaterial(vendor: SettingsCatalogVendor, material: string) {
    const setter = vendor === "Bambu" ? setBambuRefreshMaterials : setEsunRefreshMaterials;
    setter((previous) => toggleSettingsCatalogRefreshMaterial(previous, material));
  }

  function clearCatalogRefreshMaterials(vendor: SettingsCatalogVendor) {
    if (vendor === "Bambu") {
      setBambuRefreshMaterials([]);
      return;
    }
    setEsunRefreshMaterials([]);
  }

  function getCatalogRefreshMaterials(vendor: SettingsCatalogVendor) {
    return vendor === "Bambu" ? bambuRefreshMaterials : esunRefreshMaterials;
  }

  return {
    bambuRefreshMaterials,
    catalogVendor,
    clearCatalogRefreshMaterials,
    esunRefreshMaterials,
    getCatalogRefreshMaterials,
    setCatalogVendor,
    toggleCatalogRefreshMaterial,
  };
}
