import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function buildCreateHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(requireFromUi.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__inventory_create_lifecycle_entry__.js", import.meta.url));
  const hook = fileURLToPath(new URL("./use_inventory_create_actions.ts", import.meta.url));
  const source = `
    import React, { useCallback, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryCreateActions } from ${JSON.stringify(hook)};
    const commands = [], operations = [], receipts = [], reloads = [], resets = [], refreshes = [];
    window.__TAURI__ = { invoke: (command, payload) => new Promise((resolve, reject) => {
      commands.push({ command, payload, resolve, reject });
    }) };
    const master = { id: "master-1", vendor: "Bambu Lab", material: "PLA",
      filament_name: "Basic", color_name: "White", hex_color: "#ffffff", default_weight_g: 1000 };
    let actions, snapshot;
    function Harness({ host = "host-a", generation = 1, session = 1, mode = "manual",
      label = "First", prefix = "Added to inventory", refreshFailure, deferRefresh = false }) {
      const [busy, setBusy] = useState(false);
      const [info, setInfoMessage] = useState(null);
      const [error, setError] = useState(null);
      const [selected, setSelectedSpoolId] = useState(null);
      const [recent, setRecentlyAddedSpoolId] = useState(null);
      const onSpoolCreated = useCallback(receipt => {
        receipts.push({ ...receipt, frozen: Object.isFrozen(receipt) });
      }, []);
      actions = useInventoryCreateActions({
        borrowedFromContact: "", borrowedFromName: "", borrowedInNote: "",
        bambuCodeBatch: { creatableRows: [{ master }, { master: { ...master, id: "master-2" } }] },
        busy, canUseClientHostWrite: () => true,
        clientHostBaseUrl: host ? "http://" + host : null,
        clientLibraryId: host ? "library-" + host : null,
        clientReadOnly: Boolean(host), clientTargetGeneration: host ? generation : null,
        confirmWishlistRemoveId: null, createMode: mode, createSessionId: session,
        ensureLocalWriteAllowed: () => true,
        manualColorName: "White", manualFilamentName: label, manualHexColor: "#ffffff",
        manualMaterial: "PLA", manualVendor: "Generic", newInitialWeight: "1000",
        newLocation: "Shelf A", newOwnershipType: "OWNED",
        onSpoolCreated, onWishlistItemCreated: () => {},
        reloadSpools: async () => {
          reloads.push("spools");
          if (deferRefresh) await new Promise(resolve => refreshes.push(resolve));
          if (refreshFailure === "spools") throw new Error("Refresh failed");
        },
        reloadCatalog: async () => {
          reloads.push("catalog");
          if (refreshFailure === "catalog") throw new Error("Refresh failed");
        },
        reloadWishlist: async () => {},
        resetAfterCreatedSpool: () => { resets.push("single"); },
        resetBambuBatchInput: () => { resets.push("batch"); },
        selectedBambuMaster: master, selectedEsunMaster: master,
        setBusy, setConfirmWishlistRemoveId: () => {}, setError, setInfoMessage,
        setRecentlyAddedSpoolId, setSelectedSpoolId, tauriAvailable: true,
        t: (key, fallback = "") => key === "inventory.addedToInventory" ? prefix : fallback,
      });
      snapshot = { busy, info, error, selected, recent };
      return React.createElement("output", null, JSON.stringify(snapshot));
    }
    const root = createRoot(document.getElementById("root"));
    window.createLifecycle = {
      render: options => flushSync(() => root.render(React.createElement(Harness, options))),
      start: (kinds = ["single"]) => flushSync(() => {
        for (const kind of kinds) {
          const operation = { settled: false };
          operations.push(operation);
          const pending = kind === "batch" ? actions.handleCreateBambuCodeBatch() : actions.handleCreateSpool();
          pending.finally(() => { operation.settled = true; });
        }
      }),
      finish: (index, id = "authoritative-host-spool", reject = false) => {
        if (reject) commands[index].reject(new Error("Write rejected"));
        else commands[index].resolve(id);
      },
      releaseRefresh: index => refreshes[index](),
      settled: index => operations[index].settled,
      commandCount: () => commands.length,
      snapshot: () => ({ ...snapshot, receipts: [...receipts], reloads: [...reloads], resets: [...resets] }),
      commands: () => commands.map(({ command, payload }) => ({ command, payload })),
      freezeClock: () => { Date.now = () => 1777777777777; },
    };
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "create-lifecycle", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }],
    build: { write: false, minify: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "InventoryCreateLifecycle" } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(script);
  return `<html><head><meta charset="utf-8"></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

async function waitForCommand(page: Page, count: number) {
  await page.waitForFunction(`createLifecycle.commandCount() === ${count}`);
}

async function finishOperation(page: Page, command: number, operation: number, id: string, reject = false) {
  await page.evaluate(`createLifecycle.finish(${command}, ${JSON.stringify(id)}, ${reject})`);
  await page.waitForFunction(`createLifecycle.settled(${operation})`);
}

test("real registration hook protects its commit receipt and session ownership", async context => {
  const document = await buildCreateHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: document }));
          await page.goto("http://localhost/registration-hook");
          await run(page);
          assert.deepEqual(errors, []);
        } finally {
          await page.close();
        }
      });
    }

    await scenario("same-turn single and batch submissions share one immediate lock", async page => {
      await page.evaluate("createLifecycle.render({mode:'bambu'}); createLifecycle.start(['single','single','batch'])");
      await waitForCommand(page, 1);
      await finishOperation(page, 0, 0, "host-single");
      assert.equal(await page.evaluate("createLifecycle.commandCount()"), 1);
      assert.equal((await page.evaluate("createLifecycle.snapshot()")).receipts[0].spoolId, "host-single");

      await page.evaluate("createLifecycle.render({mode:'bambu',session:2}); createLifecycle.start(['batch','single','batch'])");
      await waitForCommand(page, 2);
      await page.evaluate("createLifecycle.finish(1, 'batch-first')");
      await waitForCommand(page, 3);
      await finishOperation(page, 2, 3, "batch-second");
      assert.equal(await page.evaluate("createLifecycle.commandCount()"), 3);
      const result = await page.evaluate("createLifecycle.snapshot()");
      assert.equal(result.receipts.length, 1, "batch success must not publish a single-roll receipt");
      assert.equal(result.selected, "batch-second");
    });

    for (const refreshFailure of ["spools", "catalog"]) {
      await scenario(`confirmed Host ID and captured copy survive ${refreshFailure} refresh failure`, async page => {
        await page.evaluate(`createLifecycle.render({refreshFailure:${JSON.stringify(refreshFailure)}}); createLifecycle.start()`);
        await waitForCommand(page, 1);
        await page.evaluate(`createLifecycle.render({label:'Later',prefix:'Changed language',refreshFailure:${JSON.stringify(refreshFailure)}})`);
        await finishOperation(page, 0, 0, "server-returned-id");
        const result = await page.evaluate("createLifecycle.snapshot()");
        assert.deepEqual(result.receipts, [{ spoolId: "server-returned-id", message: "Added to inventory: First · White", frozen: true }]);
        assert.equal(result.selected, "server-returned-id");
        assert.equal(result.recent, "server-returned-id");
        assert.equal(result.error, "Failed to load inventory.");
        assert.deepEqual(result.resets, ["single"]);
        assert.deepEqual(result.reloads, ["spools", "catalog"]);
        assert.equal(await page.evaluate("createLifecycle.commandCount()"), 1);
      });
    }

    await scenario("rejected registration preserves the draft and never announces success", async page => {
      await page.evaluate("createLifecycle.render({}); createLifecycle.start()");
      await waitForCommand(page, 1);
      await finishOperation(page, 0, 0, "unused", true);
      const result = await page.evaluate("createLifecycle.snapshot()");
      assert.deepEqual(result.receipts, []);
      assert.deepEqual(result.resets, []);
      assert.deepEqual(result.reloads, []);
      assert.equal(result.selected, null);
      assert.equal(result.busy, false);
      assert.match(result.error, /^Failed to create spool/);
    });

    for (const change of [
      "createLifecycle.render({host:'host-b',generation:2}); createLifecycle.render({host:'host-a',generation:3})",
      "createLifecycle.render({session:2})",
    ]) {
      await scenario(change.includes("host-b") ? "A→B→A invalidates the original operation" : "a new Add session invalidates the original operation", async page => {
        await page.evaluate("createLifecycle.render({}); createLifecycle.start()");
        await waitForCommand(page, 1);
        await page.evaluate(`${change}; createLifecycle.start()`);
        await waitForCommand(page, 2);
        await finishOperation(page, 0, 0, "old-id");
        const old = await page.evaluate("createLifecycle.snapshot()");
        assert.deepEqual(old.receipts, []);
        assert.deepEqual(old.reloads, []);
        assert.deepEqual(old.resets, []);
        assert.equal(old.selected, null);
        assert.equal(old.busy, true, "old finally must not release the new session's busy lock");
        await finishOperation(page, 1, 1, "current-id");
        assert.equal((await page.evaluate("createLifecycle.snapshot()")).receipts[0].spoolId, "current-id");
      });
    }

    await scenario("scope changes during refresh cannot overwrite a newer session", async page => {
      await page.evaluate("createLifecycle.render({deferRefresh:true,refreshFailure:'spools'}); createLifecycle.start()");
      await waitForCommand(page, 1);
      await page.evaluate("createLifecycle.finish(0, 'already-committed')");
      await page.waitForFunction("createLifecycle.snapshot().receipts.length === 1");
      await page.evaluate("createLifecycle.render({session:2}); createLifecycle.start()");
      await waitForCommand(page, 2);
      await page.evaluate("createLifecycle.releaseRefresh(0)");
      await page.waitForFunction("createLifecycle.settled(0)");
      const duringNewWrite = await page.evaluate("createLifecycle.snapshot()");
      assert.equal(duringNewWrite.busy, true);
      assert.equal(duringNewWrite.error, null);
      assert.equal(duringNewWrite.receipts.length, 1);
      await finishOperation(page, 1, 1, "new-session-id");
      const result = await page.evaluate("createLifecycle.snapshot()");
      assert.deepEqual(result.receipts.map(({ spoolId }: { spoolId: string }) => spoolId), ["already-committed", "new-session-id"]);
    });

    await scenario("two completed local Another sessions have unique IDs with a frozen clock", async page => {
      await page.evaluate("createLifecycle.freezeClock(); createLifecycle.render({host:null}); createLifecycle.start()");
      await waitForCommand(page, 1);
      await finishOperation(page, 0, 0, "ignored-local-return");
      await page.evaluate("createLifecycle.start()");
      await page.waitForFunction("createLifecycle.settled(1)");
      assert.equal(await page.evaluate("createLifecycle.commandCount()"), 1,
        "a completed Add session must reject a stale resubmission until Another advances its session");
      await page.evaluate("createLifecycle.render({host:null,session:2}); createLifecycle.start()");
      await waitForCommand(page, 2);
      await finishOperation(page, 1, 2, "ignored-local-return");
      const commands = await page.evaluate("createLifecycle.commands()");
      const ids = commands.map(({ payload }: { payload: { input: { id: string } } }) => payload.input.id);
      assert.notEqual(ids[0], ids[1]);
      assert.ok(ids.every((id: string) => /^spool_[0-9a-f-]{36}$/.test(id)));
      assert.ok(commands.every(({ command }: { command: string }) => command === "create_manual_spool"));
      const receipts = (await page.evaluate("createLifecycle.snapshot()")).receipts;
      assert.deepEqual(receipts.map(({ spoolId }: { spoolId: string }) => spoolId), ids);
    });
  } finally {
    await browser.close();
  }
});
