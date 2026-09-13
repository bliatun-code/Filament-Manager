import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const path = (file: string) => JSON.stringify(fileURLToPath(new URL(file, import.meta.url)));
  const entry = fileURLToPath(new URL("./__mark_empty_virtual__.js", import.meta.url));
  const source = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryMarkEmptyAction } from ${path("./use_inventory_mark_empty_action.ts")};
    import { useInventoryFilters } from ${path("./use_inventory_filters.ts")};
    import { InventoryDangerZonePanel } from ${path("../components/inventory_danger_zone_panel.tsx")};
    import { I18nContext } from ${path("./i18n.ts")};
    let action, snapshot, props, filter, oldAction;
    const calls = [], pending = [], reloads = [];
    let reloadFailure = false, resolution = "LIVE";
    const t = (_key, fallback) => fallback;
    const spool = { id: "roll", masterId: "master", vendor: "Maker", material: "PLA",
      filamentName: "Basic", colorName: "Blue", initialWeightGrams: 1000,
      status: "IN_STOCK", ownershipType: "OWNED", locationId: "shelf", homeLocationId: "shelf" };
    let rows = [spool, { ...spool, id: "empty", status: "EMPTY", remainingGrams: 0 }];
    window.__TAURI__ = { invoke: (command, payload) => new Promise((resolve, reject) => {
      calls.push({ command, payload, resolve, reject });
    }) };
    function Harness({ host = "local", generation = 1, id = "roll", open = true, assigned = false, loaned = false }) {
      const [busy, setManageBusy] = useState(false);
      const [info, setInfoMessage] = useState(null);
      const [error, setError] = useState(null);
      filter = useInventoryFilters(rows, { deterministicPagePreferences: true });
      action = useInventoryMarkEmptyAction({
        selectedSpool: open ? { ...spool, id, status: assigned ? "ASSIGNED" : "IN_STOCK" } : null,
        assignedSlot: assigned ? { slotId: "slot", printerId: "printer" } : null,
        activeLoan: loaned, loanedOut: loaned,
        clientReadOnly: host !== "local", clientHostBaseUrl: "http://" + host,
        clientLibraryId: "library", clientTargetGeneration: generation,
        tauriAvailable: true, manageBusy: busy, canUseClientHostWrite: () => true,
        ensureLocalWriteAllowed: () => true, setManageBusy, setError, setInfoMessage, t,
        reloadSpools: async report => { reloads.push("spools"); report?.("spools", resolution);
          if (reloadFailure) throw Error("refresh failed");
          if (resolution === "LIVE") { rows = rows.map(row => row.id === id ? { ...row, status: "EMPTY" } : row); }
        },
        reloadPrinterOverview: async () => { reloads.push("printers"); },
        reloadSpoolDetail: async id => { reloads.push("detail:" + id); },
      });
      snapshot = { busy, info, error, visible: filter.filteredSpools.map(row => row.id), status: filter.statusFilter };
      return React.createElement(I18nContext.Provider, { value: { locale: "en", setLocale: () => {}, t } },
        error && React.createElement("div", { role: "alert" }, error),
        info && React.createElement("output", null, info),
        open && React.createElement(InventoryDangerZonePanel, {
          confirmDelete: false, confirmPurge: false, manageBusy: busy, loanedOut: loaned,
          onCancelConfirmation: () => {}, onDelete: () => {}, onPurge: () => {}, onRefill: () => {},
          onMarkEmpty: () => pending.push(action()), runtimeAvailable: true,
          rollLabel: "Maker PLA Blue", status: assigned ? "ASSIGNED" : "IN_STOCK",
        }));
    }
    const root = createRoot(document.getElementById("root"));
    window.mark = {
      render: (next = {}) => { props = next; flushSync(() => root.render(React.createElement(Harness, props))); },
      start: () => { pending.push(action()); },
      double: () => { pending.push(action()); pending.push(action()); },
      save: () => { oldAction = action; }, old: () => { void oldAction(); },
      finish: async (index, reject = false) => {
        await Promise.resolve();
        if (reject) calls[index].reject(Error("write failed"));
        else calls[index].resolve({ committed: true, affected_count: 1, history_spool_count: 1 });
        await pending[index]; flushSync(() => root.render(React.createElement(Harness, props)));
      },
      failure: (value = "throw") => { reloadFailure = value === "throw"; resolution = value === "throw" ? "LIVE" : value; },
      filter: status => flushSync(() => filter.setStatusFilter(status)),
      snapshot: () => ({ ...snapshot, calls: calls.map(({command, payload}) => ({command, payload})), reloads }),
    };
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "mark-empty", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }],
    build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "MarkEmpty" } },
  });
  const script = (Array.isArray(result) ? result : [result]).flatMap(value => value.output)
    .find(value => value.type === "chunk" && value.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

test("rendered mark-empty action and default inventory filtering", async context => {
  const html = await harness();
  const browser = await chromium.launch({ headless: true });
  const scenario = async (name: string, run: (page: Awaited<ReturnType<typeof browser.newPage>>) => Promise<void>) => {
    await context.test(name, async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(10_000);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      try { await page.setContent(html); await page.evaluate("mark.render()"); await run(page); assert.deepEqual(errors, []); }
      finally { await page.close(); }
    });
  };
  try {
    await scenario("All hides empty rolls; Empty retains them after a successful mark", async page => {
      assert.deepEqual((await page.evaluate("mark.snapshot()")).visible, ["roll"]);
      await page.evaluate("mark.filter('EMPTY')");
      assert.deepEqual((await page.evaluate("mark.snapshot()")).visible, ["empty"]);
      await page.evaluate("mark.filter('ALL')");
      await page.locator("summary").click();
      await page.getByRole("button", { name: "Mark as used up (empty)", exact: true }).click();
      await page.getByRole("button", { name: "Mark roll as empty", exact: true }).click();
      await page.waitForFunction("mark.snapshot().calls.length === 1");
      const call = (await page.evaluate("mark.snapshot()")).calls[0];
      assert.equal(call.command, "execute_inventory_bulk_mutation");
      assert.equal(call.payload.input.action, "MARK_EMPTY");
      assert.equal(call.payload.input.expected_slot_id, null);
      await page.evaluate("mark.finish(0)");
      assert.deepEqual((await page.evaluate("mark.snapshot()")).visible, []);
      await page.evaluate("mark.filter('EMPTY')");
      assert.deepEqual((await page.evaluate("mark.snapshot()")).visible, ["roll", "empty"]);
    });
    await scenario("same-event duplicate sends one Host command with slot and generation", async page => {
      await page.evaluate("mark.render({host:'host', generation:3, assigned:true}); mark.double()");
      const calls = (await page.evaluate("mark.snapshot()")).calls;
      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, "execute_library_sync_host_inventory_bulk_mutation");
      assert.equal(calls[0].payload.input.expected_target_generation, 3);
      assert.equal(calls[0].payload.input.mutation.expected_slot_id, "slot");
      assert.equal(calls[0].payload.input.mutation.spool.expected_status, "ASSIGNED");
      await page.evaluate("mark.finish(0)");
    });
    await scenario("write failure remains visible and permits an explicit retry", async page => {
      await page.evaluate("mark.start(); mark.finish(0, true)");
      assert.match(await page.getByRole("alert").innerText(), /Failed to mark/);
      assert.deepEqual((await page.evaluate("mark.snapshot()")).reloads, []);
      await page.evaluate("mark.start(); mark.finish(1)");
      assert.equal((await page.evaluate("mark.snapshot()")).info, "All changes are saved.");
    });
    for (const failure of ["throw", "ERROR", "OFFLINE", "CACHED"]) {
      await scenario(`accepted write is not repeated after ${failure} refresh`, async page => {
        await page.evaluate(`mark.failure('${failure}'); mark.start(); mark.finish(0)`);
        const snapshot = await page.evaluate("mark.snapshot()");
        assert.equal(snapshot.info, "All changes are saved.");
        assert.ok(snapshot.error);
        await page.evaluate("mark.start()");
        assert.equal((await page.evaluate("mark.snapshot()")).calls.length, 1);
      });
    }
    for (const transition of ["{host:'other', generation:2}", "{generation:3}", "{id:'other'}", "{open:false}"]) {
      await scenario(`late completion and old callback ignored after ${transition}`, async page => {
        await page.evaluate(`mark.save(); mark.start(); mark.render(${transition}); mark.finish(0).then(() => mark.old())`);
        const snapshot = await page.evaluate("mark.snapshot()");
        assert.equal(snapshot.calls.length, 1);
        assert.equal(snapshot.info, null);
        assert.deepEqual(snapshot.reloads, []);
        assert.equal(snapshot.busy, false);
      });
    }
    await scenario("A to B to A completion cannot unlock or overwrite a newer action", async page => {
      await page.evaluate("mark.render({host:'host', generation:1}); mark.start(); mark.render({host:'other',generation:2}); mark.render({host:'host',generation:3}); mark.start()");
      await page.waitForFunction("mark.snapshot().calls.length === 2");
      await page.evaluate("mark.finish(0)");
      assert.equal((await page.evaluate("mark.snapshot()")).busy, true);
      assert.equal((await page.evaluate("mark.snapshot()")).info, null);
      await page.evaluate("mark.finish(1)");
      assert.equal((await page.evaluate("mark.snapshot()")).busy, false);
      assert.equal((await page.evaluate("mark.snapshot()")).info, "All changes are saved.");
    });
    await scenario("active outbound loan cannot send a write", async page => {
      await page.evaluate("mark.render({loaned:true}); mark.start()");
      assert.equal((await page.evaluate("mark.snapshot()")).calls.length, 0);
    });
  } finally { await browser.close(); }
});
