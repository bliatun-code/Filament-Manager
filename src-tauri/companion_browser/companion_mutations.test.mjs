import test from "node:test";
import assert from "node:assert/strict";

import { createBorrowedInDraft, createInitialCompanionState } from "./session_state.js";
import { createCompanionMutations } from "./companion_mutations.js";

function createMutationHarness(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    csrfToken: "csrf-token",
    ...overrides.state,
  };
  const statusCalls = [];
  const busyCalls = [];
  const detailFeedbackCalls = [];
  const renderCalls = [];
  const openSpoolDetailCalls = [];
  const setDetailReturnContextCalls = [];
  let refreshCount = 0;

  const mutations = createCompanionMutations({
    state,
    fetchJson: overrides.fetchJson ?? (async () => ({})),
    refreshOverview:
      overrides.refreshOverview ??
      (async () => {
        refreshCount += 1;
      }),
    setBusy: (nextBusy) => {
      state.busy = nextBusy;
      busyCalls.push(nextBusy);
    },
    setStatus: (message, tone = "default") => {
      state.statusMessage = message;
      state.statusTone = tone;
      statusCalls.push({ message, tone });
    },
    render: () => {
      renderCalls.push("render");
    },
    clearDetailFeedback: (spoolId = "") => {
      if (!spoolId || state.detailFeedback?.spoolId === spoolId) {
        state.detailFeedback = null;
      }
    },
    setDetailFeedback: (spoolId, message) => {
      state.detailFeedback = { spoolId, message };
      detailFeedbackCalls.push({ spoolId, message });
    },
    createBorrowedInDraft,
    setDetailReturnContext: (rootFlow) => {
      setDetailReturnContextCalls.push(rootFlow);
    },
    openSpoolDetail: (spoolId, source) => {
      openSpoolDetailCalls.push({ spoolId, source });
    },
  });

  return {
    state,
    mutations,
    statusCalls,
    busyCalls,
    detailFeedbackCalls,
    renderCalls,
    openSpoolDetailCalls,
    setDetailReturnContextCalls,
    get refreshCount() {
      return refreshCount;
    },
  };
}

test("submitQrLookup opens the matched spool in storage mode", async () => {
  const harness = createMutationHarness({
    fetchJson: async (path) => {
      assert.match(path, /\/api\/v1\/spools\/by-qr\?/);
      return { spool: { id: "spool-7" } };
    },
  });

  await harness.mutations.submitQrLookup("QR-7");

  assert.equal(harness.state.activeRootFlow, "storage");
  assert.deepEqual(harness.openSpoolDetailCalls, [
    { spoolId: "spool-7", source: { rootFlow: "storage" } },
  ]);
  assert.deepEqual(harness.busyCalls, [true, false]);
  assert.equal(harness.state.statusTone, "success");
});

test("submitQrLookup accepts versioned deep-link payloads", async () => {
  const fetchCalls = [];
  const harness = createMutationHarness({
    fetchJson: async (path) => {
      fetchCalls.push(path);
      return { spool: { id: "spool-9" } };
    },
  });

  await harness.mutations.submitQrLookup("https://local/companion?spool_qr=v1:QR-9");

  assert.equal(fetchCalls[0], "/api/v1/spools/by-qr?qr_code=QR-9");
  assert.deepEqual(harness.openSpoolDetailCalls, [
    { spoolId: "spool-9", source: { rootFlow: "storage" } },
  ]);
});

test("submitSpoolLoanReturn subtracts the Bambu spool weight from measured total weight", async () => {
  const fetchCalls = [];
  const harness = createMutationHarness({
    state: {
      activeTaskSheet: { type: "loan-return", loanId: "loan-1" },
      expandedLoanReturnId: "loan-1",
      spools: [
        {
          spool: {
            id: "spool-1",
            spool_tare_weight_g: null,
          },
          master: {
            vendor: "Bambu",
          },
        },
      ],
    },
    fetchJson: async (path, init) => {
      fetchCalls.push([path, JSON.parse(String(init?.body || "{}"))]);
      return { ok: true };
    },
  });

  await harness.mutations.submitSpoolLoanReturn("loan-1", "spool-1", "1250", "");

  assert.deepEqual(fetchCalls, [
    [
      "/api/v1/loans/loan-1/return",
      {
        returned_grams: 1000,
        note: null,
      },
    ],
  ]);
  assert.equal(harness.refreshCount, 1);
  assert.deepEqual(harness.busyCalls, [true, false]);
  assert.equal(harness.state.activeTaskSheet, null);
  assert.equal(harness.state.expandedLoanReturnId, "");
  assert.equal(harness.state.statusTone, "success");
});

