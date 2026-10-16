import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import type { PrinterOverviewRow, StatisticsPeriod, StatisticsPeriodReport } from "../lib/tauri_client";

const customPeriod: StatisticsPeriod = {
  start_at_utc: "2026-09-01T00:00:00Z",
  end_at_utc: "2026-10-01T00:00:00Z",
};
const printers: PrinterOverviewRow[] = [
  {
    printer: { id: "atlas", name: "Atlas", model: "Bambu Lab P1S", created_at: "", updated_at: "" },
    usage: { total_jobs: 3, successful_jobs: 3, failed_jobs: 0, total_used_g: 500 },
    slots: [{ slot_id: "atlas-a1", ams_id: "atlas-ams", slot_index: 0, spool_id: "owned-red", spool_status: "IN_USE", spool_ownership_type: "OWNED", spool_material: "PLA", spool_filament_name: "Basic", spool_color_name: "Red", spool_hex_color: "#FF0000" }],
  },
  {
    printer: { id: "nova", name: "Nova", model: "Prusa MK4S", created_at: "", updated_at: "" },
    usage: { total_jobs: 4, successful_jobs: 3, failed_jobs: 1, total_used_g: 750 },
    slots: [{ slot_id: "nova-ext", ams_id: "nova-ext", slot_index: 0, spool_id: "borrowed-blue", spool_status: "IN_USE", spool_ownership_type: "BORROWED_IN", spool_owner_name: "Test owner", spool_material: "PETG", spool_filament_name: "HF", spool_color_name: "Blue", spool_hex_color: "#0000FF" }],
  },
];

/** Canned backend responses differ by requested range; no page state or handlers are replaced. */
function periodResponse(period: StatisticsPeriod): StatisticsPeriodReport {
  const custom = period.start_at_utc === customPeriod.start_at_utc && period.end_at_utc === customPeriod.end_at_utc;
  const multiplier = custom ? 1 : 2;
  const emptyCoverage = { total_rows: 0, valued_rows: 0, unvalued_rows: 0, covered_grams: 0, uncovered_grams: 0, missing_reasons: [], trace_total_rows: 0, trace_returned_rows: 0, trace_truncated: false };
  return {
    period, total_used_g: 1250 * multiplier, owned_used_g: 500 * multiplier,
    borrowed_in_used_g: 750 * multiplier, total_jobs: 7, successful_jobs: 6, failed_jobs: 1,
    printer_usage: printers.map((row) => ({ printer_id: row.printer.id, ...row.usage, total_used_g: row.usage.total_used_g * multiplier })),
    filament_consumption: [
      { printer_id: "atlas", printer_name: "Atlas", material: "PLA", filament_name: "Basic", color_name: "Red", hex_color: "#FF0000", vendor: "Bambu Lab", ownership_type: "OWNED", used_grams: 500 * multiplier, jobs: 3 },
      { printer_id: "nova", printer_name: "Nova", material: "PETG", filament_name: "HF", color_name: "Blue", hex_color: "#0000FF", vendor: "Prusa", ownership_type: "BORROWED_IN", owner_name: "Test owner", used_grams: 750 * multiplier, jobs: 4 },
    ],
    value_cost: {
      inventory_value: {
        totals: [{ currency: "NOK", ownership_type: "OWNED", amount: 125 }],
        coverage: { ...emptyCoverage, total_rows: 2, valued_rows: 1, unvalued_rows: 1, covered_grams: 500, uncovered_grams: 750, missing_reasons: [{ reason: "purchase_price_missing", rows: 1, grams: 750 }], trace_total_rows: 2, trace_returned_rows: 2 },
      },
      material_cost: { totals: [], coverage: emptyCoverage },
      inventory_trace: [
        { spool_id: "owned-red", material: "PLA", filament_name: "Basic", color_name: "Red", vendor: "Bambu Lab", status: "IN_USE", ownership_type: "OWNED", remaining_g: 500, initial_weight_g: 1000, purchase_price: 250, purchase_currency: "NOK", amount: 125, missing_reasons: [] },
        { spool_id: "borrowed-blue", material: "PETG", filament_name: "HF", color_name: "Blue", vendor: "Prusa", status: "IN_USE", ownership_type: "BORROWED_IN", remaining_g: 750, initial_weight_g: 1000, purchase_price: null, purchase_currency: "NOK", amount: null, missing_reasons: ["purchase_price_missing"] },
      ],
      material_cost_trace: [],
    },
  };
}

