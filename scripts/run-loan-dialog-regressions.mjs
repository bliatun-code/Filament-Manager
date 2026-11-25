import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { require as requireTs } from "tsx/cjs/api";
import { mkdir } from "node:fs/promises";
import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";
import { cleanupVisualQaDatabase } from "./visual-qa-db.mjs";
import {
  buildUiBrowserPerformanceFixture,
  resolveUiBrowserPerformanceInvoke,
} from "./ui-browser-performance-probe.mjs";
import {
  createUiViteServer,
  installTauriFixtureBridge,
} from "./run-data-backed-accessibility.mjs";

// Real App, LoansPage and dialogs; only the native bridge is replaced. All data
// comes from the repository's generated synthetic database, never a user library.
function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function waitForStart(started) {
  let timer;
  try {
    await Promise.race([
      started.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Expected native call did not start")), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function loanFixture(base) {
  const fixture = structuredClone(base);
  fixture.spoolRows = ["a", "b"].map((id, index) => ({
    ...structuredClone(base.spoolRows[0]),
    spool: {
      ...base.spoolRows[0].spool,
      id: `dialog-spool-${id}`, status: "IN_STOCK", ownership_type: "OWNED",
      remaining_g: 500 - index * 200, current_weight_g: 500 - index * 200,
      spool_tare_weight_g: 200, location_id: `Test shelf ${id}`,
      deleted_at: null, archived_at: null,
    },
    master: { ...base.spoolRows[0].master, vendor: "Generic", filament_name: `Dialog ${id}` },
  }));
  fixture.printerRows = [];
  fixture.loanRows = ["OUTBOUND", "INBOUND"].map((direction) => ({
    ...structuredClone(base.loanRows[0]),
    spool_tare_weight_g: 200, spool_remaining_g: 300,
    loan: {
      ...base.loanRows[0].loan,
      id: `dialog-loan-${direction}`, spool_id: `dialog-return-${direction}`,
      loan_direction: direction, loan_status: "ACTIVE", returned_at: null,
      grams_out: 500, borrower_name: `Test ${direction}`, counterparty_name: `Test ${direction}`,
      expected_return_at: null,
    },
  }));
  fixture.activeLoanRows = fixture.loanRows;
  return fixture;
}

const { buildLoanableSpoolCandidates } = requireTs("../ui/src/lib/loan_out_data_source.ts", import.meta.url);
const { normalizeSpoolWithMasterRows } = requireTs("../ui/src/lib/spool_row_normalization.ts", import.meta.url);
const { filterLoanableSpoolsBySearch } = requireTs("../ui/src/lib/loan_out_candidate_model.ts", import.meta.url);

function resolveLoanDialogInvoke(fixture, command, payload) {
  if (command !== "get_loan_picker_page") return resolveUiBrowserPerformanceInvoke(fixture, command, payload);
  const { search, offset, selected_id } = payload.query;
  const candidates = buildLoanableSpoolCandidates(normalizeSpoolWithMasterRows(fixture.spoolRows), fixture.printerRows);
  const matches = filterLoanableSpoolsBySearch(candidates, search);
  const rows = matches.slice(offset, offset + 150);
  const selected = rows.some(row => row.id === selected_id) ? null : candidates.find(row => row.id === selected_id) ?? null;
  return { rows, selected, total: candidates.length, matches: matches.length, revisions: [1, 1, 1, 1] };
}

async function runCase(browser, url, base, name, check, direct) {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const fixture = loanFixture(base);
    const calls = [];
    const errors = [];
    const state = { invoke: null };
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("[loan-regression]")) {
        errors.push(message.text());
      }
    });
    await installTauriFixtureBridge(page, fixture, calls, (data, command, payload) => {
      if (state.invoke) return state.invoke(command, payload);
      return resolveLoanDialogInvoke(data, command, payload);
    });
    const openWorkspace = () => page.goto(`${url}/?bfm_locale=en&bfm_visual_qa=loans-overview`, { waitUntil: "domcontentloaded" });
    if (!direct) {
      await page.goto(`${url}/?bfm_locale=en`, { waitUntil: "domcontentloaded" });
      await page.getByRole("navigation", { name: "Navigation", exact: true }).getByRole("button", { name: "Inventory", exact: true }).click();
      await page.locator("#inventory-loans-tab").click();
      await page.getByRole("button", { name: /^Return ·/ }).waitFor();
    }
    const fallback = (command, payload) => resolveLoanDialogInvoke(fixture, command, payload);
    await check({ page, fixture, calls, state, fallback, openWorkspace });
    assert.deepEqual(errors, [], `${name}: unexpected browser errors`);
    process.stdout.write(`  Passed: ${name}\n`);
  } finally {
    await context.close();
  }
}

async function openLoanOut(page) {
  await page.getByRole("button", { name: "Loan out roll", exact: true }).click();
  return page.getByRole("dialog", { name: "Loan out roll" });
}

async function expectBadges(page, values) {
  for (const [id, count] of Object.entries(values)) {
    await page.locator(`#inventory-${id}-tab .inventory-workspace-count`).filter({ hasText: new RegExp(`^${count}$`) }).waitFor({state: id === "stock" ? "attached" : "visible"});
  }
}

function assertLoansOnly(calls) {
  const forbidden = ["list_spools", "fetch_library_sync_spools", "fetch_library_sync_spool_snapshot",
    "fetch_cached_library_sync_spools", "save_library_sync_spool_cache",
    "get_filament_standards", "fetch_library_sync_filament_standards", "get_default_purchase_currency"];
  assert.deepEqual(calls.filter(call => forbidden.includes(call.command)), []);
}

