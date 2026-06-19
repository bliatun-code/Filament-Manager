import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveInventoryCandidateRows,
  rowMatchesLiveBambuSlot,
} from "./companion_live_rfid_candidates.js";

function slot(overrides = {}) {
  return {
    slot_id: "slot-1",
    spool_id: null,
    live_loaded: true,
    live_match_status: "unknown_rfid",
    live_tray_uuid: "RFID-NEW",
    live_filament_type: "PLA",
    live_filament_name: "PLA Matte",
    live_color_hex: "#030303",
    ...overrides,
  };
}

function row(id, overrides = {}) {
  return {
    spool: {
      id,
      status: "IN_STOCK",
      rfid_tag: null,
      ownership_type: "OWNED",
      ...overrides.spool,
    },
    master: {
      id: `${id}-master`,
      material: "PLA",
      filament_name: "PLA Matte",
      color_name: "Black",
      vendor: "Bambu",
      hex_color: "#000000",
      ...overrides.master,
    },
  };
}

test("Companion live RFID candidates match near and composite Bambu swatches", () => {
  const candidate = row("multi-black", {
    master: {
      hex_color: "multi(#FFFFFF,#000000)",
    },
  });
  const farColor = row("red", {
    master: {
      color_name: "Red",
      hex_color: "#B91C1C",
    },
  });

  assert.equal(rowMatchesLiveBambuSlot(slot(), candidate), true);
  assert.equal(
    rowMatchesLiveBambuSlot(
      slot({ live_color_hex: "#3AA13F" }),
      row("gradient-green", {
        master: {
          color_name: "Green",
          hex_color: "gradient(#720062,#3A913F)",
        },
      }),
    ),
    true,
  );
  assert.deepEqual(
    buildLiveInventoryCandidateRows(slot(), [farColor, candidate]).map(
      (candidateRow) => candidateRow.spool.id,
    ),
    ["multi-black"],
  );
  assert.equal(
    rowMatchesLiveBambuSlot(
      slot(),
      row("missing-material", {
        master: {
          material: "",
          filament_name: "",
          hex_color: "#030303",
        },
      }),
    ),
    false,
  );
});

test("Companion live RFID candidates keep matching host preference, borrowed-in rows, and occupied-slot guard", () => {
  const preferred = row("host-preferred", {
    master: {
      hex_color: "#010101",
    },
  });
  const borrowedIn = row("borrowed-in", {
    spool: {
      ownership_type: "BORROWED_IN",
    },
    master: {
      hex_color: "#010101",
    },
  });

  assert.deepEqual(
    buildLiveInventoryCandidateRows(
      slot({ live_matched_inventory_spool_id: "host-preferred" }),
      [borrowedIn, preferred],
    ).map((candidateRow) => candidateRow.spool.id),
    ["host-preferred", "borrowed-in"],
  );
  assert.deepEqual(
    buildLiveInventoryCandidateRows(slot({ spool_id: "already-loaded" }), [
      preferred,
      borrowedIn,
    ]),
    [],
  );
});

test("Companion live RFID candidates ignore stale mismatched host preference", () => {
  const stalePreferred = row("stale-host-preferred", {
    master: {
      filament_name: "PLA Basic",
      color_name: "White",
      hex_color: "#FFFFFF",
    },
  });
  const matchingCandidate = row("matching-candidate", {
    master: {
      hex_color: "#010101",
    },
  });

  assert.deepEqual(
    buildLiveInventoryCandidateRows(
      slot({ live_matched_inventory_spool_id: "stale-host-preferred" }),
      [matchingCandidate, stalePreferred],
    ).map((candidateRow) => candidateRow.spool.id),
    ["matching-candidate"],
  );
});

test("Companion live RFID candidates infer material from live filament name", () => {
  assert.deepEqual(
    buildLiveInventoryCandidateRows(
      slot({
        live_filament_type: null,
        live_filament_name: "PLA Matte",
        live_color_hex: "#030303",
      }),
      [row("bambu-black")],
    ).map((candidateRow) => candidateRow.spool.id),
    ["bambu-black"],
  );
});

test("Companion live RFID candidates ignore color-only unknown RFID signals", () => {
  assert.deepEqual(
    buildLiveInventoryCandidateRows(
      slot({
        live_filament_type: null,
        live_filament_name: null,
        live_color_hex: "#000000",
      }),
      [row("bambu-black")],
    ),
    [],
  );
});
