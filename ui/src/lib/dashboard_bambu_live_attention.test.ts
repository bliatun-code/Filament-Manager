import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardBambuLiveAttention } from "./dashboard_bambu_live_attention";
import type { PrinterSettingsSnapshot } from "./tauri_client";

function snapshot(
  integrations: PrinterSettingsSnapshot["bambu_live_integrations"],
): PrinterSettingsSnapshot {
  return {
    active_printer_id: null,
    printers: [
      {
        id: "printer-1",
        model: "X1 Carbon",
        name: "Workshop X1C",
        created_at: "2026-08-10 10:00:00",
        updated_at: "2026-08-10 10:00:00",
      },
      {
        id: "printer-2",
        model: "P1S",
        name: "Office P1S",
        created_at: "2026-08-10 10:00:00",
        updated_at: "2026-08-10 10:00:00",
      },
    ],
    printer_models: ["X1 Carbon", "P1S"],
    bambu_live_integrations: integrations,
  };
}

test("dashboard flags enabled Bambu Live integrations that still need TLS trust", () => {
  const attention = buildDashboardBambuLiveAttention(
    snapshot([
      {
        printer_id: "printer-1",
        config: { enabled: true, tls_trust_state: "UNPAIRED" },
      },
      {
        printer_id: "printer-2",
        config: { enabled: true, tls_trust_state: "CHANGED" },
      },
      {
        printer_id: "trusted",
        config: { enabled: true, tls_trust_state: "TRUSTED" },
      },
      {
        printer_id: "disabled",
        config: { enabled: false, tls_trust_state: "UNPAIRED" },
      },
    ]),
  );

  assert.deepEqual(attention, [
    {
      printerId: "printer-2",
      printerName: "Office P1S",
      trustState: "CHANGED",
    },
    {
      printerId: "printer-1",
      printerName: "Workshop X1C",
      trustState: "UNPAIRED",
    },
  ]);
});

test("dashboard treats a missing legacy TLS state as unpaired", () => {
  assert.deepEqual(
    buildDashboardBambuLiveAttention(
      snapshot([
        {
          printer_id: "printer-1",
          config: { enabled: true },
        },
      ]),
    ),
    [
      {
        printerId: "printer-1",
        printerName: "Workshop X1C",
        trustState: "UNPAIRED",
      },
    ],
  );
});
