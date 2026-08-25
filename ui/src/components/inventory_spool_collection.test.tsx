import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import {
  groupInventorySpools,
  type InventorySpool,
} from "../lib/inventory_list_model";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".svg")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(url)};`,
      };
    }
    return nextLoad(url, context);
  },
});

const { InventorySpoolCollection } = await import("./inventory_spool_collection");

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

function renderEmptyCollection(options: {
  addSpoolDisabled?: boolean;
  loading?: boolean;
  totalSpoolCount?: number;
} = {}): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventorySpoolCollection
        addSpoolDisabled={options.addSpoolDisabled ?? false}
        bulkSelectionActive={false}
        bulkSelectionDisabled={false}
        filteredSpools={[]}
        groupedSpools={[]}
        inventoryView="CARDS"
        loading={options.loading ?? false}
        onAddSpool={() => {}}
        onBulkSelectionChange={() => {}}
        onResetFilters={() => {}}
        onSelectRoll={() => {}}
        recentlyAddedSpoolId={null}
        resolvedTheme="light"
        selectedSpoolId={null}
        selectedBulkSpoolIds={new Set()}
        totalSpoolCount={options.totalSpoolCount ?? 0}
      />
    </I18nContext.Provider>,
  );
}

test("empty inventory explains how to start and offers the add-spool action", () => {
  const html = renderEmptyCollection();

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Add or import inventory/);
  assert.match(html, /Start with one spool, or import an existing inventory or backup\./);
  assert.match(html, /<button[^>]*>Add spool<\/button>/);
  assert.doesNotMatch(html, /No spools match current filters|Reset filters/);
});

test("filtered empty results explain the mismatch and offer a one-click reset", () => {
  const html = renderEmptyCollection({ totalSpoolCount: 8 });

  assert.match(html, /No spools match current filters\./);
  assert.match(html, /Try adjusting search, status, material or ownership filters\./);
  assert.match(html, /<button[^>]*>Reset filters<\/button>/);
  assert.doesNotMatch(html, /Add or import inventory|>Add spool<\/button>/);
});

test("loading an empty collection does not present premature recovery actions", () => {
  const html = renderEmptyCollection({ loading: true, totalSpoolCount: 8 });

  assert.match(html, /Loading spools\.\.\./);
  assert.doesNotMatch(html, /No spools match current filters|Add or import inventory/);
  assert.doesNotMatch(html, /<button/);
});

test("empty inventory respects read-only add restrictions", () => {
  const html = renderEmptyCollection({ addSpoolDisabled: true });

  assert.match(html, /<button[^>]*disabled=""[^>]*>Add spool<\/button>/);
});

test("visible inventory rows expose selection only while multi-select mode is active", () => {
  const spool: InventorySpool = {
    colorName: "Black",
    filamentName: "Basic",
    id: "spool-a",
    initialWeightGrams: 1_000,
    masterId: "master-a",
    material: "PLA",
    ownershipType: "OWNED",
    remainingGrams: 640,
    status: "IN_STOCK",
    vendor: "Bambu Lab",
  };
  const renderCollection = (bulkSelectionActive: boolean) =>
    renderToStaticMarkup(
      <I18nContext.Provider value={i18nValue}>
        <InventorySpoolCollection
          addSpoolDisabled={false}
          bulkSelectionActive={bulkSelectionActive}
          bulkSelectionDisabled={false}
          filteredSpools={[spool]}
          groupedSpools={groupInventorySpools([spool])}
          inventoryView="LIST"
          loading={false}
          onAddSpool={() => {}}
          onBulkSelectionChange={() => {}}
          onResetFilters={() => {}}
          onSelectRoll={() => {}}
          recentlyAddedSpoolId={null}
          resolvedTheme="light"
          selectedSpoolId={null}
          selectedBulkSpoolIds={new Set([spool.id])}
          totalSpoolCount={1}
        />
      </I18nContext.Provider>,
    );

  const inactiveHtml = renderCollection(false);
  assert.doesNotMatch(inactiveHtml, /type="checkbox"|Select #pool-a/);
  assert.match(inactiveHtml, /<button[^>]*type="button"/);

  const html = renderCollection(true);

  assert.match(
    html,
    /<input(?=[^>]*type="checkbox")(?=[^>]*checked="")[^>]*>/,
  );
  assert.match(html, /<span class="sr-only">Select #pool-a<\/span>/);
  assert.match(html, /<button[^>]*type="button"/);
});
