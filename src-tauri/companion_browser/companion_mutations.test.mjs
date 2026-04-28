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

test("submitWishlistStock creates owned stock and marks the wishlist item received", async () => {
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
          quantity: 1,
        },
      ],
    },
    fetchJson: async (path, init) => {
      fetchCalls.push([path, JSON.parse(String(init?.body || "{}"))]);
      if (path === "/api/v1/spools/owned") {
        return { spool_id: "spool-88" };
      }
      return { ok: true };
    },
  });

  await harness.mutations.submitWishlistStock("wish-1");

  assert.deepEqual(fetchCalls, [
    ["/api/v1/spools/owned", { master_id: "master-1", initial_weight_g: 1000 }],
    ["/api/v1/wishlist/wish-1/status", { status: "RECEIVED" }],
  ]);
  assert.equal(harness.state.selectedSpoolId, "spool-88");
  assert.equal(harness.state.detailOpen, true);
  assert.equal(harness.state.statusMessage, "Wishlist spool added to inventory.");
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