async function checkWorkspaceOffline({ page, state, fixture, calls, fallback, openWorkspace }) {
  const host = {mode: "CLIENT", library_id: "library-a", host_base_url: "https://host-a.invalid",
    client_auth_paired: true, target_generation: 7};
  const pending = deferred();
  const started = deferred();
  let current = host;
  let offline = false;
  state.invoke = (command, payload) => {
    switch (command) {
      case "get_library_sync_page_status": return current;
      case "get_loan_workspace_counts":
        assert.deepEqual(payload.target, {base_url: current.host_base_url, expected_library_id: current.library_id, target_generation: current.target_generation});
        if (current === host) { started.resolve(); return pending.promise; }
        return {stock: 10000, loans: 2, locations: 3, purchases: 0};
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans":
        if (offline) throw new Error("[loan-regression] Host offline");
        return fixture.loanRows.map(row => ({...row, loan: {...row.loan, borrower_name: "Old generation", counterparty_name: "Old generation"}}));
      case "fetch_cached_library_sync_loans":
      case "fetch_cached_library_sync_active_loans":
        return {captured_at: "2024-01-02T12:00:00Z", rows: fixture.loanRows};
      default: return fallback(command, payload);
    }
  };
  await openWorkspace();
  await waitForStart(started);
  await expectBadges(page, {stock: "–", loans: "–"});
  current = {...host, host_base_url: "https://host-b.invalid", library_id: "library-b", target_generation: 8};
  current = {...host, target_generation: 9};
  offline = true;
  pending.resolve({stock: 17, loans: 19, locations: 21, purchases: 23});
  await page.getByText(/Showing the last cached loan snapshot/).waitFor();
  await expectBadges(page, {stock: 10000, loans: 2, locations: 3, purchases: 0});
  await page.getByRole("button", {name: /^Return ·/}).waitFor();
  await page.getByRole("button", {name: /^Hand back ·/}).waitFor();
  assert.equal(await page.getByText("Old generation", {exact: true}).count(), 0);
  assertLoansOnly(calls);
}

async function checkStockCards({page, state, fixture, calls, fallback, openWorkspace}) {
  const target = {base_url: "https://cards.invalid", expected_library_id: "cards", target_generation: 3};
  const status = {mode:"CLIENT", host_base_url:target.base_url, library_id:"cards", target_generation:3,
    client_auth_paired:true};
  const first = fixture.spoolRows[0], later = fixture.spoolRows[1];
  const hidden = {...later, master: {...later.master, filament_name: "Hidden search match"}, spool: {...later.spool, id: "hidden-roll"}};
  const members = Array.from({length: 8}, (_, i) => ({...first, spool:{...first.spool,id:"card-member-" + i}}));
  const reads = [];
  let mode = "live";
  let revision = 1;
  let purchaseCount = 1;
  state.invoke = (command,payload) => {
    switch (command) {
      case "get_library_sync_page_status": return status;
      case "get_loan_workspace_counts": return {stock:10, locations:0, loans:2, purchases:0};
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans": return fixture.loanRows;
      case "fetch_library_sync_locations": return {rows:[], mutations_supported:true};
      case "fetch_library_sync_printer_overview":
      case "fetch_library_sync_wishlist_items": return [];
      case "fetch_library_sync_spool_snapshot":
        if (mode === "offline") throw Error("[loan-regression] Host disconnected");
        return {rows:[...members,later,hidden],captured_at:"2026-01-01"};
      case "fetch_cached_library_sync_spools":
        assert.deepEqual(payload.input,target);
        return {rows:[hidden],captured_at:"2026-01-01"};
      case "get_stock_purchase_count":
        assert.deepEqual(payload.target,target);
        return purchaseCount;
      case "get_stock_card_page": {
        assert.deepEqual(payload.target,target);
        if (mode === "legacy") return null;
        if (mode === "offline") throw Error("[loan-regression] Host disconnected");
        const {member_of,offset}=payload.query;
        reads.push(offset);
        const cards = offset === 1 && !member_of ? [{count:1,remaining:300,rows:[later]}] :
          [{count:8,remaining:4000,rows:member_of ? members.slice(offset) : members.slice(0,3)}];
        return {cards, total:10, visible:10, groups:3, borrowed:0, revisions:[revision,1]};
      }
      default: return fallback(command,payload);
    }
  };
  await openWorkspace();
  await expectBadges(page,{stock:10});
  await page.getByRole("button", {name:/^Return ·/}).waitFor();
  reads.length = 0;
  calls.length = 0;
  await page.locator("#inventory-stock-tab").click();
  const panel=page.locator("#inventory-stock-panel");
  await panel.getByText(/8 spools/).waitFor();
  await expectBadges(page, {purchases: 1});
  assert.equal(await panel.locator(".inventory-roll-row").count(),3);
  await panel.getByRole("button",{name:/Show all/}).click();
  await panel.locator(".inventory-roll-row").nth(7).waitFor();
  revision++;
  await panel.getByRole("button",{name:"Show more",exact:true}).click();
  await panel.locator(".inventory-roll-row").nth(7).waitFor({state:"detached"});
  await panel.getByRole("button",{name:"Show more",exact:true}).click();
  await panel.getByRole("heading",{name:/Dialog b/}).waitFor();
  assert.deepEqual(reads,[0,3,1,0,1]);
  assert.ok(!calls.some(c=>c.command==="fetch_library_sync_spool_snapshot"));
  await page.getByPlaceholder(/Search by material/i).fill("Hidden search match");
  await panel.getByRole("heading",{name:/Hidden search match/}).waitFor();
  assert.ok(calls.some(c=>c.command==="fetch_library_sync_spool_snapshot"));
  for (mode of ["legacy", "offline"]) {
    await openWorkspace();
    await expectBadges(page,{stock:10});
    await page.getByRole("button", {name:/^Return ·/}).waitFor();
    await page.locator("#inventory-stock-tab").click();
    await panel.getByRole("heading",{name:/Hidden search match/}).waitFor();
    assert.equal(await panel.locator(".inventory-product-card").count(), mode === "legacy" ? 3 : 1);
  }
  assert.ok(calls.some(c=>c.command==="fetch_cached_library_sync_spools"));
  mode = "live";
  purchaseCount++;
  await page.getByRole("button", {name: "Refresh", exact: true}).click();
  await expectBadges(page, {purchases: 2});
  assert.ok(!calls.some(c => c.command === "get_purchase_queue_page"));
}

