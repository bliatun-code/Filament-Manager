import assert from "node:assert/strict";
import test from "node:test";

import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
  deleteInventorySpool,
  purgeInventorySpool,
  updateInventorySpoolDetails,
  updateInventorySpoolOwnership,
  updateInventorySpoolRfidTag,
  updateInventorySpoolStatus,
  updateInventorySpoolTareWeight,
  updateInventorySpoolWeight,
} from "./spool_writes";
import type {
  CreateManualSpoolInput,
  CreateSpoolInput,
  UpdateSpoolDetailsInput,
  UpdateSpoolOwnershipInput,
  UpdateSpoolRfidTagInput,
} from "./tauri_client";

function masterSpoolInput(overrides: Partial<CreateSpoolInput> = {}): CreateSpoolInput {
  return {
    id: "spool-1",
    master_id: "master-1",
    qr_code: null,
    status: "IN_STOCK",
    initial_weight_g: 1000,
    current_weight_g: 1000,
    location_id: null,
    purchase_date: null,
    purchase_price: null,
    batch_code: null,
    ...overrides,
  };
}

function manualSpoolInput(
  overrides: Partial<CreateManualSpoolInput> = {},
): CreateManualSpoolInput {
  return {
    id: "spool-manual",
    vendor: "Generic",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    hex_color: null,
    product_url: null,
    default_weight_g: 1000,
    qr_code: null,
    status: "IN_STOCK",
    initial_weight_g: 1000,
    location: null,
    ...overrides,
  };
}

test("createInventorySpoolFromMaster routes client writes to the host and returns host id", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string; input: CreateSpoolInput }> = [];

  const createdId = await createInventorySpoolFromMaster(
    masterSpoolInput(),
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      createHostSpool: async (baseUrl, libraryId, input) => {
        calls.push({ baseUrl, libraryId, input });
        return "host-spool-1";
      },
    },
  );

  assert.equal(createdId, "host-spool-1");
  assert.equal(calls[0]?.baseUrl, "http://host");
  assert.equal(calls[0]?.libraryId, "library-1");
  assert.equal(calls[0]?.input.master_id, "master-1");
});

test("createInventorySpoolFromMaster writes locally and returns the local id", async () => {
  const calls: CreateSpoolInput[] = [];
  const input = masterSpoolInput({ id: "local-spool" });

  const createdId = await createInventorySpoolFromMaster(
    input,
    { clientReadOnly: false },
    {
      createLocalSpool: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.equal(createdId, "local-spool");
  assert.deepEqual(calls, [input]);
});

test("createManualInventorySpool routes manual client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; input: CreateManualSpoolInput }> = [];

  const createdId = await createManualInventorySpool(
    manualSpoolInput(),
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      createHostSpool: async (baseUrl, _libraryId, input) => {
        calls.push({ baseUrl, input });
        return "host-manual-spool";
      },
    },
  );

  assert.equal(createdId, "host-manual-spool");
  assert.equal(calls[0]?.baseUrl, "http://host");
  assert.equal(calls[0]?.input.filament_name, "Basic");
});

test("createManualInventorySpool writes manual spools locally and returns the local id", async () => {
  const calls: CreateManualSpoolInput[] = [];
  const input = manualSpoolInput({ id: "manual-local" });

  const createdId = await createManualInventorySpool(
    input,
    { clientReadOnly: false },
    {
      createLocalManualSpool: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.equal(createdId, "manual-local");
  assert.deepEqual(calls, [input]);
});

test("spool create host writes reject missing host details", async () => {
  await assert.rejects(
    () => createInventorySpoolFromMaster(masterSpoolInput(), { clientReadOnly: true }),
    /Host connection details/,
  );
});

function spoolDetailsInput(
  overrides: Partial<UpdateSpoolDetailsInput> = {},
): UpdateSpoolDetailsInput {
  return {
    spool_id: "spool-1",
    qr_code: null,
    status: "IN_STOCK",
    location: null,
    home_location: null,
    ...overrides,
  };
}

test("updateInventorySpoolDetails delegates target selection to the active-library gateway", async () => {
  const calls: Array<{ status: string; homeLocation?: string | null }> = [];

  await updateInventorySpoolDetails(
    spoolDetailsInput({ home_location: "Shelf 1" }),
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateActiveLibrarySpoolDetails: async (input) => {
        calls.push({
          status: input.status,
          homeLocation: input.home_location,
        });
      },
    },
  );

  assert.deepEqual(calls, [
    { status: "IN_STOCK", homeLocation: "Shelf 1" },
  ]);
});

test("updateInventorySpoolDetails keeps one public atomic payload in every saved UI mode", async () => {
  const input = spoolDetailsInput({
    home_location: "",
    spool_tare_weight_g: 241,
    ownership: {
      ownership_type: "BORROWED_IN",
      owner_name: "Nora",
      owner_contact: "nora@example.com",
      ownership_note: "Return next week",
    },
    purchase_metadata: {
      purchase_price: null,
      purchase_currency: null,
      purchase_date: null,
      batch_code: null,
      supplier_reference: null,
    },
    purchase_price_batch_locked: true,
  });
  const gatewayCalls: UpdateSpoolDetailsInput[] = [];
  const updateThroughGateway = async (gatewayInput: UpdateSpoolDetailsInput) => {
    gatewayCalls.push(gatewayInput);
  };

  await updateInventorySpoolDetails(
    input,
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateActiveLibrarySpoolDetails: updateThroughGateway,
    },
  );
  await updateInventorySpoolDetails(input, { clientReadOnly: false }, {
    updateActiveLibrarySpoolDetails: updateThroughGateway,
  });

  assert.deepEqual(gatewayCalls, [input, input]);
});