async function buildPageHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
  ]);
  const entry = fileURLToPath(new URL("./__statistics_analysis_lifecycle__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import StatisticsPage from ${file("./statistics.tsx")};
    import { I18nContext } from ${file("../lib/i18n.ts")};
    import { formatMessage } from ${file("../../../src-tauri/companion_browser/message_format.js")};
    window.__TAURI__={invoke:(command,payload)=>window.statisticsInvoke(command,payload)};
    const targets=[];
    window.statisticsLifecycle={targets:()=>targets};
    const i18n={locale:"en",setLocale:()=>{},t:(_key,fallback="",params={})=>formatMessage(fallback,params,"en")};
    createRoot(document.getElementById("root")).render(<I18nContext.Provider value={i18n}>
      <StatisticsPage onOpenFilamentDefaults={target=>targets.push(target)}/>
    </I18nContext.Provider>);
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "statistics-analysis-lifecycle", enforce: "pre", resolveId: (id: string) => id === entry ? entry : null, load: (id: string) => id === entry ? source : null }, react()],
    build: { write: false, minify: false, cssCodeSplit: false, lib: { entry, formats: ["iife"], name: "StatisticsAnalysisLifecycle" } },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((result) => result.output);
  const script = output.find((file) => file.type === "chunk" && file.isEntry)?.code;
  assert.ok(script);
  return `<html lang="en"><head><meta charset="UTF-8"></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

async function selectedView(page: Page, view: "consumption" | "value" | "printers") {
  await page.waitForFunction((expected) => {
    const tab = document.getElementById(`statistics-view-${expected}`);
    const panel = document.getElementById(`statistics-panel-${expected}`);
    return tab?.getAttribute("aria-selected") === "true" && panel?.hidden === false;
  }, view);
}

async function focusedTab(page: Page, view: "consumption" | "value" | "printers") {
  await selectedView(page, view);
  assert.equal(await page.evaluate(() => document.activeElement?.id), `statistics-view-${view}`);
}

async function closeDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

test("actual StatisticsPage keeps its range, keyboard navigation, filters and detail actions across analysis views", { timeout: 60_000 }, async () => {
  const html = await buildPageHarness();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    const consoleIssues: string[] = [];
    const requests: string[] = [];
    const calls: { command: string; payload: Record<string, unknown> }[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") consoleIssues.push(message.text());
    });
    await page.route("**/*", (route) => {
      if (route.request().isNavigationRequest() && route.request().url() === "http://statistics.test/") {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      }
      requests.push(route.request().url());
      return route.abort();
    });
    await page.exposeFunction("statisticsInvoke", (command: string, payload: Record<string, unknown> = {}) => {
      calls.push({ command, payload });
      switch (command) {
        case "get_library_sync_settings": return { mode: "STANDALONE", device_name: "Synthetic statistics" };
        case "list_spools": return [];
        case "inventory_overview": return { total_spools: 2, total_owned_spools: 1, total_borrowed_in_spools: 1, in_use: 2, owned_in_use: 1, borrowed_in_in_use: 1, low_stock: 0, owned_low_stock: 0, borrowed_in_low_stock: 0, total_consumption_30d: 2500, owned_consumption_30d: 1000, borrowed_in_consumption_30d: 1500 };
        case "list_printer_overview": return printers;
        case "list_loan_usage_by_person": return [];
        case "statistics_period_report": return periodResponse(payload.period as StatisticsPeriod);
        default: throw new Error(`Unexpected command in isolated statistics test: ${command}`);
      }
    });
    await page.goto("http://statistics.test/", { waitUntil: "domcontentloaded" });
    await page.getByText("2.50 kg", { exact: true }).waitFor();
    const periodCalls = () => calls.filter((call) => call.command === "statistics_period_report");
    const tabs = page.getByRole("tablist", { name: "Statistics views", exact: true });
    assert.equal(await tabs.getByRole("tab").count(), 3);
    await page.getByRole("button", { name: "Custom range", exact: true }).click();
    await page.getByLabel("Start date", { exact: true }).fill("2026-09-01");
    await page.getByLabel("End date", { exact: true }).fill("2026-09-30");
    const initialCallCount = periodCalls().length;
    await tabs.getByRole("tab", { name: "Inventory value", exact: true }).click();
    await tabs.getByRole("tab", { name: "Inventory value", exact: true }).press("ArrowRight");
    await focusedTab(page, "printers");
    await tabs.getByRole("tab", { name: "Printers", exact: true }).press("Home");
    await focusedTab(page, "consumption");
    await tabs.getByRole("tab", { name: "Consumption", exact: true }).press("End");
    await focusedTab(page, "printers");
    await tabs.getByRole("tab", { name: "Printers", exact: true }).press("ArrowRight");
    await focusedTab(page, "consumption");
    await tabs.getByRole("tab", { name: "Consumption", exact: true }).press("ArrowLeft");
    await focusedTab(page, "printers");
    await tabs.getByRole("tab", { name: "Consumption", exact: true }).click();
    assert.equal(await page.getByLabel("Start date", { exact: true }).inputValue(), "2026-09-01");
    assert.equal(await page.getByLabel("End date", { exact: true }).inputValue(), "2026-09-30");
    assert.equal(await page.getByRole("button", { name: "Custom range", exact: true }).getAttribute("aria-pressed"), "false");
    assert.equal(periodCalls().length, initialCallCount, "changing views must not apply date drafts or reload the reporting period");
    await page.getByRole("button", { name: "Apply range", exact: true }).click();
    await page.getByText("1.25 kg", { exact: true }).waitFor();
    assert.deepEqual(periodCalls().at(-1)?.payload.period, customPeriod);
    const appliedCallCount = periodCalls().length;
    const appliedRange = await page.getByRole("group", { name: "Reporting period", exact: true }).locator("..").locator('[aria-live="polite"]').textContent();
    assert.match(appliedRange ?? "", /Sep/);

    const openConsumption = page.getByRole("button", { name: "Consumption by filament", exact: true });
    await openConsumption.click();
    const dialog = page.getByRole("dialog");
    const count = dialog.locator('[aria-live="polite"][aria-atomic="true"]');
    assert.equal(await count.textContent(), "2 / 2 results");
    await dialog.getByRole("combobox", { name: /^Vendor/ }).selectOption("Bambu Lab");
    await count.getByText("1 / 2 results", { exact: true }).waitFor();
    await dialog.getByRole("combobox", { name: /^Material/ }).selectOption("PLA");
    await dialog.getByRole("combobox", { name: /^Ownership/ }).selectOption("OWNED");
    await dialog.getByRole("combobox", { name: /^Most used/ }).selectOption("NAME_ASC");
    await dialog.getByLabel("Search filament, color, vendor or owner", { exact: true }).fill("no-such-filament");
    await dialog.getByText("No rows match current filters.", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Reset filters", exact: true }).click();
    await count.getByText("2 / 2 results", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("combobox", { name: /^Vendor/ }).inputValue(), "ALL");
    assert.equal(await dialog.getByRole("combobox", { name: /^Ownership/ }).inputValue(), "ALL");
    await dialog.getByRole("combobox", { name: /^Vendor/ }).selectOption("Bambu Lab");
    await count.getByText("1 / 2 results", { exact: true }).waitFor();
    await dialog.getByRole("combobox", { name: /^Vendor/ }).press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await openConsumption.evaluate((element) => element === document.activeElement), true);

    await tabs.getByRole("tab", { name: "Inventory value", exact: true }).click();
    const valuePanel = page.getByRole("tabpanel", { name: "Inventory value", exact: true });
    const calculation = valuePanel.locator("summary", { hasText: "Calculation and data coverage" }).first();
    await calculation.click();
    await valuePanel.getByRole("button", { name: "Purchase price is missing. Open filament defaults", exact: true }).click();
    assert.deepEqual(await page.evaluate("statisticsLifecycle.targets()"), ["GROUP_PRICING"]);
    const trace = valuePanel.getByRole("button", { name: "Trace inventory value", exact: true });
    await trace.click();
    await valuePanel.getByText("Showing 2 of 2 available trace rows (2 total).", { exact: true }).waitFor();
    await tabs.getByRole("tab", { name: "Printers", exact: true }).click();
    await page.getByRole("tabpanel", { name: "Printers", exact: true }).getByRole("button", { name: /Atlas/ }).click();
    await page.getByRole("dialog", { name: /Consumption by filament · Atlas/ }).waitFor();
    assert.equal(await dialog.getByRole("combobox", { name: /^Vendor/ }).inputValue(), "Bambu Lab");
    await closeDialog(page);
    await tabs.getByRole("tab", { name: "Inventory value", exact: true }).click();
    assert.equal(await trace.getAttribute("aria-expanded"), "true");
    assert.equal(await calculation.locator("..").getAttribute("open"), "");
    await valuePanel.getByText("Showing 2 of 2 available trace rows (2 total).", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Start date", { exact: true }).inputValue(), "2026-09-01");
    assert.equal(await page.getByLabel("End date", { exact: true }).inputValue(), "2026-09-30");
    assert.equal(await page.getByRole("button", { name: "Custom range", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("group", { name: "Reporting period", exact: true }).locator("..").locator('[aria-live="polite"]').textContent(), appliedRange);
    assert.equal(periodCalls().length, appliedCallCount, "applied reporting period survives analysis navigation without a refetch");

    await tabs.getByRole("tab", { name: "Consumption", exact: true }).click();
    await openConsumption.click();
    assert.equal(await dialog.getByRole("combobox", { name: /^Vendor/ }).inputValue(), "Bambu Lab");
    await closeDialog(page);
    for (const [button, heading] of [
      [/^Logged Jobs/, "Logged jobs by printer"],
      [/^Failed Jobs/, "Failed jobs by printer"],
      [/^Active loaded slots/, "Active loaded slots"],
    ] as const) {
      await page.getByRole("button", { name: button }).click();
      await page.getByRole("dialog", { name: heading, exact: true }).waitFor();
      await closeDialog(page);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleIssues, []);
    assert.deepEqual(requests, [], "the fixture must never reach a Host, printer or external service");
  } finally {
    await context.close();
    await browser.close();
  }
});
