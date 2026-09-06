import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function buildLifecycleHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(requireFromUi.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__inventory_load_spool_lifecycle_virtual_entry__.js", import.meta.url));
  const hook = fileURLToPath(new URL("./use_inventory_load_spool_action.ts", import.meta.url));
  const source = `
    import React, { useCallback, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryLoadSpoolAction } from ${JSON.stringify(hook)};
    const commands = [], operations = [], messages = [], reloads = [];
    window.__TAURI__ = { invoke: (command, payload) => new Promise(resolve => {
      commands.push({ command, payload, resolve });
    }) };
    const slots = [
      { printerId: "printer", printerName: "Workshop", printerModel: "Bambu P1S",
        amsId: "printer_ams_2", slotId: "slot-3", slotIndex: 3, spoolId: null },
      { printerId: "printer", printerName: "Workshop", printerModel: "Bambu P1S",
        amsId: "printer_ext", slotId: "slot-ext", slotIndex: 1, spoolId: null },
    ];
    let actions, snapshot;
    function Harness({ host, generation, spoolId }) {
      const [busy, setManageBusy] = useState(false);
      const [info, setInfo] = useState(null);
      const [error, setError] = useState(null);
      const setInfoMessage = useCallback(value => { messages.push(value); setInfo(value); }, []);
      actions = useInventoryLoadSpoolAction({
        assignedSlot: null, canUseClientHostWrite: () => true,
        clientHostBaseUrl: "http://" + host, clientLibraryId: "library-" + host,
        clientReadOnly: true, clientTargetGeneration: generation,
        ensureLocalWriteAllowed: () => false, loanedOut: false, manageBusy: busy,
        printerSlots: slots,
        reloadPrinterOverview: async () => { reloads.push("printers"); },
        reloadSpoolDetail: async id => { reloads.push("detail:" + id); },
        reloadSpools: async () => { reloads.push("spools"); },
        selectedSpool: { id: spoolId, masterId: "master", vendor: "Bambu Lab",
          material: "PLA", filamentName: "Basic", colorName: "White",
          initialWeightGrams: 1000, status: "IN_STOCK", ownershipType: "OWNED" },
        setError, setInfoMessage, setManageBusy, tauriAvailable: true,
        t: (_key, fallback = "", params = {}) => fallback.replace(/\\{(\\w+)\\}/g,
          (match, key) => String(params[key] ?? match)),
      });
      snapshot = { busy, info, error };
      return React.createElement("output", null, JSON.stringify(snapshot));
    }
    const root = createRoot(document.getElementById("root"));
    window.loadLifecycle = {
      render: (host, generation, spoolId = "spool-1") => {
        flushSync(() => root.render(React.createElement(Harness, { host, generation, spoolId })));
      },
      start: slotId => { flushSync(() => operations.push(actions.confirmLoadSpool(slotId))); },
      finish: async index => {
        commands[index].resolve();
        await operations[index];
        flushSync(() => {});
      },
      commandCount: () => commands.length,
      snapshot: () => ({ ...snapshot, messages: [...messages], reloads: [...reloads] }),
      commands: () => commands.map(({ command, payload }) => ({ command, payload })),
      unmount: () => flushSync(() => root.unmount()),
    };
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "error",
    plugins: [{ name: "load-spool-lifecycle", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }],
    build: { write: false, minify: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "InventoryLoadSpoolLifecycle" } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(script, "the actual React hook must be bundled into the browser harness");
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

test("rendered load hook rejects old Host generations and selected-spool completions", async () => {
  const document = await buildLifecycleHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    await page.setContent(document);
    await page.evaluate("loadLifecycle.render('host-a', 1); loadLifecycle.start('slot-3')");
    await page.waitForFunction("loadLifecycle.commandCount() === 1");
    assert.equal((await page.evaluate("loadLifecycle.snapshot()")).busy, true);

    await page.evaluate("loadLifecycle.render('host-b', 2); loadLifecycle.render('host-a', 3)");
    assert.equal((await page.evaluate("loadLifecycle.snapshot()")).busy, false);
    await page.evaluate("loadLifecycle.start('slot-ext')");
    await page.waitForFunction("loadLifecycle.commandCount() === 2");
    await page.evaluate("loadLifecycle.finish(0)");
    assert.deepEqual(await page.evaluate("loadLifecycle.snapshot()"), {
      busy: true, info: null, error: null, messages: [], reloads: [],
    });
    await page.evaluate("loadLifecycle.finish(1)");
    await page.waitForFunction("!loadLifecycle.snapshot().busy");
    const completed = await page.evaluate("loadLifecycle.snapshot()");
    assert.deepEqual(completed.messages, ["Roll loaded in Workshop · EXT Slot."]);
    assert.deepEqual(completed.reloads, ["spools", "printers", "detail:spool-1"]);

    await page.evaluate("loadLifecycle.start('slot-3')");
    await page.waitForFunction("loadLifecycle.commandCount() === 3");
    await page.evaluate("loadLifecycle.render('host-a', 3, 'spool-2'); loadLifecycle.start('slot-ext')");
    await page.waitForFunction("loadLifecycle.commandCount() === 4");
    await page.evaluate("loadLifecycle.finish(2)");
    const changedSpool = await page.evaluate("loadLifecycle.snapshot()");
    assert.equal(changedSpool.busy, true);
    assert.deepEqual(changedSpool.messages, completed.messages);
    assert.deepEqual(changedSpool.reloads, completed.reloads);
    await page.evaluate("loadLifecycle.finish(3)");
    await page.waitForFunction("!loadLifecycle.snapshot().busy");
    const commands = await page.evaluate("loadLifecycle.commands()");
    assert.ok(commands.every(({ command }: { command: string }) => command === "assign_library_sync_host_printer_slot"));
    assert.equal(commands[0].payload.input.slot_id, "slot-3");
    assert.equal(commands[1].payload.input.slot_id, "slot-ext");
    assert.equal(commands[3].payload.input.spool_id, "spool-2");
    assert.deepEqual(browserErrors, []);
    await page.evaluate("loadLifecycle.unmount()");
  } finally {
    await browser.close();
  }
});
