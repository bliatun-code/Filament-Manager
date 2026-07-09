import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";

function escapeInventoryExportCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function inventoryExportStatus(entry: NormalizedSpoolWithMasterRow): string {
  return entry.spool.normalized_status ?? "IN_STOCK";
}

export function buildInventoryExportCsv(rows: NormalizedSpoolWithMasterRow[]): string {
  const output = [
    "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code",
  ];
  for (const entry of rows) {
    output.push(
      [
        entry.spool.id,
        entry.master.material,
        entry.master.filament_name,
        entry.master.color_name,
        inventoryExportStatus(entry),
        String(entry.spool.remaining_g ?? 0),
        entry.spool.location_id ?? "",
        entry.spool.qr_code ?? "",
      ]
        .map(escapeInventoryExportCsv)
        .join(","),
    );
  }
  return output.join("\n");
}

export function buildInventoryExportJson(rows: NormalizedSpoolWithMasterRow[]): string {
  return JSON.stringify(
    rows.map((entry) => ({
      spool_id: entry.spool.id,
      material: entry.master.material,
      filament_name: entry.master.filament_name,
      color_name: entry.master.color_name,
      status: inventoryExportStatus(entry),
      remaining_g: entry.spool.remaining_g ?? 0,
      location: entry.spool.location_id ?? "",
      qr_code: entry.spool.qr_code ?? "",
    })),
  );
}
