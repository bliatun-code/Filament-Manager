import { LOW_STOCK_GRAMS } from "./inventory_constants";
import type {
  LowStockMaterialOverride,
  LowStockPolicy,
  SpoolWithMasterRow,
} from "./tauri_client";

export const LOW_STOCK_THRESHOLD_MIN_G = 1;
export const LOW_STOCK_THRESHOLD_MAX_G = 100_000;

export type LowStockThresholdResolution = {
  thresholdGrams: number;
  legacyFallback: boolean;
};

export function normalizeLowStockMaterialDisplayName(material: string): string {
  return material.trim().replace(/\s+/gu, " ");
}

export function normalizeLowStockMaterialKey(material: string): string {
  return normalizeLowStockMaterialDisplayName(material).toUpperCase();
}

export function isValidLowStockThreshold(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= LOW_STOCK_THRESHOLD_MIN_G &&
    value <= LOW_STOCK_THRESHOLD_MAX_G
  );
}

export function resolveLowStockThresholdGrams(
  thresholdGrams?: number | null,
): LowStockThresholdResolution {
  if (thresholdGrams != null && isValidLowStockThreshold(thresholdGrams)) {
    return { thresholdGrams, legacyFallback: false };
  }
  return { thresholdGrams: LOW_STOCK_GRAMS, legacyFallback: true };
}

export function resolveSpoolLowStockThreshold(
  row: Pick<SpoolWithMasterRow, "low_stock_threshold_g">,
): LowStockThresholdResolution {
  return resolveLowStockThresholdGrams(row.low_stock_threshold_g);
}

export function normalizeLowStockPolicy(policy?: LowStockPolicy | null): LowStockPolicy {
  const defaultThreshold = resolveLowStockThresholdGrams(
    policy?.default_threshold_g,
  ).thresholdGrams;
  const overrides = new Map<string, LowStockMaterialOverride>();
  for (const item of policy?.material_overrides ?? []) {
    const material = normalizeLowStockMaterialDisplayName(item.material);
    const materialKey = normalizeLowStockMaterialKey(material);
    if (!materialKey || !isValidLowStockThreshold(item.threshold_g)) {
      continue;
    }
    overrides.set(materialKey, {
      material_key: materialKey,
      material,
      threshold_g: item.threshold_g,
    });
  }
  return {
    default_threshold_g: defaultThreshold,
    material_overrides: Array.from(overrides.values()).sort((left, right) =>
      left.material_key.localeCompare(right.material_key),
    ),
  };
}

export function effectivePolicyThreshold(
  policy: LowStockPolicy,
  material: string,
): number {
  const normalized = normalizeLowStockPolicy(policy);
  const key = normalizeLowStockMaterialKey(material);
  return (
    normalized.material_overrides.find((item) => item.material_key === key)
      ?.threshold_g ?? normalized.default_threshold_g
  );
}
