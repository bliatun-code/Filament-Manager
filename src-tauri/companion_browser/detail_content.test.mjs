import test from "node:test";
import assert from "node:assert/strict";

import { renderSelectedSpoolDetailBody } from "./detail_content.js";

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
      ...overrides.spool,
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
      vendor: "Bambu",
      ...overrides.master,
    },
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
  assert.match(html, /Tom rull-vekt \(g\)/);
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
        rfidTag: "B85A8848EEFD4C9784072CD4D7D04FAC",
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
      ],
    }),
  });

  assert.match(html, /Lagt til i lageret/);
  assert.match(html, /RFID lagret/);
  assert.match(html, /Tom rull-vekt oppdatert/);
});

test("detail content localizes WEIGHT_UPDATED history labels in norwegian", () => {
  const html = renderBody({
    locale: "nb",
    selectedDetail: createSelectedDetail({
      history: [{ event_type: "WEIGHT_UPDATED", created_at: "2026-04-17T13:00:00Z" }],
    }),
  });

  assert.match(html, /Vekt oppdatert/);
});
