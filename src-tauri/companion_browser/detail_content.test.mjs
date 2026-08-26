import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderSelectedSpoolDetailBody } from "./detail_content.js";

const detailContentSource = readFileSync(new URL("./detail_content.js", import.meta.url), "utf8");

function createSelectedSpool(overrides = {}) {
  return {
    spool: {
      id: "spool-1",
      status: "IN_STOCK",
      ownership_type: "OWNED",
      owner_name: "",
      owner_contact: "",
      ownership_note: "",
      qr_code: "qr-1",
      location_id: "Shelf A",
      home_location_id: "Shelf A",
      initial_weight_g: 1000,
      current_weight_g: 920,
      remaining_g: 900,
      purchase_price: null,
      purchase_currency: null,
      purchase_date: null,
      batch_code: null,
      supplier_reference: null,
      ...overrides.spool,
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
      vendor: "Bambu",
      ...overrides.master,
    },
    location_name: overrides.location_name ?? null,
    home_location_name: overrides.home_location_name ?? null,
  };
}

function createSelectedDetail(overrides = {}) {
  return {
    active_loan: overrides.active_loan ?? null,
    usage: overrides.usage ?? [],
    history: overrides.history ?? [],
  };
}

function renderBody(overrides = {}) {
  const selectedSpool = overrides.selectedSpool ?? createSelectedSpool();
  return renderSelectedSpoolDetailBody({
    selectedSpool,
    selectedDetail: overrides.selectedDetail ?? createSelectedDetail(),
    detailFeedback: overrides.detailFeedback ?? "",
    busy: overrides.busy ?? false,
    compactDetail: overrides.compactDetail ?? false,
    findAssignedSlotForSpool: overrides.findAssignedSlotForSpool ?? (() => null),
    loanActionState:
      overrides.loanActionState ??
      (() => ({
        allowed: true,
        reason: "",
      })),
    escapeHtml: (value) => String(value ?? ""),
    formatDate: (value) => (value ? `date:${value}` : "Unknown"),
    formatGrams: (value) => `${value ?? 0} g`,
    formatPlacementLabel: (value) => value || "Unplaced",
    ownershipLabel: (spool) =>
      spool.ownership_type === "BORROWED_IN" ? "Borrowed in" : "Owned",
    rfidCaptureSources: overrides.rfidCaptureSources ?? [],
    locale: overrides.locale ?? "en",
  });
}

test("detail content routes timeline empty states through shared companion cards", () => {
  assert.match(detailContentSource, /renderCompanionStateCard/);
  assert.doesNotMatch(detailContentSource, /<div class="(?:empty-card|info-card)"/);

  const html = renderBody();

  assert.match(html, /class="empty-card">No usage points recorded yet\./);
  assert.match(html, /class="empty-card">No history recorded yet\./);
});

test("detail content keeps borrowed-in spools out of loan actions inside detail", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        ownership_type: "BORROWED_IN",
        owner_name: "Riley",
        owner_contact: "riley@example.test",
        ownership_note: "Return next week",
      },
    }),
    selectedDetail: createSelectedDetail({
      active_loan: {
        loan: {
          id: "loan-1",
          loan_direction: "INBOUND",
          counterparty_name: "Riley",
          counterparty_contact: "riley@example.test",
          counterparty_note: "Desk pickup",
          borrower_name: "",
          lent_at: "2026-03-22T10:00:00Z",
          grams_out: 650,
        },
      },
    }),
  });

  assert.match(html, /Borrowed in/);
  assert.doesNotMatch(html, /Riley/);
  assert.doesNotMatch(html, /Hand back spool/);
  assert.doesNotMatch(html, /loan-spool-form/);
  assert.doesNotMatch(html, /return-loan-form/);
  assert.match(html, /data-action="update-spool-details-form"/);
  assert.match(html, /class="primary-button swatch-action-button" type="submit" style="--swatch-rgb:/);
  assert.match(html, /Shelf A/);
  assert.match(html, /name="home-location"/);
});

test("detail content does not render outbound loan return flow inside detail", () => {
  const html = renderBody({
    selectedDetail: createSelectedDetail({
      active_loan: {
        loan: {
          id: "loan-2",
          loan_direction: "OUTBOUND",
          borrower_name: "Alex",
          counterparty_name: "",
          lent_at: "2026-03-21T08:00:00Z",
          lent_note: "Prototype loan",
          grams_out: 720,
        },
      },
    }),
  });

  assert.doesNotMatch(html, /Return loan/);
  assert.doesNotMatch(html, /Returned total weight incl\. spool \(g\)/);
  assert.doesNotMatch(html, /loan-spool-form/);
});

test("detail content no longer exposes create-loan controls in detail", () => {
  const html = renderBody({
    findAssignedSlotForSpool: () => ({
      printerName: "X1C",
      slotIndex: 3,
    }),
  });

  assert.doesNotMatch(html, /Lend spool/);
  assert.doesNotMatch(html, /Outgoing total weight incl\. spool \(g\)/);
});

