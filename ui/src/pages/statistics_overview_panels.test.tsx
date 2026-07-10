import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { InventoryOverview, PrinterOverviewRow } from "../lib/tauri_client";
import {
  StatisticsOwnershipSnapshotPanel,
  StatisticsPerPrinterUsagePanel,
} from "./statistics_overview_panels";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const ownershipOverview: InventoryOverview = {
  total_spools: 46,
  total_owned_spools: 46,
  total_borrowed_in_spools: 0,
  in_use: 4,
  owned_in_use: 4,
  borrowed_in_in_use: 0,
  low_stock: 5,
  owned_low_stock: 5,
  borrowed_in_low_stock: 0,
  total_consumption_30d: 4146,
  owned_consumption_30d: 4146,
  borrowed_in_consumption_30d: 0,
};

test("ownership statistics retain all borrowed-from-others zero values", () => {
  const html = renderToStaticMarkup(
    <StatisticsOwnershipSnapshotPanel
      ownershipOverview={ownershipOverview}
      t={(_key, fallback = "") => fallback}
    />,
  );

  assert.equal((html.match(/data-ownership="borrowed"/g) ?? []).length, 4);
  assert.match(html, /Borrowed in on hand[\s\S]*?>0</);
  assert.match(html, /Recorded print use · borrowed from others[\s\S]*?>0 g</);
  assert.match(html, /Borrowed assigned[\s\S]*?>0</);
  assert.match(html, /Borrowed-in low stock[\s\S]*?>0</);
  assert.doesNotMatch(html, /30d|30 days/i);
});

test("ownership statistics use four columns around the desktop QA width and rose only for low stock", () => {
  const html = renderToStaticMarkup(
    <StatisticsOwnershipSnapshotPanel
      ownershipOverview={ownershipOverview}
      t={(_key, fallback = "") => fallback}
    />,
  );

  assert.match(html, /md:grid-cols-4/);
  assert.equal((html.match(/bg-rose-50\/65/g) ?? []).length, 2);
  assert.doesNotMatch(html, /bg-sky-|bg-amber-|bg-emerald-/);
});

test("per-printer statistic rows use valid dialog button markup", () => {
  const printer: PrinterOverviewRow = {
    printer: {
      id: "workshop-x1c",
      model: "Bambu Lab X1 Carbon",
      name: "Workshop",
      created_at: "2026-07-01 10:00:00",
      updated_at: "2026-07-01 10:00:00",
    },
    usage: {
      total_jobs: 49,
      successful_jobs: 47,
      failed_jobs: 2,
      total_used_g: 4146,
      last_job_at: "2026-07-10 10:00:00",
    },
    slots: [],
  };
  const html = renderToStaticMarkup(
    <StatisticsPerPrinterUsagePanel
      loading={false}
      onOpenConsumption={() => {}}
      printers={[printer]}
      resolvedTheme="dark"
      t={(_key, fallback = "") => fallback}
    />,
  );
  const button = html.match(
    /<button type="button" aria-haspopup="dialog"[\s\S]*?<\/button>/,
  )?.[0];

  assert.ok(button);
  assert.match(button, />View details<span aria-hidden="true">→/);
  assert.match(button, /focus-visible:ring-2/);
  assert.doesNotMatch(button, /<div|role="button"|tabindex="0"/);
});
