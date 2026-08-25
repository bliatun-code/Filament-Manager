import assert from "node:assert/strict";
import test from "node:test";
import {
  inventoryLocationActionRows,
  inventoryLocationUsageById,
  normalizeInventoryLocationName,
  resolveInventoryLocationReferenceForWrite,
  validInventoryLocationName,
  validateLocationMerge,
} from "./inventory_location_model";
import type { InventoryLocationRow } from "./tauri_location_client";

function location(overrides: Partial<InventoryLocationRow> = {}): InventoryLocationRow {
  return {
    id: "location-1",
    name: "Shelf A",
    location_type: "GENERIC",
    archived_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

test("location drafts normalize whitespace and validate the backend length contract", () => {
  assert.equal(normalizeInventoryLocationName("  Dry\t Box  2 "), "Dry Box 2");
  assert.equal(validInventoryLocationName(" \t "), false);
  assert.equal(validInventoryLocationName("A".repeat(120)), true);
  assert.equal(validInventoryLocationName("A".repeat(121)), false);
});

test("management rows hide system locations and expose only permitted lifecycle actions", () => {
  const [active, archived] = inventoryLocationActionRows(
    [
      location(),
      location({ id: "archived", name: "Old shelf", archived_at: "2026-08-21" }),
      location({
        id: "Printer:Studio:slot-1",
        location_type: "PRINTER_SLOT",
      }),
    ],
    true,
  );

  assert.deepEqual(
    {
      rename: active.canRename,
      archive: active.canArchive,
      restore: active.canRestore,
    },
    { rename: true, archive: true, restore: false },
  );
  assert.deepEqual(
    {
      rename: archived.canRename,
      archive: archived.canArchive,
      restore: archived.canRestore,
    },
    { rename: true, archive: false, restore: true },
  );
  assert.deepEqual([active.id, archived.id], ["location-1", "archived"]);
});

test("restore is blocked when an active location already uses the archived name", () => {
  const [, archived] = inventoryLocationActionRows(
    [
      location({ id: "active", name: "Shelf One" }),
      location({ id: "archived", name: "  shelf   one  ", archived_at: "2026-08-21" }),
    ],
    true,
  );

  assert.equal(archived.restoreBlockedByNameConflict, true);
  assert.equal(archived.canRename, true);
  assert.equal(archived.canRestore, false);
});

test("location usage counts each roll once across current and home references", () => {
  const usage = inventoryLocationUsageById([
    { id: "spool-a", locationId: "shelf-a", homeLocationId: "shelf-a" },
    { id: "spool-b", locationId: "shelf-b", homeLocationId: "shelf-a" },
    { id: "spool-c", locationId: null, homeLocationId: " shelf-b " },
  ]);

  assert.deepEqual([...usage.entries()], [
    ["shelf-a", 2],
    ["shelf-b", 2],
  ]);
});

test("merge accepts only two different active generic locations", () => {
  const rows = [
    location({ id: "source" }),
    location({ id: "target" }),
    location({ id: "archived", archived_at: "2026-08-21" }),
    location({ id: "system", location_type: "PRINTER_SLOT" }),
  ];
  assert.equal(validateLocationMerge(rows, "source", "target"), true);
  assert.equal(validateLocationMerge(rows, "source", "source"), false);
  assert.equal(validateLocationMerge(rows, "source", "archived"), false);
  assert.equal(validateLocationMerge(rows, "source", "system"), false);
});

test("unsupported or offline Host disables every generic mutation", () => {
  const [active, archived] = inventoryLocationActionRows(
    [location(), location({ id: "archived", archived_at: "2026-08-21" })],
    false,
  );
  assert.equal(active.canRename || active.canArchive, false);
  assert.equal(archived.canRename || archived.canRestore, false);
});

test("location writes preserve stale immutable references and resolve active autocomplete names", () => {
  const renamed = location({ id: "stable-id", name: "New shelf name" });

  assert.equal(
    resolveInventoryLocationReferenceForWrite([renamed], "Old shelf name", {
      id: "stable-id",
      name: "Old shelf name",
    }),
    "stable-id",
  );
  assert.equal(
    resolveInventoryLocationReferenceForWrite([renamed], "  new   SHELF name "),
    "stable-id",
  );
  assert.equal(
    resolveInventoryLocationReferenceForWrite([renamed], "New free-text shelf"),
    "New free-text shelf",
  );
  assert.equal(resolveInventoryLocationReferenceForWrite([renamed], "   "), null);
});
