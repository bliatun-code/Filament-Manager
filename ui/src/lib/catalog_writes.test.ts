import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refreshManagedVendorCatalog,
  updateManagedMasterCatalogEntry,
  type CatalogWriteTarget,
} from "./catalog_writes";
import type { CatalogRefreshResult, UpdateMasterCatalogEntryInput } from "./tauri_client";

function catalogInput(): UpdateMasterCatalogEntryInput {
  return {
    master_id: "master_1",
    vendor: "eSUN",
    material: "PLA",
    filament_name: "PLA+",
    color_name: "Purple",
    hex_color: "#4B3290",
    product_url: null,
    default_weight: 1000,
  };
}

function catalogRefreshResult(imported = 1): CatalogRefreshResult {
  return {
    imported,
    detected_store: null,
    detected_collection: null,
    discovered_materials: null,
    reactivated_count: 0,
    discontinued_count: 0,
    reused_cached_products: null,
    detail_fetches: null,
    output: "ok",
  };
}

test("updateManagedMasterCatalogEntry routes client writes to the host", async () => {
  const hostCalls: Array<{
    baseUrl: string;
    expectedLibraryId: string | null | undefined;
    input: UpdateMasterCatalogEntryInput;
  }> = [];
  const localCalls: UpdateMasterCatalogEntryInput[] = [];
  const target: CatalogWriteTarget = {
    clientReadOnly: true,
    clientHostBaseUrl: "http://host.local",
    clientLibraryId: "library-1",
  };
  const input = catalogInput();

  await updateManagedMasterCatalogEntry(input, target, {
    updateHostMasterCatalogEntry: async (baseUrl, expectedLibraryId, writeInput) => {
      hostCalls.push({ baseUrl, expectedLibraryId, input: writeInput });
    },
    updateLocalMasterCatalogEntry: async (writeInput) => {
      localCalls.push(writeInput);
      return "local";
    },
  });

  assert.deepEqual(hostCalls, [
    {
      baseUrl: "http://host.local",
      expectedLibraryId: "library-1",
      input,
    },
  ]);
  assert.deepEqual(localCalls, []);
});

test("updateManagedMasterCatalogEntry writes locally outside client mode", async () => {
  const hostCalls: UpdateMasterCatalogEntryInput[] = [];
  const localCalls: UpdateMasterCatalogEntryInput[] = [];
  const input = catalogInput();

  await updateManagedMasterCatalogEntry(input, { clientReadOnly: false }, {
    updateHostMasterCatalogEntry: async (_baseUrl, _expectedLibraryId, writeInput) => {
      hostCalls.push(writeInput);
    },
    updateLocalMasterCatalogEntry: async (writeInput) => {
      localCalls.push(writeInput);
      return "local";
    },
  });

  assert.deepEqual(hostCalls, []);
  assert.deepEqual(localCalls, [input]);
});

test("updateManagedMasterCatalogEntry requires host details in client mode", async () => {
  await assert.rejects(
    updateManagedMasterCatalogEntry(catalogInput(), { clientReadOnly: true }, {
      updateHostMasterCatalogEntry: async () => undefined,
      updateLocalMasterCatalogEntry: async () => "local",
    }),
    /Host connection details are missing/,
  );
});

test("refreshManagedVendorCatalog routes client refreshes to the host", async () => {
  const result = catalogRefreshResult(3);
  const hostCalls: Array<{
    baseUrl: string;
    expectedLibraryId: string | null | undefined;
    vendor: string;
    materialTypes?: string[];
  }> = [];
  const localCalls: string[] = [];
  const target: CatalogWriteTarget = {
    clientReadOnly: true,
    clientHostBaseUrl: "http://host.local",
    clientLibraryId: "library-1",
  };

  const summary = await refreshManagedVendorCatalog("Bambu", ["PLA"], target, {
    refreshHostVendorCatalog: async (baseUrl, expectedLibraryId, vendor, materialTypes) => {
      hostCalls.push({ baseUrl, expectedLibraryId, vendor, materialTypes });
      return result;
    },
    refreshLocalBambuCatalog: async () => {
      localCalls.push("Bambu");
      return catalogRefreshResult();
    },
    refreshLocalEsunCatalog: async () => {
      localCalls.push("eSUN");
      return catalogRefreshResult();
    },
  });

  assert.equal(summary, result);
  assert.deepEqual(hostCalls, [
    {
      baseUrl: "http://host.local",
      expectedLibraryId: "library-1",
      vendor: "Bambu",
      materialTypes: ["PLA"],
    },
  ]);
  assert.deepEqual(localCalls, []);
});

test("refreshManagedVendorCatalog refreshes locally outside client mode", async () => {
  const result = catalogRefreshResult(2);
  const hostCalls: string[] = [];
  const localCalls: Array<{ vendor: string; materialTypes?: string[] }> = [];

  const summary = await refreshManagedVendorCatalog("eSUN", ["PETG"], { clientReadOnly: false }, {
    refreshHostVendorCatalog: async () => {
      hostCalls.push("host");
      return catalogRefreshResult();
    },
    refreshLocalBambuCatalog: async (materialTypes) => {
      localCalls.push({ vendor: "Bambu", materialTypes });
      return catalogRefreshResult();
    },
    refreshLocalEsunCatalog: async (materialTypes) => {
      localCalls.push({ vendor: "eSUN", materialTypes });
      return result;
    },
  });

  assert.equal(summary, result);
  assert.deepEqual(hostCalls, []);
  assert.deepEqual(localCalls, [{ vendor: "eSUN", materialTypes: ["PETG"] }]);
});

test("refreshManagedVendorCatalog requires host details in client mode", async () => {
  await assert.rejects(
    refreshManagedVendorCatalog("Bambu", [], { clientReadOnly: true }, {
      refreshHostVendorCatalog: async () => catalogRefreshResult(),
      refreshLocalBambuCatalog: async () => catalogRefreshResult(),
      refreshLocalEsunCatalog: async () => catalogRefreshResult(),
    }),
    /Host connection details are missing/,
  );
});
