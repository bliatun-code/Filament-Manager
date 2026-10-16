import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardLowStockPreview, sanitizeDashboardBambuLiveIntegrations } from "./dashboard_overview_data";
import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import type { BambuLiveIntegrationEntry, SpoolWithMasterRow } from "./tauri_client";

function spool(id: string, remaining: number | null, overrides: Partial<SpoolWithMasterRow> = {}): SpoolWithMasterRow {
  return {
    spool: { id, master_id: "master", status: "IN_STOCK", remaining_g: remaining, current_weight_g: 190, initial_weight_g: 1_000 },
    master: { id: "master", vendor: "Bambu", material: "PLA", filament_name: "Basic", color_name: "Signal Orange", hex_color: "#F97316", default_weight: 1_000 },
    location_name: "Shelf A",
    low_stock_threshold_g: 200,
    ...overrides,
  };
}

test("dashboard low-stock preview uses inclusive per-roll policy and actual remaining-weight fallback", () => {
  const rows = [spool("exact", 200), spool("over", 201), spool("fallback", null), spool("high-policy", 300, { low_stock_threshold_g: 300 }), spool("low-policy", 150, { low_stock_threshold_g: 100 }), spool("zero", 0), spool("legacy", 175, { low_stock_threshold_g: undefined })];
  const preview = buildDashboardLowStockPreview(normalizeSpoolWithMasterRows(rows));
  assert.deepEqual(preview.map((row) => [row.spoolId, row.remainingG]), [["legacy", 175], ["fallback", 190], ["exact", 200], ["high-policy", 300]]);
  assert.equal(preview[0].hexColor, "#F97316");
  assert.equal(preview[0].locationLabel, "Shelf A");
});

test("dashboard low-stock preview remains physical rolls, filters unavailable statuses, and limits to four lowest", () => {
  const rows = Array.from({ length: 6 }, (_, index) => spool(`roll-${index}`, 100 + index));
  rows.push(spool("empty", 30, { spool: { ...rows[0].spool, id: "empty", status: "EMPTY", remaining_g: 30 } }));
  rows.push(spool("loaned", 30, { spool: { ...rows[0].spool, id: "loaned", status: "BORROWED", remaining_g: 30 } }));
  rows.push(spool("lost", 30, { spool: { ...rows[0].spool, id: "lost", status: "LOST", remaining_g: 30 } }));
  rows.push(spool("assigned", 50, { spool: { ...rows[0].spool, id: "assigned", status: "IN_USE", remaining_g: 50, ownership_type: "BORROWED_IN" } }));
  const preview = buildDashboardLowStockPreview(normalizeSpoolWithMasterRows(rows));
  assert.deepEqual(preview.map((row) => row.spoolId), ["assigned", "roll-0", "roll-1", "roll-2"]);
  assert.equal(preview.filter((row) => row.filamentName === "Basic").length, 4);
});

test("dashboard live projections allow only read-only display fields and isolate observations", () => {
  const source: BambuLiveIntegrationEntry[] = [{ printer_id: "bambu", config: { enabled: true, host: "host.private", printer_serial: "serial", tls_certificate_fingerprint: "fingerprint", tls_spki_fingerprint: "spki", access_code_configured: true, last_error: "private transport error", tls_trust_state: "TRUSTED", observed_state: { online: true, mqtt_connected: true, gcode_state: "PAUSE", print_type: "local", progress_percent: 64, remaining_minutes: 18, subtask_name: "Part", nozzle_temp_c: 218, raw_payload_json: { captured: true }, trays: [{ loaded: true, tray_index: 1, tray_uuid: "rfid-private" }] } } }];
  const projected = sanitizeDashboardBambuLiveIntegrations(source);
  assert.deepEqual(Object.keys(projected[0].config).sort(), ["enabled", "observed_state", "tls_trust_state"]);
  assert.equal(projected[0].config.observed_state?.gcode_state, "PAUSE");
  assert.equal(projected[0].config.observed_state?.progress_percent, 64);
  assert.deepEqual(projected[0].config.observed_state?.trays, []);
  assert.doesNotMatch(JSON.stringify(projected), /private|fingerprint|spki|raw_payload_json|access_code/);
  source[0].config.observed_state!.gcode_state = "IDLE";
  assert.equal(projected[0].config.observed_state?.gcode_state, "PAUSE");
});
