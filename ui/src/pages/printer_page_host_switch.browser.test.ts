import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

test("Printers discards late cached and live data when the paired target changes during refresh", async context => {
  const bundle = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: { write: false, lib: { entry: fileURLToPath(new URL("../../test-fixtures/printer_page_host_switch.tsx", import.meta.url)),
      formats: ["iife"], name: "PrinterPage" } },
  });
  const chunk = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(output => output.output)
    .find(output => output.type === "chunk" && output.isEntry);
  assert.ok(chunk?.type === "chunk");
  const browser = await chromium.launch();
  try {
    for (const [label, url, libraryId, generation] of [
      ["different Host", "http://host-b", "library-b", 2],
      ["different library at the same address", "http://host-a", "library-b", 2],
      ["original Host after switching away and back", "http://host-a", "library-a", 3],
    ] as const) {
      await context.test(label, async () => {
        const page = await browser.newPage();
        try {
          const original = { base_url: "http://host-a", expected_library_id: "library-a", target_generation: 1 };
          const replacement = { base_url: url, expected_library_id: libraryId, target_generation: generation };
          let selected = original;
          let resumeCache!: () => void;
          const pending = new Promise<void>(resolve => { resumeCache = resolve; });
          const calls: Array<[string, unknown]> = [];
          await page.exposeFunction("printerInvoke", async (cmd: string, args: { input?: typeof original }) => {
            calls.push([cmd, args?.input]);
            switch (cmd) {
              case "get_library_sync_page_status":
                return { mode: "CLIENT", host_base_url: selected.base_url, library_id: selected.expected_library_id,
                  target_generation: selected.target_generation, client_auth_paired: true };
              case "fetch_library_sync_printer_overview":
                return [{ printer: { id: selected === original ? "old-printer" : "new-printer" }, slots: [{ slot_id: "slot", ams_id: "ams", slot_index: 1, spool_id: "assigned" }] }];
              case "fetch_library_sync_printer_settings": return { printer_models: [], bambu_live_integrations: [] };
              case "fetch_library_sync_spool_snapshot":
                if (selected === original) throw new Error("interrupted spool read");
                return { rows: [{ spool: { id: "new-spool", status: "IN_STOCK" }, master: {} }], captured_at: "fresh" };
              case "fetch_cached_library_sync_spools":
                await pending;
                return { rows: [{ spool: { id: "old-spool", status: "IN_STOCK" }, master: {} }], captured_at: "old" };
              case "fetch_library_sync_catalog_masters": return [{ id: "catalog-" + args.input?.expected_library_id }];
              default: throw new Error("Unexpected command " + cmd);
            }
          });
          await page.setContent('<div id="root"></div>');
          await page.evaluate(`window.__TAURI__ = {invoke: window.printerInvoke};
            window.paints = []; new MutationObserver(() => window.paints.push(document.body.innerText))
              .observe(document.body, {subtree: true, childList: true, characterData: true});`);
          await page.addScriptTag({ content: chunk.code });
          await page.waitForFunction(() => document.querySelector("output") !== null);
          await context.waitFor(
            () => assert.ok(calls.some(([cmd]) => cmd === "fetch_cached_library_sync_spools")),
            { timeout: 10_000 },
          );
          selected = replacement;
          resumeCache();
          await page.waitForFunction(() => document.querySelector("output")?.textContent?.includes("new-printer new-spool"));
          assert.equal(await page.locator("output").textContent(), "new-printer new-spool catalog-" + libraryId);
          assert.equal(await page.evaluate("window.paints.some(text => text.includes('old-printer') || text.includes('old-spool'))"), false);
          assert.deepEqual(calls.filter(([cmd]) => cmd === "fetch_library_sync_spool_snapshot").map(([,input]) => input), [original, replacement]);
          assert.deepEqual(calls.filter(([cmd]) => cmd.startsWith("fetch_cached_")), [["fetch_cached_library_sync_spools", original]]);
        } finally {
          await page.close();
        }
      });
    }
    for (const cached of [false, true]) {
      await context.test(`first picker discards late ${cached ? "cached" : "live"} rows after A–B–A`, async () => {
        const page = await browser.newPage();
        let generation = 1;
        let resume!: () => void;
        const pending = new Promise<void>(resolve => { resume = resolve; });
        const reads: Array<[string, number]> = [];
        try {
          await page.exposeFunction("printerInvoke", async (cmd: string, args: { input?: { target_generation: number } }) => {
            const target = args?.input?.target_generation;
            switch (cmd) {
              case "get_library_sync_page_status":
                return { mode: "CLIENT", host_base_url: "http://host-a", library_id: "library-a",
                  target_generation: generation, client_auth_paired: true };
              case "fetch_library_sync_printer_overview":
                return [{ printer: { id: "printer-" + generation }, slots: [{
                  slot_id: "slot", ams_id: "ams", slot_index: 1, spool_id: "assigned-" + generation,
                  spool_status: "ASSIGNED", spool_material: "PLA", spool_filament_name: "Basic", spool_color_name: "Red",
                  assigned_spool_details: { master_id: "master", vendor: "eSUN", default_weight: 1000,
                    initial_weight_g: 800, spool_tare_weight_g: 147, low_stock_threshold_g: 340 },
                }] }];
              case "fetch_library_sync_printer_settings": return { printer_models: [], bambu_live_integrations: [] };
              case "fetch_library_sync_catalog_masters": return [];
              case "fetch_library_sync_spool_snapshot":
              case "fetch_cached_library_sync_spools":
                assert.ok(target);
                reads.push([cmd, target]);
                if (target === 1 && cached && cmd === "fetch_library_sync_spool_snapshot") throw Error("disconnected");
                if (target === 1) await pending;
                return { rows: [{ spool: { id: "roll-" + target, status: "IN_STOCK" }, master: {} }], captured_at: "saved" };
              default: throw new Error("Unexpected command " + cmd);
            }
          });
          await page.setContent('<div id="root"></div>');
          await page.evaluate("window.__TAURI__ = {invoke: window.printerInvoke}; window.paints = [];" +
            "new MutationObserver(() => window.paints.push(document.body.innerText)).observe(document.body, {subtree:true, childList:true, characterData:true});");
          await page.addScriptTag({ content: chunk.code });
          await page.waitForFunction(() => document.querySelector("output")?.textContent === "printer-1");
          assert.deepEqual(reads, []);
          const open = page.getByRole("button", { name: "Open picker" });
          await open.click({ clickCount: 2 });
          await context.waitFor(() => assert.equal(reads.length, cached ? 2 : 1), { timeout: 10_000 });
          generation = 3;
          resume();
          await page.waitForFunction(() => document.querySelector("output")?.textContent === "printer-3");
          assert.equal(await page.locator("output").getAttribute("data-spools"), "deferred");
          assert.equal(await page.locator("output").getAttribute("data-assigned"), "assigned-3");
          await open.click();
          await page.waitForFunction(() => document.querySelector("output")?.textContent === "printer-3 roll-3");
          await open.click();
          assert.deepEqual(reads, [
            ["fetch_library_sync_spool_snapshot", 1],
            ...(cached ? [["fetch_cached_library_sync_spools", 1]] : []),
            ["fetch_library_sync_spool_snapshot", 3],
          ]);
          assert.equal(await page.evaluate("window.paints.some(text => text.includes('roll-1'))"), false);
        } finally {
          resume();
          await page.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
});
