import type { SpoolWithMasterRow } from "./tauri_client";

function escapeInventoryExportCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildInventoryExportCsv(rows: SpoolWithMasterRow[]): string {
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
        entry.spool.status,
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

export function buildInventoryExportJson(rows: SpoolWithMasterRow[]): string {
  return JSON.stringify(
    rows.map((entry) => ({
      spool_id: entry.spool.id,
      material: entry.master.material,
      filament_name: entry.master.filament_name,
      color_name: entry.master.color_name,
      status: entry.spool.status,
      remaining_g: entry.spool.remaining_g ?? 0,
      location: entry.spool.location_id ?? "",
      qr_code: entry.spool.qr_code ?? "",
    })),
  );
}
