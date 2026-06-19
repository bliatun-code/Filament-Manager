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
  assert.doesNotMatch(html, /Scan QR/);
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

test("add filament task sheet shows Bambu filament code help before and after lookup", () => {
  const state = createInitialCompanionState();
  state.catalogMasters = [
    {
      id: "master-code",
      material: "TPU",
      filament_name: "TPU for AMS",
      color_name: "Yellow (53400)",
      hex_color: "#FACC15",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];

  const helpHtml = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));
  assert.match(helpHtml, /Filament Code/);
  assert.match(helpHtml, /53400/);
  assert.match(helpHtml, /Find this field on the box label/);
  assert.match(helpHtml, /add-spool-code-box-label/);
  assert.match(helpHtml, /Type the code into the search field/);
  assert.doesNotMatch(helpHtml, /camera/i);
  assert.doesNotMatch(helpHtml, /webcam/i);

  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    catalogSearch: "53400",
  };
  const lookupHtml = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));
  assert.match(lookupHtml, /One active Bambu catalog entry matched and is selected/);
  assert.match(lookupHtml, /TPU for AMS/);
});

test("add filament task sheet selects the active Bambu code match when discontinued history exists", () => {
  const state = createInitialCompanionState();
  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    catalogSearch: "53400",
  };
  state.catalogMasters = [
    {
      id: "old-yellow",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Old Yellow (53400)",
      hex_color: "#D97706",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: true,
      discontinued_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "active-yellow",
      material: "TPU",
      filament_name: "TPU for AMS",
      color_name: "Yellow (53400)",
      hex_color: "#FACC15",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];

  const html = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(html, /One active Bambu catalog entry matched and is selected/);
  assert.match(html, /name="filament-master-id" value="active-yellow"/);
  assert.match(html, /TPU for AMS/);
  assert.doesNotMatch(html, /old-yellow/);
  assert.doesNotMatch(html, /Old Yellow/);
});

test("add filament task sheet keeps Bambu filament code lookup scoped to Bambu source", () => {
  const state = createInitialCompanionState();
  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    source: "esun",
    catalogSearch: "53400",
  };
  state.catalogMasters = [
    {
      id: "master-bambu-code",
      material: "TPU",
      filament_name: "TPU for AMS",
      color_name: "Yellow (53400)",
      hex_color: "#FACC15",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
    {
      id: "master-esun",
      material: "PLA",
      filament_name: "PLA+",
      color_name: "Yellow",
      hex_color: "#FBBF24",
      product_url: null,
      default_weight: 1000,
      vendor: "eSUN",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];

  const html = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.doesNotMatch(html, /add-spool-code-lookup/);
  assert.doesNotMatch(html, /Find this field on the box label/);
  assert.doesNotMatch(html, /One active Bambu catalog entry matched/);
  assert.doesNotMatch(html, /name="filament-master-id" value="master-bambu-code"/);
  assert.match(html, /No catalog entries match this vendor filter/);
});

test("add filament task sheet requires explicit row selection for ambiguous Bambu codes", () => {
  const state = createInitialCompanionState();
  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    catalogSearch: "65103",
  };
  state.catalogMasters = [
    {
      id: "petg-black",
      material: "PETG",
      filament_name: "PETG HF",
      color_name: "Black (65103)",
      hex_color: "#111111",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
    {
      id: "pla-black",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Black (65103)",
      hex_color: "#000000",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];

  const reviewHtml = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(reviewHtml, /This code is used by several active Bambu catalog entries/);
  assert.match(reviewHtml, /data-master-id="petg-black"/);
  assert.match(reviewHtml, /data-master-id="pla-black"/);
  assert.match(reviewHtml, /name="filament-master-id" value=""/);
  assert.match(reviewHtml, /Choose a catalog row/);
  assert.match(
    reviewHtml,
    /<button class="primary-button" type="submit" disabled>\s*Add spool to inventory/,
  );

  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    selectedMasterId: "pla-black",
  };
  const selectedHtml = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(selectedHtml, /name="filament-master-id" value="pla-black"/);
  assert.doesNotMatch(selectedHtml, /Choose a catalog row/);
  assert.doesNotMatch(
    selectedHtml,
    /<button class="primary-button" type="submit" disabled>\s*Add spool to inventory/,
  );
});

test("add filament task sheet surfaces discontinued-only Bambu code matches under active filter", () => {
  const state = createInitialCompanionState();
  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    catalogSearch: "12345",
    catalogStatusFilter: "ACTIVE",
  };
  state.catalogMasters = [
    {
      id: "master-old",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Old Red (12345)",
      hex_color: "#B91C1C",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: true,
      discontinued_at: "2024-01-01T00:00:00Z",
    },
  ];

  const html = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(html, /Only discontinued Bambu catalog entries use this code/);
  assert.match(html, /Old Red \(12345\)/);
  assert.match(html, /Discontinued/);
  assert.match(html, /name="filament-master-id" value=""/);
  assert.match(html, /Choose a catalog row/);

  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    selectedMasterId: "master-old",
  };
  const selectedHtml = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(selectedHtml, /Only discontinued Bambu catalog entries use this code/);
  assert.match(selectedHtml, /name="filament-master-id" value="master-old"/);
  assert.doesNotMatch(selectedHtml, /Choose a catalog row/);
  assert.doesNotMatch(
    selectedHtml,
    /<button class="primary-button" type="submit" disabled>\s*Add spool to inventory/,
  );
});

test("add filament task sheet blocks Bambu filament codes with no catalog match", () => {
  const state = createInitialCompanionState();
  state.borrowedInDraft = {
    ...state.borrowedInDraft,
    catalogSearch: "99999",
  };
  state.catalogMasters = [
    {
      id: "master-code",
      material: "TPU",
      filament_name: "TPU for AMS",
      color_name: "Yellow (53400)",
      hex_color: "#FACC15",
      product_url: null,
      default_weight: 1000,
      vendor: "Bambu",
      is_discontinued: false,
      discontinued_at: null,
    },
  ];

  const html = renderAddFilamentTaskSheetBody(state, false, (value) => String(value ?? ""));

  assert.match(html, /No Bambu catalog entry uses this filament code yet/);
  assert.match(html, /name="filament-master-id" value=""/);
  assert.match(html, /No catalog entries match this vendor filter/);
  assert.match(html, /Choose a catalog row/);
  assert.match(
    html,
    /<button class="primary-button" type="submit" disabled>\s*Add spool to inventory/,
  );
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