test("detail content falls back invalid status values to IN_STOCK and shows matching feedback", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        status: "UNKNOWN_STATUS",
      },
    }),
    detailFeedback: "Weight updated just now.",
  });

  assert.match(html, /Weight updated just now\./);
  assert.match(html, /In stock/);
  assert.match(html, /data-action="update-spool-details-form"/);
  assert.match(html, /name="location"/);
  assert.match(html, /name="home-location"/);
});

test("detail content disables weight editing while spool detail is refreshing", () => {
  const html = renderBody({ busy: true });

  assert.match(html, /name="grams"[^>]* disabled/);
  assert.match(html, /name="tare-grams"[^>]* disabled/);
  assert.match(html, /type="submit"[^>]* disabled/);
  assert.match(html, /name="purchase_price"[\s\S]*?disabled/);
});

test("detail content hydrates all purchase metadata fields from the selected spool", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        purchase_price: 249.5,
        purchase_currency: "NOK",
        purchase_date: "2026-08-21",
        batch_code: "LOT-7",
        supplier_reference: "PO-42",
      },
    }),
  });

  assert.match(html, /name="purchase_price"[\s\S]*?value="249\.5"/);
  assert.match(html, /name="purchase_currency"[\s\S]*?value="NOK"/);
  assert.match(html, /name="purchase_date"[\s\S]*?value="2026-08-21"/);
  assert.match(html, /name="batch_code"[\s\S]*?value="LOT-7"/);
  assert.match(html, /name="supplier_reference"[\s\S]*?value="PO-42"/);
  assert.match(html, /Clear every field to remove its purchase details/);
});

test("detail content explains the legacy price-without-currency rule", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        purchase_price: 199,
        purchase_currency: null,
      },
    }),
  });

  assert.match(html, /legacy price can remain without currency until the price changes/);
  assert.doesNotMatch(html, /name="purchase_currency"[^>]*required/);
});

test("detail content preserves the assigned status for receipt-only edits", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        status: "ASSIGNED",
        location_id: "Printer:Brutus:printer_1_ams_1_slot_2",
      },
    }),
  });

  assert.match(html, /name="status" type="hidden" value="ASSIGNED"/);
  assert.match(html, /<option value="ASSIGNED" selected>Assigned<\/option>/);
  assert.doesNotMatch(html, /<option value="IN_STOCK" selected>/);
  assert.match(html, /name="purchase_price"/);
});

test("detail content locks a loaned-out spool to BORROWED while keeping receipt fields editable", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        status: "BORROWED",
        location_id: "With Alice",
        home_location_id: "Shelf A",
      },
    }),
  });

  assert.match(html, /name="status" type="hidden" value="BORROWED"/);
  assert.match(html, /<option value="BORROWED" selected>Loaned out<\/option>/);
  assert.doesNotMatch(html, /<option value="IN_STOCK" selected>/);
  assert.match(html, /type="hidden" name="location" value="With Alice"/);
  assert.match(html, /type="hidden" name="home-location" value="Shelf A"/);
  assert.equal(html.match(/name="home-location"/g)?.length, 1);
  assert.match(html, /value="Shelf A"[\s\S]*?disabled/);
  assert.match(html, /name="purchase_price"/);
});

test("detail content displays location names while preserving opaque ids for writes", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        location_id: "location_aaaaaaaa",
        home_location_id: "location_bbbbbbbb",
      },
      location_name: "Dry box",
      home_location_name: "Shelf 2",
    }),
  });

  assert.match(html, /Dry box/);
  assert.match(html, /value="Shelf 2"/);
  assert.match(html, /type="hidden" name="location" value="location_aaaaaaaa"/);
  assert.doesNotMatch(html, /type="hidden" name="location" value="Dry box"/);
});