async function checkLegacyLocation({ page, state, fixture, calls, fallback, openWorkspace }) {
  const location = { id: "shelf", name: "Legacy shelf", location_type: "GENERIC",
    linked_spool_count: 1, reference_count: 1, created_at: "", updated_at: "" };
  const target = { base_url: "https://legacy.invalid", expected_library_id: "legacy", target_generation: 4 };
  const status = { mode: "CLIENT", host_base_url: target.base_url, library_id: target.expected_library_id,
    target_generation: target.target_generation, client_auth_paired: true };
  fixture.spoolRows[0].spool.home_location_id = location.id;
  state.invoke = (command, payload) => {
    switch (command) {
      case "get_library_sync_page_status": return status;
      case "get_loan_workspace_counts": return { stock: 2, locations: 1, loans: 2, purchases: 0 };
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans": return fixture.loanRows;
      case "fetch_library_sync_locations": return { rows: [location], mutations_supported: true };
      case "get_location_spool_page":
        assert.deepEqual(payload.target, target);
        return null;
      case "fetch_library_sync_spool_snapshot":
        assert.deepEqual(payload.input, target);
        return { rows: fixture.spoolRows, captured_at: "2026-01-02" };
      default: return fallback(command, payload);
    }
  };
  await openWorkspace();
  await expectBadges(page, { stock: 2 });
  await page.locator("#inventory-locations-tab").click();
  const link = page.getByRole("button", { name: "Legacy shelf: 1 connected roll", exact: true });
  await link.waitFor();
  assertLoansOnly(calls);
  await link.click();
  const shelf = page.locator("#inventory-location-spools");
  await shelf.locator('[data-location-spool-id="dialog-spool-a"]').waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 1);
  assert.equal(calls.filter(call => call.command === "fetch_library_sync_spool_snapshot").length, 1);
  assert.equal(calls.filter(call => call.command === "get_cached_location_spool_page").length, 0);
}

async function checkLinkedLocations({ page, state, fixture, calls, fallback, openWorkspace }) {
  const host = { mode: "CLIENT", host_base_url: "https://a.invalid", library_id: "A",
    target_generation: 11, client_auth_paired: true };
  let current = host;
  const started = deferred(), response = deferred();
  const location = { id: "shelf", name: "Cached shelf", location_type: "GENERIC", linked_spool_count: 1,
    reference_count: 2, created_at: "", updated_at: "" };
  fixture.spoolRows[0].spool.home_location_id = location.id;
  state.invoke = (command, payload) => {
    switch (command) {
      case "get_library_sync_page_status": return current;
      case "get_loan_workspace_counts": return { stock: 2, loans: 2, locations: 1, purchases: 0 };
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans": return fixture.loanRows;
      case "fetch_library_sync_locations":
        assert.equal(payload.input.expected_target_generation, current.target_generation);
        if (current === host) { started.resolve(); return response.promise; }
        throw Error("[loan-regression] offline");
      case "fetch_cached_library_sync_locations":
        assert.equal(payload.input.target_generation, 13);
        return { rows: [location], captured_at: "2026-01-02", mutations_supported: false };
      case "get_location_spool_page": throw Error("[loan-regression] offline");
      case "get_cached_location_spool_page":
        assert.equal(payload.target.target_generation, 13);
        assert.equal(payload.query.location_id, location.id);
        return { rows: [fixture.spoolRows[0]], total: 1, matches: 1, revisions: [2, 1], captured_at: "2026-01-01" };
      case "validate_library_sync_host": return { reachable: false };
      default: return fallback(command, payload);
    }
  };
  await openWorkspace();
  await expectBadges(page, { stock: 2, loans: 2 });
  await page.locator("#inventory-locations-tab").click();
  await waitForStart(started);
  current = { ...host, host_base_url: "https://b.invalid", library_id: "B", target_generation: 12 };
  current = { ...host, target_generation: 13 };
  response.resolve({ rows: [{ ...location, name: "Stale shelf" }], mutations_supported: true });
  const link = page.getByRole("button", { name: "Cached shelf: 1 connected roll", exact: true });
  await link.waitFor();
  assert.equal(await page.getByText("Stale shelf", {exact: true}).count(), 0);
  assert.equal(await page.getByRole("button", {name: "Rename Cached shelf"}).count(), 0);
  await expectBadges(page, { stock: 2, loans: 2, locations: 1, purchases: 0 });
  assertLoansOnly(calls);
  await link.click();
  const shelf = page.locator("#inventory-location-spools");
  await shelf.locator('[data-location-spool-id="dialog-spool-a"]').waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 1);
  assert.ok(calls.some(call => call.command === "get_cached_location_spool_page"));
  await expectBadges(page, { stock: 2, loans: 2, locations: 1, purchases: 0 });
  assertLoansOnly(calls);
}

