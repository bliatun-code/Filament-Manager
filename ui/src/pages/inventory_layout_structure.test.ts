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
const inventoryPageSource = readFileSync(
  new URL("./inventory.tsx", import.meta.url),
  "utf8",
);
const inventoryDetailModalSource = readFileSync(
  new URL("../components/inventory_spool_detail_modal.tsx", import.meta.url),
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

test("inventory search and filter controls expose accessible names and state", () => {
  assert.match(inventoryControlsSource, /aria-label=\{t\(/);
  assert.match(inventoryControlsSource, /aria-pressed=\{lowStockOnly\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{statusFilter === status\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{inventoryView === "CARDS"\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{inventoryView === "LIST"\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{ownershipFilter === ownership\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{vendorFilter === vendor\}/);
  assert.match(inventoryControlsSource, /aria-pressed=\{materialFilter === material\}/);
  assert.match(inventoryControlsSource, /aria-expanded=\{advancedFiltersOpen\}/);
  assert.match(inventoryControlsSource, /aria-controls="inventory-advanced-filters"/);
  assert.match(inventoryControlsSource, /id="inventory-advanced-filters"/);
});

test("inventory result summary counts all active filters and offers reset", () => {
  assert.match(inventoryControlsSource, /aria-live="polite"/);
  assert.match(inventoryControlsSource, /visibleInventoryCount === 1/);
  assert.match(inventoryControlsSource, /activeFilterCount > 0/);
  assert.match(inventoryControlsSource, /onClick=\{onResetFilters\}/);
  assert.match(inventoryControlsSource, /inventory\.resetFilters/);
});

test("history visual QA waits for rows and targets the modal scroll container", () => {
  assert.match(inventoryDetailModalSource, /data-inventory-detail-scroll/);
  assert.match(
    inventoryPageSource,
    /historyLoading \|\|[\s\S]*usageLoading \|\|[\s\S]*selectedSpoolQrLoading \|\|[\s\S]*visibleHistoryRows\.length === 0/,
  );
  assert.match(inventoryPageSource, /visibleHistoryRows\.length,/);
  assert.match(inventoryPageSource, /scrollContainer\.scrollTop =/);
  assert.match(inventoryPageSource, /\[150, 450, 900\]\.map/);
  assert.match(inventoryPageSource, /window\.addEventListener\("resize", scheduleScrollToTarget\)/);
  assert.match(inventoryPageSource, /new ResizeObserver\(scheduleScrollToTarget\)/);
  assert.match(inventoryPageSource, /block: "start"/);
});
