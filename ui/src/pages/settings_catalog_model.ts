import {
  isValidHexColor,
  normalizeHexColor,
  suggestHexFromColor,
} from "../lib/color_utils";
import type { MasterCatalogRow } from "../lib/tauri_client";

export type SettingsCatalogVendor = "Bambu" | "eSUN";

export function buildSettingsCatalogState({
  bambuRefreshMaterials,
  catalogMasters,
  catalogVendor,
  esunRefreshMaterials,
  swatchVendorFilter,
}: {
  bambuRefreshMaterials: string[];
  catalogMasters: MasterCatalogRow[];
  catalogVendor: SettingsCatalogVendor;
  esunRefreshMaterials: string[];
  swatchVendorFilter: string;
}) {
  const missingSwatchMasters = catalogMasters.filter(
    (master) => !isValidHexColor(master.hex_color),
  );
  const visibleMissingSwatchMasters =
    swatchVendorFilter === "ALL"
      ? missingSwatchMasters
      : missingSwatchMasters.filter(
          (master) => master.vendor.toLowerCase() === swatchVendorFilter.toLowerCase(),
        );
  const swatchVendorOptions = [
    "ALL",
    ...uniqueSortedStrings(missingSwatchMasters.map((master) => master.vendor).filter(Boolean)),
  ];
  const bambuCatalogMasters = catalogMasters.filter((master) =>
    master.vendor.toLowerCase().includes("bambu"),
  );
  const esunCatalogMasters = catalogMasters.filter((master) =>
    master.vendor.toLowerCase().includes("esun"),
  );
  const bambuCatalogMaterialOptions = materialOptionsForMasters(bambuCatalogMasters);
  const esunCatalogMaterialOptions = materialOptionsForMasters(esunCatalogMasters);

  return {
    activeCatalogMasterCount:
      catalogVendor === "Bambu" ? bambuCatalogMasters.length : esunCatalogMasters.length,
    activeCatalogMaterialOptions:
      catalogVendor === "Bambu" ? bambuCatalogMaterialOptions : esunCatalogMaterialOptions,
    activeCatalogRefreshMaterials:
      catalogVendor === "Bambu" ? bambuRefreshMaterials : esunRefreshMaterials,
    bambuCatalogMasters,
    bambuCatalogMaterialOptions,
    esunCatalogMasters,
    esunCatalogMaterialOptions,
    missingSwatchMasters,
    swatchVendorOptions,
    visibleMissingSwatchMasters,
    visibleMissingSwatchVendorCount: uniqueSortedStrings(
      visibleMissingSwatchMasters.map((master) => master.vendor).filter(Boolean),
    ).length,
  };
}

export function buildSettingsSwatchDrafts(catalogMasters: MasterCatalogRow[]): Record<string, string> {
  const drafts: Record<string, string> = {};

  for (const master of catalogMasters) {
    drafts[master.id] = resolveSettingsSwatchHex({
      master,
      swatchDraftById: { [master.id]: master.hex_color ?? "" },
    });
  }

  return drafts;
}

export function resolveSettingsSwatchHex({
  master,
  swatchDraftById,
}: {
  master: MasterCatalogRow;
  swatchDraftById: Record<string, string>;
}): string {
  return (
    normalizeHexColor(swatchDraftById[master.id], { uppercase: true }) ??
    suggestHexFromColor(master)
  );
}

function materialOptionsForMasters(masters: MasterCatalogRow[]): string[] {
  return uniqueSortedStrings(
    masters.map((master) => master.material.trim()).filter((value) => value.length > 0),
  );
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
