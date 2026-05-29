import {
  isValidHexColor,
  normalizeHexColor,
  suggestHexFromColor,
} from "../lib/color_utils";
import type { CatalogRefreshResult, MasterCatalogRow } from "../lib/tauri_client";

export type SettingsCatalogVendor = "Bambu" | "eSUN";

const DEFAULT_BAMBU_REFRESH_MATERIALS = [
  "ABS",
  "ASA",
  "PA6",
  "PAHT",
  "PC",
  "PET",
  "PETG",
  "PLA",
  "PPA",
  "TPU",
];

const DEFAULT_ESUN_REFRESH_MATERIALS = [
  "ABS",
  "ASA",
  "HIPS",
  "PA",
  "PA12",
  "PAHT",
  "PC",
  "PET",
  "PETG",
  "PLA",
  "PVA",
  "TPU",
];

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
  const bambuCatalogMaterialOptions = materialOptionsForVendor(
    "Bambu",
    bambuCatalogMasters,
  );
  const esunCatalogMaterialOptions = materialOptionsForVendor("eSUN", esunCatalogMasters);

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

export function toggleSettingsCatalogRefreshMaterial(
  materials: string[],
  material: string,
): string[] {
  return materials.includes(material)
    ? materials.filter((item) => item !== material)
    : [...materials, material];
}

export function settingsCatalogRefreshSummaryHasFetchDetails(
  summary: CatalogRefreshResult,
): boolean {
  return summary.reused_cached_products != null || summary.detail_fetches != null;
}

export function settingsCatalogRefreshSummaryGridClass(summary: CatalogRefreshResult): string {
  return settingsCatalogRefreshSummaryHasFetchDetails(summary)
    ? "sm:grid-cols-2 xl:grid-cols-5"
    : "sm:grid-cols-3";
}

export type SettingsCatalogRefreshSummaryLabels = {
  discontinued: string;
  imported: string;
  reactivated: string;
};

export function buildSettingsCatalogRefreshSuccessMessage(
  summary: CatalogRefreshResult,
  labels: SettingsCatalogRefreshSummaryLabels,
): string {
  return `${labels.imported} ${summary.imported} · ${labels.reactivated} ${summary.reactivated_count} · ${labels.discontinued} ${summary.discontinued_count}`;
}

export type SettingsCatalogRefreshMessageLabels = {
  refreshBambuFailed: string;
  refreshEsunFailed: string;
  refreshPreparingBambu: string;
  refreshPreparingEsun: string;
  zeroBambu: string;
  zeroEsun: string;
};

export function buildSettingsCatalogRefreshPreparingMessage(
  vendor: SettingsCatalogVendor,
  labels: Pick<SettingsCatalogRefreshMessageLabels, "refreshPreparingBambu" | "refreshPreparingEsun">,
): string {
  return vendor === "Bambu" ? labels.refreshPreparingBambu : labels.refreshPreparingEsun;
}

export function buildSettingsCatalogRefreshZeroImportMessage(
  vendor: SettingsCatalogVendor,
  labels: Pick<SettingsCatalogRefreshMessageLabels, "zeroBambu" | "zeroEsun">,
): string {
  return vendor === "Bambu" ? labels.zeroBambu : labels.zeroEsun;
}

export function buildSettingsCatalogRefreshFallbackErrorMessage(
  vendor: SettingsCatalogVendor,
  labels: Pick<SettingsCatalogRefreshMessageLabels, "refreshBambuFailed" | "refreshEsunFailed">,
): string {
  return vendor === "Bambu" ? labels.refreshBambuFailed : labels.refreshEsunFailed;
}

export type SettingsSwatchBulkResult = {
  failed: number;
  skipped: number;
  updated: number;
};

export type SettingsSwatchBulkMessageLabels = {
  confirmBulkSwatchTapAgain: string;
  failed: string;
  noMissingSwatches: string;
  noVisibleMissingSwatchesCouldBeAutoFilled: string;
  skipped: string;
  swatchBulkUpdateCompleted: string;
  updated: string;
};

export type SettingsSwatchSavedMessageLabels = {
  swatchSaved: string;
};

export type SettingsSwatchErrorMessageKey = "invalidSwatchHex" | "saveSwatchFailed";

export type SettingsSwatchErrorMessageLabels = Record<SettingsSwatchErrorMessageKey, string>;

export function buildSettingsSwatchErrorMessage(
  key: SettingsSwatchErrorMessageKey,
  labels: SettingsSwatchErrorMessageLabels,
): string {
  return labels[key];
}

export function buildSettingsSwatchSavedMessage(
  filamentTitle: string,
  labels: SettingsSwatchSavedMessageLabels,
): string {
  return `${labels.swatchSaved}: ${filamentTitle}`;
}

export function buildSettingsNoMissingSwatchesMessage(
  labels: Pick<SettingsSwatchBulkMessageLabels, "noMissingSwatches">,
): string {
  return labels.noMissingSwatches;
}

export function buildSettingsSwatchBulkConfirmMessage(
  labels: Pick<SettingsSwatchBulkMessageLabels, "confirmBulkSwatchTapAgain">,
): string {
  return labels.confirmBulkSwatchTapAgain;
}

export function buildSettingsSwatchBulkResultMessage(
  result: SettingsSwatchBulkResult,
  labels: SettingsSwatchBulkMessageLabels,
): { kind: "error" | "info"; message: string } {
  const failedPart = `${labels.failed} ${result.failed}`;
  const skippedPart = result.skipped > 0 ? `, ${labels.skipped} ${result.skipped}` : "";

  if (result.updated === 0) {
    return {
      kind: "error",
      message: `${labels.noVisibleMissingSwatchesCouldBeAutoFilled} ${failedPart}${skippedPart}.`,
    };
  }

  const failureSuffix = result.failed > 0 ? `, ${failedPart}` : "";
  return {
    kind: "info",
    message: `${labels.swatchBulkUpdateCompleted}: ${labels.updated} ${result.updated}${failureSuffix}${skippedPart}.`,
  };
}

function materialOptionsForVendor(
  vendor: SettingsCatalogVendor,
  masters: MasterCatalogRow[],
): string[] {
  const defaultMaterials =
    vendor === "Bambu" ? DEFAULT_BAMBU_REFRESH_MATERIALS : DEFAULT_ESUN_REFRESH_MATERIALS;
  return uniqueSortedStrings(
    [
      ...defaultMaterials,
      ...masters.map((master) => master.material.trim()).filter((value) => value.length > 0),
    ],
  );
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
