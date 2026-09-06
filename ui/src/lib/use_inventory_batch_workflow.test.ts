import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function buildBatchWorkflowHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }, { default: tailwindcss }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
    import(pathToFileURL(requireFromUi.resolve("@tailwindcss/vite")).href),
  ]);
  const entry = fileURLToPath(new URL("./__inventory_batch_workflow_entry__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryAddWorkflow } from ${file("./use_inventory_add_workflow.ts")};
    import { InventoryAddModal } from ${file("../components/inventory_add_modal.tsx")};
    import { I18nContext } from ${file("./i18n.ts")};
    import { formatMessage } from ${file("../../../src-tauri/companion_browser/message_format.js")};
    import ${file("../index.css")};
    const masters = [
      { id: "bambu-black", vendor: "Bambu Lab", material: "PLA", filament_name: "PLA Basic",
        color_name: "Black (10101)", hex_color: "#111111", default_weight: 1000, is_discontinued: false },
      { id: "bambu-blue", vendor: "Bambu Lab", material: "PLA", filament_name: "PLA Basic",
        color_name: "Blue (10200)", hex_color: "#2244aa", default_weight: 1000, is_discontinued: false },
      { id: "bambu-blue-alt", vendor: "Bambu Lab", material: "PLA", filament_name: "PLA Basic Refill",
        color_name: "Blue (10200)", hex_color: "#2244aa", default_weight: 1000, is_discontinued: false },
    ];
    const writes = [], opened = [], operations = [], captured = new Map();
    let workflow, snapshot, reads = 0, refreshFailure = null;
    const params = new URLSearchParams(location.search);
    let options = { host: params.get("host"), generation: Number(params.get("generation") ?? 1) };
    window.__TAURI__ = { invoke: (command, payload) => {
      if (command === "list_master_catalog" || command === "fetch_library_sync_catalog_masters") {
        return refreshFailure === "catalog" ? Promise.reject(new Error("Catalog refresh rejected")) : Promise.resolve(masters);
      }
      if (["create_catalog_spool_batch", "create_library_sync_host_catalog_spool_batch",
           "create_spool", "create_manual_spool", "create_library_sync_host_spool"].includes(command)) {
        return new Promise((resolve, reject) => writes.push({ command, payload, resolve, reject }));
      }
      return Promise.reject(new Error("Unexpected harness command: " + command));
    } };
    const t = (key, fallback = "", values = {}) => formatMessage(fallback, values, "en");
    const i18n = { locale: "en", setLocale: () => {}, t };
    const reloadSpools = async () => { reads += 1; if (refreshFailure === "spools") throw new Error("Spool refresh rejected"); };
    const allow = () => true, ignore = () => {}, reloadWishlist = async () => {};
    function track(callback) {
      const operation = { settled: false };
      operations.push(operation);
      Promise.resolve(callback()).finally(() => { operation.settled = true; });
    }
    function Harness({ host = null, generation = 1 }) {
      const [error, setError] = useState(null);
      const [infoMessage, setInfoMessage] = useState(null);
      const [selected, setSelectedSpoolId] = useState(null);
      const [recent, setRecentlyAddedSpoolId] = useState(null);
      workflow = useInventoryAddWorkflow({
        canUseClientHostWrite: allow, clientHostBaseUrl: host ? "http://" + host : null,
        clientLibraryId: host ? "library-" + host : "library-local",
        clientReadOnly: Boolean(host), clientTargetGeneration: generation,
        defaultPurchaseCurrency: "", ensureLocalWriteAllowed: allow, error, infoMessage,
        librarySyncReady: true, onOpenPurchaseQueue: ignore,
        onOpenCreatedSpool: id => { opened.push(id); setSelectedSpoolId(id); return true; },
        purchaseActionsDisabled: false, reloadSpools, reloadWishlist, resolvedTheme: "light",
        setError, setInfoMessage, setRecentlyAddedSpoolId, setSelectedSpoolId,
        tauriAvailable: true, t, wishlistItems: [], wishlistLoading: false,
      });
      const props = workflow.modalProps;
      snapshot = { busy: props.busy, batchBusy: props.batchBusy, open: props.open,
        registration: props.batchRegistration, error, infoMessage, selected, recent,
        rawInput: props.bambuBatchInput, initialWeight: props.initialWeight,
        ownership: props.ownershipType, owner: props.borrowedFromName,
        contact: props.borrowedFromContact, note: props.borrowedInNote, location: props.location,
        catalog: props.catalogLoadState,
        readyMasterIds: props.bambuCodeBatch.creatableRows.map(row => row.master.id),
      };
      return <I18nContext.Provider value={i18n}>
        <button onClick={() => workflow.openAddModal()}>Open registration</button>
        <InventoryAddModal {...props}
          onCreateBambuCodeBatch={() => track(props.onCreateBambuCodeBatch)}
          onRetryBambuBatch={() => track(props.onRetryBambuBatch)} />
      </I18nContext.Provider>;
    }
    const root = createRoot(document.getElementById("root"));
    window.batchWorkflow = {
      render: next => { options = next; flushSync(() => root.render(<Harness {...options} />)); },
      navigateAway: () => flushSync(() => root.render(<p>Another application page</p>)),
      remount: () => flushSync(() => root.render(<Harness {...options} />)),
      snapshot: () => ({ ...snapshot, reads, opened: [...opened],
        writes: writes.map(({command,payload}) => ({command,payload})),
        settled: operations.filter(operation => operation.settled).length }),
      stored: () => Object.keys(localStorage).filter(key => key.startsWith("filament-manager.catalog-spool-batch.v1:"))
        .map(key => ({ key, value: JSON.parse(localStorage.getItem(key)) })),
      capture: name => captured.set(name, {
        batch: workflow.modalProps.onCreateBambuCodeBatch,
        single: workflow.modalProps.onCreateSpool,
        retry: workflow.modalProps.onRetryBambuBatch,
        next: workflow.modalProps.onNewBambuBatch,
      }),
      runCaptured: (name, kinds) => flushSync(() => { for (const kind of kinds) track(captured.get(name)[kind]); }),
      complete: (index, spoolIds) => {
        const input = writes[index].payload.input.batch ?? writes[index].payload.input;
        writes[index].resolve({ batch_id: input.batch_id, spool_ids: spoolIds });
      },
      reject: (index, code = "common.internal") => writes[index].reject(new Error(JSON.stringify({ code }))),
      failRefresh: kind => { refreshFailure = kind; },
    };
    window.batchWorkflow.render(options);
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "batch-workflow-harness", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }, react(), tailwindcss()],
    build: { write: false, minify: false, cssCodeSplit: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "BatchWorkflow" } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  const css = outputs.filter(output => output.type === "asset" && output.fileName.endsWith(".css"))
    .map(output => typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source)).join("\n");
  assert.ok(script);
  return `<html><head><meta charset="utf-8"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

async function openRegistration(page: Page) {
  await page.getByRole("button", { name: "Open registration", exact: true }).click();
  await page.waitForFunction("batchWorkflow.snapshot().catalog === 'READY' || batchWorkflow.snapshot().registration !== null");
}

async function openBatch(page: Page, codes?: string) {
  await page.getByRole("button", { name: "Batch add from boxes", exact: true }).click();
  if (codes !== undefined) await page.getByLabel("Codes in this batch", { exact: true }).fill(codes);
}

async function readyBatch(page: Page, codes = "10101\n10101") {
  await openRegistration(page);
  await page.getByLabel("Initial weight (g)", { exact: true }).fill("850");
  await page.getByLabel("Home location").fill("QA Dry box");
  await openBatch(page, codes);
}

async function waitStatus(page: Page, status: string) {
  await page.waitForFunction(`batchWorkflow.snapshot().registration?.status === ${JSON.stringify(status)} && !batchWorkflow.snapshot().busy`);
}

async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function complete(page: Page, index: number, ids = ["host-first", "host-second"]) {
  await page.evaluate(({ index, ids }) => {
    (window as unknown as { batchWorkflow: { complete: (index: number, ids: string[]) => void } }).batchWorkflow.complete(index, ids);
  }, { index, ids });
  await waitStatus(page, "COMPLETE");
  await frames(page);
}

async function closeRegistration(page: Page) {
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  if (await page.getByRole("dialog").count()) {
    await page.getByRole("button", { name: "Close", exact: true }).last().click();
  }
  await page.waitForFunction("!batchWorkflow.snapshot().open");
}

test("real batch workflow preserves one atomic request and safe explicit next actions", async context => {
  const document = await buildBatchWorkflowHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>, host: string | null = null) {
      await context.test(name, async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: document }));
          await page.goto(`http://localhost/batch-workflow${host ? `?host=${host}` : ""}`);
          await run(page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }

    await scenario("two repeated physical codes use one atomic command; stale callbacks cannot add more rolls", async page => {
      await readyBatch(page, "10101\n10101\n99999");
      await page.evaluate("batchWorkflow.capture('before'); batchWorkflow.runCaptured('before', ['batch','single','batch'])");
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      let snapshot = await page.evaluate("batchWorkflow.snapshot()");
      const input = snapshot.writes[0].payload.input;
      assert.equal(snapshot.writes[0].command, "create_catalog_spool_batch");
      assert.deepEqual(input.master_ids, ["bambu-black", "bambu-black"]);
      assert.equal(input.initial_weight_g, 850);
      assert.equal(input.location, "QA Dry box");
      assert.equal(snapshot.writes[0].payload.expectedLibraryId, "library-local");
      assert.equal(snapshot.writes[0].payload.expectedTargetGeneration, 1);
      assert.equal(snapshot.registration.status, "SAVING");
      assert.equal(snapshot.registration.rows.length, 2);
      await complete(page, 0, ["local-first", "local-second"]);
      await page.evaluate("batchWorkflow.runCaptured('before', ['single','batch'])");
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 1);
      await page.getByRole("button", { name: /^Open roll: 1\./ }).click();
      await page.waitForFunction("!batchWorkflow.snapshot().open");
      await frames(page);
      snapshot = await page.evaluate("batchWorkflow.snapshot()");
      assert.deepEqual(snapshot.opened, ["local-first"]);
      assert.equal(snapshot.selected, "local-first", "closing the receipt must not reselect the last batch row");
      await openRegistration(page);
      await openBatch(page);
      await page.getByRole("button", { name: "Start new batch", exact: true }).click();
      await page.getByLabel("Codes in this batch", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Codes in this batch", { exact: true }).inputValue(), "99999");
      snapshot = await page.evaluate("batchWorkflow.snapshot()");
      assert.equal(snapshot.registration, null);
      assert.equal(snapshot.writes.length, 1);
      assert.deepEqual(snapshot.readyMasterIds, []);
      assert.equal(await page.getByRole("button", { name: /Add ready matches/ }).isDisabled(), true);
    });

    await scenario("lost Host response survives close, navigation and reload without an automatic POST", async page => {
      await readyBatch(page);
      await page.getByRole("button", { name: /Add ready matches/ }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      const original = (await page.evaluate("batchWorkflow.snapshot()")).writes[0];
      assert.equal(original.command, "create_library_sync_host_catalog_spool_batch");
      assert.deepEqual(original.payload.input.batch.master_ids, ["bambu-black", "bambu-black"]);
      await page.evaluate("batchWorkflow.reject(0)");
      await waitStatus(page, "UNCERTAIN");
      await closeRegistration(page);
      await openRegistration(page);
      await openBatch(page);
      await page.getByRole("button", { name: "Continue same batch", exact: true }).waitFor();
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 1);
      await page.evaluate("batchWorkflow.navigateAway(); batchWorkflow.remount()");
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 1);
      await openRegistration(page);
      await openBatch(page);
      await page.getByRole("button", { name: "Continue same batch", exact: true }).waitFor();
      await page.reload();
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 0);
      const stored = await page.evaluate("batchWorkflow.stored()");
      assert.equal(stored.length, 1);
      assert.deepEqual(stored[0].value.input, original.payload.input.batch);
      await openRegistration(page);
      await openBatch(page);
      await page.getByRole("button", { name: "Continue same batch", exact: true }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      const retry = (await page.evaluate("batchWorkflow.snapshot()")).writes[0];
      assert.deepEqual(retry, original, "retry must preserve the complete authority and frozen request after page reload");
      await complete(page, 0);
      assert.deepEqual((await page.evaluate("batchWorkflow.snapshot()")).registration.spoolIds, ["host-first", "host-second"]);
      await page.getByRole("button", { name: /^Open roll: 1\./ }).click();
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).selected, "host-first");
    }, "host-a");

    await scenario("in-flight navigation retains the controller and cannot start a second batch", async page => {
      await readyBatch(page);
      await page.getByRole("button", { name: /Add ready matches/ }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      await page.evaluate("batchWorkflow.navigateAway(); batchWorkflow.remount()");
      await openRegistration(page);
      await openBatch(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).registration.status, "SAVING");
      await page.evaluate("batchWorkflow.capture('remount'); batchWorkflow.runCaptured('remount', ['single','batch','retry'])");
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 1);
      await complete(page, 0);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 1);
    }, "host-a");

    await scenario("explicit rejected Edit restores selected catalog rows, borrowed owner, home and weight", async page => {
      await openRegistration(page);
      await page.getByRole("button", { name: "Borrowed in", exact: true }).click();
      await page.getByLabel("Borrowed from", { exact: true }).fill("Sample lender");
      await page.getByLabel("Owner contact (optional)", { exact: true }).fill("QA contact");
      await page.getByLabel("Borrowed-in note (optional)", { exact: true }).fill("QA note");
      await page.getByLabel("Home location").fill("QA loan shelf");
      await page.getByLabel("Initial weight (g)", { exact: true }).fill("780");
      await openBatch(page, "10101\n10200\n99999");
      await page.getByLabel("Choose catalog row").selectOption("bambu-blue-alt");
      await page.getByRole("button", { name: /Add ready matches/ }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      const request = (await page.evaluate("batchWorkflow.snapshot()")).writes[0].payload.input;
      assert.deepEqual(request.master_ids, ["bambu-black", "bambu-blue-alt"]);
      await page.evaluate("batchWorkflow.reject(0, 'inventory.batch.invalid')");
      await waitStatus(page, "REJECTED");
      await closeRegistration(page);
      await openRegistration(page);
      await openBatch(page);
      await page.getByRole("button", { name: "Edit batch", exact: true }).click();
      await page.getByLabel("Codes in this batch", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Codes in this batch", { exact: true }).inputValue(), "10101\n10200\n99999");
      assert.equal(await page.getByLabel("Choose catalog row").inputValue(), "bambu-blue-alt");
      const restored = await page.evaluate("batchWorkflow.snapshot()");
      assert.deepEqual(restored.readyMasterIds, request.master_ids);
      assert.equal(restored.ownership, "BORROWED_IN");
      assert.equal(restored.owner, "Sample lender");
      assert.equal(restored.contact, "QA contact");
      assert.equal(restored.note, "QA note");
      assert.equal(restored.location, "QA loan shelf");
      assert.equal(restored.initialWeight, "780");
      assert.equal(restored.writes.length, 1);
    });

    await scenario("refresh rejection retains the completed receipt and does not allow a resubmission", async page => {
      await readyBatch(page);
      await page.evaluate("batchWorkflow.capture('before')");
      await page.getByRole("button", { name: /Add ready matches/ }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      await page.evaluate("batchWorkflow.failRefresh('spools')");
      await complete(page, 0);
      await page.waitForFunction("batchWorkflow.snapshot().error !== null");
      let snapshot = await page.evaluate("batchWorkflow.snapshot()");
      assert.equal(snapshot.registration.status, "COMPLETE");
      assert.deepEqual(snapshot.registration.spoolIds, ["host-first", "host-second"]);
      assert.equal(snapshot.reads, 1);
      await page.evaluate("batchWorkflow.runCaptured('before', ['batch','single','retry'])");
      await frames(page);
      snapshot = await page.evaluate("batchWorkflow.snapshot()");
      assert.equal(snapshot.writes.length, 1);
      assert.equal(snapshot.registration.status, "COMPLETE");
      assert.equal(await page.getByRole("button", { name: "Continue same batch", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: /^Open roll:/ }).count(), 2);
    }, "host-a");

    await scenario("Host A to B to A generation changes fence stale callbacks and completions", async page => {
      await readyBatch(page);
      await page.evaluate("batchWorkflow.capture('old')");
      await page.getByRole("button", { name: /Add ready matches/ }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 1");
      await page.evaluate("batchWorkflow.render({host:'host-b',generation:2})");
      await page.waitForFunction("!batchWorkflow.snapshot().open");
      await page.evaluate("batchWorkflow.render({host:'host-a',generation:3})");
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).registration, null);
      await readyBatch(page);
      await page.evaluate("batchWorkflow.runCaptured('old', ['batch','single','retry'])");
      await frames(page);
      assert.equal((await page.evaluate("batchWorkflow.snapshot()")).writes.length, 1);
      await page.getByRole("button", { name: /Add ready matches/ }).click();
      await page.waitForFunction("batchWorkflow.snapshot().writes.length === 2");
      const current = (await page.evaluate("batchWorkflow.snapshot()")).writes[1];
      assert.equal(current.payload.input.expected_target_generation, 3);
      await page.evaluate("batchWorkflow.complete(0, ['old-first','old-second'])");
      await frames(page);
      const pending = await page.evaluate("batchWorkflow.snapshot()");
      assert.equal(pending.busy, true, "old finally must not clear the current operation's busy lock");
      assert.equal(pending.registration.status, "SAVING");
      assert.equal(pending.registration.batchId, current.payload.input.batch.batch_id);
      assert.equal(pending.selected, null);
      assert.equal(pending.reads, 0);
      await complete(page, 1, ["current-first", "current-second"]);
      const completed = await page.evaluate("batchWorkflow.snapshot()");
      assert.equal(completed.selected, "current-second");
      assert.deepEqual(completed.registration.spoolIds, ["current-first", "current-second"]);
      assert.equal(completed.writes.length, 2);
    }, "host-a");
  } finally { await browser.close(); }
});
