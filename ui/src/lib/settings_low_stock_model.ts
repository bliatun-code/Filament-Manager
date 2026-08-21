import {
  isValidLowStockThreshold,
  normalizeLowStockMaterialDisplayName,
  normalizeLowStockMaterialKey,
} from "./low_stock_policy";
import type { LowStockPolicy } from "./tauri_client";

export type LowStockOverrideDraft = {
  materialKey: string;
  material: string;
  thresholdRaw: string;
};

export function parseLowStockThreshold(raw: string): number | null {
  if (!/^\d+$/u.test(raw.trim())) {
    return null;
  }
  const value = Number(raw);
  return isValidLowStockThreshold(value) ? value : null;
}

export function buildLowStockPolicyFromDraft(input: {
  defaultThresholdRaw: string;
  overrides: LowStockOverrideDraft[];
}): LowStockPolicy | null {
  const defaultThreshold = parseLowStockThreshold(input.defaultThresholdRaw);
  if (defaultThreshold == null) {
    return null;
  }
  const seen = new Set<string>();
  const overrides = [];
  for (const item of input.overrides) {
    const material = normalizeLowStockMaterialDisplayName(item.material);
    const materialKey = normalizeLowStockMaterialKey(material);
    const threshold = parseLowStockThreshold(item.thresholdRaw);
    if (!materialKey || threshold == null || seen.has(materialKey)) {
      return null;
    }
    seen.add(materialKey);
    overrides.push({
      material_key: materialKey,
      material,
      threshold_g: threshold,
    });
  }
  overrides.sort((left, right) => left.material_key.localeCompare(right.material_key));
  return {
    default_threshold_g: defaultThreshold,
    material_overrides: overrides,
  };
}
