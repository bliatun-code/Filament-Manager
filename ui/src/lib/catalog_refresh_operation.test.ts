import assert from "node:assert/strict";
import test from "node:test";

import {
  completeCatalogRefreshOperation,
  getActiveCatalogRefreshOperation,
  isCatalogRefreshOperationActive,
  tryBeginCatalogRefreshOperation,
} from "./catalog_refresh_operation";

test("catalog refresh lease is synchronous, single-flight, and survives view remounts", () => {
  const first = tryBeginCatalogRefreshOperation({
    kind: "REFRESH",
    message: "Preparing Bambu refresh",
    phase: "PREPARE",
    vendor: "Bambu",
  });
  assert.ok(first);
  assert.equal(isCatalogRefreshOperationActive(), true);
  assert.deepEqual(getActiveCatalogRefreshOperation(), first);

  const competing = tryBeginCatalogRefreshOperation({
    kind: "AUDIT",
    message: "Checking eSUN",
    phase: "DISCOVER",
    vendor: "eSUN",
  });
  assert.equal(competing, null);
  assert.equal(completeCatalogRefreshOperation(first.id + 1), false);
  assert.deepEqual(getActiveCatalogRefreshOperation(), first);

  assert.equal(completeCatalogRefreshOperation(first.id), true);
  assert.equal(isCatalogRefreshOperationActive(), false);
});

test("a released catalog refresh lease permits the next operation", () => {
  const operation = tryBeginCatalogRefreshOperation({
    kind: "AUDIT",
    message: "Checking Bambu",
    phase: "DISCOVER",
    vendor: "Bambu",
  });
  assert.ok(operation);
  assert.equal(completeCatalogRefreshOperation(operation.id), true);

  const next = tryBeginCatalogRefreshOperation({
    kind: "REFRESH",
    message: "Preparing eSUN refresh",
    phase: "PREPARE",
    vendor: "eSUN",
  });
  assert.ok(next);
  assert.notEqual(next.id, operation.id);
  assert.equal(completeCatalogRefreshOperation(next.id), true);
});
