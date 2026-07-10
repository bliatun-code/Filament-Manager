import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  BorrowerFilamentUsageRow,
  BorrowerPopupPrefs,
  ConsumptionPopupPrefs,
} from "../lib/statistics_model";
import type { FilamentConsumptionRow } from "../lib/tauri_client";
import {
  StatisticsBorrowerUsageModal,
  StatisticsConsumptionModal,
} from "./statistics_usage_modals";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t = (_key: string, fallback = "") => fallback;

const consumptionRows: FilamentConsumptionRow[] = [
  {
    printer_id: "x1c",
    printer_name: "Workshop",
    material: "PLA",
    filament_name: "Basic",
    color_name: "Red",
    hex_color: "#ff0000",
    vendor: "Bambu",
    ownership_type: "OWNED",
    used_grams: 250,
    jobs: 3,
  },
  {
    printer_id: "p1s",
    printer_name: "Office",
    material: "PETG",
    filament_name: "HF",
    color_name: "Blue",
    hex_color: "#0000ff",
    vendor: "Bambu",
    ownership_type: "BORROWED_IN",
    owner_name: "Ada",
    used_grams: 80,
    jobs: 1,
  },
];

const consumptionPrefs: ConsumptionPopupPrefs = {
  search: "red",
  vendorFilter: "ALL",
  materialFilter: "ALL",
  ownershipFilter: "ALL",
  sort: "USED_DESC",
};

const borrowerRows: BorrowerFilamentUsageRow[] = [
  {
    material: "PLA",
    filamentName: "Basic",
    colorName: "Red",
    vendor: "Bambu",
    consumedGrams: 120,
    lentOutGrams: 800,
    loans: 2,
    activeLoans: 1,
  },
  {
    material: "PETG",
    filamentName: "HF",
    colorName: "Blue",
    vendor: "Bambu",
    consumedGrams: 40,
    lentOutGrams: 500,
    loans: 1,
    activeLoans: 0,
  },
];

test("consumption modal gives search and every select an associated label", () => {
  const html = renderToStaticMarkup(
    <StatisticsConsumptionModal
      consumptionError={null}
      consumptionLoading={false}
      consumptionMaterialOptions={["ALL", "PLA", "PETG"]}
      consumptionModalTitle="Consumption by filament"
      consumptionPrefs={consumptionPrefs}
      consumptionRows={consumptionRows}
      consumptionVendorOptions={["ALL", "Bambu"]}
      filteredConsumptionRows={consumptionRows.slice(0, 1)}
      onClose={() => {}}
      setConsumptionPrefs={() => {}}
      t={t}
    />,
  );

  const labelTargets = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(labelTargets.length, 5);
  for (const id of labelTargets) {
    assert.match(html, new RegExp(`<(?:input|select) id="${id}"`));
  }
  assert.match(html, />Search filament, color, vendor or owner</);
  assert.match(html, />Vendor</);
  assert.match(html, />Material</);
  assert.match(html, />Ownership</);
  assert.match(html, /aria-live="polite"[^>]*aria-atomic="true"[^>]*>1 \/ 2 result</);
  assert.match(
    html,
    /surface-subtle mt-4 grid grid-cols-1 gap-2 p-3 sm:grid-cols-2/,
  );
  assert.equal((html.match(/sm:col-span-2/g) ?? []).length, 3);
  assert.doesNotMatch(html, /min-\[900px\]:grid-cols-6/);
});

test("borrower usage search has a label and announces filtered versus total rows", () => {
  const borrowerPrefs: BorrowerPopupPrefs = { search: "red" };
  const html = renderToStaticMarkup(
    <StatisticsBorrowerUsageModal
      borrowerError={null}
      borrowerLoading={false}
      borrowerModalDirection="OUTBOUND"
      borrowerModalTitle="Loan usage by filament · Ada"
      borrowerPrefs={borrowerPrefs}
      borrowerRows={borrowerRows}
      filteredBorrowerRows={borrowerRows.slice(0, 1)}
      onClose={() => {}}
      setBorrowerPrefs={() => {}}
      t={t}
    />,
  );

  const searchId = html.match(/<label[^>]*for="([^"]+)"/)?.[1];
  assert.ok(searchId);
  assert.match(html, new RegExp(`<input id="${searchId}" type="search"`));
  assert.match(html, />Search filament, color or vendor</);
  assert.match(html, /aria-live="polite"[^>]*aria-atomic="true"[^>]*>1 \/ 2 result</);
});
