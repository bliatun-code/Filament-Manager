import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StatisticsPeriodReport } from "../lib/tauri_client";
import { StatisticsConsumptionPanel } from "./statistics_consumption_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const t = (_key: string, fallback = "") => fallback;
const report: StatisticsPeriodReport = {
  period: { start_at_utc: "2026-08-01T00:00:00Z", end_at_utc: "2026-09-01T00:00:00Z" },
  total_used_g: 1250, owned_used_g: 1000, borrowed_in_used_g: 250,
  total_jobs: 7, successful_jobs: 6, failed_jobs: 1, printer_usage: [],
  filament_consumption: [
    { material: "PLA", filament_name: "Basic", color_name: "Red", hex_color: "#ff0000", vendor: "Bambu", ownership_type: "OWNED", used_grams: 750, jobs: 5 },
    { material: "PLA", filament_name: "Basic", color_name: "Blue", hex_color: "#0000ff", vendor: "Bambu", ownership_type: "BORROWED_IN", used_grams: 250, jobs: 2 },
    { material: "PETG", filament_name: "HF", color_name: "Green", hex_color: "#00ff00", vendor: "Bambu", ownership_type: "OWNED", used_grams: 250, jobs: 1 },
  ],
};
const renderPanel = (value: StatisticsPeriodReport | null, loading = false) => renderToStaticMarkup(
  <StatisticsConsumptionPanel activeSlots={4} loading={loading} locale="en" onOpenConsumption={() => {}} onOpenMetric={() => {}} periodLabel="1–31 Aug 2026" report={value} t={t} tauri unavailableMessage="Selected period is unavailable from this Host." />,
);

test("consumption headline uses authoritative report totals and actual filament colors", () => {
  const html = renderPanel(report);
  assert.match(html, />1\.25 kg</);
  assert.match(html, /1–31 Aug 2026/);
  assert.match(html, /Logged Jobs[\s\S]*?>7</);
  assert.doesNotMatch(html, />8</);
  assert.match(html, /PLA[\s\S]*?>1,000 g</);
  assert.match(html, /PETG[\s\S]*?>250 g</);
  assert.match(html, /width:75%;background:#FF0000/);
  assert.match(html, /width:25%;background:#0000FF/);
  assert.match(html, /background:#00FF00/);
  assert.match(html, /Active loaded slots[\s\S]*Current snapshot[\s\S]*?>4</);
  assert.match(html, /<details[^>]*><summary[^>]*>Data and limitations/);
  assert.doesNotMatch(html, /Week|per week|2026-08-0[1-9]/);
});

test("missing Host period data never masquerades as zero consumption or an empty period", () => {
  const html = renderPanel(null);
  assert.match(html, /Selected period is unavailable from this Host/);
  assert.doesNotMatch(html, /No material use recorded in this period/);
  assert.doesNotMatch(html, />0 kg</);
  assert.match(html, /Current snapshot[\s\S]*?>4</);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
});

test("zero consumption is a legitimate result only when the selected report exists", () => {
  const html = renderPanel({ ...report, total_used_g: 0, total_jobs: 0, failed_jobs: 0, filament_consumption: [] });
  assert.match(html, />0\.00 kg</);
  assert.match(html, /No material use recorded in this period/);
  assert.doesNotMatch(html, /Selected period is unavailable from this Host/);
});

test("initial loading withholds all unknown metrics including the current slot snapshot", () => {
  const html = renderPanel(null, true);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status">Loading/);
  assert.doesNotMatch(html, />4</);
  assert.doesNotMatch(html, /No material use recorded in this period|Selected period is unavailable from this Host/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 4);
});