async function checkLocationPages({ page, state, fixture, calls, fallback, openWorkspace }) {
  const count = 103;
  const host = { mode: "CLIENT", host_base_url: "https://a.invalid", library_id: "A",
    target_generation: 1, client_auth_paired: true };
  let current = host;
  let revision = 1;
  let disconnected = false;
  let hasCache = true;
  const started = deferred(), latePage = deferred();
  const location = { id: "shelf", name: "Side shelf", location_type: "GENERIC",
    linked_spool_count: count, reference_count: count, created_at: "", updated_at: "" };
  const rows = Array.from({ length: count }, (_, index) => {
    const base = fixture.spoolRows[0];
    return {
      ...base, spool: { ...base.spool, id: `linked-${index}`, location_id: location.id },
      master: { ...base.master, filament_name: `Shelf spool ${index}` },
    };
  });
  const queries = [];
  state.invoke = (command, payload) => {
    switch (command) {
      case "get_library_sync_page_status": return current;
      case "get_loan_workspace_counts": return { stock: 10000, loans: 2, locations: 1, purchases: 0 };
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans": return fixture.loanRows;
      case "fetch_library_sync_locations": return { rows: [location], mutations_supported: true };
      case "get_location_spool_page": {
        const { query, target } = payload;
        assert.equal(query.location_id, location.id);
        assert.deepEqual(target, { base_url: current.host_base_url, expected_library_id: current.library_id,
          target_generation: current.target_generation });
        queries.push({ ...query });
        if (disconnected) throw Error("[loan-regression] connection interrupted");
        if (query.search === "delayed") { started.resolve(); return latePage.promise; }
        const found = rows.filter(row => row.master.filament_name.includes(query.search));
        return { rows: found.slice(query.offset, query.offset + 100), total: count, matches: found.length,
          revisions: [revision, 1] };
      }
      case "get_cached_location_spool_page": {
        assert.equal(payload.target.target_generation, 3);
        if (!hasCache) return null;
        const saved = { ...rows[0], spool: { ...rows[0].spool, id: "saved-shelf-roll" } };
        return { rows: payload.query.offset === 0 ? [saved] : [], total: 1, matches: 1,
          revisions: [2, 8], captured_at: "2026-01-02" };
      }
      default: return fallback(command, payload);
    }
  };
  await openWorkspace();
  await expectBadges(page, { stock: 10000 });
  await page.locator("#inventory-locations-tab").click();
  const link = page.getByRole("button", { name: "Side shelf: 103 connected rolls", exact: true });
  await link.click();
  const shelf = page.locator("#inventory-location-spools");
  const row = id => shelf.locator(`[data-location-spool-id="${id}"]`);
  await row("linked-99").waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 100);
  const more = shelf.getByRole("button", { name: "Show more" });
  revision++;
  rows[0].spool.id = "first-after-stock-change";
  await more.click();
  // A changed library must restart at the beginning before exposing the next page.
  await row("first-after-stock-change").waitFor();
  await more.click();
  await row("linked-102").waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 103);
  assert.deepEqual(queries.map(query => query.offset), [0, 100, 0, 100]);
  const search = shelf.getByRole("searchbox");
  await search.fill("spool 102");
  await row("first-after-stock-change").waitFor({ state: "detached" });
  await row("linked-102").waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 1);
  await search.fill("no such roll");
  await shelf.locator('[data-location-spool-id]').first().waitFor({ state: "detached" });
  await page.locator('[data-location-spool-matches="0"]').waitFor();
  await search.fill("delayed");
  await waitForStart(started);
  await page.evaluate(() => {
    window.staleShelfRowSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-location-spool-id="stale-generation"]')) window.staleShelfRowSeen = true;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  current = { ...host, library_id: "B", host_base_url: "https://b.invalid", target_generation: 2 };
  current = { ...host, target_generation: 3 };
  latePage.resolve({ rows: [{ ...rows[0], spool: { ...rows[0].spool, id: "stale-generation" } }],
    matches: 1, total: 1, revisions: [1, 1] });
  await link.waitFor();
  await link.click();
  await row("linked-99").waitFor();
  assert.equal(await page.evaluate(() => window.staleShelfRowSeen), false);
  await expectBadges(page, { stock: 10000, loans: 2, locations: 1, purchases: 0 });
  disconnected = true;
  await more.click();
  await row("saved-shelf-roll").waitFor();
  await shelf.getByText(/Showing the last cached inventory snapshot/).waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 1);
  hasCache = false;
  await shelf.getByRole("button", { name: "Refresh" }).click();
  await shelf.getByText(/no cached inventory snapshot/i).waitFor();
  assert.equal(await shelf.locator("[data-location-spool-id]").count(), 0);
  assert.equal(await shelf.getByText("No connected rolls", { exact: true }).count(), 0);
  assertLoansOnly(calls);
}

