import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inventoryPageWorkspaceSource = readFileSync(
  "ui/src/components/inventory_page_workspace.tsx",
  "utf8",
);
const inventoryControlsSource = readFileSync(
  "ui/src/components/inventory_controls_panel.tsx",
  "utf8",
);

test("inventory header actions stay inside the page header", () => {
  const headerIndex = inventoryPageWorkspaceSource.indexOf('<div className="page-header">');
  const headerActionsIndex = inventoryPageWorkspaceSource.indexOf(
    "<InventoryHeaderActions",
    headerIndex,
  );
  const filterPanelIndex = inventoryPageWorkspaceSource.indexOf(
    "<InventoryControlsPanel",
    headerIndex,
  );

  assert.notEqual(headerIndex, -1);
  assert.notEqual(headerActionsIndex, -1);
  assert.notEqual(filterPanelIndex, -1);
  assert.ok(
    headerIndex < headerActionsIndex && headerActionsIndex < filterPanelIndex,
    "header actions must render in the header before the separate filter panel",
  );
});

test("inventory filters do not own header search and primary actions", () => {
  const headerActionsSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryHeaderActions"),
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );
  const filterPanelSource = inventoryControlsSource.slice(
    inventoryControlsSource.indexOf("export function InventoryControlsPanel"),
  );

  assert.match(headerActionsSource, /page-header-actions/);
  assert.match(headerActionsSource, /page-header-search/);
  assert.match(headerActionsSource, /PageHeaderButton/);
  assert.match(headerActionsSource, /variant="primary"/);
  assert.doesNotMatch(filterPanelSource, /page-header-actions/);
  assert.doesNotMatch(filterPanelSource, /page-header-search/);
  assert.doesNotMatch(filterPanelSource, /PageHeaderButton/);
});
