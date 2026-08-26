import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibrarySyncHostInventoryBulkMutationPayload,
  buildLibrarySyncHostSpoolCreatePayload,
  buildLibrarySyncHostSpoolDetailsPayload,
  type CreateManualSpoolInput,
  type CreateSpoolInput,
} from "./tauri_inventory_client";

test("host detail payload distinguishes omitted purchase metadata from clearing", () => {
  const baseInput = {
    spool_id: "spool-1",
    qr_code: null,
    status: "IN_STOCK",
  };

  const omitted = buildLibrarySyncHostSpoolDetailsPayload(
    "http://host.local:4278",
    "library-1",
    baseInput,
  );
  assert.equal(Object.hasOwn(omitted, "purchase_metadata"), false);

  const clearing = {
    purchase_price: null,
    purchase_currency: null,
    purchase_date: null,
    batch_code: null,
    supplier_reference: null,
  };
  assert.deepEqual(
    buildLibrarySyncHostSpoolDetailsPayload(
      "http://host.local:4278",
      "library-1",
      { ...baseInput, purchase_metadata: clearing },
    ).purchase_metadata,
    clearing,
  );
});

test("bulk host payload preserves one tagged atomic mutation request", () => {
  const command = {
    action: "STATUS" as const,
    expected_affected_count: 1,
    spools: [
      {
        expected_active_loan: false,
        expected_assigned_to_printer: false,
        expected_home_location_id: "location-a",
        expected_location_id: "location-a",
        expected_status: "IN_STOCK" as const,
        spool_id: "spool-a",
      },
    ],
    target_status: "EMPTY" as const,
  };

  assert.deepEqual(
    buildLibrarySyncHostInventoryBulkMutationPayload(
      "http://host.local:4278",
      "library-1",
      command,
    ),
    {
      input: {
        base_url: "http://host.local:4278",
        expected_library_id: "library-1",
        mutation: command,
      },
    },
  );
});

test("buildLibrarySyncHostSpoolCreatePayload forwards catalog ownership to host create", () => {
  const input: CreateSpoolInput = {
    id: "spool-1",
    master_id: "master-1",
    qr_code: null,
    status: "IN_STOCK",
    ownership_type: "BORROWED_IN",
    owner_name: "Nora",
    owner_contact: "nora@example.com",
    ownership_note: "Return after AMS tests",
    initial_weight_g: 900,
    current_weight_g: 900,
    location_id: "Drybox 2",
    purchase_date: null,
    purchase_price: null,
    batch_code: null,
  };

  assert.deepEqual(
    buildLibrarySyncHostSpoolCreatePayload("http://host", "library-1", input),
    {
      input: {
        base_url: "http://host",
        expected_library_id: "library-1",
        master_id: "master-1",
        material: null,
        filament_name: null,
        color_name: null,
        vendor: null,
        initial_weight_g: 900,
        location: "Drybox 2",
        hex_color: null,
        ownership_type: "BORROWED_IN",
        owner_name: "Nora",
        owner_contact: "nora@example.com",
        ownership_note: "Return after AMS tests",
      },
    },
  );
});

test("buildLibrarySyncHostSpoolCreatePayload forwards manual ownership to host create", () => {
  const input: CreateManualSpoolInput = {
    id: "manual-1",
    material: "PLA",
    filament_name: "Prototype",
    color_name: "Green",
    hex_color: "#22C55E",
    product_url: null,
    vendor: "Generic",
    default_weight_g: 1000,
    qr_code: null,
    status: "IN_STOCK",
    ownership_type: "OWNED",
    owner_name: null,
    owner_contact: null,
    ownership_note: null,
    initial_weight_g: 1000,
    location: "Shelf A",
  };

  assert.equal(
    buildLibrarySyncHostSpoolCreatePayload("http://host", null, input).input
      .ownership_type,
    "OWNED",
  );
  assert.equal(
    buildLibrarySyncHostSpoolCreatePayload("http://host", null, input).input.location,
    "Shelf A",
  );
});