async function checkLocationRollHandoff({ page, state, fixture, calls, fallback, openWorkspace }) {
  const host = { mode: "CLIENT", host_base_url: "http://shelf-a.local:4278", library_id: "A",
    target_generation: 21, client_auth_paired: true };
  let current = host;
  const location = { id: "handoff-shelf", name: "Handoff shelf", location_type: "GENERIC",
    linked_spool_count: 1, reference_count: 1, created_at: "", updated_at: "" };
  const reviewed = fixture.spoolRows[0];
  reviewed.spool.home_location_id = location.id;
  const replacement = structuredClone(reviewed);
  replacement.master.filament_name = "New generation roll";
  const started = deferred(), response = deferred();
  let delayRead = false;
  const snapshots = [];
  const detailReads = [];
  state.invoke = (command, payload) => {
    switch (command) {
      case "get_library_sync_page_status": return current;
      case "get_loan_workspace_counts": return { stock: 1, loans: 2, purchases: 0, locations: 1 };
      case "fetch_library_sync_locations": return { rows: [location], mutations_supported: true };
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans": return fixture.loanRows;
      case "fetch_library_sync_printer_overview": return [];
      case "fetch_library_sync_wishlist_items": return [];
      case "get_location_spool_page": return { rows: [reviewed], total: 1, matches: 1, revisions: [1, 1] };
      case "fetch_library_sync_spool_snapshot": {
        const generation = payload.input.target_generation;
        snapshots.push(generation);
        if (delayRead && generation === host.target_generation) {
          started.resolve();
          return response.promise;
        }
        const roll = generation === host.target_generation ? reviewed : replacement;
        return { rows: [roll], captured_at: "2026-01-01" };
      }
      case "fetch_library_sync_spool_detail":
        detailReads.push(payload.input.spool_id);
        return { spool: reviewed, history: [], usage: [] };
      default: return fallback(command, payload);
    }
  };
  const link = page.getByRole("button", { name: "Handoff shelf: 1 connected roll", exact: true });
  const panel = page.locator("#inventory-location-spools");
  const roll = panel.locator('[data-location-spool-id="dialog-spool-a"]');
  const openShelf = async () => {
    await openWorkspace();
    await expectBadges(page, { stock: 1 });
    await page.locator("#inventory-locations-tab").click();
    await link.press("Enter");
    await roll.waitFor();
  };

  await openShelf();
  await panel.getByRole("button", { name: "Back", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Handoff shelf: 1 connected roll");
  await link.press("Enter");
  await roll.waitFor();
  assertLoansOnly(calls);
  await roll.click();
  await page.getByRole("dialog", { name: /Selected roll:.*Dialog a/ }).waitFor();
  assert.equal(await page.locator("#inventory-stock-tab").getAttribute("aria-pressed"), "true");
  assert.deepEqual(snapshots, [21]);

  await openShelf();
  detailReads.length = 0;
  delayRead = true;
  await page.evaluate(() => {
    window.locationDetailOpened = false;
    new MutationObserver(() => {
      if (document.querySelector('[role="dialog"]')) window.locationDetailOpened = true;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  await roll.click();
  await waitForStart(started);
  current = { ...host, host_base_url: "http://shelf-b.local:4278", library_id: "B", target_generation: 22 };
  current = { ...host, target_generation: 23 };
  response.resolve({ rows: [reviewed], captured_at: "2026-01-01" });
  // The new generation has the same spool ID and placement. Rendering it in regular
  // stock proves the refresh completed before we assert that the old click was dropped.
  await page.getByRole("heading", { name: /New generation roll/ }).waitFor();
  assert.equal(await page.evaluate(() => window.locationDetailOpened), false);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator("#inventory-location-filter-chip").count(), 0);
  assert.deepEqual(detailReads, []);
  assert.deepEqual(snapshots, [21, 21, 23]);
}

async function checkWorkspaceWrites({ page, state, fixture, calls, fallback, openWorkspace }) {
  fixture.loanRows = fixture.loanRows.filter(row => row.loan.loan_direction === "INBOUND");
  fixture.activeLoanRows = fixture.loanRows;
  fixture.spoolRows[0].spool.ownership_type = "BORROWED_IN";
  const source = fixture.loanRows[0];
  state.invoke = (command, payload) => {
    if (command === "lend_spool") {
      const input = payload.input;
      const loan = {...source, loan: {...source.loan, id: "new-loan", spool_id: input.spool_id,
        borrower_name: input.borrower_name, counterparty_name: input.borrower_name, loan_direction: "OUTBOUND"}};
      fixture.loanRows = [loan, source];
      fixture.activeLoanRows = fixture.loanRows;
      return loan;
    }
    if (command === "return_spool_loan") {
      fixture.loanRows[0].loan.returned_at = "2025-01-02T12:00:00Z";
      fixture.activeLoanRows = [source];
      return fixture.loanRows[0];
    }
    if (["list_spool_history", "list_spool_usage"].includes(command)) return [];
    return fallback(command, payload);
  };
  await openWorkspace();
  await expectBadges(page, {stock: 2, loans: 1, locations: 0, purchases: fixture.wishlistRows.length});
  const dialog = await openLoanOut(page);
  await dialog.getByLabel("Borrower name", {exact: true}).fill("Badge test");
  await dialog.getByRole("button", {name: "Loan out roll", exact: true}).click();
  await expectBadges(page, {stock: 2, loans: 2});
  await page.getByRole("button", {name: /^Return ·/}).click();
  await page.getByRole("button", {name: "Confirm return", exact: true}).click();
  await expectBadges(page, {stock: 2, loans: 1});
  assert.equal(await page.getByRole("button", {name: /^Return ·/}).count(), 0);
  assertLoansOnly(calls);

  await page.getByRole("button", {name: "All", exact: true}).last().click();
  const row = page.getByRole("row").filter({hasText: "Badge test"});
  await row.locator("summary").click();
  fixture.trustedLanStatus = {...fixture.trustedLanStatus, local_name_running: true, shell_url: "http://fixture.local:4278/companion"};
  await row.getByRole("button", {name: "Open roll"}).click();
  await page.getByRole("dialog", {name: /Selected roll:.*Dialog b/}).waitFor();
  assert.equal(await page.locator("#inventory-stock-tab").getAttribute("aria-pressed"), "true");
  assert.ok(calls.some(call => call.command === "list_spools"));
}

async function checkReopen({ page, fixture, calls, state, fallback }) {
  let dialog = await openLoanOut(page);
  await dialog.getByRole("spinbutton", { name: "Measured total weight (g)" }).fill("600");
  assert.match(await dialog.locator("#loan-out-weight-preview").innerText(), /600 g\s*−\s*200 g\s*=\s*400 g/);
  await dialog.getByLabel("Borrower name", { exact: true }).fill("Old borrower");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  fixture.printerRows = [{ printer: { id: "test-printer" }, slots: [{ spool_id: "dialog-spool-a" }] }];
  fixture.spoolRows[0].spool.remaining_g = 300;
  state.invoke = (command, payload) => {
    if (command === "get_loan_picker_page") throw new Error("[loan-regression] picker failed");
    return fallback(command, payload);
  };
  dialog = await openLoanOut(page);
  await dialog.getByText("Failed to load inventory.", { exact: true }).waitFor();
  assert.equal(await dialog.getByRole("spinbutton").count(), 0, "Failed reopen must discard the old draft");
  assert.match(await dialog.getByRole("alert").innerText(), /Failed to load inventory/);
  assert.equal(await dialog.getByRole("button", { name: "Loan out roll", exact: true }).count(), 0);
  assert.doesNotMatch(await dialog.innerText(), /No rolls are currently available/, "Failure is not an empty inventory");
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 0);
  state.invoke = null;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await dialog.getByRole("spinbutton").waitFor();
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "500");
  assert.equal(await dialog.getByLabel("Borrower name", { exact: true }).inputValue(), "");
  assert.doesNotMatch(await dialog.innerText(), /Test shelf a/);
  await dialog.getByLabel("Borrower name", { exact: true }).fill("New borrower");
  state.invoke = (command, payload) => {
    if (command === "lend_spool") throw new Error("[loan-regression] loan rejected");
    return fallback(command, payload);
  };
  await dialog.getByRole("button", { name: "Loan out roll", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  const writes = calls.filter(({ command }) => command === "lend_spool");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.input.spool_id, "dialog-spool-b");
  assert.equal(writes[0].payload.input.grams_out, 300);
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "500");
  assert.equal(await dialog.getByLabel("Borrower name", { exact: true }).inputValue(), "New borrower");
}

async function checkVisibleValidation({ page, calls }) {
  await page.setViewportSize({ width: 856, height: 700 });
  const dialog = await openLoanOut(page);
  const submit = dialog.getByRole("button", { name: "Loan out roll", exact: true });
  await submit.click();
  const borrower = dialog.getByLabel("Borrower name", { exact: true });
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-invalid") === "true");
  assert.equal(await borrower.evaluate((input) => input === document.activeElement), true);
  const alert = dialog.getByRole("alert");
  assert.match(await alert.innerText(), /Borrower name is required/);
  assert.equal(await alert.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }), true);
  assert.equal(await borrower.getAttribute("aria-describedby"), await alert.getAttribute("id"));
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 0);
  await borrower.fill("Valid borrower");
  assert.equal(await borrower.getAttribute("aria-invalid"), null);
  assert.equal(await alert.count(), 0);
}

