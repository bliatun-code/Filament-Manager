import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";
import type { InventorySpool } from "./inventory_list_model";

type InventoryExportRecord = Readonly<{
  colorName: string;
  filamentName: string;
  vendor: string;
  initialWeightGrams: number;
  currentWeightGrams: number;
  spoolTareWeightGrams: number | null;
  ownershipType: string;
  ownerName: string;
  ownerContact: string;
  ownershipNote: string;
  locationId: string;
  locationName: string;
  locationType: string;
  homeLocationId: string;
  homeLocationName: string;
  homeLocationType: string;
  material: string;
  qrCode: string;
  remainingGrams: number;
  purchasePrice: number | null;
  purchaseCurrency: string;
  purchaseDate: string;
  batchCode: string;
  supplierReference: string;
  purchasePriceBatchLocked: boolean;
  purchasePriceSource: string | null;
  spoolId: string;
  status: string;
}>;

function escapeInventoryExportCsv(value: string): string {
  if (/[",\n\r]/.test(value) || value.trim() !== value) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function inventoryExportStatus(entry: NormalizedSpoolWithMasterRow): string {
  return entry.spool.normalized_status ?? "IN_STOCK";
}

function normalizedInventoryExportRecord(
  entry: NormalizedSpoolWithMasterRow,
): InventoryExportRecord {
  return {
    colorName: entry.master.color_name,
    filamentName: entry.master.filament_name,
    vendor: entry.master.vendor,
    initialWeightGrams:
      entry.spool.initial_weight_g ?? Math.max(1, entry.master.default_weight),
    currentWeightGrams:
      entry.spool.current_weight_g ??
      entry.spool.remaining_g ??
      entry.spool.initial_weight_g ??
      Math.max(1, entry.master.default_weight),
    spoolTareWeightGrams: entry.spool.spool_tare_weight_g ?? null,
    ownershipType: entry.spool.ownership_type ?? "OWNED",
    ownerName: entry.spool.owner_name ?? "",
    ownerContact: entry.spool.owner_contact ?? "",
    ownershipNote: entry.spool.ownership_note ?? "",
    locationId: entry.spool.location_id ?? "",
    locationName: entry.location_name?.trim() || entry.spool.location_id || "",
    locationType: entry.location_type?.trim() || "",
    homeLocationId: entry.spool.home_location_id ?? "",
    homeLocationName:
      entry.home_location_name?.trim() || entry.spool.home_location_id || "",
    homeLocationType: entry.home_location_type?.trim() || "",
    material: entry.master.material,
    qrCode: entry.spool.qr_code ?? "",
    remainingGrams: entry.spool.remaining_g ?? 0,
    purchasePrice: entry.spool.purchase_price ?? null,
    purchaseCurrency: entry.spool.purchase_currency ?? "",
    purchaseDate: entry.spool.purchase_date ?? "",
    batchCode: entry.spool.batch_code ?? "",
    supplierReference: entry.spool.supplier_reference ?? "",
    purchasePriceBatchLocked: entry.spool.purchase_price_batch_locked ?? false,
    purchasePriceSource: entry.spool.purchase_price_source ?? null,
    spoolId: entry.spool.id,
    status: inventoryExportStatus(entry),
  };
}

function inventorySpoolExportRecord(spool: InventorySpool): InventoryExportRecord {
  return {
    colorName: spool.colorName,
    filamentName: spool.filamentName,
    vendor: spool.vendor,
    initialWeightGrams: spool.initialWeightGrams,
    currentWeightGrams:
      spool.currentWeightGrams ?? spool.remainingGrams ?? spool.initialWeightGrams,
    spoolTareWeightGrams: spool.spoolTareWeightGrams ?? null,
    ownershipType: spool.ownershipType,
    ownerName: spool.ownerName ?? "",
    ownerContact: spool.ownerContact ?? "",
    ownershipNote: spool.ownershipNote ?? "",
    locationId: spool.locationId ?? "",
    locationName: spool.location ?? spool.locationId ?? "",
    locationType: spool.locationType ?? "",
    homeLocationId: spool.homeLocationId ?? "",
    homeLocationName: spool.homeLocation ?? spool.homeLocationId ?? "",
    homeLocationType: spool.homeLocationType ?? "",
    material: spool.material,
    qrCode: spool.qrCode ?? "",
    remainingGrams: spool.remainingGrams ?? 0,
    purchasePrice: spool.purchasePrice ?? null,
    purchaseCurrency: spool.purchaseCurrency ?? "",
    purchaseDate: spool.purchaseDate ?? "",
    batchCode: spool.batchCode ?? "",
    supplierReference: spool.supplierReference ?? "",
    purchasePriceBatchLocked: spool.purchasePriceBatchLocked ?? false,
    purchasePriceSource: spool.purchasePriceSource ?? null,
    spoolId: spool.id,
    status: spool.status,
  };
}

function buildInventoryExportRecordCsv(rows: readonly InventoryExportRecord[]): string {
  const output = [
    "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source",
  ];
  for (const row of rows) {
    output.push(
      [
        row.spoolId,
        row.material,
        row.filamentName,
        row.colorName,
        row.vendor,
        row.status,
        row.ownershipType,
        row.ownerName,
        row.ownerContact,
        row.ownershipNote,
        String(row.initialWeightGrams),
        String(row.currentWeightGrams),
        String(row.remainingGrams),
        row.spoolTareWeightGrams === null ? "" : String(row.spoolTareWeightGrams),
        row.locationName,
        row.locationId,
        row.locationName,
        row.locationType,
        row.homeLocationId,
        row.homeLocationName,
        row.homeLocationType,
        row.qrCode,
        row.purchasePrice === null ? "" : String(row.purchasePrice),
        row.purchaseCurrency,
        row.purchaseDate,
        row.batchCode,
        row.supplierReference,
        String(row.purchasePriceBatchLocked),
        row.purchasePriceSource ?? "",
      ]
        .map(escapeInventoryExportCsv)
        .join(","),
    );
  }
  return output.join("\n");
}

function buildInventoryExportRecordJson(rows: readonly InventoryExportRecord[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      spool_id: row.spoolId,
      material: row.material,
      filament_name: row.filamentName,
      color_name: row.colorName,
      vendor: row.vendor,
      status: row.status,
      ownership_type: row.ownershipType,
      owner_name: row.ownerName || null,
      owner_contact: row.ownerContact || null,
      ownership_note: row.ownershipNote || null,
      initial_weight_g: row.initialWeightGrams,
      current_weight_g: row.currentWeightGrams,
      remaining_g: row.remainingGrams,
      spool_tare_weight_g: row.spoolTareWeightGrams,
      location: row.locationName,
      location_id: row.locationId || null,
      location_name: row.locationName || null,
      location_type: row.locationType || null,
      home_location_id: row.homeLocationId || null,
      home_location_name: row.homeLocationName || null,
      home_location_type: row.homeLocationType || null,
      qr_code: row.qrCode,
      purchase_price: row.purchasePrice,
      purchase_currency: row.purchaseCurrency || null,
      purchase_date: row.purchaseDate || null,
      batch_code: row.batchCode || null,
      supplier_reference: row.supplierReference || null,
      purchase_price_batch_locked: row.purchasePriceBatchLocked,
      purchase_price_source: row.purchasePriceSource,
    })),
  );
}

export function buildInventoryExportCsv(rows: NormalizedSpoolWithMasterRow[]): string {
  return buildInventoryExportRecordCsv(rows.map(normalizedInventoryExportRecord));
}

export function buildInventoryExportJson(rows: NormalizedSpoolWithMasterRow[]): string {
  return buildInventoryExportRecordJson(rows.map(normalizedInventoryExportRecord));
}

export function buildInventorySpoolExportCsv(rows: readonly InventorySpool[]): string {
  return buildInventoryExportRecordCsv(rows.map(inventorySpoolExportRecord));
}

export function buildInventorySpoolExportJson(rows: readonly InventorySpool[]): string {
  return buildInventoryExportRecordJson(rows.map(inventorySpoolExportRecord));
}
