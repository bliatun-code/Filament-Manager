import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MasterCatalogRow } from "../lib/tauri_client";
import { SettingsMissingSwatchesPanel } from "./settings_missing_swatches_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const missingMaster: MasterCatalogRow = {
  id: "esun-abs-black",
  color_name: "Black",
  default_weight: 1000,
  filament_name: "ABS+",
  hex_color: null,
  is_discontinued: false,
  material: "ABS",
  vendor: "eSUN",
};

function renderPanel({
  confirmBulkSwatch = false,
  draft = "#1F2937",
  master = missingMaster,
}: {
  confirmBulkSwatch?: boolean;
  draft?: string;
  master?: MasterCatalogRow;
} = {}): string {
  return renderToStaticMarkup(
    <SettingsMissingSwatchesPanel
      busy={false}
      catalogRefreshBusy={false}
      confirmBulkSwatch={confirmBulkSwatch}
      missingSwatchCount={8}
      swatchBusy={false}
      swatchDraftById={{ [master.id]: draft }}
      swatchVendorFilter="ALL"
      swatchVendorOptions={["ALL", "eSUN"]}
      tauri
      t={(_key, fallback) => fallback}
      visibleMissingSwatchMasters={[master]}
      visibleMissingSwatchVendorCount={1}
      onBulkAutoFill={() => {}}
      onCancelBulkAutoFill={() => {}}
      onRefresh={() => {}}
      onSaveMissingSwatch={() => {}}
      onSwatchDraftChange={() => {}}
      onVendorFilterChange={() => {}}
    />,
  );
}

test("missing swatch worklist is compact, labelled and exposes filter state", () => {
  const html = renderPanel();

  assert.match(html, /Missing swatches: 8/);
  assert.match(html, /aria-label="Filter by vendor"/);
  assert.match(html, /aria-pressed="true"[^>]*>All/);
  assert.match(html, /role="region" aria-label="Missing swatches" tabindex="0"/);
  assert.match(html, /<label for="missing-swatch-value-0"/);
  assert.match(html, /<label for="missing-swatch-picker-0"/);
  assert.match(html, /md:flex-row/);
  assert.match(html, /max-content/);
  assert.doesNotMatch(html, /sm:grid-cols-3/);
});

test("long catalog titles remain fully visible and wrap safely", () => {
  const html = renderPanel({
    master: {
      ...missingMaster,
      filament_name: "High Speed Recycled Carbon Fiber Reinforced Copolymer",
      color_name: "Midnight Aurora",
    },
  });

  assert.match(
    html,
    /title="ABS · High Speed Recycled Carbon Fiber Reinforced Copolymer · Midnight Aurora"/,
  );
  assert.match(html, /class="break-words text-sm font-semibold leading-snug/);
  assert.doesNotMatch(html, /class="truncate text-sm font-semibold/);
});

test("invalid manual swatch values stay invalid and cannot be saved", () => {
  const html = renderPanel({ draft: "not-a-color" });

  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /Use #RGB, #RRGGBB, gradient\(\.\.\.\), or multi\(\.\.\.\)\./);
  assert.match(html, /Invalid value/);
  assert.match(html, /aria-label="Save: ABS\+ · Black"[^>]*disabled=""/);
});

test("bulk auto-fill confirmation has explicit confirm and cancel actions", () => {
  const html = renderPanel({ confirmBulkSwatch: true });

  assert.match(html, />Confirm auto-fill</);
  assert.match(html, />Cancel</);
  assert.match(html, /Apply suggested colors to 1 visible entries\?/);
  assert.doesNotMatch(html, /Click Auto-fill visible missing swatches again/);
});