async function checkLateLoad({ page, fixture, state, fallback }) {
  const pending = deferred();
  const started = deferred();
  let oldPage;
  state.invoke = (command, payload) => {
    if (command === "get_loan_picker_page") { oldPage = fallback(command, payload); started.resolve(); return pending.promise; }
    return fallback(command, payload);
  };
  let dialog = await openLoanOut(page);
  await waitForStart(started);
  assert.equal(await dialog.getByRole("spinbutton").count(), 0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  fixture.spoolRows = [fixture.spoolRows[1]];
  state.invoke = null;
  dialog = await openLoanOut(page);
  await dialog.getByRole("spinbutton").fill("450");
  pending.resolve(oldPage);
  // A bridge round trip followed by paint drains the old request's continuation.
  await page.evaluate(async () => {
    await window.__TAURI__.invoke("list_printer_overview");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "450");
  assert.doesNotMatch(await dialog.innerText(), /Test shelf a/);
}

async function checkLendPending({ page, calls, state, fallback }) {
  const pending = deferred();
  const started = deferred();
  const dialog = await openLoanOut(page);
  await dialog.getByLabel("Borrower name", { exact: true }).fill("Test borrower");
  const submit = dialog.getByRole("button", { name: "Loan out roll", exact: true });
  for (const weight of ["", "2.5", "1e3", "9007199254740992"]) {
    await dialog.getByRole("spinbutton").fill(weight);
    await submit.click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 0, weight);
  }
  await dialog.getByRole("spinbutton").fill("600");
  state.invoke = (command, payload) => {
    if (command === "lend_spool") { started.resolve(); return pending.promise; }
    if (command === "list_spool_loans") throw new Error("[loan-regression] refresh failed after save");
    return fallback(command, payload);
  };
  await submit.evaluate((button) => { button.click(); button.click(); });
  await waitForStart(started);
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[type="number"]')?.disabled);
  assert.equal(await submit.isDisabled(), true);
  assert.equal(await dialog.getByLabel("Borrower name", { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).isDisabled(), true);
  await dialog.press("Escape");
  await page.locator(".app-modal-overlay").click({ position: { x: 2, y: 2 } });
  assert.equal(await dialog.count(), 1);
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 1);
  pending.resolve({ id: "saved-loan" });
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Failed to load loan data.", { exact: true }).waitFor();
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 1);
}

async function checkReturn({ page, calls, state, fallback }, inbound) {
  const command = inbound ? "return_inbound_spool_loan" : "return_spool_loan";
  await page.getByRole("button", { name: inbound ? /^Hand back ·/ : /^Return ·/ }).click();
  const dialog = page.getByRole("dialog");
  const grams = dialog.getByRole("spinbutton");
  const note = dialog.getByLabel("Return note (optional)");
  const submit = dialog.getByRole("button", { name: inbound ? "Confirm hand-back" : "Confirm return", exact: true });
  await note.fill("Keep my return note");
  for (const weight of ["", "2.5", "1e3", "9007199254740992"]) {
    await grams.fill(weight);
    await submit.click();
    await dialog.getByRole("alert").waitFor();
    assert.match(await dialog.getByRole("alert").innerText(), /Returned grams/);
    assert.equal(await note.inputValue(), "Keep my return note");
    assert.equal(calls.filter((call) => call.command === command).length, 0);
  }
  await grams.fill("450");
  state.invoke = (name, payload) => {
    if (name === command) throw new Error("[loan-regression] return rejected");
    return fallback(name, payload);
  };
  await submit.click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent?.startsWith("Failed"));
  assert.match(await dialog.getByRole("alert").innerText(), inbound ? /Failed to hand back/ : /Failed to return/);
  assert.equal(await grams.inputValue(), "450");
  assert.equal(await note.inputValue(), "Keep my return note");
  const writes = calls.filter((call) => call.command === command);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].payload.input, {
    loan_id: `dialog-loan-${inbound ? "INBOUND" : "OUTBOUND"}`,
    returned_grams: 250, note: "Keep my return note",
  });
  const pending = deferred();
  const started = deferred();
  state.invoke = (name, payload) => {
    if (name === command) { started.resolve(); return pending.promise; }
    if (name === "list_spool_loans") throw new Error("[loan-regression] refresh failed after return");
    return fallback(name, payload);
  };
  await submit.evaluate((button) => { button.click(); button.click(); });
  await waitForStart(started);
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[type="number"]')?.disabled);
  assert.equal(await note.isDisabled(), true);
  for (const close of await dialog.getByRole("button", { name: "Close", exact: true }).all()) {
    assert.equal(await close.isDisabled(), true);
  }
  await dialog.press("Escape");
  await page.locator(".app-modal-overlay").click({ position: { x: 2, y: 2 } });
  assert.equal(await dialog.count(), 1);
  assert.equal(calls.filter((call) => call.command === command).length, 2);
  pending.resolve({ id: "saved-return" });
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Failed to load loan data.", { exact: true }).waitFor();
  assert.equal(calls.filter((call) => call.command === command).length, 2);
}