test("submitLiveSlotCandidateRfidUpdate saves a current unknown live RFID candidate", async () => {
  const fetchCalls = [];
  const harness = createMutationHarness({
    state: {
      spools: [
        {
          spool: {
            id: "spool-candidate",
            rfid_tag: null,
          },
          master: {
            vendor: "Bambu Lab",
          },
        },
      ],
      printers: [
        {
          printer: {
            id: "printer-1",
          },
          slots: [
            {
              slot_id: "slot-1",
              spool_id: null,
              live_loaded: true,
              live_match_status: "unknown_rfid",
              live_tray_uuid: "RFID-1",
              live_last_identity_seen_at: "2026-04-17T18:46:30Z",
            },
          ],
        },
      ],
    },
    fetchJson: async (path, init) => {
      fetchCalls.push([path, JSON.parse(String(init?.body || "{}"))]);
      return {};
    },
  });

  await harness.mutations.submitLiveSlotCandidateRfidUpdate(
    "spool-candidate",
    "printer-1",
    "slot-1",
    "RFID-1",
    "2026-04-17T18:45:56Z",
  );

  assert.deepEqual(fetchCalls, [
    [
      "/api/v1/spools/spool-candidate/rfid",
      {
        rfid_tag: "RFID-1",
        rfid_observed_at: "2026-04-17T18:46:30Z",
      },
    ],
  ]);
  assert.equal(harness.refreshCount, 1);
  assert.equal(harness.state.statusTone, "success");
  assert.equal(harness.state.statusMessage, "RFID saved.");
});

test("submitLiveSlotCandidateRfidUpdate saves RFID on the already assigned candidate", async () => {
  const fetchCalls = [];
  const harness = createMutationHarness({
    state: {
      spools: [
        {
          spool: {
            id: "spool-candidate",
            rfid_tag: null,
            status: "ASSIGNED",
          },
          master: {
            vendor: "Bambu Lab",
          },
        },
      ],
      printers: [
        {
          printer: {
            id: "printer-1",
          },
          slots: [
            {
              slot_id: "slot-1",
              spool_id: "spool-candidate",
              live_loaded: true,
              live_match_status: "unknown_rfid",
              live_tray_uuid: "RFID-1",
              live_printer_last_seen_at: "2026-04-17T18:47:00Z",
            },
          ],
        },
      ],
    },
    fetchJson: async (path, init) => {
      fetchCalls.push([path, JSON.parse(String(init?.body || "{}"))]);
      return {};
    },
  });

  await harness.mutations.submitLiveSlotCandidateRfidUpdate(
    "spool-candidate",
    "printer-1",
    "slot-1",
    "RFID-1",
    "2026-04-17T18:45:56Z",
  );

  assert.deepEqual(fetchCalls, [
    [
      "/api/v1/spools/spool-candidate/rfid",
      {
        rfid_tag: "RFID-1",
        rfid_observed_at: "2026-04-17T18:47:00Z",
      },
    ],
  ]);
  assert.equal(harness.refreshCount, 1);
  assert.equal(harness.state.statusTone, "success");
});