test("updateInventorySpoolStatus uses the narrow local status command outside client mode", async () => {
  const calls: Array<{ spoolId: string; status: string }> = [];

  await updateInventorySpoolStatus(
    spoolDetailsInput({ status: "LOST" }),
    { clientReadOnly: false },
    {
      updateLocalSpoolStatus: async (spoolId, status) => {
        calls.push({ spoolId, status });
      },
    },
  );

  assert.deepEqual(calls, [{ spoolId: "spool-1", status: "LOST" }]);
});

function spoolOwnershipInput(
  overrides: Partial<UpdateSpoolOwnershipInput> = {},
): UpdateSpoolOwnershipInput {
  return {
    spool_id: "spool-1",
    ownership_type: "BORROWED_IN",
    owner_name: "Nora",
    owner_contact: "nora@example.com",
    ownership_note: "Prototype batch",
    ...overrides,
  };
}

test("updateInventorySpoolOwnership routes client writes to the host", async () => {
  const calls: Array<{ baseUrl: string; ownershipType: string; ownerName?: string | null }> = [];

  await updateInventorySpoolOwnership(
    spoolOwnershipInput(),
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateHostSpoolOwnership: async (baseUrl, _libraryId, input) => {
        calls.push({
          baseUrl,
          ownershipType: input.ownership_type,
          ownerName: input.owner_name,
        });
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", ownershipType: "BORROWED_IN", ownerName: "Nora" },
  ]);
});

test("updateInventorySpoolOwnership writes locally outside client mode", async () => {
  const calls: UpdateSpoolOwnershipInput[] = [];
  const input = spoolOwnershipInput({ ownership_type: "OWNED", owner_name: null });

  await updateInventorySpoolOwnership(
    input,
    { clientReadOnly: false },
    {
      updateLocalSpoolOwnership: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});

test("deleteInventorySpool and purgeInventorySpool route destructive writes to the host", async () => {
  const deletes: Array<{ baseUrl: string; reason?: string | null }> = [];
  const purges: Array<{ baseUrl: string; reason?: string | null }> = [];
  const target = {
    clientReadOnly: true,
    clientHostBaseUrl: "http://host",
    clientLibraryId: "library-1",
  };

  await deleteInventorySpool(
    { spool_id: "spool-1", reason: "manual removal" },
    target,
    {
      deleteHostSpool: async (baseUrl, _libraryId, input) => {
        deletes.push({ baseUrl, reason: input?.reason });
      },
    },
  );
  await purgeInventorySpool(
    { spool_id: "spool-1", reason: "manual purge" },
    target,
    {
      purgeHostSpool: async (baseUrl, _libraryId, input) => {
        purges.push({ baseUrl, reason: input?.reason });
      },
    },
  );

  assert.deepEqual(deletes, [{ baseUrl: "http://host", reason: "manual removal" }]);
  assert.deepEqual(purges, [{ baseUrl: "http://host", reason: "manual purge" }]);
});

test("updateInventorySpoolWeight routes weight writes to host and local targets", async () => {
  const hostCalls: Array<{ baseUrl: string; spoolId: string; grams: number }> = [];
  const localCalls: Array<{ spoolId: string; grams: number }> = [];

  await updateInventorySpoolWeight(
    "spool-1",
    700,
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateHostSpoolWeight: async (baseUrl, _libraryId, spoolId, grams) => {
        hostCalls.push({ baseUrl, spoolId, grams });
      },
    },
  );
  await updateInventorySpoolWeight(
    "spool-2",
    650,
    { clientReadOnly: false },
    {
      updateLocalSpoolWeight: async (spoolId, grams) => {
        localCalls.push({ spoolId, grams });
      },
    },
  );

  assert.deepEqual(hostCalls, [{ baseUrl: "http://host", spoolId: "spool-1", grams: 700 }]);
  assert.deepEqual(localCalls, [{ spoolId: "spool-2", grams: 650 }]);
});

test("updateInventorySpoolTareWeight routes empty spool weight writes", async () => {
  const calls: Array<{ spoolId: string; grams: number }> = [];

  await updateInventorySpoolTareWeight(
    "spool-1",
    180,
    { clientReadOnly: false },
    {
      updateLocalSpoolTareWeight: async (spoolId, grams) => {
        calls.push({ spoolId, grams });
      },
    },
  );

  assert.deepEqual(calls, [{ spoolId: "spool-1", grams: 180 }]);
});

test("updateInventorySpoolRfidTag routes RFID writes to the host", async () => {
  const input: UpdateSpoolRfidTagInput = {
    spool_id: "spool-1",
    rfid_tag: "rfid-1",
    rfid_observed_at: "2026-04-01 10:00:00",
  };
  const calls: Array<{
    baseUrl: string;
    libraryId: string;
    input: UpdateSpoolRfidTagInput;
  }> = [];

  await updateInventorySpoolRfidTag(
    input,
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateHostSpoolRfidTag: async (baseUrl, libraryId, hostInput) => {
        calls.push({ baseUrl, libraryId, input: hostInput });
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", input }]);
});

test("updateInventorySpoolRfidTag writes locally outside client mode", async () => {
  const input: UpdateSpoolRfidTagInput = {
    spool_id: "spool-1",
    rfid_tag: "rfid-1",
    rfid_observed_at: "2026-04-01 10:00:00",
  };
  const calls: UpdateSpoolRfidTagInput[] = [];

  await updateInventorySpoolRfidTag(
    input,
    { clientReadOnly: false },
    {
      updateLocalSpoolRfidTag: async (localInput) => {
        calls.push(localInput);
      },
    },
  );

  assert.deepEqual(calls, [input]);
});
