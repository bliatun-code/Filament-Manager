import { isSpoolLowStock, resolveSpoolStockGrams } from "./inventory_domain";
import { resolveSpoolLowStockThreshold } from "./low_stock_policy";
import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";
import type { BambuLiveIntegrationEntry } from "./tauri_client";

export type DashboardStockPreviewRow = {
  spoolId: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor: string | null;
  remainingG: number;
  locationLabel: string | null;
};

export function buildDashboardLowStockPreview(
  rows: NormalizedSpoolWithMasterRow[],
): DashboardStockPreviewRow[] {
  return rows.flatMap((row) => {
    const remainingG = resolveSpoolStockGrams({
      status: row.spool.normalized_status,
      remainingGrams: row.spool.remaining_g,
      currentWeightGrams: row.spool.current_weight_g,
      initialWeightGrams: row.spool.initial_weight_g,
    });
    if (!isSpoolLowStock(
      { status: row.spool.normalized_status, remainingGrams: remainingG },
      resolveSpoolLowStockThreshold(row).thresholdGrams,
    )) return [];
    return [{
      spoolId: row.spool.id,
      vendor: row.master.vendor,
      material: row.master.material,
      filamentName: row.master.filament_name,
      colorName: row.master.color_name,
      hexColor: row.master.hex_color ?? null,
      remainingG,
      locationLabel: row.location_name?.trim() || null,
    }];
  }).sort((left, right) => left.remainingG - right.remainingG || left.spoolId.localeCompare(right.spoolId))
    .slice(0, 4);
}

/** Keep only the fields needed by the compact read-only live-status cards. */
export function sanitizeDashboardBambuLiveIntegrations(
  entries: BambuLiveIntegrationEntry[],
): BambuLiveIntegrationEntry[] {
  return entries.map(({ printer_id, config }) => {
    const observed = config.observed_state;
    return {
      printer_id,
      config: {
        enabled: config.enabled,
        tls_trust_state: config.tls_trust_state,
        observed_state: observed ? {
          online: observed.online,
          mqtt_connected: observed.mqtt_connected,
          last_seen_at: observed.last_seen_at,
          gcode_state: observed.gcode_state,
          print_type: observed.print_type,
          progress_percent: observed.progress_percent,
          remaining_minutes: observed.remaining_minutes,
          subtask_name: observed.subtask_name,
          nozzle_temp_c: observed.nozzle_temp_c,
          trays: [],
        } : null,
      },
    };
  });
}
