import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import { PrinterSlotAssignmentStatus } from "./printer_slot_assignment_status";

const t = (_key: string, fallback = "") => fallback;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t,
};

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function slot(overrides: Partial<PrinterAmsSlotRow> = {}): PrinterAmsSlotRow {
  return {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 1,
    ...overrides,
  };
}

function printerOverview(slotRow: PrinterAmsSlotRow): PrinterOverviewRow {
  return {
    printer: {
      id: "printer-1",
      model: "Bambu Lab X1 Carbon",
      name: "X1C",
      created_at: "2099-01-01T00:00:00Z",
      updated_at: "2099-01-01T00:00:00Z",
    },
    usage: {
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      total_used_g: 0,
    },
    slots: [slotRow],
  };
}

function liveConfig(): BambuLiveIntegrationSettings {
  return {
    enabled: true,
    observed_state: {
      online: true,
      mqtt_connected: true,
      last_seen_at: "2099-01-01T00:00:00Z",
      progress_percent: 34,
      active_ams_index: 0,
      active_tray_index: 0,
      trays: [],
    },
  };
}

function unknownRfidTray(
  overrides: Partial<BambuLiveObservedTray> = {},
): BambuLiveObservedTray {
  return {
    tray_index: 0,
    loaded: true,
    tray_uuid: "UNREGISTERED-BAMBU-RFID",
    match_status: "unknown_rfid",
    filament_type: "PLA",
    filament_name: "PLA Matte",
    color_hex: "#000000",
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function spoolRow(
  id: string,
  overrides: {
    vendor?: string;
    material?: string;
    filamentName?: string;
    colorName?: string;
    hexColor?: string;
    status?: string;
    rfidTag?: string | null;
    ownershipType?: string | null;
  } = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `${id}-master`,
      status: overrides.status ?? "IN_STOCK",
      rfid_tag: overrides.rfidTag ?? null,
      ownership_type: overrides.ownershipType ?? "OWNED",
    },
    master: {
      id: `${id}-master`,
      vendor: overrides.vendor ?? "Bambu",
      material: overrides.material ?? "PLA",
      filament_name: overrides.filamentName ?? "PLA Matte",
      color_name: overrides.colorName ?? "Black",
      hex_color: overrides.hexColor ?? "#000000",
      default_weight: 1000,
    },
  };
}

function catalogRow(
  id: string,
  overrides: Partial<MasterCatalogRow> = {},
): MasterCatalogRow {
  return {
    id,
    vendor: overrides.vendor ?? "Bambu Lab",
    material: overrides.material ?? "PLA",
    filament_name: overrides.filament_name ?? "PLA Matte",
    color_name: overrides.color_name ?? "Black",
    hex_color: overrides.hex_color ?? "#000000",
    default_weight: overrides.default_weight ?? 1000,
    is_discontinued: overrides.is_discontinued ?? false,
    product_url: overrides.product_url ?? null,
    discontinued_at: overrides.discontinued_at ?? null,
  };
}

function renderStatus(options: {
  slotRow: PrinterAmsSlotRow;
  liveTray?: BambuLiveObservedTray;
  spools?: SpoolWithMasterRow[];
  catalogRows?: MasterCatalogRow[];
}) {
  const liveTray = options.liveTray ?? unknownRfidTray();
  const displayState = derivePrinterSlotDisplayState({
    slot: options.slotRow,
    liveConfig: liveConfig(),
    liveTray,
    spoolRows: options.spools ?? [],
    catalogRows: options.catalogRows ?? [],
    selectedTargetSpool: null,
    clientReadOnly: false,
    clientPrinterSource: "LIVE",
    locale: "en",
    t,
    findSpoolById: (spoolId) =>
      options.spools?.find((row) => row.spool.id === spoolId) ?? null,
  });

  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(PrinterSlotAssignmentStatus, {
        printer: printerOverview(options.slotRow),
        slot: options.slotRow,
        busy: false,
        displayState,
        openRfidOverrideDialog: () => {},
        registerLiveRfidCandidate: () => {},
        createLiveBambuCatalogSpool: () => {},
      }),
    ),
  );
}

test("PrinterSlotAssignmentStatus offers one-click RFID registration for one unknown RFID inventory candidate", () => {
  const html = renderStatus({
    slotRow: slot(),
    spools: [spoolRow("bambu-black")],
  });

  assert.match(
    html,
    /One inventory roll looks like this live Bambu roll\. Save RFID to bind it permanently\./,
  );
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /Save RFID/);
  assert.match(html, /focus-visible:border-sky-300/);
  assert.doesNotMatch(html, /Add \+ save RFID/);
});

test("PrinterSlotAssignmentStatus keeps one-click RFID registration for one borrowed-in candidate", () => {
  const html = renderStatus({
    slotRow: slot(),
    spools: [
      spoolRow("borrowed-bambu-black", {
        ownershipType: "BORROWED_IN",
      }),
    ],
  });

  assert.match(
    html,
    /One inventory roll looks like this live Bambu roll\. Save RFID to bind it permanently\./,
  );
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /Borrowed in/);
  assert.match(html, /Save RFID/);
  assert.doesNotMatch(html, /select first/);
  assert.doesNotMatch(html, /Add \+ save RFID/);
});

