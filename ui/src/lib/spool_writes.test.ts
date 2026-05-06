import assert from "node:assert/strict";
import test from "node:test";

import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
  deleteInventorySpool,
  purgeInventorySpool,
  updateInventorySpoolDetails,
  updateInventorySpoolStatus,
} from "./spool_writes";
import type {
  CreateManualSpoolInput,
  CreateSpoolInput,
  UpdateSpoolDetailsInput,
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

test("updateInventorySpoolDetails routes detail writes to the host", async () => {
  const calls: Array<{ baseUrl: string; status: string; homeLocation?: string | null }> = [];

  await updateInventorySpoolDetails(
    spoolDetailsInput({ home_location: "Shelf 1" }),
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      updateHostSpoolDetails: async (baseUrl, _libraryId, input) => {
        calls.push({
          baseUrl,
          status: input.status,
          homeLocation: input.home_location,
        });
      },
    },
  );

  assert.deepEqual(calls, [
    { baseUrl: "http://host", status: "IN_STOCK", homeLocation: "Shelf 1" },
  ]);
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
