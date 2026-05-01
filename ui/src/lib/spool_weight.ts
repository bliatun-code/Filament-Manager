export function defaultSpoolTareWeightForVendor(vendor?: string | null): number {
  const normalized = (vendor ?? "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return 250;
  }
  if (normalized.includes("esun")) {
    return 224;
  }
  return 0;
}

export function resolveSpoolTareWeight(
  explicitTareWeightGrams?: number | null,
  vendor?: string | null,
): number {
  if (explicitTareWeightGrams != null && Number.isFinite(explicitTareWeightGrams)) {
    return Math.max(0, Math.round(explicitTareWeightGrams));
  }
  return defaultSpoolTareWeightForVendor(vendor);
}
