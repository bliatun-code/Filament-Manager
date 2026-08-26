import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";
import { createAppError } from "./error_text";
import type {
  FilamentDefaultsSpoolRow,
  FilamentGroupPriceDefault,
  FilamentPriceBatchReceipt as UiFilamentPriceBatchReceipt,
  FilamentPriceBatchRequest,
  SaveFilamentGroupPriceDefaultRequest,
} from "./settings_filament_defaults_model";
import {
  FILAMENT_STANDARDS_SCHEMA_VERSION,
  type FilamentPriceBatchInput,
  type FilamentPriceBatchReceipt,
  type FilamentStandardsSettings,
  type FilamentStandardsSnapshot,
} from "./tauri_filament_standards_client";

export function emptyFilamentStandardsSettings(): FilamentStandardsSettings {
  return {
    schema_version: FILAMENT_STANDARDS_SCHEMA_VERSION,
    default_purchase_currency: null,
    price_standards: [],
  };
}

export function mapFilamentStandardsSnapshotRows(
  snapshot: FilamentStandardsSnapshot,
): FilamentDefaultsSpoolRow[] {
  return snapshot.groups.flatMap((group) =>
    group.spools.map((spool) => ({
      spoolId: spool.spool_id,
      masterId: spool.master_id,
      groupKey: group.group_key,
      vendor: group.vendor,
      material: group.material,
      filamentName: group.filament_name,
      colorName: spool.color_name,
      nominalWeightG: group.nominal_weight_g,
      purchasePrice: spool.purchase_price ?? null,
      purchaseCurrency: spool.purchase_currency ?? null,
      purchasePriceSource: spool.purchase_price_source ?? null,
      batchPriceLocked: spool.purchase_price_batch_locked,
      ownershipType: spool.ownership_type,
      status: spool.status,
    })),
  );
}

export function mapFallbackFilamentDefaultsRows(
  rows: readonly NormalizedSpoolWithMasterRow[],
): FilamentDefaultsSpoolRow[] {
  return rows.map((row) => ({
    spoolId: row.spool.id,
    masterId: row.spool.master_id,
    vendor: row.master.vendor,
    material: row.master.material,
    filamentName: row.master.filament_name,
    colorName: row.master.color_name,
    nominalWeightG: row.master.default_weight,
    purchasePrice: row.spool.purchase_price ?? null,
    purchaseCurrency: row.spool.purchase_currency ?? null,
    purchasePriceSource: row.spool.purchase_price_source ?? null,
    batchPriceLocked: row.spool.purchase_price_batch_locked ?? false,
    ownershipType: row.spool.ownership_type,
    status: row.spool.status,
  }));
}

export function filamentGroupPriceDefaults(
  snapshot: FilamentStandardsSnapshot | null,
): FilamentGroupPriceDefault[] {
  return (snapshot?.settings.price_standards ?? []).map((standard) => ({
    groupKey: standard.group_key,
    price: standard.price,
    currency: standard.currency,
  }));
}

export function settingsWithDefaultPurchaseCurrency(
  snapshot: FilamentStandardsSnapshot,
  currency: string,
): FilamentStandardsSettings {
  return {
    ...snapshot.settings,
    default_purchase_currency: currency,
  };
}

export function settingsWithGroupPriceDefault(
  snapshot: FilamentStandardsSnapshot,
  request: SaveFilamentGroupPriceDefaultRequest,
): FilamentStandardsSettings {
  const group = snapshot.groups.find(
    (candidate) => candidate.group_key === request.groupKey,
  );
  if (!group) {
    throw createAppError("filament_price_batch.stale_review");
  }

  const standard = {
    group_key: group.group_key,
    vendor: group.vendor,
    material: group.material,
    filament_name: group.filament_name,
    nominal_weight_g: group.nominal_weight_g,
    price: request.price,
    currency: request.currency,
  };
  const priceStandards = snapshot.settings.price_standards
    .filter((candidate) => candidate.group_key !== request.groupKey)
    .concat(standard)
    .sort((left, right) => left.group_key.localeCompare(right.group_key));

  return {
    ...snapshot.settings,
    price_standards: priceStandards,
  };
}

