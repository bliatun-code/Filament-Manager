import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";
import type { PurchaseReceiptMetadata } from "./purchase_receipt_metadata";
import type { WishlistReceiptResult } from "./tauri_wishlist_client";

const receipt: WishlistReceiptResult = {
  spool_ids: ["received-1", "received-2"],
  received_quantity: 2,
  remaining_quantity: 1,
  status: "ON_ORDER",
};

async function buildWishlistHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(requireFromUi.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__wishlist_receipt_action_entry__.js", import.meta.url));
  const hook = fileURLToPath(new URL("./use_inventory_create_actions.ts", import.meta.url));
  const messageFormat = fileURLToPath(new URL("../../../src-tauri/companion_browser/message_format.js", import.meta.url));
  const source = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryCreateActions } from ${JSON.stringify(hook)};
    import { formatMessage } from ${JSON.stringify(messageFormat)};
    const commands = [], operations = [], reloads = [], refreshes = [], resets = [], registrations = [], added = [];
    window.__TAURI__ = { invoke: (command, payload) => new Promise((resolve, reject) => {
      commands.push({ command, payload, resolve, reject });
    }) };
    const item = { id: "wish-white", material: "PLA", filament_name: "PLA Basic", color_name: "Jade White",
      vendor: "Bambu Lab", status: "ON_ORDER", quantity: 8, created_at: "", updated_at: "" };
    let actions, captured, snapshot;
    function Harness({ host = "paired-host", generation = 1, session = 1, refreshFailure, deferRefresh = false }) {
      const [busy, setBusy] = useState(false);
      const [info, setInfoMessage] = useState(null);
      const [error, setError] = useState(null);
      const [selected, setSelectedSpoolId] = useState(null);
      const [recent, setRecentlyAddedSpoolId] = useState(null);
      const reload = async kind => {
        reloads.push({ kind, host, generation });
        if (deferRefresh) await new Promise(resolve => refreshes.push(resolve));
        if (refreshFailure === kind) throw new Error(kind + " refresh failed");
      };
      actions = useInventoryCreateActions({
        borrowedFromContact: "", borrowedFromName: "", borrowedInNote: "",
        bambuCodeBatch: { creatableRows: [], blockedRows: [] },
        busy, canUseClientHostWrite: () => true,
        clientHostBaseUrl: host ? "http://" + host : null,
        clientLibraryId: host ? "library-" + host : null,
        clientReadOnly: Boolean(host), clientTargetGeneration: host ? generation : null,
        confirmWishlistRemoveId: item.id, createMode: "manual", createSessionId: session,
        ensureLocalWriteAllowed: () => true,
        manualColorName: "White", manualFilamentName: "PLA Basic", manualHexColor: "#ffffff",
        manualMaterial: "PLA", manualVendor: "Generic", newInitialWeight: "1000",
        newLocation: "", newOwnershipType: "OWNED",
        onSpoolCreated: receipt => registrations.push(receipt),
        onWishlistItemCreated: () => added.push(host),
        reloadSpools: () => reload("spools"), reloadCatalog: () => reload("catalog"),
        reloadWishlist: () => reload("wishlist"),
        resetAfterCreatedSpool: () => resets.push(host), resetBambuBatchInput: () => {},
        selectedBambuMaster: null, selectedEsunMaster: null,
        setBusy, setConfirmWishlistRemoveId: () => {}, setError, setInfoMessage,
        setRecentlyAddedSpoolId, setSelectedSpoolId, tauriAvailable: true,
        t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
      });
      snapshot = { busy, info, error, selected, recent };
      return React.createElement("output", null, JSON.stringify(snapshot));
    }
    const root = createRoot(document.getElementById("root"));
    function run(action, options, source) {
      if (action === "register") return source.handleCreateSpool();
      if (action === "add") return source.handleAddCurrentToWishlist();
      if (action === "status") return source.handleWishlistStatus(item.id, "ON_ORDER");
      if (action === "delete") return source.handleDeleteWishlistItem(item.id);
      return source.handleStockFromWishlist(item, 2, options.metadata, options.location);
    }
    window.wishlistLifecycle = {
      render: options => flushSync(() => root.render(React.createElement(Harness, options))),
      capture: () => { captured = actions; },
      start: (kinds = ["receive"], options = {}) => flushSync(() => {
        for (const kind of kinds) {
          const operation = { settled: false, result: null };
          operations.push(operation);
          run(kind, options, options.captured ? captured : actions).then(result => {
            operation.result = result ?? null;
            operation.settled = true;
          });
        }
      }),
      finish: (index, result, reject = false) => {
        if (reject) commands[index].reject(new Error("Write rejected"));
        else commands[index].resolve(result);
      },
      releaseRefreshes: () => { while (refreshes.length) refreshes.shift()(); },
      settled: index => operations[index].settled,
      commandCount: () => commands.length,
      snapshot: () => ({ ...snapshot, operations, reloads, resets, registrations, added }),
      commands: () => commands.map(({ command, payload }) => ({ command, payload })),
    };
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "wishlist-lifecycle", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }],
    build: { write: false, minify: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "WishlistLifecycle" } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(script);
  return `<html><head><meta charset="utf-8"></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

async function finish(page: Page, command: number, operation: number, result: unknown = receipt, reject = false) {
  await page.evaluate(`wishlistLifecycle.finish(${command}, ${JSON.stringify(result)}, ${reject})`);
  await page.waitForFunction(`wishlistLifecycle.settled(${operation})`);
}

async function waitForCommands(page: Page, count: number) {
  await page.waitForFunction(`wishlistLifecycle.commandCount() === ${count}`);
}

function assertNoPublication(state: {
  info: unknown; error: unknown; selected: unknown; recent: unknown;
  reloads: unknown[]; resets: unknown[]; registrations: unknown[]; added: unknown[];
}) {
  assert.equal(state.info, null);
  assert.equal(state.error, null);
  assert.equal(state.selected, null);
  assert.equal(state.recent, null);
  assert.deepEqual(state.reloads, []);
  assert.deepEqual(state.resets, []);
  assert.deepEqual(state.registrations, []);
  assert.deepEqual(state.added, []);
}

test("wishlist writes preserve receipt contracts and own their React lifecycle", async context => {
  const document = await buildWishlistHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: document }));
          await page.goto("http://localhost/wishlist-hook");
          await run(page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }

    for (const host of [null, "paired-host"]) {
      await scenario(`${host ? "Host" : "local"} receipt sends location and purchase metadata atomically`, async page => {
        const metadata: PurchaseReceiptMetadata = {
          purchase_price: 24.5, purchase_currency: "NOK", purchase_date: "2026-09-09",
          batch_code: "batch-9", supplier_reference: "order-5",
        };
        await page.evaluate(`wishlistLifecycle.render({host:${JSON.stringify(host)}}); wishlistLifecycle.start(['receive'], {location:'  QA Dry box  ',metadata:${JSON.stringify(metadata)}})`);
        await waitForCommands(page, 1);
        await finish(page, 0, 0);
        assert.deepEqual(await page.evaluate("wishlistLifecycle.commands()"), [{
          command: host ? "receive_library_sync_host_wishlist_item" : "receive_wishlist_item",
          payload: { input: {
            ...(host ? { base_url: "http://paired-host", expected_library_id: "library-paired-host" } : {}),
            item_id: "wish-white", quantity: 2, home_location: "QA Dry box", purchase_metadata: metadata,
          } },
        }]);
        const state = await page.evaluate("wishlistLifecycle.snapshot()");
        assert.equal(state.operations[0].result, true);
        assert.deepEqual(state.reloads.map((entry: {kind: string}) => entry.kind), ["spools", "wishlist"]);
        assert.equal(state.selected, "received-1");
        assert.equal(state.recent, "received-1");
        assert.match(state.info, /^Received 2 × .*Jade White\. Remaining: 1\.$/);
        assert.equal(state.busy, false);
      });

      for (const failure of ["spools", "wishlist"]) {
        await scenario(`${host ? "Host" : "local"} committed receipt stays successful after ${failure} refresh failure`, async page => {
          await page.evaluate(`wishlistLifecycle.render({host:${JSON.stringify(host)},refreshFailure:${JSON.stringify(failure)}}); wishlistLifecycle.start()`);
          await waitForCommands(page, 1);
          await finish(page, 0, 0);
          const state = await page.evaluate("wishlistLifecycle.snapshot()");
          assert.equal(state.operations[0].result, true, "Close the committed receipt draft");
          assert.equal(await page.evaluate("wishlistLifecycle.commandCount()"), 1, "A failed read must not repeat the write");
          assert.deepEqual(state.reloads.map((entry: {kind: string}) => entry.kind), ["spools", "wishlist"]);
          assert.equal(state.busy, false);
          assert.equal(state.selected, "received-1");
          assert.match(state.info, /^Received 2 × .*Jade White\. Remaining: 1\.$/);
          assert.equal(state.error, "Failed to load inventory.");
        });
      }
    }

    for (const location of [undefined, "", "  "]) {
      await scenario(`blank optional location ${JSON.stringify(location)} keeps the legacy request`, async page => {
        await page.evaluate(`wishlistLifecycle.render({host:null}); wishlistLifecycle.start(['receive'],${JSON.stringify({location})})`);
        await waitForCommands(page, 1);
        await finish(page, 0, 0);
        assert.deepEqual(await page.evaluate("wishlistLifecycle.commands()"), [{command:"receive_wishlist_item",payload:{input:{item_id:"wish-white",quantity:2}}}]);
      });
    }

    await scenario("rejection keeps the receipt retryable without announcing success", async page => {
      await page.evaluate("wishlistLifecycle.render({}); wishlistLifecycle.start()");
      await waitForCommands(page, 1);
      await finish(page, 0, 0, null, true);
      const state = await page.evaluate("wishlistLifecycle.snapshot()");
      assert.equal(state.operations[0].result, false);
      assert.equal(state.busy, false);
      assert.equal(state.error, "Failed to stock roll from wishlist item.");
      assert.equal(state.info, null);
      assert.equal(state.selected, null);
      assert.deepEqual(state.reloads, []);
      await page.evaluate("wishlistLifecycle.start()");
      await waitForCommands(page, 2);
      await finish(page, 1, 1);
      assert.equal((await page.evaluate("wishlistLifecycle.snapshot()")).operations[1].result, true);
    });

    for (const kinds of [["receive", "receive"], ["receive", "register"], ["register", "receive"]]) {
      await scenario(`${kinds.join(" then ")} callbacks share an immediate write lock`, async page => {
        await page.evaluate(`wishlistLifecycle.render({}); wishlistLifecycle.start(${JSON.stringify(kinds)})`);
        assert.equal(await page.evaluate("wishlistLifecycle.commandCount()"), 1);
        await finish(page, 0, 0, kinds[0] === "register" ? "registered-1" : receipt);
        await page.waitForFunction("wishlistLifecycle.settled(1)");
        assert.equal(await page.evaluate("wishlistLifecycle.commandCount()"), 1);
        const state = await page.evaluate("wishlistLifecycle.snapshot()");
        assert.equal(state.busy, false);
        assert.equal(state.selected, kinds[0] === "register" ? "registered-1" : "received-1");
      });
    }

    await scenario("a completed registration does not block a subsequent receipt", async page => {
      await page.evaluate("wishlistLifecycle.render({}); wishlistLifecycle.start(['register'])");
      await waitForCommands(page, 1);
      await finish(page, 0, 0, "registered-1");
      await page.evaluate("wishlistLifecycle.start()");
      await waitForCommands(page, 2);
      await finish(page, 1, 1);
      assert.equal((await page.evaluate("wishlistLifecycle.snapshot()")).operations[1].result, true);
    });

    for (const kind of ["receive", "add", "status", "delete"]) {
      for (const rejected of [false, true]) {
        await scenario(`A→B→A discards stale ${kind} ${rejected ? "rejection" : "success"} without unlocking the new write`, async page => {
          await page.evaluate(`wishlistLifecycle.render({}); wishlistLifecycle.start([${JSON.stringify(kind)}])`);
          await waitForCommands(page, 1);
          await page.evaluate("wishlistLifecycle.render({host:'other-host',generation:2}); wishlistLifecycle.render({generation:3}); wishlistLifecycle.start()");
          await waitForCommands(page, 2);
          await finish(page, 0, 0, receipt, rejected);
          const stale = await page.evaluate("wishlistLifecycle.snapshot()");
          assertNoPublication(stale);
          assert.equal(stale.busy, true, "Old finally must not release the current write lock");
          await finish(page, 1, 1);
          const current = await page.evaluate("wishlistLifecycle.snapshot()");
          assert.equal(current.selected, "received-1");
          assert.equal(current.error, null);
          assert.equal(current.busy, false);
        });
      }

      await scenario(`a captured ${kind} callback cannot write after target generation changes`, async page => {
        await page.evaluate(`wishlistLifecycle.render({}); wishlistLifecycle.capture(); wishlistLifecycle.render({host:'other-host',generation:2}); wishlistLifecycle.render({generation:3}); wishlistLifecycle.start([${JSON.stringify(kind)}],{captured:true})`);
        await page.waitForFunction("wishlistLifecycle.settled(0)");
        assert.equal(await page.evaluate("wishlistLifecycle.commandCount()"), 0);
        assertNoPublication(await page.evaluate("wishlistLifecycle.snapshot()"));
      });
    }

    for (const kind of ["receive", "add", "status", "delete"]) {
      await scenario(`target change during ${kind} refresh preserves the new write and its UI`, async page => {
        await page.evaluate(`wishlistLifecycle.render({deferRefresh:true,refreshFailure:'${kind === "receive" ? "spools" : "wishlist"}'}); wishlistLifecycle.start([${JSON.stringify(kind)}])`);
        await waitForCommands(page, 1);
        await page.evaluate(`wishlistLifecycle.finish(0,${JSON.stringify(receipt)})`);
        await page.waitForFunction("wishlistLifecycle.snapshot().reloads.length > 0");
        await page.evaluate("wishlistLifecycle.render({host:'other-host',generation:2}); wishlistLifecycle.start(); wishlistLifecycle.releaseRefreshes()");
        await waitForCommands(page, 2);
        await page.waitForFunction("wishlistLifecycle.settled(0)");
        const state = await page.evaluate("wishlistLifecycle.snapshot()");
        assert.equal(state.busy, true);
        assert.equal(state.error, null);
        assert.equal(state.info, null);
        assert.equal(state.selected, null);
        assert.deepEqual(state.resets, []);
        assert.deepEqual(state.added, []);
        await finish(page, 1, 1);
        assert.equal((await page.evaluate("wishlistLifecycle.snapshot()")).selected, "received-1");
      });
    }
  } finally { await browser.close(); }
});
