import assert from "node:assert/strict";
import test from "node:test";

import { loadCatalogMasters, resolveCatalogSelectionDefaults } from "./catalog_data_source";
import type { MasterCatalogRow } from "./tauri_client";

function catalogRow(
  id: string,
  vendor: string,
  overrides: Partial<MasterCatalogRow> = {},
): MasterCatalogRow {
  return {
    id,
    material: "PLA",
    filament_name: "Basic",
    color_name: "Gray",
    hex_color: "#808080",
    product_url: null,
    default_weight: 1000,
    vendor,
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

test("loadCatalogMasters uses host catalog in client mode", async () => {
  const calls: Array<{ baseUrl: string; libraryId: string | null | undefined; limit: number }> = [];
  const rows = await loadCatalogMasters(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      fetchHostCatalog: async (baseUrl, libraryId, limit) => {
        calls.push({ baseUrl, libraryId, limit });
        return [catalogRow("host-bambu", "Bambu")];
      },
    },
  );

  assert.deepEqual(calls, [{ baseUrl: "http://host", libraryId: "library-1", limit: 5000 }]);
  assert.deepEqual(rows.map((row) => row.id), ["host-bambu"]);
});

test("loadCatalogMasters uses local catalog outside client host mode", async () => {
  const calls: Array<{ limit: number; search?: string }> = [];
  const rows = await loadCatalogMasters(
    { clientReadOnly: false, limit: 250, search: "pla" },
    {
      listLocalCatalog: async (limit, search) => {
        calls.push({ limit, search });
        return [catalogRow("local-esun", "eSUN")];
      },
    },
  );

  assert.deepEqual(calls, [{ limit: 250, search: "pla" }]);
  assert.deepEqual(rows.map((row) => row.id), ["local-esun"]);
});

test("loadCatalogMasters avoids local catalog fallback when client host details are incomplete", async () => {
  const rows = await loadCatalogMasters(
    { clientReadOnly: true, clientHostBaseUrl: " ", clientLibraryId: "library-1" },
    {
      fetchHostCatalog: async () => {
        throw new Error("host catalog should not load without a complete target");
      },
      listLocalCatalog: async () => {
        throw new Error("local catalog should not load for client mode");
      },
    },
  );

  assert.deepEqual(rows, []);
});

test("resolveCatalogSelectionDefaults prefers vendor-specific first choices", () => {
  const defaults = resolveCatalogSelectionDefaults([
    catalogRow("generic-1", "Generic"),
    catalogRow("bambu-1", "Bambu Lab"),
    catalogRow("esun-1", "eSUN"),
  ]);

  assert.deepEqual(defaults, {
    bambuMasterId: "bambu-1",
    esunMasterId: "esun-1",
  });
});

test("resolveCatalogSelectionDefaults preserves existing selections", () => {
  const defaults = resolveCatalogSelectionDefaults(
    [catalogRow("bambu-1", "Bambu Lab"), catalogRow("esun-1", "eSUN")],
    "existing-bambu",
    "existing-esun",
  );

  assert.deepEqual(defaults, {
    bambuMasterId: "existing-bambu",
    esunMasterId: "existing-esun",
  });
});

test("resolveCatalogSelectionDefaults falls back safely for empty or generic-only catalogs", () => {
  assert.deepEqual(resolveCatalogSelectionDefaults([], "bambu-current", ""), {
    bambuMasterId: "bambu-current",
    esunMasterId: "",
  });
  assert.deepEqual(resolveCatalogSelectionDefaults([catalogRow("generic-1", "Generic")]), {
    bambuMasterId: "generic-1",
    esunMasterId: "",
  });
});