test("compact detail keeps history collapsed behind a short summary", () => {
  const html = renderBody({
    compactDetail: true,
    selectedDetail: createSelectedDetail({
      usage: [{ grams: 840, source: "Manual", captured_at: "2026-03-20T10:00:00Z" }],
      history: [{ event_type: "weight_update", created_at: "2026-03-21T10:00:00Z" }],
    }),
  });

  assert.match(html, /detail-history-collapsible/);
  assert.match(html, /1 weight check · 1 activity item/);
  assert.match(html, /Started/);
  assert.match(html, /Now/);
  assert.doesNotMatch(html, /detail-history-collapsible" open/);
  assert.doesNotMatch(html, /data-collapsible="details" open/);
});

test("detail content localizes core labels in norwegian", () => {
  const html = renderBody({
    locale: "nb",
    selectedDetail: createSelectedDetail({
      usage: [{ grams: 840, source: "", captured_at: "2026-03-20T10:00:00Z" }],
      history: [{ event_type: "weight_update", created_at: "2026-03-21T10:00:00Z" }],
    }),
  });

  assert.match(html, /Detaljer/);
  assert.match(html, /Nåværende plassering/);
  assert.match(html, /Hjemmeplassering/);
  assert.match(html, /Målt totalvekt \(g\)/);
  assert.match(html, /Rullens tomvekt \(g\)/);
  assert.match(html, /Lagre vekt/);
  assert.match(html, /Historikk/);
  assert.match(html, /Vekt oppdatert/);
});

test("detail content renders a generated QR image tied to the selected spool id", () => {
  const html = renderBody({
    selectedSpool: createSelectedSpool({
      spool: {
        id: "spool-qr-42",
      },
    }),
  });

  assert.match(
    html,
    /src="\/api\/v1\/spools\/spool-qr-42\/qr-image\.svg"/
  );
  assert.match(html, /class="detail-qr-preview"/);
});

test("detail content renders RFID capture controls from live printer sources", () => {
  const html = renderBody({
    rfidCaptureSources: [
      {
        slotId: "slot-4",
        printerId: "printer-1",
        printerName: "Brutus",
        slotLabel: "AMS 1 · Slot 4",
        rfidTag: "00112233445566778899AABBCCDDEEFF",
        observedAt: "2026-04-17T18:45:56Z",
        filamentLabel: "PLA · Jade White",
        statusLabel: "RFID not registered",
      },
    ],
  });

  assert.match(html, /data-action="update-spool-rfid-form"/);
  assert.match(html, /Saved RFID/);
  assert.match(html, /Observed RFID/);
  assert.match(html, /Brutus · AMS 1 · Slot 4 · PLA · Jade White/);
  assert.match(html, /Save RFID/);
});

test("detail content localizes newer history event labels in norwegian", () => {
  const html = renderBody({
    locale: "nb",
    selectedDetail: createSelectedDetail({
      history: [
        { event_type: "CREATED", created_at: "2026-04-17T10:00:00Z" },
        { event_type: "RFID_TAG_UPDATED", created_at: "2026-04-17T11:00:00Z" },
        { event_type: "TARE_WEIGHT_UPDATED", created_at: "2026-04-17T12:00:00Z" },
        { event_type: "PURCHASE_METADATA_UPDATED", created_at: "2026-04-17T12:30:00Z" },
        { event_type: "PURCHASE_RECEIPT_RECORDED", created_at: "2026-04-17T12:45:00Z" },
      ],
    }),
  });

  assert.match(html, /Lagt til i lageret/);
  assert.match(html, /RFID lagret/);
  assert.match(html, /Rullens tomvekt oppdatert/);
  assert.match(html, /Innkjøpsdetaljer oppdatert/);
  assert.match(html, /Innkjøpskvittering registrert/);
});

test("detail content localizes WEIGHT_UPDATED history labels in norwegian", () => {
  const html = renderBody({
    locale: "nb",
    selectedDetail: createSelectedDetail({
      history: [
        { event_type: "WEIGHT_UPDATED", created_at: "2026-04-17T13:00:00Z" },
        { event_type: "WEIGHT_CORRECTED", created_at: "2026-04-17T14:00:00Z" },
      ],
    }),
  });

  assert.match(html, /Vekt oppdatert/);
  assert.match(html, /Vekt korrigert/);
});

test("detail content localizes loan history and usage source labels in norwegian", () => {
  const html = renderBody({
    locale: "nb",
    selectedDetail: createSelectedDetail({
      usage: [
        { grams: 165, source: "MANUAL", captured_at: "2026-04-17T13:00:00Z" },
        { grams: 120, source: "LOAN_RETURN", captured_at: "2026-04-17T14:00:00Z" },
      ],
      history: [
        { event_type: "loaned out", created_at: "2026-04-17T15:00:00Z" },
        { event_type: "LOAN_RETURN", created_at: "2026-04-17T16:00:00Z" },
      ],
    }),
  });

  assert.match(html, /Manuell/);
  assert.match(html, /Utlån returnert/);
  assert.match(html, /Lånt ut/);
  assert.doesNotMatch(html, /MANUAL/);
  assert.doesNotMatch(html, /LOAN_RETURN/);
  assert.doesNotMatch(html, /loaned out/);
});

test("detail content localizes accepted AMS weight sources in norwegian", () => {
  const html = renderBody({
    locale: "nb",
    selectedDetail: createSelectedDetail({
      usage: [
        {
          grams: 843,
          source: "BAMBU_AMS_ACCEPTED",
          captured_at: "2026-08-15T10:00:00Z",
        },
      ],
    }),
  });

  assert.match(html, /AMS-estimat/);
  assert.doesNotMatch(html, /BAMBU_AMS_ACCEPTED|BAMBU AMS ACCEPTED/);
});