async function checkPairedDialogTargets({ page, fixture, calls, state, fallback }) {
  await page.locator("#inventory-stock-tab").click();
  await page.getByRole("button", { name: /^Return ·/ }).waitFor({ state: "detached" });
  const hostA = { mode: "CLIENT", library_id: "library-a", host_base_url: "https://host-a.invalid",
    client_auth_paired: true, target_generation: 1 };
  let current = hostA;
  const writes = [];
  state.invoke = (command, payload) => {
    switch (command) {
      case "get_library_sync_page_status": return current;
      case "fetch_library_sync_loans":
      case "fetch_library_sync_active_loans": return fixture.loanRows;
      case "fetch_cached_library_sync_loans":
      case "fetch_cached_library_sync_active_loans": return null;
      case "fetch_library_sync_printer_overview": return fixture.printerRows;
      case "get_loan_picker_page": return null; // Older Host
      case "fetch_library_sync_spool_snapshot": return { rows: fixture.spoolRows, captured_at: null };
      case "lend_library_sync_host_spool":
      case "return_library_sync_host_loan": {
        const input = payload.input;
        assert.equal(input.base_url, hostA.host_base_url);
        assert.equal(input.expected_library_id, hostA.library_id);
        if (input.expected_target_generation !== current.target_generation) {
          throw new Error("[loan-regression] superseded dialog");
        }
        writes.push(command);
        return null;
      }
      default: return fallback(command, payload);
    }
  };
  await page.locator("#inventory-loans-tab").click();
  for (const action of ["lend", "return", "hand-back"]) {
    const lend = action === "lend";
    const inbound = action === "hand-back";
    const command = lend ? "lend_library_sync_host_spool" : "return_library_sync_host_loan";
    const attempts = () => calls.filter(call => call.command === command);
    const initialAttempts = attempts().length;
    const initialWrites = writes.length;
    for (const stale of [true, false]) {
      const reviewed = current.target_generation;
      await page.getByRole("button", { name: /^Return ·/ }).waitFor();
      const open = page.getByRole("button", { name: lend ? "Loan out roll" : inbound ? /^Hand back ·/ : /^Return ·/, exact: true });
      await open.click();
      const dialog = page.getByRole("dialog");
      if (lend) await dialog.getByLabel("Borrower name", { exact: true }).fill("Test borrower");
      await dialog.getByRole("spinbutton").fill("450");
      if (stale) {
        current = { ...hostA, host_base_url: "https://host-b.invalid", library_id: "library-b", target_generation: reviewed + 1 };
        current = { ...hostA, target_generation: current.target_generation + 1 };
      }
      const confirm = dialog.getByRole("button", { name: lend ? "Loan out roll" : inbound ? "Confirm hand-back" : "Confirm return", exact: true });
      await confirm.evaluate(button => { button.click(); button.click(); });
      if (stale) {
        await dialog.getByRole("alert").waitFor();
        assert.equal(writes.length, initialWrites);
        await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
      }
      await dialog.waitFor({ state: "hidden" });
      const submitted = attempts();
      assert.equal(submitted.length, initialAttempts + (stale ? 1 : 2));
      const input = submitted.at(-1).payload.input;
      assert.equal(input.expected_target_generation, reviewed);
      if (!lend) assert.equal(input.inbound, inbound);
    }
    assert.equal(writes.length, initialWrites + 1);
  }
  assert.ok(!calls.some(({ command }) => ["lend_spool", "return_spool_loan", "return_inbound_spool_loan"].includes(command)));
}

