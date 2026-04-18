import test from "node:test";
import assert from "node:assert/strict";

import { createInitialCompanionState } from "./session_state.js";
import { renderAddFilamentTaskSheetBody, renderStorageShell } from "./storage_shell.js";

function createSpoolRow(id, overrides = {}) {
  return {
    spool: {
      id,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      owner_name: "",
      qr_code: "",
      location_id: "Shelf A",
      remaining_g: 850,
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

function renderShell(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    ...overrides.state,
  };
  state.borrowedInDraft = overrides.state?.borrowedInDraft ?? createInitialCompanionState().borrowedInDraft;
  state.catalogMasters = overrides.state?.catalogMasters ?? [];
  state.wishlistItems = overrides.state?.wishlistItems ?? [];

  return renderStorageShell({
    state,
    spools: overrides.spools ?? [createSpoolRow("spool-1")],
    selectedSpool: overrides.selectedSpool ?? createSpoolRow("spool-1"),
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
    formatPlacementLabel: (value) => value || "Unplaced",
    ownershipLabel: (spool) => (spool.ownership_type === "BORROWED_IN" ? "Borrowed in" : "Owned"),
  });
}

test("storage shell keeps search and primary actions close to the spool list", () => {
  const html = renderShell({
    state: {
      search: "pla",
    },
  });

  assert.match(html, /Storage/);
  assert.match(html, /Add spool/);
  assert.match(html, /Scan QR/);
  assert.match(html, /data-action="select-spool"/);
  assert.doesNotMatch(html, /Selected spool/);
  assert.match(html, /Browse local stock and open the spool you need\./);
});

test("storage shell shows the selected hidden banner when a search hides the active spool", () => {
  const html = renderShell({
    state: {
      search: "PETG",
      loanHistory: [{ loan: { spool_id: "spool-1" } }],
    },
    spools: [createSpoolRow("spool-2", { master: { material: "PETG" } })],
    selectedSpool: createSpoolRow("spool-1"),
  });

  assert.match(html, /Selected spool hidden/);
  assert.match(html, /850 g/);
  assert.match(html, /Shelf A/);
  assert.match(html, /data-root-flow="loans"/);
  assert.match(html, /data-action="open-current-detail"/);
  assert.match(html, /Detail/);
});

test("storage shell collapses to an empty state when no visible spools match", () => {
  const html = renderShell({
    spools: [],
    selectedSpool: null,
  });

  assert.match(html, /No local spools matched the current search/);
});

test("add filament task sheet exposes stock and wishlist flows from the same selection", () => {
  const state = createInitialCompanionState();
  state.catalogMasters = [
    {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Blue",
      hex_color: "#2563EB",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];
  state.wishlistItems = [
    {
      id: "wish-1",
      master_id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Blue",
      vendor: "Bambu",
      status: "WISHLIST",
      quantity: 2,
      note: "Restock",
      created_at: "",
      updated_at: "",
    },
  ];
  const html = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(html, /data-action="set-filament-source"/);
  assert.match(html, /data-action="select-master"/);
  assert.match(html, /data-action="set-filament-ownership"/);
  assert.match(html, /data-action="wishlist-update-status"/);
  assert.match(html, /data-action="wishlist-stock-now"/);
  assert.match(html, /data-action="add-spool-form"/);
  assert.match(html, /data-action="wishlist-item-form"/);
  assert.match(html, /Add spool to inventory/);
  assert.match(html, /Home location \(optional\)/);
  assert.match(html, /Add current selection to wishlist/);
});

test("add filament task sheet localizes key copy in norwegian", () => {
  const state = createInitialCompanionState();
  state.locale = "nb";
  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    source: "manual",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Blå",
  };
  state.catalogMasters = [
    {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Blå",
      hex_color: "#2563EB",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];
  const html = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(html, /data-action="set-filament-source"/);
  assert.match(html, /Materiale/);
  assert.match(html, /Filamentnavn/);
  assert.match(html, /Legg spole i lager/);
  assert.match(html, /Hjemmeplassering \(valgfritt\)/);
  assert.match(html, /Ønskeliste \/ bestillingskø/);
});
