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
  const modal = fileURLToPath(new URL("../components/inventory_load_spool_modal.tsx", import.meta.url));
  const i18n = fileURLToPath(new URL("./i18n.ts", import.meta.url));
  const source = `
    import React, { useCallback, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryLoadSpoolAction } from ${JSON.stringify(hook)};
    import { InventoryLoadSpoolModal } from ${JSON.stringify(modal)};
    import { I18nContext } from ${JSON.stringify(i18n)};
    const commands = [], operations = [], messages = [], reloads = [];
    const t = (_key, fallback = "", params = {}) => fallback.replace(/\\{(\\w+)\\}/g,
      (match, key) => String(params[key] ?? match));
    let failReload = false, reportedResolution = "LIVE", oldConfirm;
    window.__TAURI__ = { invoke: (command, payload) => new Promise((resolve, reject) => {
      commands.push({ command, payload, resolve, reject });
    }) };
    const initialSlots = [
      { printerId: "printer", printerName: "Workshop", printerModel: "Bambu P1S",
        amsId: "printer_ams_2", slotId: "slot-3", slotIndex: 3, spoolId: null },
      { printerId: "printer", printerName: "Workshop", printerModel: "Bambu P1S",
        amsId: "printer_ext", slotId: "slot-ext", slotIndex: 1, spoolId: null },
    ];
    let slots = initialSlots, actions, snapshot, currentProps;
    function Harness({ host, generation, spoolId }) {
      const [busy, setManageBusy] = useState(false);
      const [info, setInfo] = useState(null);
      const [error, setError] = useState(null);
      const setInfoMessage = useCallback(value => { messages.push(value); setInfo(value); }, []);
      actions = useInventoryLoadSpoolAction({
        assignedSlot: null, canUseClientHostWrite: () => true,
        clientHostBaseUrl: "http://" + host, clientLibraryId: "library-" + host,
        clientReadOnly: host !== "local", clientTargetGeneration: generation,
        ensureLocalWriteAllowed: () => true, loanedOut: false, manageBusy: busy,
        printerSlots: slots,
        reloadPrinterOverview: async report => { reloads.push("printers"); report?.("printers", reportedResolution); },
        reloadSpoolDetail: async id => { reloads.push("detail:" + id); },
        reloadSpools: async () => { reloads.push("spools"); if (failReload) throw new Error("Refresh failed"); },
        selectedSpool: { id: spoolId, masterId: "master", vendor: "Bambu Lab",
          material: "PLA", filamentName: "Basic", colorName: "White",
          initialWeightGrams: 1000, status: "IN_STOCK", ownershipType: "OWNED" },
        setError, setInfoMessage, setManageBusy, tauriAvailable: true,
        t,
      });
      snapshot = { busy, info, error };
      return React.createElement(I18nContext.Provider, { value: { locale: "en", setLocale: () => {}, t } },
        React.createElement("button", { onClick: actions.openLoadSpoolModal }, "Open load dialog"),
        React.createElement("output", null, JSON.stringify(snapshot)),
        React.createElement(InventoryLoadSpoolModal, {
          busy, open: actions.showLoadSpoolModal, error: actions.loadSpoolError ?? null,
          onClose: actions.closeLoadSpoolModal,
          onConfirm: id => operations.push(actions.confirmLoadSpool(id)),
          slots: actions.availableSlots,
          slotLabelById: new Map([["slot-3", "AMS 2 Slot 3"], ["slot-ext", "External slot"]]),
          spool: { id: spoolId, vendor: "Bambu Lab", material: "PLA", colorName: "White" },
        }));
    }
    const root = createRoot(document.getElementById("root"));
    window.loadLifecycle = {
      render: (host, generation, spoolId = "spool-1") => {
        currentProps = { host, generation, spoolId };
        flushSync(() => root.render(React.createElement(Harness, currentProps)));
      },
      start: slotId => {
        flushSync(() => actions.openLoadSpoolModal());
        flushSync(() => operations.push(actions.confirmLoadSpool(slotId)));
      },
      refreshSlots: ids => {
        slots = initialSlots.filter(slot => ids.includes(slot.slotId)).map(slot => ({ ...slot }));
        flushSync(() => root.render(React.createElement(Harness, currentProps)));
      },
      failReload: () => { failReload = true; },
      reportReload: resolution => { reportedResolution = resolution; },
      saveCallback: () => { oldConfirm = actions.confirmLoadSpool; },
      callOldCallback: () => { void oldConfirm("slot-3"); },
      doubleSubmitAndClose: () => {
        flushSync(() => {
          operations.push(actions.confirmLoadSpool("slot-ext"));
          actions.confirmLoadSpool("slot-ext");
          actions.closeLoadSpoolModal();
        });
      },
      reject: async index => {
        commands[index].reject(new Error("Selected slot is occupied"));
        await operations[index];
        flushSync(() => {});
      },
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
    assert.ok(commands.every(({ command }: { command: string }) => command === "operate_library_sync_host_printer_slot"));
    assert.deepEqual(commands[0].payload.input.operation, {
      printer_id: "printer", slot_id: "slot-3", expected_current_spool_id: null,
      target_spool_id: "spool-1", outgoing_measured_total_g: null, incoming_measured_total_g: null,
    });
    assert.equal(commands[0].payload.input.expected_target_generation, 1);
    assert.equal(commands[1].payload.input.expected_target_generation, 3);
    assert.equal(commands[1].payload.input.operation.slot_id, "slot-ext");
    assert.equal(commands[3].payload.input.operation.target_spool_id, "spool-2");
    assert.deepEqual(browserErrors, []);
    await page.evaluate("loadLifecycle.unmount()");
  } finally {
    await browser.close();
  }
});

test("rendered load dialog keeps its destination and distinguishes writes from refreshes", async (t) => {
  const document = await buildLifecycleHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(check: (page: import("playwright").Page) => Promise<void>) {
      const page = await browser.newPage();
      page.setDefaultTimeout(10_000);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.setContent(document);
        await page.evaluate("loadLifecycle.render('host-a', 1)");
        await page.getByRole("button", { name: "Open load dialog" }).click();
        await check(page);
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    }

    await t.test("refresh preserves an available destination; removing it requires an explicit new choice", () => run(async page => {
      await page.getByRole("radio", { name: "External slot" }).check();
      await page.evaluate("loadLifecycle.refreshSlots(['slot-3', 'slot-ext'])");
      assert.equal(await page.getByRole("radio", { name: "External slot" }).isChecked(), true);
      await page.evaluate("loadLifecycle.refreshSlots(['slot-3'])");
      assert.equal(await page.getByRole("button", { name: "Load in printer", exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("radio", { name: "AMS 2 Slot 3" }).isChecked(), false);
      await page.evaluate("loadLifecycle.refreshSlots(['slot-3', 'slot-ext'])");
      assert.equal(await page.getByRole("button", { name: "Load in printer", exact: true }).isDisabled(), true);
      await page.getByRole("radio", { name: "AMS 2 Slot 3" }).check();
      await page.getByRole("button", { name: "Load in printer", exact: true }).click();
      await page.waitForFunction("loadLifecycle.commandCount() === 1");
      assert.equal((await page.evaluate("loadLifecycle.commands()"))[0].payload.input.operation.slot_id, "slot-3");
      await page.evaluate("loadLifecycle.finish(0)");
    }));

    await t.test("write rejection is visible inside the dialog and retains the selected slot", () => run(async page => {
      await page.getByRole("radio", { name: "External slot" }).check();
      await page.getByRole("button", { name: "Load in printer", exact: true }).click();
      await page.waitForFunction("loadLifecycle.commandCount() === 1");
      await page.evaluate("loadLifecycle.reject(0)");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("alert").waitFor();
      assert.ok((await dialog.getByRole("alert").innerText()).length > 0);
      assert.equal(await dialog.getByRole("radio", { name: "External slot" }).isChecked(), true);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Open load dialog" }).click();
      assert.equal(await page.getByRole("alert").count(), 0);
      assert.equal(await page.getByRole("radio", { name: "AMS 2 Slot 3" }).isChecked(), true);
    }));

    await t.test("same-event duplicate submission and close cannot bypass the write lock", () => run(async page => {
      await page.evaluate("loadLifecycle.doubleSubmitAndClose()");
      await page.waitForFunction("loadLifecycle.commandCount() === 1");
      assert.equal(await page.getByRole("dialog").count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 1);
      await page.evaluate("loadLifecycle.finish(0)");
      await page.waitForFunction("!loadLifecycle.snapshot().busy");
      assert.equal(await page.getByRole("dialog").count(), 0);
    }));

    await t.test("accepted write closes the dialog and retains its receipt when refresh rejects", () => run(async page => {
      await page.evaluate("loadLifecycle.failReload()");
      await page.getByRole("button", { name: "Load in printer", exact: true }).click();
      await page.waitForFunction("loadLifecycle.commandCount() === 1");
      await page.evaluate("loadLifecycle.finish(0)");
      await page.waitForFunction("!loadLifecycle.snapshot().busy");
      assert.equal(await page.getByRole("dialog").count(), 0);
      const snapshot = await page.evaluate("loadLifecycle.snapshot()");
      assert.deepEqual(snapshot.messages, ["Roll loaded in Workshop · AMS 2 · Slot 3."]);
      assert.ok(snapshot.error);
      assert.equal(await page.evaluate("loadLifecycle.commandCount()"), 1);
    }));

    await t.test("Host generation and spool changes close the old dialog without reopening it on return", () => run(async page => {
      await page.evaluate("loadLifecycle.render('host-b', 2)");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.evaluate("loadLifecycle.render('host-a', 1)");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByRole("button", { name: "Open load dialog" }).click();
      await page.evaluate("loadLifecycle.render('host-a', 1, 'spool-2')");
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.evaluate("loadLifecycle.commandCount()"), 0);
    }));

    for (const resolution of ["ERROR", "OFFLINE", "CACHED"]) {
      await t.test(`accepted write survives a reported ${resolution} refresh without offering another submission`, () => run(async page => {
        await page.evaluate(`loadLifecycle.reportReload(${JSON.stringify(resolution)})`);
        await page.getByRole("button", { name: "Load in printer", exact: true }).click();
        await page.waitForFunction("loadLifecycle.commandCount() === 1");
        await page.evaluate("loadLifecycle.finish(0)");
        await page.waitForFunction("!loadLifecycle.snapshot().busy");
        assert.equal(await page.getByRole("dialog").count(), 0);
        const snapshot = await page.evaluate("loadLifecycle.snapshot()");
        assert.deepEqual(snapshot.messages, ["Roll loaded in Workshop · AMS 2 · Slot 3."]);
        assert.ok(snapshot.error);
        assert.equal(await page.evaluate("loadLifecycle.commandCount()"), 1);
      }));
    }

    await t.test("a callback retained from an earlier opening cannot submit into the new dialog", () => run(async page => {
      await page.evaluate("loadLifecycle.saveCallback()");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Open load dialog" }).click();
      await page.evaluate("loadLifecycle.callOldCallback()");
      assert.equal(await page.evaluate("loadLifecycle.commandCount()"), 0);
    }));

    await t.test("local loading uses the same empty-slot precondition without submitting a weight", () => run(async page => {
      await page.evaluate("loadLifecycle.render('local', 0)");
      await page.getByRole("button", { name: "Open load dialog" }).click();
      await page.getByRole("button", { name: "Load in printer", exact: true }).click();
      await page.waitForFunction("loadLifecycle.commandCount() === 1");
      assert.deepEqual((await page.evaluate("loadLifecycle.commands()"))[0], {
        command: "operate_printer_slot",
        payload: { input: {
          printer_id: "printer", slot_id: "slot-3", expected_current_spool_id: null,
          target_spool_id: "spool-1", outgoing_measured_total_g: null, incoming_measured_total_g: null,
        } },
      });
      await page.evaluate("loadLifecycle.finish(0)");
      await page.waitForFunction("!loadLifecycle.snapshot().busy");
    }));
  } finally {
    await browser.close();
  }
});
