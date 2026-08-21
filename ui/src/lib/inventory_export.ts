import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";
import type { InventorySpool } from "./inventory_list_model";

type InventoryExportRecord = Readonly<{
  colorName: string;
  filamentName: string;
  location: string;
  material: string;
  qrCode: string;
  remainingGrams: number;
  spoolId: string;
  status: string;
}>;

function escapeInventoryExportCsv(value: string): string {
  if (/[",\n]/.test(value)) {
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
    location: entry.spool.location_id ?? "",
    material: entry.master.material,
    qrCode: entry.spool.qr_code ?? "",
    remainingGrams: entry.spool.remaining_g ?? 0,
    spoolId: entry.spool.id,
    status: inventoryExportStatus(entry),
  };
}

function inventorySpoolExportRecord(spool: InventorySpool): InventoryExportRecord {
  return {
    colorName: spool.colorName,
    filamentName: spool.filamentName,
    location: spool.locationId ?? spool.location ?? "",
    material: spool.material,
    qrCode: spool.qrCode ?? "",
    remainingGrams: spool.remainingGrams ?? 0,
    spoolId: spool.id,
    status: spool.status,
  };
}

function buildInventoryExportRecordCsv(rows: readonly InventoryExportRecord[]): string {
  const output = [
    "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code",
  ];
  for (const row of rows) {
    output.push(
      [
        row.spoolId,
        row.material,
        row.filamentName,
        row.colorName,
        row.status,
        String(row.remainingGrams),
        row.location,
        row.qrCode,
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
      status: row.status,
      remaining_g: row.remainingGrams,
      location: row.location,
      qr_code: row.qrCode,
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
