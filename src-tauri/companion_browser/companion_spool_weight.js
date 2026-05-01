export function defaultSpoolTareWeightForVendor(vendor) {
  const normalized = String(vendor || "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return 250;
  }
  if (normalized.includes("esun")) {
    return 224;
  }
  return 0;
}

export function resolveSpoolTareWeight(spoolLike, vendor) {
  const explicit = spoolLike?.spool_tare_weight_g;
  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }
  return defaultSpoolTareWeightForVendor(vendor);
}

export function resolveSpoolRowTareWeight(row) {
  return resolveSpoolTareWeight(row?.spool, row?.master?.vendor);
}