test("PrinterSlotAssignmentStatus lists multiple unknown RFID candidates with borrowed-in context", () => {
  const html = renderStatus({
    slotRow: slot(),
    spools: [
      spoolRow("bambu-black"),
      spoolRow("bambu-white", {
        colorName: "Black backup",
        hexColor: "#000000",
        ownershipType: "BORROWED_IN",
      }),
    ],
  });

  assert.match(html, /2 inventory rolls look like this live Bambu roll\./);
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /PLA Matte.*Black backup/);
  assert.match(html, /Borrowed in/);
  assert.match(html, /Save RFID/);
});

test("PrinterSlotAssignmentStatus requires selecting a different candidate before saving RFID", () => {
  const html = renderStatus({
    slotRow: slot({ spool_id: "loaded-other-spool" }),
    spools: [spoolRow("bambu-black")],
  });

  assert.match(html, /Current roll/);
  assert.match(html, /One inventory roll looks like this live Bambu roll/);
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /select first/);
  assert.doesNotMatch(html, /Save RFID/);
  assert.doesNotMatch(html, /Add \+ save RFID/);
});

test("PrinterSlotAssignmentStatus counts multiple RFID candidates before saving into occupied slots", () => {
  const html = renderStatus({
    slotRow: slot({ spool_id: "loaded-other-spool" }),
    spools: [
      spoolRow("bambu-black"),
      spoolRow("bambu-black-backup", { colorName: "Black backup" }),
    ],
  });

  assert.match(html, /Current roll/);
  assert.match(html, /2 inventory rolls look like this live Bambu roll\./);
  assert.match(html, /Select the correct roll before saving RFID\./);
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /PLA Matte.*Black backup/);
  assert.equal((html.match(/select first/g) ?? []).length, 2);
  assert.doesNotMatch(html, /One inventory roll looks like this live Bambu roll/);
  assert.doesNotMatch(html, /Save RFID/);
  assert.doesNotMatch(html, /Add \+ save RFID/);
});

test("PrinterSlotAssignmentStatus allows RFID registration when the candidate is already assigned", () => {
  const html = renderStatus({
    slotRow: slot({ spool_id: "bambu-black" }),
    spools: [spoolRow("bambu-black")],
  });

  assert.match(html, /Current roll/);
  assert.match(
    html,
    /Current assignment looks like this live Bambu roll\. Save RFID to bind it permanently\./,
  );
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /current/);
  assert.match(html, /Save RFID/);
  assert.doesNotMatch(html, /select first/);
  assert.doesNotMatch(html, /Add \+ save RFID/);
});

test("PrinterSlotAssignmentStatus offers catalog add and RFID save when inventory has no unknown RFID match", () => {
  const html = renderStatus({
    slotRow: slot(),
    catalogRows: [catalogRow("bambu-matte-black")],
  });

  assert.match(
    html,
    /Bambu catalog has one likely match\. Add it here to save the live RFID\./,
  );
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /Add \+ save RFID/);
  assert.doesNotMatch(html, /Save RFID/);
});

test("PrinterSlotAssignmentStatus offers catalog add from tray preset name", () => {
  const html = renderStatus({
    slotRow: slot(),
    liveTray: unknownRfidTray({
      filament_type: null,
      filament_name: null,
      tray_id_name: "Bambu PLA Matte @BBL P1S 0.4 nozzle",
      color_hex: "#000000",
    }),
    catalogRows: [catalogRow("bambu-matte-black")],
  });

  assert.match(
    html,
    /Bambu catalog has one likely match\. Add it here to save the live RFID\./,
  );
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /Add \+ save RFID/);
  assert.doesNotMatch(html, /Save RFID/);
});

test("PrinterSlotAssignmentStatus lists multiple catalog onboarding choices", () => {
  const html = renderStatus({
    slotRow: slot(),
    catalogRows: [
      catalogRow("bambu-matte-black"),
      catalogRow("bambu-basic-black", { filament_name: "PLA Basic" }),
      catalogRow("bambu-archived-black", {
        filament_name: "PLA Archived",
        is_discontinued: true,
      }),
      catalogRow("bambu-extra-black", { filament_name: "PLA Extra" }),
    ],
  });

  assert.match(html, /4 Bambu catalog entries look like this live roll\./);
  assert.match(html, /PLA Matte.*Black/);
  assert.match(html, /PLA Basic.*Black/);
  assert.match(html, /PLA Extra.*Black/);
  assert.doesNotMatch(html, /PLA Archived.*Black/);
  assert.doesNotMatch(html, /Discontinued/);
  assert.match(html, /More Bambu catalog candidates are available\./);
  assert.equal((html.match(/Add \+ save RFID/g) ?? []).length, 3);
});

test("PrinterSlotAssignmentStatus blocks catalog onboarding when the slot is already occupied", () => {
  const html = renderStatus({
    slotRow: slot({ spool_id: "loaded-spool" }),
    catalogRows: [catalogRow("bambu-matte-black")],
  });

  assert.match(html, /Current roll/);
  assert.match(html, /Bambu catalog has one likely match/);
  assert.match(html, /clear slot first/);
  assert.doesNotMatch(html, /Add \+ save RFID/);
});
