import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function buildPrinterWeightHarness() {
  const requireUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }] = await Promise.all([
    import(pathToFileURL(requireUi.resolve("vite")).href),
    import(pathToFileURL(requireUi.resolve("@vitejs/plugin-react")).href),
  ]);
  const entry = fileURLToPath(new URL("./__printer_weight_harness__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React, { useCallback, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { usePrinterSlotInteractions } from ${file("./use_printer_slot_interactions.ts")};
    import { IncomingWeightModal } from ${file("../components/incoming_weight_modal.tsx")};
    import { I18nContext } from ${file("../lib/i18n.ts")};
    const slot = id => ({ slot_id: "slot-1", ams_id: "ams-1", slot_index: 1,
      spool_id: id, spool_remaining_g: id ? 500 : null, spool_material: "PLA",
      spool_filament_name: "Basic", spool_color_name: id });
    const spools = ["A", "B", "C"].map(id => ({
      spool: { id, remaining_g: 500, spool_tare_weight_g: 200,
        status: "IN_STOCK", normalized_status: "IN_STOCK" },
      master: { id: "master-" + id, vendor: "Generic", material: "PLA",
        filament_name: "Basic", color_name: id },
    }));
    const writes = [], reads = [], feedback = [], observedAt = new Date().toISOString();
    let workflow, snapshot, currentSlot, retained, settled = 0;
    let options = { current: "A", host: null, library: "library-A", generation: 1,
      ready: true, tauri: true, ams: false };
    window.__TAURI__ = { invoke: (command, payload) => {
      if (!["operate_printer_slot", "operate_library_sync_host_printer_slot", "accept_bambu_live_weight_estimate"].includes(command)) {
        return Promise.reject(new Error("Unexpected non-atomic write: " + command));
      }
      return new Promise((resolve, reject) => writes.push({ command, payload, resolve, reject }));
    } };
    const reloadData = () => new Promise((resolve, reject) => reads.push({ resolve, reject }));
    const allow = () => true, t = (key, fallback = "") => fallback;
    const i18n = { locale: "en", setLocale: () => {}, t };
    const save = (count = 1) => {
      const confirm = workflow.confirmIncomingWeightDialog;
      for (let index = 0; index < count; index += 1) {
        Promise.resolve(confirm()).finally(() => { settled += 1; });
      }
    };
    const accept = () => {
      Promise.resolve(workflow.acceptIncomingAmsWeightEstimate()).finally(() => { settled += 1; });
    };
    function Harness({ current, host, library, generation, ready, tauri, ams }) {
      const [busy, setBusy] = useState(false), [error, setError] = useState(null),
        [info, setInfo] = useState(null);
      const trackBusy = useCallback(value => { feedback.push(["busy", value]); setBusy(value); }, []);
      const trackError = useCallback(value => { feedback.push(["error", value]); setError(value); }, []);
      const trackInfo = useCallback(value => { feedback.push(["info", value]); setInfo(value); }, []);
      currentSlot = slot(current);
      const integrations = ams ? { "printer-1": { enabled: true, observed_state: {
        online: true, mqtt_connected: true, trays: [{ tray_index: 0, loaded: true,
          match_status: "clear_match", matched_inventory_mode: "exact_rfid",
          matched_inventory_spool_id: current, remaining_grams: 400,
          remaining_percent: 40, tray_weight_g: 1000 }],
      } } } : {};
      if (ams) Object.assign(currentSlot, { live_loaded: true, live_match_status: "clear_match",
        live_matched_inventory_mode: "exact_rfid", live_matched_inventory_spool_id: current,
        live_remaining_grams: 400, live_remaining_percent: 40, live_tray_weight_g: 1000,
        live_weight_seen_at: observedAt, live_last_identity_seen_at: observedAt });
      workflow = usePrinterSlotInteractions({
        bambuLiveIntegrations: integrations, busy, canUseClientHostWrite: allow,
        clientHostBaseUrl: host ? "http://" + host : null,
        clientLibraryId: host ? library : null, clientPrinterSource: "LIVE",
        clientReadOnly: Boolean(host), clientTargetGeneration: generation,
        ensureLocalWriteAllowed: allow, librarySyncReady: ready, locale: "en",
        printers: [{ printer: { id: "printer-1", model: "P1S", name: "QA" }, slots: [currentSlot] }],
        reloadData, setBusy: trackBusy, setError: trackError, setInfo: trackInfo,
        spools, tauri, t,
      });
      snapshot = () => ({ busy, error, info, prompt: workflow.incomingWeightPrompt });
      return <I18nContext.Provider value={i18n}>
        <button onClick={() => workflow.openEmptySlotWeightDialog("printer-1", currentSlot)}>Unload</button>
        <button onClick={() => workflow.openIncomingWeightDialog("printer-1", currentSlot,
          spools.find(row => row.spool.id === current))}>Update weight</button>
        <button onClick={() => workflow.openIncomingWeightDialog("printer-1", currentSlot, spools[2])}>Load C</button>
        {workflow.incomingWeightPrompt && <IncomingWeightModal
          amsEstimateAvailable={workflow.liveAmsWeightAvailable} busy={busy} error={error} prompt={workflow.incomingWeightPrompt}
          incomingWeightValue={workflow.incomingWeightValue} outgoingWeightValue={workflow.outgoingWeightValue}
          onIncomingWeightChange={workflow.setIncomingWeightValue}
          onOutgoingWeightChange={workflow.setOutgoingWeightValue}
          onCancel={workflow.cancelIncomingWeightDialog} onSave={() => save()} onAcceptAmsEstimate={accept} />}
      </I18nContext.Provider>;
    }
    const root = createRoot(document.getElementById("root"));
    window.printerWeight = {
      render: patch => { options = { ...options, ...patch }; flushSync(() => root.render(<Harness {...options} />)); },
      reset: () => flushSync(() => workflow.resetPrinterInteractionState()),
      unmount: () => flushSync(() => root.unmount()), save, accept,
      retain: () => {
        const old = workflow, oldSlot = currentSlot;
        retained = { unload: () => old.openEmptySlotWeightDialog("printer-1", oldSlot),
          incoming: () => old.openIncomingWeightDialog("printer-1", oldSlot, spools[2]),
          cancel: old.cancelIncomingWeightDialog };
      },
      invokeRetained: action => flushSync(() => retained[action]()),
      completeWrite: index => writes[index].resolve(),
      rejectWrite: (index, code = "printers.slot_operation_stale") =>
        writes[index].reject(JSON.stringify({ code, safe_detail: "private diagnostic text", diagnostic_id: "internal-id" })),
      completeRead: index => reads[index].resolve(),
      rejectRead: index => reads[index].reject(new Error("Refresh failed")),
      snapshot: () => ({ ...snapshot(), writes: writes.map(({ command, payload }) => ({ command, payload })),
        reads: reads.length, feedback: [...feedback], settled }),
    };
    window.printerWeight.render({});
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    logLevel: "error", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{ name: "printer-weight-harness", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }, react()],
    build: { write: false, minify: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "PrinterWeightHarness" } },
  });
  const script = (Array.isArray(result) ? result : [result]).flatMap(result => result.output)
    .find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(script);
  return script;
}