test("submitLiveSlotCandidateRfidUpdate rejects stale or occupied live slots", async () => {
  let fetchCount = 0;
  const harness = createMutationHarness({
    state: {
      spools: [
        {
          spool: {
            id: "spool-candidate",
            rfid_tag: null,
          },
          master: {
            vendor: "Bambu Lab",
          },
        },
      ],
      printers: [
        {
          printer: {
            id: "printer-1",
          },
          slots: [
            {
              slot_id: "slot-1",
              spool_id: "already-loaded",
              live_loaded: true,
              live_match_status: "unknown_rfid",
              live_tray_uuid: "RFID-1",
            },
          ],
        },
      ],
    },
    fetchJson: async () => {
      fetchCount += 1;
      return {};
    },
  });

  await harness.mutations.submitLiveSlotCandidateRfidUpdate(
    "spool-candidate",
    "printer-1",
    "slot-1",
    "RFID-1",
    "2026-04-17T18:45:56Z",
  );

  assert.equal(fetchCount, 0);
  assert.equal(harness.state.statusTone, "error");
  assert.match(harness.state.statusMessage, /live slot identity changed/);
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("submitLiveSlotCandidateRfidUpdate rejects candidates that already have RFID", async () => {
  let fetchCount = 0;
  const harness = createMutationHarness({
    state: {
      spools: [
        {
          spool: {
            id: "spool-candidate",
            rfid_tag: "EXISTING-RFID",
          },
          master: {
            vendor: "Bambu Lab",
          },
        },
      ],
      printers: [
        {
          printer: {
            id: "printer-1",
          },
          slots: [
            {
              slot_id: "slot-1",
              spool_id: null,
              live_loaded: true,
              live_match_status: "unknown_rfid",
              live_tray_uuid: "RFID-1",
            },
          ],
        },
      ],
    },
    fetchJson: async () => {
      fetchCount += 1;
      return {};
    },
  });

  await harness.mutations.submitLiveSlotCandidateRfidUpdate(
    "spool-candidate",
    "printer-1",
    "slot-1",
    "RFID-1",
    "2026-04-17T18:45:56Z",
  );

  assert.equal(fetchCount, 0);
  assert.equal(harness.state.statusTone, "error");
  assert.equal(harness.state.statusMessage, "This roll already has an RFID saved.");
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("submitLiveSlotCandidateRfidUpdate rejects stale or inactive candidates", async () => {
  for (const row of [
    null,
    {
      spool: {
        id: "spool-candidate",
        rfid_tag: null,
        status: "BORROWED",
      },
      master: {
        vendor: "Bambu Lab",
      },
    },
    {
      spool: {
        id: "spool-candidate",
        rfid_tag: null,
        status: "IN_STOCK",
      },
      master: {
        vendor: "eSUN",
      },
    },
  ]) {
    let fetchCount = 0;
    const harness = createMutationHarness({
      state: {
        spools: row ? [row] : [],
        printers: [
          {
            printer: {
              id: "printer-1",
            },
            slots: [
              {
                slot_id: "slot-1",
                spool_id: null,
                live_match_status: "unknown_rfid",
                live_tray_uuid: "RFID-1",
              },
            ],
          },
        ],
      },
      fetchJson: async () => {
        fetchCount += 1;
        return {};
      },
    });

    await harness.mutations.submitLiveSlotCandidateRfidUpdate(
      "spool-candidate",
      "printer-1",
      "slot-1",
      "RFID-1",
      "2026-04-17T18:45:56Z",
    );

    assert.equal(fetchCount, 0);
    assert.equal(harness.state.statusTone, "error");
    assert.match(harness.state.statusMessage, /live slot identity changed/);
    assert.deepEqual(harness.renderCalls, ["render"]);
  }
});

test("submitLiveSlotCandidateRfidUpdate rejects unloaded live slots", async () => {
  let fetchCount = 0;
  const harness = createMutationHarness({
    state: {
      spools: [
        {
          spool: {
            id: "spool-candidate",
            rfid_tag: null,
          },
          master: {
            vendor: "Bambu Lab",
          },
        },
      ],
      printers: [
        {
          printer: {
            id: "printer-1",
          },
          slots: [
            {
              slot_id: "slot-1",
              spool_id: null,
              live_loaded: false,
              live_match_status: "unknown_rfid",
              live_tray_uuid: "RFID-1",
            },
          ],
        },
      ],
    },
    fetchJson: async () => {
      fetchCount += 1;
      return {};
    },
  });

  await harness.mutations.submitLiveSlotCandidateRfidUpdate(
    "spool-candidate",
    "printer-1",
    "slot-1",
    "RFID-1",
    "2026-04-17T18:45:56Z",
  );

  assert.equal(fetchCount, 0);
  assert.equal(harness.state.statusTone, "error");
  assert.match(harness.state.statusMessage, /live slot identity changed/);
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("submitManualSpoolRegistration routes borrowed-in spools through the inbound create path", async () => {
  const harness = createMutationHarness({
    state: {
      showBorrowedInForm: true,
      borrowedInDraft: {
        ...createBorrowedInDraft(),
        ownerName: "Before",
      },
    },
    fetchJson: async (path) => {
      assert.equal(path, "/api/v1/spools/borrowed-in");
      return { spool_id: "borrowed-1" };
    },
  });

  await harness.mutations.submitManualSpoolRegistration({
    source: "manual",
    ownershipType: "BORROWED_IN",
    ownerName: "Alex",
    ownerContact: "alex@example.com",
    material: "PLA",
    filamentName: "Loaner",
    colorName: "Orange",
    vendor: "Generic",
    hexColor: "#F97316",
    initialWeight: "640",
    location: "Shelf B",
    note: "Borrowed for testing",
  });

  assert.equal(harness.refreshCount, 1);
  assert.equal(harness.state.activeRootFlow, "storage");
  assert.equal(harness.state.selectedSpoolId, "borrowed-1");
  assert.equal(harness.state.detailOpen, true);
  assert.equal(harness.state.showBorrowedInForm, false);
  assert.equal(harness.state.borrowedInDraft.ownerName, "");
  assert.deepEqual(harness.setDetailReturnContextCalls, ["storage"]);
  assert.deepEqual(harness.detailFeedbackCalls, [
    { spoolId: "borrowed-1", message: "Borrowed-in spool registered just now." },
  ]);
});

test("submitManualSpoolRegistration routes owned stock through the owned create path", async () => {
  const harness = createMutationHarness({
    state: {
      catalogMasters: [
        {
          id: "master-1",
          material: "PLA",
          filament_name: "Basic",
          color_name: "Red",
          vendor: "Bambu",
          default_weight: 1000,
        },
      ],
    },
    fetchJson: async (path, init) => {
      assert.equal(path, "/api/v1/spools/owned");
      const payload = JSON.parse(String(init?.body || "{}"));
      assert.equal(payload.master_id, "master-1");
      assert.equal(payload.initial_weight_g, 1000);
      return { spool_id: "owned-2" };
    },
  });

  await harness.mutations.submitManualSpoolRegistration({
    source: "bambu",
    masterId: "master-1",
    ownershipType: "OWNED",
    ownerName: "Nora",
    ownerContact: "nora@example.com",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Red",
    vendor: "Bambu",
    hexColor: "",
    initialWeight: "1000",
    qrCode: "QR-22",
    location: "Shelf A",
    note: "Desk loaner",
  });

  assert.equal(harness.state.selectedSpoolId, "owned-2");
  assert.equal(harness.state.statusTone, "success");
  assert.equal(harness.state.statusMessage, "Spool added to inventory.");
  assert.deepEqual(harness.detailFeedbackCalls, [
    { spoolId: "owned-2", message: "Spool added to inventory just now." },
  ]);
});

test("submitManualSpoolRegistration routes borrowed-in catalog stock through the inbound create path", async () => {
  const harness = createMutationHarness({
    state: {
      catalogMasters: [
        {
          id: "master-borrowed-1",
          material: "PLA",
          filament_name: "Matte",
          color_name: "Ivory",
          vendor: "Bambu Lab",
          default_weight: 1000,
        },
      ],
    },
    fetchJson: async (path, init) => {
      assert.equal(path, "/api/v1/spools/borrowed-in");
      const payload = JSON.parse(String(init?.body || "{}"));
      assert.deepEqual(payload, {
        master_id: "master-borrowed-1",
        initial_weight_g: 1000,
        location: "Drybox 2",
        owner_name: "Mina",
        owner_contact: "mina@example.com",
        ownership_note: "AMS test loan",
      });
      return { spool_id: "borrowed-catalog-2" };
    },
  });

  await harness.mutations.submitManualSpoolRegistration({
    source: "bambu",
    masterId: "master-borrowed-1",
    ownershipType: "BORROWED_IN",
    ownerName: "Mina",
    ownerContact: "mina@example.com",
    initialWeight: "",
    location: "Drybox 2",
    note: "AMS test loan",
  });

  assert.equal(harness.state.selectedSpoolId, "borrowed-catalog-2");
  assert.equal(harness.state.statusTone, "success");
  assert.equal(harness.state.statusMessage, "Borrowed-in spool registered.");
  assert.deepEqual(harness.detailFeedbackCalls, [
    {
      spoolId: "borrowed-catalog-2",
      message: "Borrowed-in spool registered just now.",
    },
  ]);
});

test("submitManualSpoolRegistration requires an explicit catalog master before adding catalog stock", async () => {
  let fetchCount = 0;
  const harness = createMutationHarness({
    state: {
      catalogMasters: [
        {
          id: "master-1",
          material: "PLA",
          filament_name: "Basic",
          color_name: "Red",
          vendor: "Bambu",
          default_weight: 1000,
        },
      ],
    },
    fetchJson: async () => {
      fetchCount += 1;
      return { spool_id: "unexpected" };
    },
  });

  await harness.mutations.submitManualSpoolRegistration({
    source: "bambu",
    masterId: "",
    ownershipType: "OWNED",
    initialWeight: "1000",
  });

  assert.equal(fetchCount, 0);
  assert.equal(harness.state.statusTone, "error");
  assert.equal(harness.state.statusMessage, "Choose a catalog filament before adding stock.");
  assert.deepEqual(harness.busyCalls, []);
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("submitManualSpoolRegistration rejects stale catalog master selections from another source", async () => {
  let fetchCount = 0;
  const harness = createMutationHarness({
    state: {
      catalogMasters: [
        {
          id: "esun-1",
          material: "PLA",
          filament_name: "PLA+",
          color_name: "Blue",
          vendor: "eSUN",
          default_weight: 1000,
        },
        {
          id: "bambu-1",
          material: "PLA",
          filament_name: "Basic",
          color_name: "Red",
          vendor: "Bambu Lab",
          default_weight: 1000,
        },
      ],
    },
    fetchJson: async () => {
      fetchCount += 1;
      return { spool_id: "unexpected" };
    },
  });

  await harness.mutations.submitManualSpoolRegistration({
    source: "bambu",
    masterId: "esun-1",
    ownershipType: "BORROWED_IN",
    ownerName: "Mina",
    initialWeight: "1000",
  });

  assert.equal(fetchCount, 0);
  assert.equal(harness.state.statusTone, "error");
  assert.equal(harness.state.statusMessage, "Choose a catalog filament before adding stock.");
  assert.deepEqual(harness.busyCalls, []);
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("submitWishlistStock receives the selected quantity through one atomic endpoint", async () => {
  const fetchCalls = [];
  const harness = createMutationHarness({
    state: {
      catalogMasters: [
        {
          id: "master-1",
          material: "PLA",
          filament_name: "Basic",
          color_name: "Blue",
          vendor: "Bambu",
          default_weight: 1000,
        },
      ],
      wishlistItems: [
        {
          id: "wish-1",
          master_id: "master-1",
          material: "PLA",
          filament_name: "Basic",
          color_name: "Blue",
          vendor: "Bambu",
          status: "WISHLIST",
          quantity: 3,
        },
      ],
    },
    fetchJson: async (path, init) => {
      fetchCalls.push([path, JSON.parse(String(init?.body || "{}"))]);
      return {
        spool_ids: ["spool-88", "spool-89"],
        received_quantity: 2,
        remaining_quantity: 1,
        status: "WISHLIST",
      };
    },
  });

  await harness.mutations.submitWishlistStock("wish-1", "2");

  assert.deepEqual(fetchCalls, [
    ["/api/v1/wishlist/wish-1/receive", { quantity: 2 }],
  ]);
  assert.equal(harness.state.selectedSpoolId, "spool-88");
  assert.equal(harness.state.detailOpen, true);
  assert.equal(harness.state.statusMessage, "Wishlist spool added to inventory.");
});

test("submitWishlistStock rejects quantities above the remaining wishlist count", async () => {
  let fetchCount = 0;
  const harness = createMutationHarness({
    state: {
      wishlistItems: [
        {
          id: "wish-1",
          status: "ON_ORDER",
          quantity: 2,
        },
      ],
    },
    fetchJson: async () => {
      fetchCount += 1;
      return {};
    },
  });

  await harness.mutations.submitWishlistStock("wish-1", "3");

  assert.equal(fetchCount, 0);
  assert.equal(harness.state.statusTone, "error");
  assert.deepEqual(harness.renderCalls, ["render"]);
});

test("submitWishlistDelete removes an item through the host wishlist route", async () => {
  const fetchCalls = [];
  const harness = createMutationHarness({
    fetchJson: async (path, init) => {
      fetchCalls.push([path, JSON.parse(String(init?.body || "{}"))]);
      return { ok: true };
    },
  });

  await harness.mutations.submitWishlistDelete("wish-9");

  assert.deepEqual(fetchCalls, [["/api/v1/wishlist/wish-9/delete", {}]]);
  assert.equal(harness.refreshCount, 1);
  assert.deepEqual(harness.busyCalls, [true, false]);
  assert.equal(harness.state.statusTone, "success");
  assert.equal(harness.state.statusMessage, "Wishlist item removed.");
});

test("status messages follow selected locale for validation errors", async () => {
  const harness = createMutationHarness({
    state: {
      locale: "nb",
    },
  });

  await harness.mutations.submitWeightUpdate("spool-1", "-4");

  assert.equal(harness.state.statusTone, "error");
  assert.equal(harness.state.statusMessage, "Skriv inn en gyldig ikke-negativ vekt i gram.");
});