export function buildFilamentPriceBatchInput(
  snapshot: FilamentStandardsSnapshot,
  request: FilamentPriceBatchRequest,
): FilamentPriceBatchInput {
  const group = snapshot.groups.find(
    (candidate) => candidate.group_key === request.groupKey,
  );
  if (!group) {
    throw createAppError("filament_price_batch.stale_review");
  }
  const spoolsById = new Map(group.spools.map((spool) => [spool.spool_id, spool]));
  const historicalMissingPriceSpoolIds = new Set(
    request.historicalMissingPriceSpoolIds,
  );
  const spools = request.spoolIds.map((spoolId) => {
    const spool = spoolsById.get(spoolId);
    if (!spool) {
      throw createAppError("filament_price_batch.stale_review");
    }
    return {
      spool_id: spool.spool_id,
      expected_master_id: spool.master_id,
      expected_status: spool.status,
      expected_ownership_type: spool.ownership_type,
      expected_purchase_price: spool.purchase_price ?? null,
      expected_purchase_currency: spool.purchase_currency ?? null,
      expected_purchase_price_source: spool.purchase_price_source ?? null,
      expected_purchase_price_batch_locked:
        spool.purchase_price_batch_locked,
      allow_historical_missing_price_fill:
        historicalMissingPriceSpoolIds.has(spool.spool_id),
    };
  });

  return {
    mode: request.mode,
    group_key: request.groupKey,
    price: request.price,
    currency: request.currency,
    spools,
  };
}

export function requireWritableFilamentStandardsSnapshot({
  clientReadOnly,
  roleResolved,
  snapshot,
}: {
  clientReadOnly: boolean;
  roleResolved: boolean;
  snapshot: FilamentStandardsSnapshot | null;
}): FilamentStandardsSnapshot {
  if (!roleResolved) {
    throw createAppError("filament_standards.role_unresolved");
  }
  if (clientReadOnly) {
    throw createAppError("filament_standards.host_managed");
  }
  if (!snapshot) {
    throw createAppError("filament_standards.not_loaded");
  }
  return snapshot;
}

export function mapFilamentPriceBatchReceipt(
  receipt: FilamentPriceBatchReceipt,
  request: FilamentPriceBatchRequest,
  snapshot: FilamentStandardsSnapshot,
): UiFilamentPriceBatchReceipt {
  const group = snapshot.groups.find(
    (candidate) => candidate.group_key === request.groupKey,
  );
  const spoolLabels = new Map(
    (group?.spools ?? []).map((spool) => [
      spool.spool_id,
      [group?.filament_name, spool.color_name].filter(Boolean).join(" · "),
    ]),
  );
  const label = (spoolId: string, colorName: string) =>
    spoolLabels.get(spoolId) || colorName || spoolId;

  return {
    batchId: receipt.batch_id,
    groupKey: receipt.group_key,
    mode: receipt.mode,
    price: request.price,
    currency: request.currency,
    committed: receipt.committed,
    updated: receipt.updated.map((entry) => ({
      spoolId: entry.spool_id,
      spoolLabel: label(entry.spool_id, entry.color_name),
      protectedFromBatchPricing: entry.purchase_price_batch_locked,
    })),
    skipped: receipt.skipped.map((entry) => ({
      spoolId: entry.spool_id,
      spoolLabel: label(entry.spool_id, entry.color_name),
      reason: entry.reason,
    })),
    completedAt: new Date().toISOString(),
  };
}

export async function refreshAfterFilamentPriceBatch({
  refreshInventory,
  refreshStandards,
  reportWarning = console.warn,
}: {
  refreshInventory: () => Promise<void> | void;
  refreshStandards: () => Promise<FilamentStandardsSnapshot>;
  reportWarning?: (reason: unknown) => void;
}): Promise<FilamentStandardsSnapshot | null> {
  const [standardsRefresh, inventoryRefresh] = await Promise.allSettled([
    refreshStandards(),
    Promise.resolve(refreshInventory()),
  ]);
  if (inventoryRefresh.status === "rejected") {
    reportWarning(inventoryRefresh.reason);
  }
  if (standardsRefresh.status === "rejected") {
    reportWarning(standardsRefresh.reason);
    return null;
  }
  return standardsRefresh.value;
}