async function openUnload(page: Page) {
  await page.getByRole("button", { name: "Unload", exact: true }).click();
  await page.getByRole("spinbutton").fill("600");
}

async function save(page: Page, expectedWrites: number) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(`printerWeight.snapshot().writes.length === ${expectedWrites}`);
}

async function complete(page: Page, index = 0) {
  await page.evaluate(`printerWeight.completeWrite(${index})`);
  await page.waitForFunction(`printerWeight.snapshot().reads === ${index + 1}`);
  await page.evaluate(`printerWeight.completeRead(${index})`);
  await page.waitForFunction("!printerWeight.snapshot().busy");
}

const clearOperation = {
  printer_id: "printer-1", slot_id: "slot-1", expected_current_spool_id: "A",
  target_spool_id: null, outgoing_measured_total_g: 600, incoming_measured_total_g: null,
};

test("rendered printer weight operations keep the original roll and session", async context => {
  const script = await buildPrinterWeightHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage();
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.setContent('<div id="root"></div>');
          await page.addScriptTag({ content: script });
          await run(page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }

    await scenario("a silent slot replacement rejects the old measured roll without writes", async page => {
      await openUnload(page);
      await page.evaluate("printerWeight.render({ current: 'B' })");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const state = await page.evaluate("printerWeight.snapshot()");
      assert.equal(state.prompt.expectedCurrentSpoolId, "A");
      assert.match(state.error, /roll in this slot changed/);
      assert.deepEqual(state.writes, []);
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /roll in this slot changed/);
      assert.equal(await page.getByRole("spinbutton").inputValue(), "600");
    });

    await scenario("failed atomic unload retries the same measured total without separate consumption writes", async page => {
      await openUnload(page);
      await save(page, 1);
      await page.evaluate("printerWeight.rejectWrite(0)");
      await page.waitForFunction("!printerWeight.snapshot().busy");
      assert.match((await page.evaluate("printerWeight.snapshot()")).error, /roll in this slot changed/);
      assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /roll in this slot changed/);
      await save(page, 2);
      const { writes } = await page.evaluate("printerWeight.snapshot()");
      assert.deepEqual(writes, [0, 1].map(() => ({ command: "operate_printer_slot", payload: { input: clearOperation } })));
      await page.evaluate("printerWeight.completeWrite(1)");
      await page.waitForFunction("printerWeight.snapshot().reads === 1");
      await page.evaluate("printerWeight.completeRead(0)");
      await page.waitForFunction("!printerWeight.snapshot().busy");
      assert.equal(await page.getByRole("dialog").count(), 0);
    });

    await scenario("validation stays visible in the dialog and fresh prompts clear obsolete feedback", async page => {
      await openUnload(page);
      await page.getByRole("spinbutton").fill("");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /Enter outgoing spool weight/);
      assert.deepEqual((await page.evaluate("printerWeight.snapshot()")).writes, []);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Update weight", exact: true }).click();
      assert.equal(await page.getByRole("dialog").getByRole("alert").count(), 0);
      assert.equal((await page.evaluate("printerWeight.snapshot()")).error, null);
      await page.getByRole("spinbutton").fill("");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /Weight value is invalid/);
      assert.equal(await page.getByRole("spinbutton").inputValue(), "");
    });

    await scenario("an unsupported Host shows a safe actionable error beside the retained weights", async page => {
      await page.evaluate("printerWeight.render({ host: 'old-host' })");
      await openUnload(page);
      await save(page, 1);
      await page.evaluate("printerWeight.rejectWrite(0, 'printers.slot_operation_host_unsupported')");
      await page.waitForFunction("!printerWeight.snapshot().busy");
      const message = await page.getByRole("dialog").getByRole("alert").innerText();
      assert.equal(message, "Upgrade the Host before changing printer slots or their weights. No changes were sent.");
      assert.doesNotMatch(message, /printers\.|private diagnostic|internal-id/);
      assert.equal(await page.getByRole("spinbutton").inputValue(), "600");
      assert.equal((await page.evaluate("printerWeight.snapshot()")).reads, 0);
      assert.equal((await page.evaluate("printerWeight.snapshot()")).writes.length, 1);
    });

    await scenario("same-roll updates retry absolute measurements and stay completed after a refresh failure", async page => {
      await page.getByRole("button", { name: "Update weight", exact: true }).click();
      await page.getByRole("spinbutton").fill("600");
      await save(page, 1);
      await page.evaluate("printerWeight.rejectWrite(0, 'common.invalid_request')");
      await page.waitForFunction("!printerWeight.snapshot().busy");
      await save(page, 2);
      const operation = { ...clearOperation, target_spool_id: "A", outgoing_measured_total_g: null,
        incoming_measured_total_g: 600 };
      assert.deepEqual((await page.evaluate("printerWeight.snapshot()")).writes,
        [0, 1].map(() => ({ command: "operate_printer_slot", payload: { input: operation } })));
      await page.evaluate("printerWeight.completeWrite(1)");
      await page.waitForFunction("printerWeight.snapshot().reads === 1");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.evaluate("printerWeight.rejectRead(0)");
      await page.waitForFunction("!printerWeight.snapshot().busy");
      const state = await page.evaluate("printerWeight.snapshot()");
      assert.equal(state.prompt, null);
      assert.equal(state.info, "Printer slot updated.");
      assert.equal(state.error, "Failed to load printer overview.");
      await page.evaluate("printerWeight.save()");
      assert.equal((await page.evaluate("printerWeight.snapshot()")).writes.length, 2);
    });

    await scenario("same-turn submissions share one synchronous write lock", async page => {
      await openUnload(page);
      await page.evaluate("printerWeight.save(2)");
      await page.waitForFunction("printerWeight.snapshot().writes.length === 1");
      await page.waitForFunction("printerWeight.snapshot().busy");
      assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
      await complete(page);
      assert.equal((await page.evaluate("printerWeight.snapshot()")).writes.length, 1);
    });

    await scenario("AMS acceptance and manual Save share the same operation lock", async page => {
      await page.evaluate("printerWeight.render({ ams: true })");
      await page.getByRole("button", { name: "Update weight", exact: true }).click();
      await page.getByRole("button", { name: "Use AMS estimate", exact: true }).waitFor();
      await page.evaluate("printerWeight.accept(); printerWeight.accept(); printerWeight.save()");
      await page.waitForFunction("printerWeight.snapshot().busy");
      const { writes } = await page.evaluate("printerWeight.snapshot()");
      assert.equal(writes.length, 1);
      assert.equal(writes[0].command, "accept_bambu_live_weight_estimate");
      assert.equal(writes[0].payload.input.spool_id, "A");
      assert.equal(writes[0].payload.input.expected_remaining_grams, 400);
      await complete(page);
      assert.equal((await page.evaluate("printerWeight.snapshot()")).info,
        "Weight updated from the current AMS estimate.");
    });

    await scenario("replacement and empty-slot loading send original occupant and both gross weights", async page => {
      await page.getByRole("button", { name: "Load C", exact: true }).click();
      await save(page, 1);
      assert.deepEqual((await page.evaluate("printerWeight.snapshot()")).writes[0].payload.input,
        { ...clearOperation, target_spool_id: "C", outgoing_measured_total_g: 700, incoming_measured_total_g: 700 });
      await complete(page);
      await page.evaluate("printerWeight.render({ current: null })");
      await page.getByRole("button", { name: "Load C", exact: true }).click();
      await save(page, 2);
      assert.deepEqual((await page.evaluate("printerWeight.snapshot()")).writes[1].payload.input,
        { ...clearOperation, expected_current_spool_id: null, target_spool_id: "C",
          outgoing_measured_total_g: null, incoming_measured_total_g: 700 });
      await complete(page, 1);
    });

    for (const [name, patch] of Object.entries({
      Host: { host: "host-B" }, library: { library: "library-B" },
      generation: { generation: 2 }, role: { host: null },
      readiness: { ready: false }, runtime: { tauri: false },
    })) {
      await scenario(`${name} changes invalidate pending writes and close the old prompt`, async page => {
        await page.evaluate("printerWeight.render({ host: 'host-A' })");
        await openUnload(page);
        await save(page, 1);
        assert.deepEqual((await page.evaluate("printerWeight.snapshot()")).writes[0], {
          command: "operate_library_sync_host_printer_slot", payload: { input: {
            base_url: "http://host-A", expected_library_id: "library-A", expected_target_generation: 1,
            operation: clearOperation,
          } },
        });
        await page.evaluate(patch => {
          const api = (window as unknown as { printerWeight: { render: (patch: unknown) => void } }).printerWeight;
          api.render(patch);
        }, patch);
        assert.equal(await page.getByRole("dialog").count(), 0);
        const before = await page.evaluate("printerWeight.snapshot()");
        assert.equal(before.busy, false);
        await page.evaluate("printerWeight.completeWrite(0)");
        await page.waitForFunction("printerWeight.snapshot().settled === 1");
        const after = await page.evaluate("printerWeight.snapshot()");
        assert.deepEqual(after.feedback, before.feedback);
        assert.equal(after.reads, 0);
      });
    }

    await scenario("old success and failure cannot close or unlock a reopened dialog", async page => {
      await openUnload(page);
      await save(page, 1);
      await page.evaluate("printerWeight.reset()");
      await page.getByRole("button", { name: "Load C", exact: true }).click();
      await save(page, 2);
      await page.evaluate("printerWeight.completeWrite(0)");
      await page.waitForFunction("printerWeight.snapshot().settled === 1");
      let state = await page.evaluate("printerWeight.snapshot()");
      assert.equal(state.busy, true);
      assert.equal(state.prompt.targetSpoolId, "C");
      assert.equal(state.reads, 0);
      assert.equal(state.info, null);
      await page.evaluate("printerWeight.reset()");
      await openUnload(page);
      await page.evaluate("printerWeight.rejectWrite(1)");
      await page.waitForFunction("printerWeight.snapshot().settled === 2");
      state = await page.evaluate("printerWeight.snapshot()");
      assert.equal(state.prompt.targetSpoolId, null);
      assert.equal(state.error, null);
      assert.equal(state.busy, false);
    });

    await scenario("retained openers cannot cross scopes and an old Cancel cannot close a new dialog", async page => {
      await openUnload(page);
      await page.evaluate("printerWeight.retain()");
      await page.evaluate("printerWeight.render({ host: 'host-B' })");
      await page.evaluate("printerWeight.render({ host: null })");
      await page.evaluate("printerWeight.invokeRetained('unload'); printerWeight.invokeRetained('incoming')");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByRole("button", { name: "Load C", exact: true }).click();
      await page.evaluate("printerWeight.invokeRetained('cancel')");
      assert.equal((await page.evaluate("printerWeight.snapshot()")).prompt.targetSpoolId, "C");
      assert.equal(await page.getByRole("dialog").count(), 1);
    });

    await scenario("late refresh failure after a new session does not replace its feedback", async page => {
      await openUnload(page);
      await save(page, 1);
      await page.evaluate("printerWeight.completeWrite(0)");
      await page.waitForFunction("printerWeight.snapshot().reads === 1");
      await page.evaluate("printerWeight.render({ generation: 2 })");
      await openUnload(page);
      const before = await page.evaluate("printerWeight.snapshot()");
      await page.evaluate("printerWeight.rejectRead(0)");
      await page.waitForFunction("printerWeight.snapshot().settled === 1");
      const after = await page.evaluate("printerWeight.snapshot()");
      assert.deepEqual(after.feedback, before.feedback);
      assert.equal(after.prompt.expectedCurrentSpoolId, "A");
    });

    await scenario("unmount suppresses refreshes and shared-state callbacks from a pending write", async page => {
      await openUnload(page);
      await save(page, 1);
      await page.evaluate("printerWeight.unmount()");
      const before = await page.evaluate("printerWeight.snapshot()");
      await page.evaluate("printerWeight.completeWrite(0)");
      await page.waitForFunction("printerWeight.snapshot().settled === 1");
      const after = await page.evaluate("printerWeight.snapshot()");
      assert.deepEqual(after.feedback, before.feedback);
      assert.equal(after.reads, 0);
    });
  } finally { await browser.close(); }
});
