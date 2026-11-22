import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

test("Inventory displays only a complete live or saved spool list for the selected generation", async context => {
  const bundle = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: { write: false, lib: { entry: fileURLToPath(new URL("../../test-fixtures/inventory_spool_snapshot.tsx", import.meta.url)),
      formats: ["iife"], name: "InventorySnapshot" } },
  });
  const chunk = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(output => output.output)
    .find(output => output.type === "chunk" && output.isEntry);
  assert.ok(chunk?.type === "chunk");
  const browser = await chromium.launch();
  try {
    const original = { base_url: "http://host-a", expected_library_id: "library-a", target_generation: 1 };
    const other = { base_url: "http://host-b", expected_library_id: "library-b", target_generation: 2 };
    for (const [label, target, delayLive] of [
      ["interrupted read keeps the last complete offline list and timestamp", original, false],
      ["Host changes during fallback", other, false],
      ["Host changes while live rows are in flight", other, true],
      ["Host switches away and back during fallback", { ...original, target_generation: 3 }, false],
    ] as const) {
      await context.test(label, async () => {
        const page = await browser.newPage();
        try {
          let current = original;
          const pending = Promise.withResolvers<void>();
          const calls: Array<[string, unknown]> = [];
          const row = (id: string) => ({ spool: { id, status: "IN_STOCK", ownership_type: "OWNED" }, master: { id: "master" } });
          await page.exposeFunction("inventoryInvoke", async (cmd: string, args?: { input?: unknown }) => {
            calls.push([cmd, args?.input]);
            switch (cmd) {
              case "get_library_sync_page_status":
                return { mode: "CLIENT", host_base_url: current.base_url, library_id: current.expected_library_id,
                  target_generation: current.target_generation, client_auth_paired: true };
              case "fetch_library_sync_spool_snapshot":
                if (current !== original) return { rows: [row("new-roll")], captured_at: "fresh" };
                if (!delayLive) throw new Error("Host interrupted the second page");
                await pending.promise;
                return { rows: [row("old-roll")], captured_at: "old" };
              case "fetch_cached_library_sync_spools":
                await pending.promise;
                return { rows: [row("saved-roll")], captured_at: "saved" };
              case "validate_library_sync_host": return { reachable: false };
              case "fetch_library_sync_locations": return { rows: [], captured_at: "now" };
              default: throw new Error("Unexpected command: " + cmd);
            }
          });
          await page.setContent('<div id="root"></div>');
          await page.evaluate(`window.__TAURI__ = {invoke: window.inventoryInvoke};
            window.paints = []; new MutationObserver(() => window.paints.push(document.body.innerText))
              .observe(document.body, {subtree: true, childList: true, characterData: true});`);
          await page.addScriptTag({ content: chunk.code });
          const delayedCommand = delayLive ? "fetch_library_sync_spool_snapshot" : "fetch_cached_library_sync_spools";
          await context.waitFor(() => assert.ok(calls.some(([cmd]) => cmd === delayedCommand)), { timeout: 10_000 });
          current = target;
          pending.resolve();
          const switched = target !== original;
          const expected = switched ? "LIVE fresh new-roll" : "CACHED saved saved-roll";
          await page.waitForFunction(text => document.querySelector("output")?.textContent === text, expected);
          if (switched) {
            assert.equal(await page.evaluate("window.paints.some(text => /old-roll|saved-roll/.test(text))"), false);
          }
          assert.deepEqual(calls.filter(([cmd]) => cmd === "fetch_library_sync_spool_snapshot").map(([,arg]) => arg),
            switched ? [original, target] : [original]);
          assert.deepEqual(calls.filter(([cmd]) => cmd === "fetch_cached_library_sync_spools").map(([,arg]) => arg),
            delayLive ? [] : [original]);
          assert.ok(calls.every(([cmd]) => cmd !== "save_library_sync_spool_cache" && cmd !== "fetch_library_sync_spools"));
        } finally {
          await page.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
});