async function checkPagedLoanPicker({ page, fixture, state, calls, fallback }) {
  const [first, preferred] = fixture.spoolRows;
  fixture.trustedLanStatus = { ...fixture.trustedLanStatus, local_name_running: true, shell_url: "http://fixture.local:4278/companion" };
  state.invoke = (command, payload) => {
    if (["list_spool_history", "list_spool_usage"].includes(command)) return [];
    return fallback(command, payload);
  };
  await page.locator("#inventory-stock-tab").click();
  await page.getByRole("button", { name: /#pool-b/ }).filter({ visible: true }).click();
  const open = page.getByRole("button", { name: "Loan out", exact: true });
  await open.waitFor();

  // Inventory reviewed two rolls. More stock has since arrived ahead of its selection.
  const additions = Array.from({ length: 9998 }, (_, i) => ({
    ...first, spool: { ...first.spool, id: `extra-${i + 1}` },
  }));
  fixture.spoolRows = [first, ...additions, preferred];
  const started = deferred();
  const late = deferred();
  let revision = 1;
  const pickerQueries = [];
  state.invoke = (command, payload) => {
    if (command !== "get_loan_picker_page") return fallback(command, payload);
    pickerQueries.push(payload.query);
    if (payload.query.search === "slow") {
      started.resolve();
      return late.promise;
    }
    if (payload.query.search === "offline") throw new Error("[loan-regression] picker offline");
    return { ...fallback(command, payload), revisions: [revision, 1, 1, 1] };
  };
  const firstCall = calls.length;
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Loan out roll" });
  const group = dialog.getByRole("group", { name: "Available to loan" });
  const rows = group.locator("button[aria-pressed]");
  await group.getByRole("button", { pressed: true }).waitFor();
  assert.equal(pickerQueries[0].selected_id, preferred.spool.id);
  await dialog.getByText("10,000 rolls", { exact: true }).waitFor();
  assert.equal(await rows.count(), 151);
  assert.match(await group.getByRole("button", { pressed: true }).innerText(), /#pool-b/);
  await dialog.getByRole("spinbutton").fill("411");

  assert.ok(pickerQueries.every(q => q.offset === 0 && q.selected_id === preferred.spool.id));
  const initialReads = pickerQueries.length;
  const more = dialog.getByRole("button", { name: /Show more/ });
  await more.click();
  await rows.nth(300).waitFor();
  assert.deepEqual(pickerQueries.slice(initialReads).map(q => q.offset), [150]);
  revision++;
  await more.click();
  await rows.nth(151).waitFor({ state: "detached" });
  await rows.nth(150).waitFor();
  assert.deepEqual(pickerQueries.slice(initialReads).map(q => q.offset), [150, 300, 0]);
  assert.equal(await rows.count(), 151);

  const search = dialog.getByRole("searchbox");
  await search.fill("slow");
  await waitForStart(started);
  assert.equal(await rows.first().isDisabled(), true);
  await search.fill("#pool-b Generic");
  await dialog.getByText("1 of 10,000 rolls", { exact: true }).waitFor();
  late.resolve({ rows: [], total: 0, matches: 0, selected: null, revisions: [1, 1, 1, 1] });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await rows.count(), 1);
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "411");
  assert.match(await group.getByRole("button", { pressed: true }).innerText(), /#pool-b/);

  await search.fill("offline");
  await dialog.getByRole("alert").waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Loan out roll", exact: true }).count(), 0);
  assert.ok(!calls.slice(firstCall).some(({ command }) =>
    command.includes("cached") || ["list_spools", "list_printer_overview", "lend_spool"].includes(command)));
}

async function checkScrollableLoanForm({ page, fixture }) {
  fixture.spoolRows.push(...Array.from({ length: 40 }, (_, index) => ({
    ...structuredClone(fixture.spoolRows[0]),
    spool: { ...fixture.spoolRows[0].spool, id: `scroll-spool-${index}` },
  })));
  for (const row of fixture.spoolRows) row.master.filament_name = "PLA Silk Multi-Color · Dawn Radiance (13912) — long selection preview";
  const engine = process.env.LOAN_QA_BROWSER || "chromium";
  const out = resolve("release-artifacts/visual-qa/loan-scroll", engine);
  await mkdir(out, { recursive: true });
  for (const [width, height] of [[1440, 650], [1024, 650], [780, 650], [390, 720]]) {
    await page.setViewportSize({ width, height });
    const dialog = await openLoanOut(page);
    const save = dialog.getByRole("button", { name: "Loan out roll", exact: true });
    await dialog.getByLabel("Borrower name", { exact: true }).waitFor();
    const scrollArea = await save.evaluate(button => {
      for (let node = button.parentElement; node; node = node.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) {
          const rect = node.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    });
    assert.ok(scrollArea, `${width}x${height}: the clipped loan form needs a reachable scroll container`);
    await page.mouse.move(scrollArea.x, scrollArea.y);
    await page.mouse.wheel(0, 5000);
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('[role="dialog"] button')].find(node => node.textContent.trim() === "Loan out roll");
      const rect = button?.getBoundingClientRect();
      return rect && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    const reachable = await save.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === button || button.contains(hit);
    });
    assert.ok(reachable, `${width}x${height}: the save action must not remain clipped behind the panel`);
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    const box = await close.boundingBox();assert.ok(box.y >= 0 && box.y + box.height <= height);
    await page.screenshot({ path: resolve(out, `${width}x${height}.png`) });
    await close.click();await dialog.waitFor({ state: "hidden" });
  }
}

async function main() {
  const generated = createVisualQaFixture();
  let server;
  let browser;
  try {
    const fixture = buildUiBrowserPerformanceFixture(generated.outputPath);
    server = await createUiViteServer({
      configFile: resolve("ui", "vite.config.ts"), root: resolve("ui"), logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: false, forwardConsole: false },
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    const engine = process.env.LOAN_QA_BROWSER || "chromium";
    assert.ok(["chromium", "webkit"].includes(engine));
    browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
    const failures = [];
    for (const [name, check, direct] of [
      ["loan workspace badges and stock on demand after lending and returning", checkWorkspaceWrites, true],
      ["Locations rejects an A–B–A read and opens the linked offline rolls on click", checkLinkedLocations, true],
      ["Location pages and search stay within the shelf and reject an old Host generation", checkLocationPages, true],
      ["A shelf roll opens its detail only on the reviewed Host generation", checkLocationRollHandoff, true],
      ["Stock cards read group totals, more members and more groups before a whole-library search", checkStockCards, true],
      ["An older Host supplies the complete stock for the selected location on demand", checkLegacyLocation, true],
      ["offline loan rows and badges reject a late A–B–A read", checkWorkspaceOffline, true],
      ["inventory selection, paged search, changing stock and interrupted reads", checkPagedLoanPicker],
      ["loan form remains scrollable with 42 rolls and a short window", checkScrollableLoanForm],
      ["paired loan dialogs keep the reviewed target through A–B–A and recover on reopen", checkPairedDialogTargets],
      ["failed reopen clears old selection; retry uses current assignments", checkReopen],
      ["narrow validation focuses the invalid field and shows its message", checkVisibleValidation],
      ["late load cannot overwrite a newly opened draft", checkLateLoad],
      ["lend validation, single submission and refresh failure", checkLendPending],
      ["outbound return errors, draft retention and single submission", (ctx) => checkReturn(ctx, false)],
      ["inbound hand-back errors, draft retention and single submission", (ctx) => checkReturn(ctx, true)],
    ]) {
      try {
        await runCase(browser, url, fixture, name, check, direct);
      } catch (error) {
        console.error(`  Failed: ${name}
${error.stack ?? error}`);
        failures.push(new Error(name, { cause: error }));
      }
    }
    if (failures.length) throw new AggregateError(failures, "Loan dialog regressions failed");
  } finally {
    try { await browser?.close(); }
    finally {
      try { await server?.close(); }
      finally { cleanupVisualQaDatabase(generated.outputPath); }
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
