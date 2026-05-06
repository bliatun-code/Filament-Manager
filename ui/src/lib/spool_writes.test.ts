import assert from "node:assert/strict";
import test from "node:test";

import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
} from "./spool_writes";
import type { CreateManualSpoolInput, CreateSpoolInput } from "./tauri_client";

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
