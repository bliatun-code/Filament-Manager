import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build, preview } from "vite";
import { createVisualQaFixture } from "../../../scripts/create-visual-qa-fixture.mjs";
import { buildUiBrowserPerformanceFixture, resolveUiBrowserPerformanceInvoke } from "../../../scripts/ui-browser-performance-probe.mjs";
import type { WishlistItemRow, WishlistPurchaseTarget } from "../lib/tauri_client";

type CreatePayload = Pick<WishlistItemRow, "master_id" | "material" | "filament_name" | "color_name" | "vendor" | "quantity" | "note"> & {
  expected_library_id: string;
  expected_target_generation: number;
  target_generation?: number;
  item_id?: string;
};

test("Dashboard purchase handoff stays with the reviewed library", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dashboard-purchase-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = buildUiBrowserPerformanceFixture(createVisualQaFixture({ outputPath: join(dir, "qa.db") }).outputPath);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const config = { root, build: { outDir: join(dir, "dist") }, logLevel: "error" as const };
  await build(config);
  const server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const origin: WishlistPurchaseTarget = {
    mode: "CLIENT", host_base_url: "http://host-a.test", library_id: "library-a", target_generation: 1,
  };
  const replacement = { ...origin, host_base_url: "http://host-b.test", library_id: "library-b", target_generation: 2 };
  const backToA = { ...origin, target_generation: 3 };

  for (const scenario of ["switch after save", "A–B–A after save", "switch on arrival", "A–B–A on arrival", "offline return", "switch before offline return",
    "refresh cached queue", "refresh without a saved queue", "switch during queue read", "A–B–A during cached read", "receive and open stock"] as const) {
    await t.test(scenario, async () => {
      const page = await browser.newPage();
      try {
        let target = origin;
        let offline = false;
        let queueOffline = scenario === "refresh cached queue" || scenario === "refresh without a saved queue" || scenario === "A–B–A during cached read";
        let received = false;
        let afterClick = false;
        let arrivalRead = false;
        let checkedAfterSave = false;
        const calls: string[] = [];
        const saved: WishlistItemRow[] = [];
        const row = (name: string) => {
          const sample = structuredClone(fixture.spoolRows[0]);
          Object.assign(sample.spool, { id: name, master_id: name, current_weight_g: 20, remaining_g: 20 });
          Object.assign(sample.master, { id: name, filament_name: name });
          return sample;
        };
        await page.exposeFunction("purchaseInvoke", async (cmd: string, args: { input?: CreatePayload } = {}) => {
          if (afterClick) calls.push(cmd);
          if (cmd === "get_library_sync_page_status" && saved.length) {
            if (checkedAfterSave && !arrivalRead) {
              if (scenario === "switch on arrival") target = replacement;
              if (scenario === "A–B–A on arrival") target = backToA;
            }
            arrivalRead ||= checkedAfterSave;
            checkedAfterSave = true;
          }
          const rows = [row(target === origin ? "Purchased roll" : "Replacement roll"), row("Other roll")];
          if (received) rows.push(row("Delivered roll"));
          const status = { ...target, client_auth_paired: true, host_device_name: target.library_id };
          const snapshot = { library_id: target.library_id, device_name: target.library_id, captured_at: "2026-11-01 10:00:00",
            total_spools: 2, low_stock: 2, in_use: 0, active_loans: 0, printers: 0 };
          if (offline && cmd.startsWith("fetch_library_sync_")) throw new Error("Host offline");
          switch (cmd) {
            case "get_library_sync_page_status": return status;
            case "get_library_sync_settings": return {
              ...status, cached_snapshot: snapshot, cached_spools: { rows, captured_at: snapshot.captured_at },
              cached_wishlist: { rows: [], captured_at: snapshot.captured_at },
            };
            case "fetch_library_sync_snapshot": return snapshot;
            case "fetch_library_sync_spool_detail": return { spool: rows[0], history: [], usage: [] };
            case "fetch_library_sync_spool_snapshot": return { rows, captured_at: snapshot.captured_at };
            case "fetch_library_sync_wishlist_items": {
              if (!saved.length) return [];
              if (target !== origin) return [{ ...saved[0], filament_name: "Replacement purchase" }];
              if (scenario === "switch during queue read") {
                assert.equal(args.input?.expected_target_generation, origin.target_generation);
                target = replacement;
                return [{ ...saved[0], filament_name: "Obsolete purchase" }];
              }
              if (queueOffline) throw new Error("Host offline");
              if (scenario === "refresh without a saved queue") return [];
              return saved;
            }
            case "validate_library_sync_host": return { reachable: !queueOffline, matches_library_id: true, pairing_checked: true, pairing_valid: true };
            case "fetch_cached_library_sync_wishlist":
              assert.equal(args.input?.expected_library_id, origin.library_id);
              assert.equal(args.input.target_generation, origin.target_generation);
              if (scenario === "A–B–A during cached read") {
                target = replacement;
                target = backToA;
                return { rows: [{ ...saved[0], filament_name: "Obsolete purchase" }], captured_at: snapshot.captured_at };
              }
              if (scenario === "refresh without a saved queue") return null;
              return { rows: [{ ...saved[0], filament_name: "Cached purchase" }], captured_at: snapshot.captured_at };
            case "receive_library_sync_host_wishlist_item":
              assert.equal(args.input?.item_id, "host-assigned-id");
              saved[0] = { ...saved[0], quantity: 0, status: "RECEIVED" };
              received = true;
              return { spool_ids: ["Delivered roll"], received_quantity: 1, remaining_quantity: 0, status: "RECEIVED" };
            case "create_library_sync_host_wishlist_item": {
              assert.ok(args.input);
              assert.equal(args.input.expected_library_id, origin.library_id);
              assert.equal(args.input.expected_target_generation, origin.target_generation);
              saved.push({ ...args.input, status: "WISHLIST", id: "host-assigned-id",
                created_at: snapshot.captured_at, updated_at: snapshot.captured_at });
              if (scenario === "switch after save" || scenario === "A–B–A after save") target = replacement;
              if (scenario === "A–B–A after save") target = backToA;
              return null;
            }
            case "fetch_library_sync_printer_settings": return { ...fixture.printerSettings, printers: [] };
            case "fetch_library_sync_printer_overview":
            case "fetch_library_sync_active_loans":
            case "list_companion_access_requests": return [];
            case "fetch_library_sync_locations": return { rows: [], captured_at: snapshot.captured_at };
            case "fetch_library_sync_domain_revisions": return fixture.revisions;
            case "fetch_library_sync_filament_standards": return fixture.filamentStandards;
            case "fetch_library_sync_catalog_masters": return fixture.catalogRows;
            case "get_library_sync_host_catalog_refresh_job": return null;
            default: return resolveUiBrowserPerformanceInvoke(fixture, cmd, args);
          }
        });
        await page.addInitScript(`let cb=0; const invoke=window.purchaseInvoke;
          window.__TAURI__={invoke};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
          window.__TAURI_INTERNALS__={invoke,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++cb,unregisterCallback(){}};
          window.purchasePaints=[];window.stockPaints=[];
          new MutationObserver(()=>{
            if(document.body)window.purchasePaints.push(document.body.innerText);
            const stock=document.querySelector('section[aria-labelledby=dashboard-stock-overview-title]');
            if(stock)window.stockPaints.push(stock.innerText);
          }).observe(document,{subtree:true,childList:true,characterData:true});`);
        await page.goto(server.resolvedUrls!.local[0] + "?bfm_locale=en&bfm_visual_qa=dashboard-overview");
        await page.getByText(/Live host snapshot/i).first().waitFor();
        const showSuggestions = page.getByRole("button", { name: /Show suggestions/ });
        await showSuggestions.click();
        const purchased = page.getByRole("button", { name: /Add .*Purchased roll.*wishlist/i });
        afterClick = true;
        await purchased.click();

        const queue = page.locator("#inventory-purchases-panel:not([hidden])");
        const notice = "Added to the wishlist. Opening Purchases.";
        if (scenario === "switch during queue read" || scenario === "A–B–A during cached read") {
          await queue.getByText(/Replacement purchase/).first().waitFor();
          assert.ok(!await page.evaluate("window.purchasePaints.some(text => text.includes('Obsolete purchase'))"));
          assert.equal(calls.filter(cmd => cmd === "fetch_library_sync_spool_snapshot").length, 0);
        } else if (scenario === "refresh cached queue" || scenario === "refresh without a saved queue" || scenario === "receive and open stock") {
          const stockTab = page.locator("#inventory-stock-tab");
          if (queueOffline) {
            if (scenario === "refresh without a saved queue") {
              await page.getByText(/no cached inventory snapshot/i).first().waitFor();
              assert.equal(await page.locator("#inventory-purchases-tab .inventory-workspace-count").innerText(), "–");
            } else {
              await queue.getByText(/Cached purchase/).first().waitFor();
            }
            queueOffline = false;
            await page.getByRole("button", { name: "Refresh", exact: true }).click();
          }
          if (scenario === "refresh without a saved queue") {
            await page.waitForFunction(() => document.querySelector("#inventory-purchases-tab .inventory-workspace-count")?.textContent === "0");
          } else {
            await queue.getByText(/Purchased roll/).first().waitFor();
            assert.equal(await page.locator("#inventory-purchases-tab .inventory-workspace-count").innerText(), "1");
          }
          for (const tab of ["stock", "loans", "locations"]) {
            assert.equal(await page.locator(`#inventory-${tab}-tab .inventory-workspace-count`).innerText(), "–");
          }
          assert.ok(!calls.some(cmd => ["fetch_library_sync_spool_snapshot", "fetch_cached_library_sync_spools",
            "fetch_library_sync_active_loans", "fetch_library_sync_printer_overview", "fetch_library_sync_locations"].includes(cmd)));
          if (scenario === "receive and open stock") {
            await queue.getByRole("button", { name: "Stock roll now" }).click();
            await page.getByRole("dialog").getByRole("button", { name: "Receive 1 roll", exact: true }).click();
            await page.getByText(/Received 1 ×/).first().waitFor();
            await stockTab.click();
            await page.locator("#inventory-stock-panel").getByText(/Delivered roll/).first().waitFor();
            assert.equal(await stockTab.locator(".inventory-workspace-count").innerText(), "3");
            assert.equal(calls.filter(cmd => cmd === "receive_library_sync_host_wishlist_item").length, 1);
          }
        } else if (scenario === "offline return" || scenario === "switch before offline return") {
          await queue.getByText(/Purchased roll/).first().waitFor();
          await page.getByText(notice, { exact: true }).first().waitFor();
          assert.ok(!calls.includes("fetch_library_sync_snapshot"), "Dashboard refreshed on the successful path");
          assert.equal(calls.filter(cmd => cmd === "fetch_library_sync_spool_snapshot").length, 0, "opening Purchases must not load stock");
          offline = true;
          if (scenario === "switch before offline return") target = backToA;
          await page.evaluate("window.stockPaints = []");
          await page.getByRole("button", { name: "Dashboard", exact: true }).click();
          await page.getByText(/Cached host snapshot/i).first().waitFor();
          await showSuggestions.click();
          await page.getByRole("button", { name: /Add .*Other roll.*wishlist/i }).waitFor();
          assert.equal(await purchased.count(), 0);
          const expectedRoll = target === origin ? "Purchased roll" : "Replacement roll";
          await page.locator("section[aria-labelledby=dashboard-stock-overview-title] li").filter({ hasText: expectedRoll }).first().waitFor();
          if (target !== origin) {
            assert.ok(!await page.evaluate("window.stockPaints.some(text => text.includes('Purchased roll'))"));
          }
        } else if (scenario === "switch on arrival" || scenario === "A–B–A on arrival") {
          await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
          await page.getByText(/Replacement roll/).first().waitFor();
          assert.equal(await queue.count(), 0);
          assert.ok(!await page.evaluate("window.purchasePaints.some(text => text.includes('Replacement roll') && text.includes('Added to the wishlist.'))"));
          offline = true;
          await page.evaluate("window.stockPaints = []");
          await page.getByRole("button", { name: "Dashboard", exact: true }).click();
          await page.getByText(/Cached host snapshot/i).first().waitFor();
          assert.ok(!await page.evaluate("window.stockPaints.some(text => text.includes('Purchased roll'))"),
            "returning offline to the replacement library painted stock from the reviewed library");
        } else {
          await page.getByRole("button", { name: /Add .*Replacement roll.*wishlist/i }).waitFor();
          assert.equal(await queue.count(), 0);
          assert.ok(!await page.evaluate("window.purchasePaints.some(text => text.includes('Added to the wishlist.'))"));
        }
        assert.equal(saved.length, 1);
      } finally {
        await page.close();
      }
    });
  }
});
